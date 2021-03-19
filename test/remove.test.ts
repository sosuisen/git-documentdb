/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import nodegit from '@sosuisen/nodegit';
import { monotonicFactory } from 'ulid';
import fs from 'fs-extra';
import {
  DocumentNotFoundError,
  InvalidIdCharacterError,
  RepositoryNotOpenError,
  UndefinedDBError,
  UndefinedDocumentIdError,
} from '../src/error';
import { GitDocumentDB } from '../src/index';
import { remove_worker } from '../src/crud/remove';
const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

describe('remove(): validate:', () => {
  const localDir = `./test/database_delete${monoId()}`;

  test('Repository is not opened.', async () => {
    const dbName = `test_repos_${monoId()}`;
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await expect(gitDDB.remove('prof01')).rejects.toThrowError(RepositoryNotOpenError);
    await expect(
      remove_worker(gitDDB, 'prof01', gitDDB.fileExt, 'message')
    ).rejects.toThrowError(RepositoryNotOpenError);
    await gitDDB.destroy();
  });

  test('Invalid _id', async () => {
    const dbName = `test_repos_${monoId()}`;

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    await gitDDB.open();

    await expect(gitDDB.remove('_underscore')).rejects.toThrowError(
      InvalidIdCharacterError
    );

    // @ts-ignore
    await expect(gitDDB.remove()).rejects.toThrowError(UndefinedDocumentIdError);

    await expect(gitDDB.remove({})).rejects.toThrowError(UndefinedDocumentIdError);

    await gitDDB.destroy();
  });
});

describe('delete(): delete document:', () => {
  const localDir = `./test/database_delete${monoId()}`;

  beforeAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  afterAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  test('Use delete(_id).', async () => {
    const dbName = `test_repos_${monoId()}`;
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    await gitDDB.open();
    const _id = 'prof01';
    const doc = { _id: _id, name: 'shirase' };
    await gitDDB.put(doc);

    // Delete
    await expect(gitDDB.delete(_id)).resolves.toMatchObject({
      ok: true,
      id: expect.stringMatching('^' + _id + '$'),
      file_sha: expect.stringMatching(/^[\da-z]{40}$/),
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });

    // Check commit message
    const repository = gitDDB.repository();
    if (repository !== undefined) {
      const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
      const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
      expect(commit.message()).toEqual(`remove: ${_id}`);
    }

    await gitDDB.destroy();
  });

  test('Use delete(doc).', async () => {
    const dbName = `test_repos_${monoId()}`;
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    await gitDDB.open();
    const _id = 'prof01';
    const doc = { _id: _id, name: 'shirase' };
    await gitDDB.put(doc);

    // Delete
    await expect(gitDDB.delete(doc)).resolves.toMatchObject({
      ok: true,
      id: expect.stringMatching('^' + _id + '$'),
      file_sha: expect.stringMatching(/^[\da-z]{40}$/),
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });

    await gitDDB.destroy();
  });

  test('Use non-ASCII _id.', async () => {
    const dbName = `test_repos_${monoId()}`;
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    await gitDDB.open();
    const _id = '春はあけぼの';
    const doc = { _id: _id, name: 'shirase' };
    await gitDDB.put(doc);

    // Delete
    await expect(gitDDB.delete(_id)).resolves.toMatchObject({
      ok: true,
      id: expect.stringMatching('^' + _id + '$'),
      file_sha: expect.stringMatching(/^[\da-z]{40}$/),
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });

    // Check commit message
    const repository = gitDDB.repository();
    if (repository !== undefined) {
      const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
      const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
      expect(commit.message()).toEqual(`remove: ${_id}`);
    }

    await gitDDB.destroy();
  });

  test('Undefined _id', async () => {
    const dbName = `test_repos_${monoId()}`;
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    await gitDDB.open();
    // @ts-ignore
    await expect(gitDDB.delete()).rejects.toThrowError(UndefinedDocumentIdError);
    await gitDDB.destroy();
  });
});

