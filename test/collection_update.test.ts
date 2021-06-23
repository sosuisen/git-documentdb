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
import { PutResultJsonDoc } from '../src/types';
import { DocumentNotFoundError } from '../src/error';
import { GitDocumentDB } from '../src/git_documentdb';
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
    const insertResult = await col.insert(json);

    const prevCommitOid = insertResult.commit.oid;

    const jsonUpdated = { _id, name: 'updated' };

    const beforeTimestamp = Math.floor(Date.now() / 1000) * 1000;
    const putResult = await col.update(jsonUpdated);
    const afterTimestamp = Math.floor(Date.now() / 1000) * 1000;

    const currentCommitOid = await git.resolveRef({
      fs,
      dir: gitDDB.workingDir(),
      ref: 'HEAD',
    });

    const internalJson = JSON.parse(JSON.stringify(jsonUpdated));
    internalJson._id = col.collectionPath() + _id;
    const fileOid = (await git.hashBlob({ object: toSortedJSONString(internalJson) })).oid;
    const shortOid = fileOid.substr(0, SHORT_SHA_LENGTH);

    expect(putResult._id).toBe(_id);
    expect(putResult.fileOid).toBe(fileOid);
    expect(putResult.commit.oid).toBe(currentCommitOid);
    expect(putResult.commit.message).toBe(
      `update: ${col.collectionPath()}${_id}${JSON_EXT}(${shortOid})`
    );

    expect(putResult.commit.parent).toEqual([prevCommitOid]);
    expect(putResult.commit.author.name).toEqual(gitDDB.author.name);
    expect(putResult.commit.author.email).toEqual(gitDDB.author.email);
    expect(putResult.commit.author.timestamp.getTime()).toBeGreaterThanOrEqual(
      beforeTimestamp
    );
    expect(putResult.commit.author.timestamp.getTime()).toBeLessThanOrEqual(afterTimestamp);
    expect(putResult.commit.committer.name).toEqual(gitDDB.author.name);
    expect(putResult.commit.committer.email).toEqual(gitDDB.author.email);
    expect(putResult.commit.committer.timestamp.getTime()).toBeGreaterThanOrEqual(
      beforeTimestamp
    );
    expect(putResult.commit.committer.timestamp.getTime()).toBeLessThanOrEqual(
      afterTimestamp
    );

    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(
      gitDDB.workingDir(),
      col.collectionPath(),
      _id + JSON_EXT
    );
    await expect(fs.access(filePath)).resolves.not.toThrowError();

    expect(fs.readFileSync(filePath, 'utf8')).toBe(toSortedJSONString(internalJson));

    await gitDDB.destroy();
  });

  it('set a commitMessage by PutOptions', async () => {
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
    const internalJson = JSON.parse(JSON.stringify(jsonUpdated));
    internalJson._id = col.collectionPath() + _id;
    expect(putResult.commit.message).toBe(commitMessage);

    await gitDDB.destroy();
  });

  it('inserts into deep collection', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = new Collection(gitDDB, 'col01/col02/col03');
    const _id = 'prof01';
    const commitMessage = 'message';
    const json = { _id, name: 'Shirase' };
    await col.insert(json, { commitMessage });
    const jsonUpdated = { _id: 'prof01', name: 'updated' };
    const putResult = await col.update(jsonUpdated);
    const internalJson = JSON.parse(JSON.stringify(jsonUpdated));
    internalJson._id = col.collectionPath() + _id;
    const fileOid = (await git.hashBlob({ object: toSortedJSONString(internalJson) })).oid;
    const shortOid = fileOid.substr(0, SHORT_SHA_LENGTH);
    expect(putResult.commit.message).toBe(
      `update: ${col.collectionPath()}${_id}${JSON_EXT}(${shortOid})`
    );

    await gitDDB.destroy();
  });
});

