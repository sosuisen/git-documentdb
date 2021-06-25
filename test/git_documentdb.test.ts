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
});