describe('remove(): remove document:', () => {
  const localDir = `./test/database_delete${monoId()}`;

  beforeAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  afterAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  test('Remove from sub-directory.', async () => {
    const dbName = `test_repos_${monoId()}`;
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    await gitDDB.open();
    const _id1 = 'dir/1';
    const _id2 = 'dir/2';
    const _id3 = 'dir/childDir/3';

    await expect(gitDDB.remove(_id1)).rejects.toThrowError(DocumentNotFoundError);

    // Put documents into deep directories.
    await gitDDB.put({ _id: _id1, name: 'Kimari' });
    await gitDDB.put({ _id: _id2, name: 'Shirase' });
    await gitDDB.put({ _id: _id3, name: 'Hinata' });
    /**
      └── dir
          ├── 1.json
          ├── 2.json
          └── childDir
              └── 3.json
    */
    // Check if file exists.
    const fileExt = '.json';
    await expect(
      fs.access(path.resolve(gitDDB.workingDir(), _id1 + fileExt), fs.constants.F_OK)
    ).resolves.toBeUndefined();

    // Delete document#1
    await expect(gitDDB.remove(_id1)).resolves.toMatchObject({
      ok: true,
      id: expect.stringMatching('^' + _id1 + '$'),
      file_sha: expect.stringMatching(/^[\da-z]{40}$/),
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });
    // Check commit message
    const repository = gitDDB.repository();
    if (repository !== undefined) {
      const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
      const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
      expect(commit.message()).toEqual(`remove: ${_id1}`);
    }

    /**
      └── dir
          ├── 2.json
          └── childDir
              └── 3.json
    */
    // Check if get and remove fail.
    await expect(gitDDB.get(_id1)).rejects.toThrowError(DocumentNotFoundError);
    await expect(gitDDB.remove(_id1)).rejects.toThrowError(DocumentNotFoundError);
    // @ts-ignore
    await expect(remove_worker(undefined)).rejects.toThrowError(UndefinedDBError);
    // @ts-ignore
    await expect(remove_worker(gitDDB, undefined)).rejects.toThrowError(
      DocumentNotFoundError
    );

    // Check if file is deleted.
    await expect(
      fs.access(path.resolve(gitDDB.workingDir(), _id1), fs.constants.F_OK)
    ).rejects.toThrowError();

    // Directory is not empty
    await expect(
      fs.access(path.dirname(path.resolve(gitDDB.workingDir(), _id1)), fs.constants.F_OK)
    ).resolves.toBeUndefined();

    // Delete document#2
    await gitDDB.remove(_id2);

    /**
      └── dir
          └── childDir
              └── 3.json
    */
    // Directory is not empty
    await expect(
      fs.access(path.dirname(path.resolve(gitDDB.workingDir(), _id2)), fs.constants.F_OK)
    ).resolves.toBeUndefined();

    // Delete document#3
    // Empty parent directories will be removed recursively.
    await gitDDB.remove(_id3);
    /**
      └── (empty)
    */
    // Check if childDir/ exists.
    await expect(
      fs.access(path.dirname(path.resolve(gitDDB.workingDir(), _id3)), fs.constants.F_OK)
    ).rejects.toThrowError();
    // Check if dir/ exists.
    await expect(
      fs.access(path.dirname(path.resolve(gitDDB.workingDir(), _id2)), fs.constants.F_OK)
    ).rejects.toThrowError();

    await gitDDB.destroy();
  });

  test('Set a commit message.', async () => {
    const dbName = `test_repos_${monoId()}`;
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    await gitDDB.open();
    const _id = 'test/prof01';
    await gitDDB.put({ _id: _id, name: 'shirase' });

    // Delete
    await gitDDB.remove(_id, { commit_message: 'my commit message' });

    // Check commit message
    const repository = gitDDB.repository();
    if (repository !== undefined) {
      const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
      const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
      expect(commit.message()).toEqual(`my commit message`);
    }

    await gitDDB.destroy();
  });

  test('Use JsonObject as key.', async () => {
    const dbName = `test_repos_${monoId()}`;
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    await gitDDB.open();
    const _id = 'test/prof01';
    const doc = { _id: _id, name: 'shirase' };
    await gitDDB.put(doc);

    // Delete
    await expect(gitDDB.remove(doc)).resolves.toMatchObject({
      ok: true,
      id: expect.stringMatching('^' + _id + '$'),
      file_sha: expect.stringMatching(/^[\da-z]{40}$/),
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });

    await gitDDB.destroy();
  });
});

describe('remove(): worker:', () => {
  const localDir = `./test/database_delete${monoId()}`;
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

  test('All at once', async () => {
    const dbName = `test_repos_${monoId()}`;
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.open();

    await Promise.all([
      gitDDB.put({ _id: _id_a, name: name_a }),
      gitDDB.put({ _id: _id_b, name: name_b }),
      gitDDB.put({ _id: _id_c01, name: name_c01 }),
      gitDDB.put({ _id: _id_c02, name: name_c02 }),
      gitDDB.put({ _id: _id_d, name: name_d }),
      gitDDB.put({ _id: _id_p, name: name_p }),
    ]);

    await Promise.all([
      gitDDB.remove(_id_a),
      gitDDB.remove(_id_b),
      gitDDB.remove(_id_c01),
      gitDDB.remove(_id_c02),
      gitDDB.remove(_id_d),
    ]);

    await expect(gitDDB.allDocs({ recursive: true })).resolves.toMatchObject({
      total_rows: 1,
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
      rows: [
        {
          id: expect.stringMatching('^' + _id_p + '$'),
          file_sha: expect.stringMatching(/^[\da-z]{40}$/),
        },
      ],
    });

    await gitDDB.destroy();
  });

  test('Concurrent calls of _remove_worker() cause an error.', async () => {
    const dbName = `test_repos_${monoId()}`;
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.open();

    await Promise.all([
      gitDDB.put({ _id: _id_a, name: name_a }),
      gitDDB.put({ _id: _id_b, name: name_b }),
      gitDDB.put({ _id: _id_c01, name: name_c01 }),
      gitDDB.put({ _id: _id_c02, name: name_c02 }),
      gitDDB.put({ _id: _id_d, name: name_d }),
      gitDDB.put({ _id: _id_p, name: name_p }),
    ]);

    await expect(
      Promise.all([
        remove_worker(gitDDB, _id_a, gitDDB.fileExt, 'message'),
        remove_worker(gitDDB, _id_b, gitDDB.fileExt, 'message'),
        remove_worker(gitDDB, _id_c01, gitDDB.fileExt, 'message'),
        remove_worker(gitDDB, _id_c02, gitDDB.fileExt, 'message'),
        remove_worker(gitDDB, _id_d, gitDDB.fileExt, 'message'),
      ])
    ).rejects.toThrowError();

    await gitDDB.destroy();
  });
});
