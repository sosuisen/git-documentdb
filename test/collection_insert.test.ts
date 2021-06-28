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
import { PutResultJsonDoc } from '../src/types';
import { Collection } from '../src/collection';
import { JSON_EXT, SHORT_SHA_LENGTH } from '../src/const';
import { toSortedJSONString } from '../src/utils';
import { GitDocumentDB } from '../src/git_documentdb';
import { Err } from '../src/error';

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
      Err.SameIdExistsError
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
    const prevCommitOid = await git.resolveRef({
      fs,
      dir: gitDDB.workingDir,
      ref: 'HEAD',
    });

    const col = new Collection(gitDDB, 'col01');
    const _id = 'prof01';
    const json = { _id, name: 'Shirase' };

    const beforeTimestamp = Math.floor(Date.now() / 1000) * 1000;
    const putResult = await col.insert(json);
    const afterTimestamp = Math.floor(Date.now() / 1000) * 1000;

    const currentCommitOid = await git.resolveRef({
      fs,
      dir: gitDDB.workingDir,
      ref: 'HEAD',
    });

    const internalJson = JSON.parse(JSON.stringify(json));
    internalJson._id = col.collectionPath + _id;
    const fileOid = (await git.hashBlob({ object: toSortedJSONString(internalJson) })).oid;
    const shortOid = fileOid.substr(0, SHORT_SHA_LENGTH);

    expect(putResult._id).toBe(_id);
    expect(putResult.fileOid).toBe(fileOid);
    expect(putResult.commit.oid).toBe(currentCommitOid);
    expect(putResult.commit.message).toBe(
      `insert: ${col.collectionPath}${_id}${JSON_EXT}(${shortOid})`
    );

    expect(putResult.commit.parent).toEqual([prevCommitOid]);
    expect(putResult.commit.author.name).toEqual(gitDDB.author.name);
    expect(putResult.commit.author.email).toEqual(gitDDB.author.email);
    expect(putResult.commit.author.timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
    expect(putResult.commit.author.timestamp).toBeLessThanOrEqual(afterTimestamp);
    expect(putResult.commit.committer.name).toEqual(gitDDB.author.name);
    expect(putResult.commit.committer.email).toEqual(gitDDB.author.email);
    expect(putResult.commit.committer.timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
    expect(putResult.commit.committer.timestamp).toBeLessThanOrEqual(afterTimestamp);

    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(gitDDB.workingDir, col.collectionPath, _id + JSON_EXT);
    await expect(fs.access(filePath)).resolves.not.toThrowError();

    expect(fs.readFileSync(filePath, 'utf8')).toBe(toSortedJSONString(internalJson));

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
    const internalJson = JSON.parse(JSON.stringify(json));
    internalJson._id = col.collectionPath + _id;
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
    const putResult = await col.insert(json);
    const internalJson = JSON.parse(JSON.stringify(json));
    internalJson._id = col.collectionPath + _id;
    const fileOid = (await git.hashBlob({ object: toSortedJSONString(internalJson) })).oid;
    const shortOid = fileOid.substr(0, SHORT_SHA_LENGTH);
    expect(putResult.commit.message).toBe(
      `insert: ${col.collectionPath}${_id}${JSON_EXT}(${shortOid})`
    );

    await gitDDB.destroy();
  });
});

