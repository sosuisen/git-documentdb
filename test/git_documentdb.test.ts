/* eslint-disable @typescript-eslint/naming-convention */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import fs from 'fs-extra';
import { monotonicFactory } from 'ulid';
import expect from 'expect';
import parse from 'parse-git-config';
import { GitDocumentDB } from '../src/git_documentdb';
import { Collection } from '../src/collection';

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = `./test/database_index`;

beforeEach(function () {
  // @ts-ignore
  console.log(`... ${this.currentTest.fullTitle()}`);
});

after(() => {
  fs.removeSync(path.resolve(localDir));
});

describe('<index>', () => {
  it('GitDocumentDB#dbName', () => {
    const dbName = monoId();
    const gitDDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    expect(gitDDB.dbName()).toBe(dbName);
  });

  it('GitDocumentDB#collection', () => {
    const dbName = monoId();
    const gitDDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    const col = gitDDB.collection('col01');
    expect(col instanceof Collection).toBeTruthy();
    expect(col.collectionPath).toBe('col01/');
  });

  it('saveAuthor', async () => {
    const dbName = monoId();
    const gitDDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const author = {
      name: 'foo',
      email: 'bar@example.com',
    };
    gitDDB.author = author;
    await gitDDB.saveAuthor();

    const config = parse.sync({ cwd: gitDDB.workingDir(), path: '.git/config' });
    expect(config.user).toEqual(author);

    await gitDDB.destroy();
  });

  it('loadAuthor', async () => {
    const dbName = monoId();
    const gitDDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const author = {
      name: 'foo',
      email: 'bar@example.com',
    };
    gitDDB.author = author;
    await gitDDB.saveAuthor();

    gitDDB.author = { name: 'baz', email: 'baz@localhost' };
    expect(gitDDB.author).not.toEqual(author);

    await gitDDB.loadAuthor();
    expect(gitDDB.author).toEqual(author);

    await gitDDB.destroy();
  });

  it('load undefined author', async () => {
    const dbName = monoId();
    const gitDDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const author = JSON.parse(JSON.stringify(gitDDB.author));

    await gitDDB.loadAuthor();

    expect(gitDDB.author).toEqual(author);

    await gitDDB.destroy();
  });

  it('getCommit', async () => {
    const dbName = monoId();
    const gitDDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const putResult = await gitDDB.put({ _id: '1', name: 'Shirase' });
    const commit = await gitDDB.getCommit(putResult.commit.oid);
    expect(commit).toEqual(putResult.commit);
    await gitDDB.destroy();
  });

  it('returns root collections', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const root01 = gitDDB.collection('root01');
    const root02 = gitDDB.collection('root02');
    const root03 = gitDDB.collection('root03');
    await root01.put('item01', {});
    await root02.put('item02', {});
    await root03.put('item03', {});
    const cols = await gitDDB.getCollections();
    expect(cols.length).toBe(3);
    await expect(cols[0].get('item01')).resolves.toEqual({ _id: 'item01' });
    await expect(cols[1].get('item02')).resolves.toEqual({ _id: 'item02' });
    await expect(cols[2].get('item03')).resolves.toEqual({ _id: 'item03' });

    const cols2 = await gitDDB.getCollections('');
    expect(cols2.length).toBe(3);

    await gitDDB.destroy();
  });

  it('returns sub directory collections from root', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const root01 = gitDDB.collection('sub/root01');
    const root02 = gitDDB.collection('sub/root02');
    const root03 = gitDDB.collection('sub03');
    await root01.put('item01', {});
    await root02.put('item02', {});
    await root03.put('item03', {});

    const cols = await gitDDB.getCollections();
    expect(cols.length).toBe(2);
    await expect(cols[0].get('root01/item01')).resolves.toEqual({ _id: 'root01/item01' });
    await expect(cols[0].get('root02/item02')).resolves.toEqual({ _id: 'root02/item02' });
    await expect(cols[1].get('item03')).resolves.toEqual({ _id: 'item03' });

    const cols2 = await gitDDB.getCollections('sub');
    expect(cols2.length).toBe(2);
    await expect(cols2[0].get('item01')).resolves.toEqual({ _id: 'item01' });
    await expect(cols2[1].get('item02')).resolves.toEqual({ _id: 'item02' });

    const cols3 = await gitDDB.getCollections('sub/');
    expect(cols3.length).toBe(2);
    await expect(cols3[0].get('item01')).resolves.toEqual({ _id: 'item01' });
    await expect(cols3[1].get('item02')).resolves.toEqual({ _id: 'item02' });

    await gitDDB.destroy();
  });

  it('save and load AppInfo', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();

    const json = {
      appName: 'foo',
      appVersion: 1,
    };
    await gitDDB.saveAppInfo(json);

    await expect(gitDDB.loadAppInfo()).resolves.toEqual(json);

    await gitDDB.destroy();
  });
});
