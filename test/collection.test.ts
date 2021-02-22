/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import nodegit from '@sosuisen/nodegit';
import fs from 'fs-extra';
import { GitDocumentDB } from '../src/index';
import {
  DocumentNotFoundError,
  InvalidCollectionPathCharacterError,
  RepositoryNotOpenError,
  UndefinedDocumentIdError,
} from '../src/error';
import { Validator } from '../src/validator';

describe('Collection', () => {
  const localDir = './test/database_collection01';

  beforeAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  afterAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  test('getFullPath()', () => {
    const dbName = 'test_repos_1';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    gitDDB.open();
    const users = gitDDB.collection('users');
    expect(users.getFullPath('pages')).toEqual('users/pages/');
    gitDDB.destroy();
  });

  test('InvalidCollectionPathCharacterError', () => {
    const dbName = 'test_repos_1';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    gitDDB.open();
    expect(() => gitDDB.collection('users./')).toThrowError(
      InvalidCollectionPathCharacterError
    );
    gitDDB.destroy();
  });
});

describe('Collection: put()', () => {
  const localDir = './test/database_collection02';

  beforeAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  afterAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  test('put(): Put a JSON document.', async () => {
    const dbName = 'test_repos_2';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.open();
    const users = gitDDB.collection('users');
    const doc = { _id: 'prof01', name: 'Kimari' };
    await expect(users.put(doc)).resolves.toMatchObject({
      ok: true,
      id: expect.stringMatching('^' + doc._id + '$'),
      file_sha: expect.stringMatching(/^[\da-z]{40}$/),
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });

    // Check filename
    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(
      gitDDB.workingDir(),
      users.collectionPath() + doc._id + '.json'
    );
    await expect(fs.access(filePath)).resolves.not.toThrowError();
    // Read JSON and check doc._id
    expect(fs.readJSONSync(filePath)._id).toBe(doc._id);

    gitDDB.destroy();
  });

  test('put(): Put a sub-directory ID into sub-directory collection.', async () => {
    const dbName = 'test_repos_3';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.open();
    const users = gitDDB.collection('users/Gunma');
    const doc = { _id: 'prof01/page01', name: 'Kimari' };
    await expect(users.put(doc)).resolves.toMatchObject({
      ok: true,
      id: expect.stringMatching('^' + doc._id + '$'),
      file_sha: expect.stringMatching(/^[\da-z]{40}$/),
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });
    // Check filename
    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(
      gitDDB.workingDir(),
      users.collectionPath() + doc._id + '.json'
    );
    await expect(fs.access(filePath)).resolves.not.toThrowError();
    // Read JSON and check doc._id
    expect(fs.readJSONSync(filePath)._id).toBe('page01'); // not 'prof01/page01'

    const repository = gitDDB.getRepository();
    if (repository !== undefined) {
      const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
      const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
      expect(commit.message()).toEqual(`put: users/Gunma/prof01/page01`);
    }

    gitDDB.destroy();
  });

  test('put(): Put with a commit_message', async () => {
    const dbName = 'test_repos_4';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.open();
    const users = gitDDB.collection('users');
    const doc = { _id: 'prof01', name: 'Kimari' };
    await expect(users.put(doc, { commit_message: 'message' })).resolves.toMatchObject({
      ok: true,
      id: expect.stringMatching('^' + doc._id + '$'),
      file_sha: expect.stringMatching(/^[\da-z]{40}$/),
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });

    const repository = gitDDB.getRepository();
    if (repository !== undefined) {
      const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
      const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
      expect(commit.message()).toEqual(`message`);
    }

    gitDDB.destroy();
  });

  test('put(): Put with a collection_path', async () => {
    const dbName = 'test_repos_5';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.open();
    const users = gitDDB.collection('users');
    const doc = { _id: 'prof01', name: 'Kimari' };
    await expect(users.put(doc, { collection_path: 'Gunma' })).resolves.toMatchObject({
      ok: true,
      id: expect.stringMatching('^' + doc._id + '$'),
      file_sha: expect.stringMatching(/^[\da-z]{40}$/),
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });

    const repository = gitDDB.getRepository();
    if (repository !== undefined) {
      const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
      const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
      expect(commit.message()).toEqual(`put: users/Gunma/prof01`);
    }

    gitDDB.destroy();
  });
});

