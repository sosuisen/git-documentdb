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
import { monotonicFactory } from 'ulid';
import expect from 'expect';
import fs from 'fs-extra';
import { GitDocumentDB } from '../src/index';
import { toSortedJSONString } from '../src/utils';
import { JSON_EXT, SHORT_SHA_LENGTH } from '../src/const';

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
});

describe('<index> put(jsonDoc)', () => {
  it('creates a JSON file', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const _id = 'prof01';
    // Check put operation
    const json = { _id, name: 'Shirase' };
    const putResult = await gitDDB.put(json);
    const fileOid = (await git.hashBlob({ object: toSortedJSONString(json) })).oid;
    const shortOid = fileOid.substr(0, SHORT_SHA_LENGTH);
    expect(putResult).toEqual({
      _id,
      fileOid,
      commitOid: expect.stringMatching(/^[\da-z]{40}$/),
      commitMessage: `insert: ${_id}${JSON_EXT}(${shortOid})`,
    });

    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(gitDDB.workingDir(), _id + JSON_EXT);
    await expect(fs.access(filePath)).resolves.not.toThrowError();
    expect(fs.readFileSync(filePath, 'utf8')).toBe(toSortedJSONString(json));

    await gitDDB.destroy();
  });

  it('puts with a commitMessage', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const _id = 'prof01';
    const json = { _id, name: 'Shirase' };
    const commitMessage = 'message';
    await expect(gitDDB.put(json, { commitMessage })).resolves.toMatchObject({
      _id,
      fileOid: expect.stringMatching(/^[\da-z]{40}$/),
      commitOid: expect.stringMatching(/^[\da-z]{40}$/),
      commitMessage,
    });

    // Check commit directly
    const commitOid = await git.resolveRef({
      fs,
      dir: gitDDB.workingDir(),
      ref: 'HEAD',
    });
    const { commit } = await git.readCommit({
      fs,
      dir: gitDDB.workingDir(),
      oid: commitOid,
    });
    expect(commit.message).toEqual(`${commitMessage}\n`);

    gitDDB.destroy();
  });
});

describe('<index> put(_id, jsonDoc)', () => {
  it('creates a JSON file', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const _id = 'prof01';
    const json = { _id, name: 'Shirase' };
    const putResult = await gitDDB.put(_id, json);
    const fileOid = (await git.hashBlob({ object: toSortedJSONString(json) })).oid;
    const shortOid = fileOid.substr(0, SHORT_SHA_LENGTH);
    expect(putResult).toEqual({
      _id,
      fileOid,
      commitOid: expect.stringMatching(/^[\da-z]{40}$/),
      commitMessage: `insert: ${_id}${JSON_EXT}(${shortOid})`,
    });

    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(gitDDB.workingDir(), _id + JSON_EXT);
    await expect(fs.access(filePath)).resolves.not.toThrowError();
    expect(fs.readFileSync(filePath, 'utf8')).toBe(toSortedJSONString(json));

    await gitDDB.destroy();
  });

  it('puts with a commitMessage', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const _id = 'prof01';
    const json = { _id, name: 'Shirase' };
    const commitMessage = 'message';
    await expect(gitDDB.put(_id, json, { commitMessage })).resolves.toMatchObject({
      _id,
      fileOid: expect.stringMatching(/^[\da-z]{40}$/),
      commitOid: expect.stringMatching(/^[\da-z]{40}$/),
      commitMessage,
    });

    // Check commit directly
    const commitOid = await git.resolveRef({
      fs,
      dir: gitDDB.workingDir(),
      ref: 'HEAD',
    });
    const { commit } = await git.readCommit({
      fs,
      dir: gitDDB.workingDir(),
      oid: commitOid,
    });
    expect(commit.message).toEqual(`${commitMessage}\n`);

    gitDDB.destroy();
  });
});

