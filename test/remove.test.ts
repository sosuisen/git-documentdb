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
import {
  DocumentNotFoundError,
  RepositoryNotOpenError,
  UndefinedDocumentIdError,
} from '../src/error';
import { GitDocumentDB } from '../src/index';

describe('Delete document', () => {
  const localDir = './test/database_delete01';

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
    await expect(gitDDB.delete(_id)).rejects.toThrowError(DocumentNotFoundError);

    await gitDDB.put({ _id: _id, name: 'shirase' });
    await gitDDB.put({ _id: _id2, name: 'kimari' });

    // Check if file exists.
    const fileExt = '.json';
    await expect(
      fs.access(path.resolve(gitDDB.workingDir(), _id + fileExt), fs.constants.F_OK)
    ).resolves.toBeUndefined();

    // Delete
    await expect(gitDDB.delete(_id)).resolves.toMatchObject({
      ok: true,
      id: expect.stringMatching(_id),
      file_sha: expect.stringMatching(/^[\da-z]{40}$/),
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });
    // Check commit message
    const repository = gitDDB.getRepository();
    if (repository !== undefined) {
      const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
      const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
      expect(commit.message()).toEqual(`remove: ${_id}`);
    }

    await expect(gitDDB.delete(_id)).rejects.toThrowError(DocumentNotFoundError);
    await expect(gitDDB.get(_id)).rejects.toThrowError(DocumentNotFoundError);
    // @ts-ignore
    await expect(gitDDB._remove_concurrent(undefined)).rejects.toThrowError(
      DocumentNotFoundError
    );

    // Check if file is deleted.
    await expect(
      fs.access(path.resolve(gitDDB.workingDir(), _id), fs.constants.F_OK)
    ).rejects.toThrowError();
    // Directory is not empty
    await expect(
      fs.access(path.dirname(path.resolve(gitDDB.workingDir(), _id)), fs.constants.F_OK)
    ).resolves.toBeUndefined();

    await gitDDB.delete(_id2);
    // Directory is empty
    await expect(
      fs.access(path.dirname(path.resolve(gitDDB.workingDir(), _id)), fs.constants.F_OK)
    ).rejects.toThrowError();

    await gitDDB.destroy();

    await expect(gitDDB.delete(_id)).rejects.toThrowError(RepositoryNotOpenError);
    await expect(gitDDB._remove_concurrent(_id, '', 'message')).rejects.toThrowError(
      RepositoryNotOpenError
    );
  });

  test('delete(): Set commit message.', async () => {
    const dbName = 'test_repos_02';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    await gitDDB.open();
    const _id = 'test/prof01';
    await gitDDB.put({ _id: _id, name: 'shirase' });

    // Delete
    await gitDDB.delete(_id, { commit_message: 'my commit message' });

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

    // @ts-ignore
    await expect(gitDDB.delete()).rejects.toThrowError(UndefinedDocumentIdError);

    await gitDDB.destroy();
  });

  test('delete(): Use JsonObject as key.', async () => {
    const dbName = 'test_repos_03';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    await gitDDB.open();
    const _id = 'test/prof01';
    const doc = { _id: _id, name: 'shirase' };
    await gitDDB.put(doc);

    // Delete
    await expect(gitDDB.delete(doc)).resolves.toMatchObject({
      ok: true,
      id: expect.stringMatching(_id),
      file_sha: expect.stringMatching(/^[\da-z]{40}$/),
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });

    await gitDDB.destroy();
  });
});

describe('Concurrent', () => {
  const localDir = './test/database_delete02';
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

  test('delete(): All at once', async () => {
    const dbName = 'test_repos_1';
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
      gitDDB.delete(_id_a),
      gitDDB.delete(_id_b),
      gitDDB.delete(_id_c01),
      gitDDB.delete(_id_c02),
      gitDDB.delete(_id_d),
    ]);

    await expect(gitDDB.allDocs({ recursive: true })).resolves.toMatchObject({
      total_rows: 1,
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
      rows: [
        {
          id: expect.stringMatching(_id_p),
          file_sha: expect.stringMatching(/^[\da-z]{40}$/),
        },
      ],
    });

    await gitDDB.destroy();
  });

  test('delete(): Concurrent calls of _remove_concurrent() cause an error.', async () => {
    const dbName = 'test_repos_2';
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
        gitDDB._remove_concurrent(_id_a, '', 'message'),
        gitDDB._remove_concurrent(_id_b, '', 'message'),
        gitDDB._remove_concurrent(_id_c01, '', 'message'),
        gitDDB._remove_concurrent(_id_c02, '', 'message'),
        gitDDB._remove_concurrent(_id_d, '', 'message'),
      ])
    ).rejects.toThrowError();

    await gitDDB.destroy();
  });
});
