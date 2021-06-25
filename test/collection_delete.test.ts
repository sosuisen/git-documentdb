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
import { DeleteResultJsonDoc } from '../src/types';
import { JSON_EXT, SHORT_SHA_LENGTH } from '../src/const';
import { toSortedJSONString } from '../src/utils';
import { GitDocumentDB } from '../src/git_documentdb';
import { DocumentNotFoundError, UndefinedDocumentIdError } from '../src/error';
import { Collection } from '../src/collection';

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = `./test/database_collection_delete`;

beforeEach(function () {
  // @ts-ignore
  console.log(`... ${this.currentTest.fullTitle()}`);
});

after(() => {
  fs.removeSync(path.resolve(localDir));
});

describe('delete(shortId)', () => {
  it('throws UndefinedDocumentIdError', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const users = new Collection(gitDDB, 'users');
    // @ts-ignore
    await expect(users.delete()).rejects.toThrowError(UndefinedDocumentIdError);

    await gitDDB.destroy();
  });

  it('throws UndefinedDocumentIdError when document does not have _id', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const users = new Collection(gitDDB, 'users');
    // @ts-ignore
    await expect(users.delete({ name: 'Shirase' })).rejects.toThrowError(
      UndefinedDocumentIdError
    );

    await gitDDB.destroy();
  });

  it('throws DocumentNotFoundError', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const _id = 'test/prof01';
    const users = new Collection(gitDDB, 'users');
    await expect(users.delete(_id)).rejects.toThrowError(DocumentNotFoundError);

    await gitDDB.destroy();
  });

  it('deletes a document by id.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const users = new Collection(gitDDB, 'users');
    const _id = 'test/prof01';
    const _id2 = 'test/prof02';

    const putResult = await users.put({ _id: _id, name: 'Shirase' });
    await users.put({ _id: _id2, name: 'Soya' });

    const shortOid = putResult.fileOid.substr(0, SHORT_SHA_LENGTH);
    // Delete
    const deleteResult = await users.delete(_id);
    expect(deleteResult._id).toBe(_id);
    expect(deleteResult.fileOid).toBe(putResult.fileOid);
    expect(deleteResult.commit.message).toBe(
      `delete: users/${_id}${JSON_EXT}(${shortOid})`
    );

    // Check commit directly
    const commitOid = await git.resolveRef({ fs, dir: gitDDB.workingDir(), ref: 'HEAD' });
    const { commit } = await git.readCommit({
      fs,
      dir: gitDDB.workingDir(),
      oid: commitOid,
    });
    expect(commit.message).toEqual(`delete: users/${_id}${JSON_EXT}(${shortOid})\n`);

    await expect(users.delete(_id)).rejects.toThrowError(DocumentNotFoundError);
    await expect(users.get(_id)).resolves.toBeUndefined();

    await users.delete(_id2);

    // Directory is empty
    await expect(
      fs.access(
        path.dirname(path.resolve(gitDDB.workingDir(), 'users', _id)),
        fs.constants.F_OK
      )
    ).rejects.toThrowError();

    await gitDDB.destroy();
  });

  it('deletes a document in deep collection by id.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const users = new Collection(gitDDB, 'col01/col02/col03/users');
    const _id = 'test/prof01';
    const _id2 = 'test/prof02';

    const putResult = await users.put({ _id: _id, name: 'Shirase' });
    await users.put({ _id: _id2, name: 'Soya' });

    const shortOid = putResult.fileOid.substr(0, SHORT_SHA_LENGTH);
    // Delete
    const deleteResult = await users.delete(_id);
    expect(deleteResult._id).toBe(_id);
    expect(deleteResult.fileOid).toBe(putResult.fileOid);
    expect(deleteResult.commit.message).toBe(
      `delete: ${users.collectionPath}${_id}${JSON_EXT}(${shortOid})`
    );

    // Check commit directly
    const commitOid = await git.resolveRef({ fs, dir: gitDDB.workingDir(), ref: 'HEAD' });
    const { commit } = await git.readCommit({
      fs,
      dir: gitDDB.workingDir(),
      oid: commitOid,
    });
    expect(commit.message).toEqual(
      `delete: ${users.collectionPath}${_id}${JSON_EXT}(${shortOid})\n`
    );

    await expect(users.delete(_id)).rejects.toThrowError(DocumentNotFoundError);
    await expect(users.get(_id)).resolves.toBeUndefined();

    await users.delete(_id2);

    // Directories are recursively removed.
    await expect(
      fs.access(
        path.dirname(path.resolve(gitDDB.workingDir(), 'col01', _id)),
        fs.constants.F_OK
      )
    ).rejects.toThrowError();

    await gitDDB.destroy();
  });

  it('modifies a commit message.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const users = new Collection(gitDDB, 'users');

    const _id = 'test/prof01';
    await users.put({ _id: _id, name: 'shirase' });

    // Delete
    const commitMessage = 'my commit message';
    const deleteResult = await users.delete(_id, { commitMessage });

    expect(deleteResult.commit.message).toBe(commitMessage);

    // Check commit directly
    const commitOid = await git.resolveRef({ fs, dir: gitDDB.workingDir(), ref: 'HEAD' });
    const { commit } = await git.readCommit({
      fs,
      dir: gitDDB.workingDir(),
      oid: commitOid,
    });
    expect(commit.message).toEqual(`${commitMessage}\n`);

    await gitDDB.destroy();
  });
});

