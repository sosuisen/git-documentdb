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

const localDir = `./test/database_collection_delete`;

beforeEach(function () {
  // @ts-ignore
  console.log(`... ${this.currentTest.fullTitle()}`);
});

after(() => {
  fs.removeSync(path.resolve(localDir));
});

describe('delete()', () => {
  it('deletes a document by id.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const _id = 'test/prof01';
    const _id2 = 'test/prof02';
    const users = gitDDB.collection('users');
    await expect(users.delete(_id)).rejects.toThrowError(DocumentNotFoundError);

    await users.put({ _id: _id, name: 'shirase' });
    await users.put({ _id: _id2, name: 'Shirase' });

    // Delete
    const deleteResult = await users.delete(_id);
    expect(deleteResult).toMatchObject({
      ok: true,
      _id: expect.stringMatching('^test/prof01$'),
      fileOid: expect.stringMatching(/^[\da-z]{40}$/),
      commitOid: expect.stringMatching(/^[\da-z]{40}$/),
    });

    // Check commit message
    const repository = gitDDB.repository();
    if (repository !== undefined) {
      const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
      const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
      expect(commit.message()).toEqual(
        `delete: users/${_id}${JSON_EXT}(${deleteResult.fileOid.substr(
          0,
          SHORT_SHA_LENGTH
        )})`
      );
    }

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

    await expect(users.delete(_id)).rejects.toThrowError(RepositoryNotOpenError);
  });

  it('deletes a document by JsonDoc.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const _id = 'test/prof01';
    const users = gitDDB.collection('users');
    const doc = { _id: _id, name: 'shirase' };
    await users.put(doc);
    const sameDoc = { _id: _id, name: 'shirase' };
    await expect(users.delete(sameDoc)).resolves.toMatchObject({
      ok: true,
      _id: expect.stringMatching('^test/prof01$'),
      fileOid: expect.stringMatching(/^[\da-z]{40}$/),
      commitOid: expect.stringMatching(/^[\da-z]{40}$/),
    });
    expect(sameDoc._id).toBe(_id);
    await gitDDB.destroy();
  });

  it('throws UndefinedDocumentIdError', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const users = gitDDB.collection('users');
    // @ts-ignore
    await expect(users.delete()).rejects.toThrowError(UndefinedDocumentIdError);

    await gitDDB.destroy();
  });

  it('deletes a document by id.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const _id = 'test/prof01';
    const users = gitDDB.collection('users');
    const doc = { _id: _id, name: 'shirase' };
    await users.put(doc);
    await expect(users.delete(_id)).resolves.toMatchObject({
      ok: true,
      _id: expect.stringMatching('^test/prof01$'),
      fileOid: expect.stringMatching(/^[\da-z]{40}$/),
      commitOid: expect.stringMatching(/^[\da-z]{40}$/),
    });
    await gitDDB.destroy();
  });

  it('modifies a commit message.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const users = gitDDB.collection('users');
    const _id = 'test/prof01';
    await users.put({ _id: _id, name: 'shirase' });

    // Delete
    await users.delete(_id, { commitMessage: 'my commit message' });

    // Check commit message
    const repository = gitDDB.repository();
    if (repository !== undefined) {
      const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
      const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
      expect(commit.message()).toEqual(`my commit message`);
    }

    await gitDDB.destroy();
  });

  it('throws UndefinedDocumentIdError', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const users = gitDDB.collection('users');
    // @ts-ignore
    await expect(users.delete()).rejects.toThrowError(UndefinedDocumentIdError);

    await gitDDB.destroy();
  });

  it('deletes a document by JsonDoc.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const _id = 'dir01/prof01';
    const json = { _id: _id, name: 'shirase' };
    const putResult = await gitDDB.put(json);

    const prevCommitOid = putResult.commit.oid;

    // Delete
    const { oid } = await git.hashBlob({ object: toSortedJSONString(json) });
    const beforeTimestamp = Math.floor(Date.now() / 1000) * 1000;
    const deleteResult = await gitDDB.delete(json);
    const afterTimestamp = Math.floor(Date.now() / 1000) * 1000;

    const currentCommitOid = await git.resolveRef({
      fs,
      dir: gitDDB.workingDir(),
      ref: 'HEAD',
    });

    // Check NormalizedCommit
    expect(deleteResult.commit.oid).toBe(currentCommitOid);
    expect(deleteResult.commit.message).toBe(
      `insert: ${_id}${JSON_EXT}(${oid.substr(0, SHORT_SHA_LENGTH)})`
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
});
