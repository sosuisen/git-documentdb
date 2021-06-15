/* eslint-disable @typescript-eslint/naming-convention */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import git from 'isomorphic-git';
import fs from 'fs-extra';
import expect from 'expect';
import { monotonicFactory } from 'ulid';
import { DocumentNotFoundError } from '../src/error';
import { GitDocumentDB } from '../src/index';
import { Collection } from '../src/collection';
import { toSortedJSONString } from '../src/utils';
import { JSON_EXT, SHORT_SHA_LENGTH } from '../src/const';

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = `./test/database_collection_update`;

beforeEach(function () {
  // @ts-ignore
  console.log(`... ${this.currentTest.fullTitle()}`);
});

after(() => {
  fs.removeSync(path.resolve(localDir));
});

describe('<collection> update(jsonDoc)', () => {
  it('throws DocumentNotFoundError.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = new Collection(gitDDB, 'col01');
    await expect(col.update({ _id: 'prof01', name: 'Shirase' })).rejects.toThrowError(
      DocumentNotFoundError
    );
    await gitDDB.destroy();
  });

  it('update a JSON file', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = new Collection(gitDDB, 'col01');
    const _id = 'prof01';
    const json = { _id, name: 'Shirase' };
    await col.insert(json);
    const jsonUpdated = { _id: 'prof01', name: 'updated' };
    const putResult = await col.update(jsonUpdated);
    const fileOid = (await git.hashBlob({ object: toSortedJSONString(jsonUpdated) })).oid;
    const shortOid = fileOid.substr(0, SHORT_SHA_LENGTH);
    expect(putResult).toEqual({
      _id,
      fileOid,
      commitOid: expect.stringMatching(/^[\da-z]{40}$/),
      commitMessage: `update: ${col.collectionPath()}${_id}${JSON_EXT}(${shortOid})`,
    });

    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(
      gitDDB.workingDir(),
      col.collectionPath(),
      _id + JSON_EXT
    );
    await expect(fs.access(filePath)).resolves.not.toThrowError();

    expect(fs.readFileSync(filePath, 'utf8')).toBe(toSortedJSONString(jsonUpdated));

    await gitDDB.destroy();
  });

  it('set commitMessage by PutOptions', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = new Collection(gitDDB, 'col01');
    const _id = 'prof01';
    const json = { _id, name: 'Shirase' };
    await col.insert(json);
    const commitMessage = 'message';
    const jsonUpdated = { _id: 'prof01', name: 'updated' };
    const putResult = await col.update(jsonUpdated, { commitMessage });
    const fileOid = (await git.hashBlob({ object: toSortedJSONString(jsonUpdated) })).oid;
    const shortOid = fileOid.substr(0, SHORT_SHA_LENGTH);
    expect(putResult).toEqual({
      _id,
      fileOid,
      commitOid: expect.stringMatching(/^[\da-z]{40}$/),
      commitMessage,
    });
    await gitDDB.destroy();
  });
});

describe('<collection> update(id, jsonDoc)', () => {
  it('throws DocumentNotFoundError.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = new Collection(gitDDB, 'col01');
    await expect(
      col.update('prof01', { _id: 'prof01', name: 'Shirase' })
    ).rejects.toThrowError(DocumentNotFoundError);
    await gitDDB.destroy();
  });

  it('update a JSON file', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = new Collection(gitDDB, 'col01');
    const _id = 'prof01';
    const json = { _id, name: 'Shirase' };
    await col.insert(json);
    const jsonUpdated = { _id: 'prof01', name: 'updated' };
    const putResult = await col.update('prof01', jsonUpdated);
    const fileOid = (await git.hashBlob({ object: toSortedJSONString(jsonUpdated) })).oid;
    const shortOid = fileOid.substr(0, SHORT_SHA_LENGTH);
    expect(putResult).toEqual({
      _id,
      fileOid,
      commitOid: expect.stringMatching(/^[\da-z]{40}$/),
      commitMessage: `update: ${col.collectionPath()}${_id}${JSON_EXT}(${shortOid})`,
    });

    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(
      gitDDB.workingDir(),
      col.collectionPath(),
      _id + JSON_EXT
    );
    await expect(fs.access(filePath)).resolves.not.toThrowError();

    expect(fs.readFileSync(filePath, 'utf8')).toBe(toSortedJSONString(jsonUpdated));

    await gitDDB.destroy();
  });

  it('set commitMessage by PutOptions', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = new Collection(gitDDB, 'col01');
    const _id = 'prof01';
    const json = { _id, name: 'Shirase' };
    await col.insert(json);
    const commitMessage = 'message';
    const jsonUpdated = { _id: 'prof01', name: 'updated' };
    const putResult = await col.update('prof01', jsonUpdated, { commitMessage });
    const fileOid = (await git.hashBlob({ object: toSortedJSONString(jsonUpdated) })).oid;
    const shortOid = fileOid.substr(0, SHORT_SHA_LENGTH);
    expect(putResult).toEqual({
      _id,
      fileOid,
      commitOid: expect.stringMatching(/^[\da-z]{40}$/),
      commitMessage,
    });
    await gitDDB.destroy();
  });
});