describe('delete(jsonDoc)', () => {
  it('deletes a document by JsonDoc.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const users = new Collection(gitDDB, 'users');

    const _id = 'dir01/prof01';
    const json = { _id: _id, name: 'shirase' };
    const innerJson = { _id: users.collectionPath + _id, name: 'shirase' };
    const putResult = await users.put(json);

    const prevCommitOid = putResult.commit.oid;

    // Delete
    const { oid } = await git.hashBlob({ object: toSortedJSONString(innerJson) });
    const beforeTimestamp = Math.floor(Date.now() / 1000) * 1000;
    const deleteResult = await users.delete(json);
    const afterTimestamp = Math.floor(Date.now() / 1000) * 1000;

    const currentCommitOid = await git.resolveRef({
      fs,
      dir: gitDDB.workingDir(),
      ref: 'HEAD',
    });

    // Check NormalizedCommit
    expect(deleteResult.commit.oid).toBe(currentCommitOid);
    expect(deleteResult.commit.message).toBe(
      `delete: ${users.collectionPath}${_id}${JSON_EXT}(${oid.substr(
        0,
        SHORT_SHA_LENGTH
      )})`
    );
    expect(deleteResult.commit.parent).toEqual([prevCommitOid]);
    expect(deleteResult.commit.author.name).toEqual(gitDDB.author.name);
    expect(deleteResult.commit.author.email).toEqual(gitDDB.author.email);
    expect(deleteResult.commit.author.timestamp.getTime()).toBeGreaterThanOrEqual(
      beforeTimestamp
    );
    expect(deleteResult.commit.author.timestamp.getTime()).toBeLessThanOrEqual(
      afterTimestamp
    );
    expect(deleteResult.commit.committer.name).toEqual(gitDDB.author.name);
    expect(deleteResult.commit.committer.email).toEqual(gitDDB.author.email);
    expect(deleteResult.commit.committer.timestamp.getTime()).toBeGreaterThanOrEqual(
      beforeTimestamp
    );
    expect(deleteResult.commit.committer.timestamp.getTime()).toBeLessThanOrEqual(
      afterTimestamp
    );

    await gitDDB.destroy();
  });

  it('deletes a document by JsonDoc in which only _id is the same.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const _id = 'test/prof01';
    const users = new Collection(gitDDB, 'users');
    const json = { _id, name: 'Shirase' };
    const anotherJson = { _id, name: 'Soya' };
    await users.put(json);
    const deleteResult = await users.delete(anotherJson);
    expect(deleteResult._id).toBe(_id);

    await gitDDB.destroy();
  });
});