describe('<index> insert(jsonDoc)', () => {
  it('inserts a JSON file', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const _id = 'prof01';
    const json = { _id, name: 'Shirase' };
    const putResult = await gitDDB.insert(json);
    const fileOid = (await git.hashBlob({ object: toSortedJSONString(json) })).oid;
    const shortOid = fileOid.substr(0, SHORT_SHA_LENGTH);
    expect(putResult).toEqual({
      _id,
      fileOid,
      commitOid: expect.stringMatching(/^[\da-z]{40}$/),
      commitMessage: `insert: ${_id}${JSON_EXT}(${shortOid})`,
    });

    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(gitDDB.workingDir(), _id + JSON_EXT);
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
    const _id = 'prof01';
    const commitMessage = 'message';
    const json = { _id, name: 'Shirase' };
    const putResult = await gitDDB.insert(json, { commitMessage });
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

describe('<index> insert(_id, jsonDoc)', () => {
  it('inserts a JSON file', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const _id = 'prof01';
    const json = { _id, name: 'Shirase' };
    const putResult = await gitDDB.insert(_id, json);
    const fileOid = (await git.hashBlob({ object: toSortedJSONString(json) })).oid;
    const shortOid = fileOid.substr(0, SHORT_SHA_LENGTH);
    expect(putResult).toEqual({
      _id,
      fileOid,
      commitOid: expect.stringMatching(/^[\da-z]{40}$/),
      commitMessage: `insert: ${_id}${JSON_EXT}(${shortOid})`,
    });

    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(gitDDB.workingDir(), _id + JSON_EXT);
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
    const _id = 'prof01';
    const commitMessage = 'message';
    const json = { _id, name: 'Shirase' };
    const putResult = await gitDDB.insert(_id, json, { commitMessage });
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

describe('<index> update(jsonDoc)', () => {
  it('update a JSON file', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const _id = 'prof01';
    const json = { _id, name: 'Shirase' };
    await gitDDB.insert(json);
    const jsonUpdated = { _id: 'prof01', name: 'updated' };
    const putResult = await gitDDB.update(jsonUpdated);
    const fileOid = (await git.hashBlob({ object: toSortedJSONString(jsonUpdated) })).oid;
    const shortOid = fileOid.substr(0, SHORT_SHA_LENGTH);
    expect(putResult).toEqual({
      _id,
      fileOid,
      commitOid: expect.stringMatching(/^[\da-z]{40}$/),
      commitMessage: `update: ${_id}${JSON_EXT}(${shortOid})`,
    });

    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(
      gitDDB.workingDir(),
      _id + JSON_EXT
    );
    await expect(fs.access(filePath)).resolves.not.toThrowError();

    expect(fs.readFileSync(filePath, 'utf8')).toBe(toSortedJSONString(jsonUpdated));

    await gitDDB.destroy();
  });

  it('set a commitMessage by PutOptions', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const _id = 'prof01';
    const json = { _id, name: 'Shirase' };
    await gitDDB.insert(json);
    const commitMessage = 'message';
    const jsonUpdated = { _id: 'prof01', name: 'updated' };
    const putResult = await gitDDB.update(jsonUpdated, { commitMessage });
    const fileOid = (await git.hashBlob({ object: toSortedJSONString(jsonUpdated) })).oid;
    expect(putResult).toEqual({
      _id,
      fileOid,
      commitOid: expect.stringMatching(/^[\da-z]{40}$/),
      commitMessage,
    });
    await gitDDB.destroy();
  });
});

describe('<index> update(_id, jsonDoc', () => {
  it('update a JSON file', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const _id = 'prof01';
    const json = { _id, name: 'Shirase' };
    await gitDDB.insert(json);
    const jsonUpdated = { _id, name: 'updated' };
    const putResult = await gitDDB.update('prof01', jsonUpdated);
    const fileOid = (await git.hashBlob({ object: toSortedJSONString(jsonUpdated) })).oid;
    const shortOid = fileOid.substr(0, SHORT_SHA_LENGTH);
    expect(putResult).toEqual({
      _id,
      fileOid,
      commitOid: expect.stringMatching(/^[\da-z]{40}$/),
      commitMessage: `update: ${_id}${JSON_EXT}(${shortOid})`,
    });

    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(gitDDB.workingDir(), _id + JSON_EXT);
    await expect(fs.access(filePath)).resolves.not.toThrowError();

    expect(fs.readFileSync(filePath, 'utf8')).toBe(toSortedJSONString(jsonUpdated));

    await gitDDB.destroy();
  });

  it('set a commitMessage by PutOptions', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const _id = 'prof01';
    const json = { _id, name: 'Shirase' };
    await gitDDB.insert(json);
    const commitMessage = 'message';
    const jsonUpdated = { _id, name: 'updated' };
    const putResult = await gitDDB.update('prof01', jsonUpdated, { commitMessage });
    const fileOid = (await git.hashBlob({ object: toSortedJSONString(jsonUpdated) })).oid;
    expect(putResult).toEqual({
      _id,
      fileOid,
      commitOid: expect.stringMatching(/^[\da-z]{40}$/),
      commitMessage,
    });
    await gitDDB.destroy();
  });
});