describe('<collection> update(shortId, jsonDoc)', () => {
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
    const insertResult = await col.insert(json);

    const prevCommitOid = insertResult.commit.oid;

    const jsonUpdated = { _id, name: 'updated' };

    const beforeTimestamp = Math.floor(Date.now() / 1000) * 1000;
    const putResult = await col.update('prof01', jsonUpdated);
    const afterTimestamp = Math.floor(Date.now() / 1000) * 1000;

    const currentCommitOid = await git.resolveRef({
      fs,
      dir: gitDDB.workingDir(),
      ref: 'HEAD',
    });

    const internalJson = JSON.parse(JSON.stringify(jsonUpdated));
    internalJson._id = col.collectionPath() + _id;
    const fileOid = (await git.hashBlob({ object: toSortedJSONString(internalJson) })).oid;
    const shortOid = fileOid.substr(0, SHORT_SHA_LENGTH);

    expect(putResult._id).toBe(_id);
    expect(putResult.fileOid).toBe(fileOid);
    expect(putResult.commit.oid).toBe(currentCommitOid);
    expect(putResult.commit.message).toBe(
      `update: ${col.collectionPath()}${_id}${JSON_EXT}(${shortOid})`
    );

    expect(putResult.commit.parent).toEqual([prevCommitOid]);
    expect(putResult.commit.author.name).toEqual(gitDDB.author.name);
    expect(putResult.commit.author.email).toEqual(gitDDB.author.email);
    expect(putResult.commit.author.timestamp.getTime()).toBeGreaterThanOrEqual(
      beforeTimestamp
    );
    expect(putResult.commit.author.timestamp.getTime()).toBeLessThanOrEqual(afterTimestamp);
    expect(putResult.commit.committer.name).toEqual(gitDDB.author.name);
    expect(putResult.commit.committer.email).toEqual(gitDDB.author.email);
    expect(putResult.commit.committer.timestamp.getTime()).toBeGreaterThanOrEqual(
      beforeTimestamp
    );
    expect(putResult.commit.committer.timestamp.getTime()).toBeLessThanOrEqual(
      afterTimestamp
    );

    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(
      gitDDB.workingDir(),
      col.collectionPath(),
      _id + JSON_EXT
    );
    await expect(fs.access(filePath)).resolves.not.toThrowError();

    expect(fs.readFileSync(filePath, 'utf8')).toBe(toSortedJSONString(internalJson));

    await gitDDB.destroy();
  });

  it('set a commitMessage by PutOptions', async () => {
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
    const internalJson = JSON.parse(JSON.stringify(jsonUpdated));
    internalJson._id = col.collectionPath() + _id;
    const fileOid = (await git.hashBlob({ object: toSortedJSONString(internalJson) })).oid;
    expect(putResult.commit.message).toBe(commitMessage);

    await gitDDB.destroy();
  });
});

describe('<collection> updateFatDoc(shortName, jsonDoc)', () => {
  it('update a JSON file', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = new Collection(gitDDB, 'col01');
    const _id = 'prof01';
    const shortName = _id + JSON_EXT;
    const json = { _id, name: 'Shirase' };
    const insertResult = await col.insert(json);

    const prevCommitOid = insertResult.commit.oid;

    const jsonUpdated = { _id, name: 'updated' };

    const beforeTimestamp = Math.floor(Date.now() / 1000) * 1000;
    const putResult = (await col.updateFatDoc(shortName, jsonUpdated)) as PutResultJsonDoc;
    const afterTimestamp = Math.floor(Date.now() / 1000) * 1000;

    const currentCommitOid = await git.resolveRef({
      fs,
      dir: gitDDB.workingDir(),
      ref: 'HEAD',
    });

    const internalJson = JSON.parse(JSON.stringify(jsonUpdated));
    internalJson._id = col.collectionPath() + _id;
    const fileOid = (await git.hashBlob({ object: toSortedJSONString(internalJson) })).oid;
    const shortOid = fileOid.substr(0, SHORT_SHA_LENGTH);

    expect(putResult._id).toBe(_id);
    expect(putResult.fileOid).toBe(fileOid);
    expect(putResult.commit.oid).toBe(currentCommitOid);
    expect(putResult.commit.message).toBe(
      `update: ${col.collectionPath()}${_id}${JSON_EXT}(${shortOid})`
    );

    expect(putResult.commit.parent).toEqual([prevCommitOid]);
    expect(putResult.commit.author.name).toEqual(gitDDB.author.name);
    expect(putResult.commit.author.email).toEqual(gitDDB.author.email);
    expect(putResult.commit.author.timestamp.getTime()).toBeGreaterThanOrEqual(
      beforeTimestamp
    );
    expect(putResult.commit.author.timestamp.getTime()).toBeLessThanOrEqual(afterTimestamp);
    expect(putResult.commit.committer.name).toEqual(gitDDB.author.name);
    expect(putResult.commit.committer.email).toEqual(gitDDB.author.email);
    expect(putResult.commit.committer.timestamp.getTime()).toBeGreaterThanOrEqual(
      beforeTimestamp
    );
    expect(putResult.commit.committer.timestamp.getTime()).toBeLessThanOrEqual(
      afterTimestamp
    );

    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(
      gitDDB.workingDir(),
      col.collectionPath(),
      _id + JSON_EXT
    );
    await expect(fs.access(filePath)).resolves.not.toThrowError();

    expect(fs.readFileSync(filePath, 'utf8')).toBe(toSortedJSONString(internalJson));

    await gitDDB.destroy();
  });
});
