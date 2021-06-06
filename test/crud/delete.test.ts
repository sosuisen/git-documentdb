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
import { JSON_EXT, SHORT_SHA_LENGTH } from '../../src/const';
import {
  DocumentNotFoundError,
  InvalidIdCharacterError,
  RepositoryNotOpenError,
  UndefinedDBError,
  UndefinedDocumentIdError,
} from '../../src/error';
import { GitDocumentDB } from '../../src/index';
import { delete_worker } from '../../src/crud/delete';
import { TaskMetadata } from '../../src/types';
import { sleep } from '../../src/utils';

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = `./test/database_delete`;

beforeEach(function () {
  // @ts-ignore
  console.log(`... ${this.currentTest.title}`);
});

beforeAll(() => {
  fs.removeSync(path.resolve(localDir));
});

afterAll(() => {
  fs.removeSync(path.resolve(localDir));
});
describe('<crud/delete>', () => {
  describe('delete():', () => {
    it('deletes a document by id.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });

      await gitDDB.createDB();
      const _id = 'prof01';
      const doc = { _id: _id, name: 'shirase' };
      await gitDDB.put(doc);

      // Delete
      const deleteResult = await gitDDB.delete(_id);
      expect(deleteResult).toMatchObject({
        ok: true,
        id: expect.stringMatching('^' + _id + '$'),
        file_sha: expect.stringMatching(/^[\da-z]{40}$/),
        commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
      });
      const short_sha = deleteResult.file_sha.substr(0, SHORT_SHA_LENGTH);

      // Check commit message
      const repository = gitDDB.repository();
      if (repository !== undefined) {
        const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
        const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
        expect(commit.message()).toEqual(`delete: ${_id}${JSON_EXT}(${short_sha})`);
      }

      await gitDDB.destroy();
    });

    it('deletes a document by JsonDoc.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });

      await gitDDB.createDB();
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

    it('deletes a document which _id is non-ASCII.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });

      await gitDDB.createDB();
      const _id = '春はあけぼの';
      const doc = { _id: _id, name: 'shirase' };
      await gitDDB.put(doc);

      // Delete
      const deleteResult = await gitDDB.delete(_id);
      expect(deleteResult).toMatchObject({
        ok: true,
        id: expect.stringMatching('^' + _id + '$'),
        file_sha: expect.stringMatching(/^[\da-z]{40}$/),
        commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
      });
      const short_sha = deleteResult.file_sha.substr(0, SHORT_SHA_LENGTH);

      // Check commit message
      const repository = gitDDB.repository();
      if (repository !== undefined) {
        const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
        const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
        expect(commit.message()).toEqual(`delete: ${_id}${JSON_EXT}(${short_sha})`);
      }

      await gitDDB.destroy();
    });

    it('throws UndefinedDocumentIdError', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });

      await gitDDB.createDB();
      // @ts-ignore
      await expect(gitDDB.delete()).rejects.toThrowError(UndefinedDocumentIdError);
      await gitDDB.destroy();
    });
  });

  describe('remove()', () => {
    it('throws RepositoryNotOpenError.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await expect(gitDDB.remove('prof01')).rejects.toThrowError(RepositoryNotOpenError);
      await expect(
        delete_worker(gitDDB, 'prof01', JSON_EXT, 'message')
      ).rejects.toThrowError(RepositoryNotOpenError);
      await gitDDB.destroy();
    });

    it('throws InvalidIdCharacterError', async () => {
      const dbName = monoId();

      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });

      await gitDDB.createDB();

      await expect(gitDDB.remove('_underscore')).rejects.toThrowError(
        InvalidIdCharacterError
      );

      // @ts-ignore
      await expect(gitDDB.remove()).rejects.toThrowError(UndefinedDocumentIdError);

      await expect(gitDDB.remove({})).rejects.toThrowError(UndefinedDocumentIdError);

      await gitDDB.destroy();
    });

    it('deletes from sub-directory.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });

      await gitDDB.createDB();
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
      const deleteResult = await gitDDB.remove(_id1);
      expect(deleteResult).toMatchObject({
        ok: true,
        id: expect.stringMatching('^' + _id1 + '$'),
        file_sha: expect.stringMatching(/^[\da-z]{40}$/),
        commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
      });
      const short_sha = deleteResult.file_sha.substr(0, SHORT_SHA_LENGTH);

      // Check commit message
      const repository = gitDDB.repository();
      if (repository !== undefined) {
        const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
        const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
        expect(commit.message()).toEqual(`delete: ${_id1}${JSON_EXT}(${short_sha})`);
      }

      /**
      └── dir
          ├── 2.json
          └── childDir
              └── 3.json
    */
      // Check if get and remove fail.
      await expect(gitDDB.get(_id1)).resolves.toBeUndefined();
      await expect(gitDDB.remove(_id1)).rejects.toThrowError(DocumentNotFoundError);
      // @ts-ignore
      await expect(delete_worker(undefined)).rejects.toThrowError(UndefinedDBError);
      // @ts-ignore
      await expect(delete_worker(gitDDB, undefined)).rejects.toThrowError(
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

    it('modifies a commit message.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });

      await gitDDB.createDB();
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

    it('deletes a document by JsonObject.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });

      await gitDDB.createDB();
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

  describe('delete_worker', () => {
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

    it('deletes all at once', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.createDB();

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

    it('called concurrently throws an error.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.createDB();

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
          delete_worker(gitDDB, _id_a, JSON_EXT, 'message'),
          delete_worker(gitDDB, _id_b, JSON_EXT, 'message'),
          delete_worker(gitDDB, _id_c01, JSON_EXT, 'message'),
          delete_worker(gitDDB, _id_c02, JSON_EXT, 'message'),
          delete_worker(gitDDB, _id_d, JSON_EXT, 'message'),
        ])
      ).rejects.toThrowError();

      await gitDDB.destroy();
    });
  });

  it('set taskId', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    const enqueueEvent: TaskMetadata[] = [];
    await gitDDB.put({ _id: '1' });
    await gitDDB.put({ _id: '2' });
    const id1 = gitDDB.taskQueue.newTaskId();
    const id2 = gitDDB.taskQueue.newTaskId();
    await gitDDB.delete(
      { _id: '1' },
      {
        taskId: id1,
        enqueueCallback: (taskMetadata: TaskMetadata) => {
          enqueueEvent.push(taskMetadata);
        },
      }
    );
    await gitDDB.delete(
      { _id: '2' },
      {
        taskId: id2,
        enqueueCallback: (taskMetadata: TaskMetadata) => {
          enqueueEvent.push(taskMetadata);
        },
      }
    );

    await sleep(2000);
    expect(enqueueEvent[0].taskId).toBe(id1);
    expect(enqueueEvent[1].taskId).toBe(id2);

    await gitDDB.destroy();
  });
});