describe('deleteFatDoc(name)', () => {
  it('throws UndefinedDocumentIdError', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const users = new Collection(gitDDB, 'users');
    // @ts-ignore
    await expect(users.deleteFatDoc()).rejects.toThrowError(UndefinedDocumentIdError);

    await gitDDB.destroy();
  });

  it('deletes a document by id.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const users = new Collection(gitDDB, 'users');
    const _id = 'test/prof01';
    const _id2 = 'test/prof02';

    const putResult = await users.put({ _id: _id, name: 'Shirase' });
    await users.put({ _id: _id2, name: 'Soya' });

    const shortOid = putResult.fileOid.substr(0, SHORT_SHA_LENGTH);
    // Delete
    const deleteResult = (await users.deleteFatDoc(_id + JSON_EXT)) as DeleteResultJsonDoc;
    expect(deleteResult._id).toBe(_id);
    expect(deleteResult.fileOid).toBe(putResult.fileOid);
    expect(deleteResult.commit.message).toBe(
      `delete: users/${_id}${JSON_EXT}(${shortOid})`
    );

    // Check commit directly
    const commitOid = await git.resolveRef({ fs, dir: gitDDB.workingDir(), ref: 'HEAD' });
    const { commit } = await git.readCommit({
      fs,
      dir: gitDDB.workingDir(),
      oid: commitOid,
    });
    expect(commit.message).toEqual(`delete: users/${_id}${JSON_EXT}(${shortOid})\n`);

    await expect(users.delete(_id)).rejects.toThrowError(DocumentNotFoundError);
    await expect(users.get(_id)).resolves.toBeUndefined();

    await users.delete(_id2);

    // Directory is empty
    await expect(
      fs.access(
        path.dirname(path.resolve(gitDDB.workingDir(), 'users', _id)),
        fs.constants.F_OK
      )
    ).rejects.toThrowError();

    await gitDDB.destroy();
  });

  it('deletes a document in deep collection by id.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const users = new Collection(gitDDB, 'col01/col02/col03/users');
    const _id = 'test/prof01';
    const _id2 = 'test/prof02';

    const putResult = await users.put({ _id: _id, name: 'Shirase' });
    await users.put({ _id: _id2, name: 'Soya' });

    const shortOid = putResult.fileOid.substr(0, SHORT_SHA_LENGTH);
    // Delete
    const deleteResult = (await users.deleteFatDoc(_id + JSON_EXT)) as DeleteResultJsonDoc;
    expect(deleteResult._id).toBe(_id);
    expect(deleteResult.fileOid).toBe(putResult.fileOid);
    expect(deleteResult.commit.message).toBe(
      `delete: ${users.collectionPath}${_id}${JSON_EXT}(${shortOid})`
    );

    // Check commit directly
    const commitOid = await git.resolveRef({ fs, dir: gitDDB.workingDir(), ref: 'HEAD' });
    const { commit } = await git.readCommit({
      fs,
      dir: gitDDB.workingDir(),
      oid: commitOid,
    });
    expect(commit.message).toEqual(
      `delete: ${users.collectionPath}${_id}${JSON_EXT}(${shortOid})\n`
    );

    await expect(users.delete(_id)).rejects.toThrowError(DocumentNotFoundError);
    await expect(users.get(_id)).resolves.toBeUndefined();

    await users.delete(_id2);

    // Directories are recursively removed.
    await expect(
      fs.access(
        path.dirname(path.resolve(gitDDB.workingDir(), 'col01', _id)),
        fs.constants.F_OK
      )
    ).rejects.toThrowError();

    await gitDDB.destroy();
  });
});