describe('Collection: get()', () => {
  const localDir = './test/database_collection03';

  beforeAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  afterAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  test('get(): Read an existing document', async () => {
    const dbName = 'test_repos_1';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    await gitDDB.open();
    const users = gitDDB.collection('users');
    const _id = 'prof01';
    await users.put({ _id: _id, name: 'shirase' });
    // Get
    await expect(users.get(_id)).resolves.toEqual({ _id: _id, name: 'shirase' });
    await gitDDB.destroy();
    // Check error
    await expect(users.get(_id)).rejects.toThrowError(RepositoryNotOpenError);
  });

  test('get(): Read an existing document in subdirectory', async () => {
    const dbName = 'test_repos_2';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    await gitDDB.open();
    const users = gitDDB.collection('users');
    const _id = 'dir01/prof01';
    await users.put({ _id: _id, name: 'shirase' });
    // Get
    await expect(users.get(_id)).resolves.toEqual({ _id: _id, name: 'shirase' });
    await gitDDB.destroy();
  });

  test('get(): Read an existing document by using collection_path', async () => {
    const dbName = 'test_repos_2';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    await gitDDB.open();
    const users = gitDDB.collection('users');
    const _id = 'dir01/prof01';
    await users.put({ _id: _id, name: 'shirase' });
    // Get
    await expect(users.get('prof01', { collection_path: 'dir01' })).resolves.toEqual({
      _id: 'prof01',
      name: 'shirase',
    });
    await gitDDB.destroy();
  });
});

