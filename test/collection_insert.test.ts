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
import git from 'isomorphic-git';
import expect from 'expect';
import { monotonicFactory } from 'ulid';
import { Collection } from '../src/collection';
import { JSON_EXT, SHORT_SHA_LENGTH } from '../src/const';
import { toSortedJSONString } from '../src/utils';
import { GitDocumentDB } from '../src/index';
import { SameIdExistsError } from '../src/error';

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = `./test/database_collection_insert`;

beforeEach(function () {
  // @ts-ignore
  console.log(`... ${this.currentTest.fullTitle()}`);
});

after(() => {
  fs.removeSync(path.resolve(localDir));
});

describe('<collection> insert(jsonDoc)', () => {
  it('throws SameIdExistsError when a document which has the same id exists.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = new Collection(gitDDB, 'col01');
    await col.insert({ _id: 'prof01' });
    await expect(col.insert({ _id: 'prof01', name: 'Shirase' })).rejects.toThrowError(
      SameIdExistsError
    );
    await gitDDB.destroy();
  });

  it('inserts a JSON file', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = new Collection(gitDDB, 'col01');
    const _id = 'prof01';
    const json = { _id, name: 'Shirase' };
    const putResult = await col.insert(json);
    const fileOid = (await git.hashBlob({ object: toSortedJSONString(json) })).oid;
    const shortOid = fileOid.substr(0, SHORT_SHA_LENGTH);
    expect(putResult).toEqual({
      _id,
      fileOid,
      commitOid: expect.stringMatching(/^[\da-z]{40}$/),
      commitMessage: `insert: ${col.collectionPath()}${_id}${JSON_EXT}(${shortOid})`,
    });

    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(
      gitDDB.workingDir(),
      col.collectionPath(),
      _id + JSON_EXT
    );
    await expect(fs.access(filePath)).resolves.not.toThrowError();

    expect(fs.readFileSync(filePath, 'utf8')).toBe(toSortedJSONString(json));

    await gitDDB.destroy();
  });

  it('sets commitMessage by PutOptions', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = new Collection(gitDDB, 'col01');
    const _id = 'prof01';
    const commitMessage = 'message';
    const json = { _id, name: 'Shirase' };
    const putResult = await col.insert(json, { commitMessage });
    const fileOid = (await git.hashBlob({ object: toSortedJSONString(json) })).oid;
    fileOid.substr(0, SHORT_SHA_LENGTH);
    expect(putResult).toEqual({
      _id,
      fileOid,
      commitOid: expect.stringMatching(/^[\da-z]{40}$/),
      commitMessage,
    });

    await gitDDB.destroy();
  });
});

describe('<collection> insert(id, jsonDoc)', () => {
  it('throws SameIdExistsError when a document which has the same id exists.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = new Collection(gitDDB, 'col01');
    await col.insert('prof01', { name: 'Shirase' });
    await expect(col.insert('prof01', { name: 'Shirase' })).rejects.toThrowError(
      SameIdExistsError
    );
    await gitDDB.destroy();
  });

  it('inserts a JSON file', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = new Collection(gitDDB, 'col01');
    const _id = 'prof01';
    const json = { _id, name: 'Shirase' };
    const putResult = await col.insert(_id, json);
    const fileOid = (await git.hashBlob({ object: toSortedJSONString(json) })).oid;
    const shortOid = fileOid.substr(0, SHORT_SHA_LENGTH);
    expect(putResult).toEqual({
      _id,
      fileOid,
      commitOid: expect.stringMatching(/^[\da-z]{40}$/),
      commitMessage: `insert: ${col.collectionPath()}${_id}${JSON_EXT}(${shortOid})`,
    });

    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(
      gitDDB.workingDir(),
      col.collectionPath(),
      _id + JSON_EXT
    );
    await expect(fs.access(filePath)).resolves.not.toThrowError();

    expect(fs.readFileSync(filePath, 'utf8')).toBe(toSortedJSONString(json));

    await gitDDB.destroy();
  });

  it('sets commitMessage by PutOptions', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = new Collection(gitDDB, 'col01');
    const _id = 'prof01';
    const commitMessage = 'message';
    const json = { _id, name: 'Shirase' };
    const putResult = await col.insert(_id, json, { commitMessage });
    const fileOid = (await git.hashBlob({ object: toSortedJSONString(json) })).oid;
    fileOid.substr(0, SHORT_SHA_LENGTH);
    expect(putResult).toEqual({
      _id,
      fileOid,
      commitOid: expect.stringMatching(/^[\da-z]{40}$/),
      commitMessage,
    });

    await gitDDB.destroy();
  });
});