describe('<collection> insert(shortId, jsonDoc)', () => {
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
      Err.SameIdExistsError
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
    const prevCommitOid = await git.resolveRef({
      fs,
      dir: gitDDB.workingDir,
      ref: 'HEAD',
    });

    const col = new Collection(gitDDB, 'col01');
    const _id = 'prof01';
    const json = { _id, name: 'Shirase' };
    const internalJson = JSON.parse(JSON.stringify(json));
    internalJson._id = col.collectionPath + _id;

    const beforeTimestamp = Math.floor(Date.now() / 1000) * 1000;
    const putResult = await col.insert(_id, json);
    const afterTimestamp = Math.floor(Date.now() / 1000) * 1000;

    const currentCommitOid = await git.resolveRef({
      fs,
      dir: gitDDB.workingDir,
      ref: 'HEAD',
    });

    const fileOid = (await git.hashBlob({ object: toSortedJSONString(internalJson) })).oid;
    const shortOid = fileOid.substr(0, SHORT_SHA_LENGTH);

    expect(putResult._id).toBe(_id);
    expect(putResult.fileOid).toBe(fileOid);
    expect(putResult.commit.oid).toBe(currentCommitOid);
    expect(putResult.commit.message).toBe(
      `insert: ${col.collectionPath}${_id}${JSON_EXT}(${shortOid})`
    );

    expect(putResult.commit.parent).toEqual([prevCommitOid]);
    expect(putResult.commit.author.name).toEqual(gitDDB.author.name);
    expect(putResult.commit.author.email).toEqual(gitDDB.author.email);
    expect(putResult.commit.author.timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
    expect(putResult.commit.author.timestamp).toBeLessThanOrEqual(afterTimestamp);
    expect(putResult.commit.committer.name).toEqual(gitDDB.author.name);
    expect(putResult.commit.committer.email).toEqual(gitDDB.author.email);
    expect(putResult.commit.committer.timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
    expect(putResult.commit.committer.timestamp).toBeLessThanOrEqual(afterTimestamp);

    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(gitDDB.workingDir, col.collectionPath, _id + JSON_EXT);
    await expect(fs.access(filePath)).resolves.not.toThrowError();

    expect(fs.readFileSync(filePath, 'utf8')).toBe(toSortedJSONString(internalJson));

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
    const internalJson = JSON.parse(JSON.stringify(json));
    internalJson._id = col.collectionPath + _id;
    const fileOid = (await git.hashBlob({ object: toSortedJSONString(internalJson) })).oid;
    fileOid.substr(0, SHORT_SHA_LENGTH);
    expect(putResult.commit.message).toBe(commitMessage);

    await gitDDB.destroy();
  });
});

describe('<collection> insertFatDoc(shortName, jsonDoc)', () => {
  it('inserts a JSON file', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const prevCommitOid = await git.resolveRef({
      fs,
      dir: gitDDB.workingDir,
      ref: 'HEAD',
    });

    const col = new Collection(gitDDB, 'col01');
    const _id = 'prof01';
    const shortName = _id + JSON_EXT;
    const json = { _id, name: 'Shirase' };
    const internalJson = JSON.parse(JSON.stringify(json));
    internalJson._id = col.collectionPath + _id;

    const beforeTimestamp = Math.floor(Date.now() / 1000) * 1000;
    const putResult = (await col.insertFatDoc(shortName, json)) as PutResultJsonDoc;
    const afterTimestamp = Math.floor(Date.now() / 1000) * 1000;

    const currentCommitOid = await git.resolveRef({
      fs,
      dir: gitDDB.workingDir,
      ref: 'HEAD',
    });

    const fileOid = (await git.hashBlob({ object: toSortedJSONString(internalJson) })).oid;
    const shortOid = fileOid.substr(0, SHORT_SHA_LENGTH);

    expect(putResult._id).toBe(_id);
    expect(putResult.fileOid).toBe(fileOid);
    expect(putResult.commit.oid).toBe(currentCommitOid);
    expect(putResult.commit.message).toBe(
      `insert: ${col.collectionPath}${_id}${JSON_EXT}(${shortOid})`
    );

    expect(putResult.commit.parent).toEqual([prevCommitOid]);
    expect(putResult.commit.author.name).toEqual(gitDDB.author.name);
    expect(putResult.commit.author.email).toEqual(gitDDB.author.email);
    expect(putResult.commit.author.timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
    expect(putResult.commit.author.timestamp).toBeLessThanOrEqual(afterTimestamp);
    expect(putResult.commit.committer.name).toEqual(gitDDB.author.name);
    expect(putResult.commit.committer.email).toEqual(gitDDB.author.email);
    expect(putResult.commit.committer.timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
    expect(putResult.commit.committer.timestamp).toBeLessThanOrEqual(afterTimestamp);

    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(gitDDB.workingDir, col.collectionPath, _id + JSON_EXT);
    await expect(fs.access(filePath)).resolves.not.toThrowError();

    expect(fs.readFileSync(filePath, 'utf8')).toBe(toSortedJSONString(internalJson));

    await gitDDB.destroy();
  });
});