describe('Collection: delete()', () => {
  const localDir = './test/database_collection04';

  beforeAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  afterAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  test('delete()', async () => {
    const dbName = 'test_repos_01';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    await gitDDB.open();
    const _id = 'test/prof01';
    const _id2 = 'test/prof02';
    const users = gitDDB.collection('users');
    await expect(users.delete(_id)).rejects.toThrowError(DocumentNotFoundError);

    await users.put({ _id: _id, name: 'shirase' });
    await users.put({ _id: _id2, name: 'kimari' });

    // Delete
    await expect(users.delete(_id)).resolves.toMatchObject({
      ok: true,
      id: expect.stringMatching('^' + _id + '$'),
      file_sha: expect.stringMatching(/^[\da-z]{40}$/),
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });
    // Check commit message
    const repository = gitDDB.getRepository();
    if (repository !== undefined) {
      const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
      const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
      expect(commit.message()).toEqual(`remove: users/${_id}`);
    }

    await expect(users.delete(_id)).rejects.toThrowError(DocumentNotFoundError);
    await expect(users.get(_id)).rejects.toThrowError(DocumentNotFoundError);

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

  test('delete(): Set commit message.', async () => {
    const dbName = 'test_repos_02';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    await gitDDB.open();
    const users = gitDDB.collection('users');
    const _id = 'test/prof01';
    await users.put({ _id: _id, name: 'shirase' });

    // Delete
    await users.delete(_id, { commit_message: 'my commit message' });

    // Check commit message
    const repository = gitDDB.getRepository();
    if (repository !== undefined) {
      const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
      const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
      expect(commit.message()).toEqual(`my commit message`);
    }

    await gitDDB.destroy();
  });

  test('delete(): _id is undefined', async () => {
    const dbName = 'test_repos_03';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    await gitDDB.open();
    const users = gitDDB.collection('users');
    // @ts-ignore
    await expect(users.delete()).rejects.toThrowError(UndefinedDocumentIdError);

    await gitDDB.destroy();
  });

  test('delete(): Use JsonObject as key.', async () => {
    const dbName = 'test_repos_03';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    await gitDDB.open();
    const users = gitDDB.collection('users');
    const _id = 'test/prof01';
    const doc = { _id: _id, name: 'shirase' };
    await users.put(doc);

    // Delete
    await expect(users.delete(doc)).resolves.toMatchObject({
      ok: true,
      id: expect.stringMatching('^' + _id + '$'),
      file_sha: expect.stringMatching(/^[\da-z]{40}$/),
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });

    await gitDDB.destroy();
  });
});

describe('Collection: allDocs()', () => {
  const localDir = './test/database_collection05';

  const _id_a = 'apple';
  const name_a = 'Apple woman';
  const _id_b = 'banana';
  const name_b = 'Banana man';

  const _id_c01 = 'citrus/amanatsu';
  const name_c01 = 'Amanatsu boy';
  const _id_c02 = 'citrus/yuzu';
  const name_c02 = 'Yuzu girl';
  const _id_d = 'durio/durian';
  const name_d = 'Durian girls';
  const _id_p = 'pear/Japan/21st';
  const name_p = '21st century pear';

  beforeAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  afterAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  test('allDocs()', async () => {
    const dbName = 'test_repos_1';

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    await expect(gitDDB.allDocs({ recursive: true })).rejects.toThrowError(
      RepositoryNotOpenError
    );

    await gitDDB.open();
    const users = gitDDB.collection('users');
    await expect(users.allDocs()).resolves.toStrictEqual({ total_rows: 0 });

    await users.put({ _id: _id_b, name: name_b });
    await users.put({ _id: _id_a, name: name_a });

    await expect(users.allDocs()).resolves.toMatchObject({
      total_rows: 2,
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
      rows: [
        {
          id: expect.stringMatching('^' + _id_a + '$'),
          file_sha: expect.stringMatching(/^[\da-z]{40}$/),
        },
        {
          id: expect.stringMatching('^' + _id_b + '$'),
          file_sha: expect.stringMatching(/^[\da-z]{40}$/),
        },
      ],
    });

    await gitDDB.destroy();
  });

  test('allDocs(): get from deep directory', async () => {
    const dbName = 'test_repos_2';

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.open();
    const users = gitDDB.collection('users');
    await users.put({ _id: _id_p, name: name_p });

    await users.put({ _id: _id_b, name: name_b });
    await users.put({ _id: _id_a, name: name_a });
    await users.put({ _id: _id_d, name: name_d });
    await users.put({ _id: _id_c01, name: name_c01 });
    await users.put({ _id: _id_c02, name: name_c02 });

    await expect(
      users.allDocs({ sub_directory: 'pear/Japan', include_docs: true })
    ).resolves.toMatchObject({
      total_rows: 1,
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
      rows: [
        {
          id: expect.stringMatching('^' + _id_p + '$'),
          file_sha: expect.stringMatching(/^[\da-z]{40}$/),
          doc: {
            _id: expect.stringMatching('^' + _id_p + '$'),
            name: name_p,
          },
        },
      ],
    });

    await gitDDB.destroy();
  });

  test('allDocs(): get from deep directory by using collection_path', async () => {
    const dbName = 'test_repos_3';

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.open();
    const users = gitDDB.collection('users');
    await users.put({ _id: _id_p, name: name_p });

    await users.put({ _id: _id_b, name: name_b });
    await users.put({ _id: _id_a, name: name_a });
    await users.put({ _id: _id_d, name: name_d });
    await users.put({ _id: _id_c01, name: name_c01 });
    await users.put({ _id: _id_c02, name: name_c02 });

    await expect(
      users.allDocs({
        sub_directory: 'Japan',
        include_docs: true,
        collection_path: 'pear',
      })
    ).resolves.toMatchObject({
      total_rows: 1,
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
      rows: [
        {
          id: expect.stringMatching('^Japan/21st$'),
          file_sha: expect.stringMatching(/^[\da-z]{40}$/),
          doc: {
            _id: expect.stringMatching('^Japan/21st$'),
            name: name_p,
          },
        },
      ],
    });

    await gitDDB.destroy();
  });
});
