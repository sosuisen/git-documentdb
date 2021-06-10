/* eslint-disable @typescript-eslint/naming-convention */
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
import { deleteWorker } from '../../src/crud/delete';
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
        dbName,
        localDir,
      });

      await gitDDB.open();
      const _id = 'prof01';
      const doc = { _id: _id, name: 'shirase' };
      await gitDDB.put(doc);

      // Delete
      const deleteResult = await gitDDB.delete(_id);
      const short_sha = deleteResult.fileSha.substr(0, SHORT_SHA_LENGTH);
      expect(deleteResult).toMatchObject({
        _id: expect.stringMatching('^' + _id + '$'),
        fileSha: expect.stringMatching(/^[\da-z]{40}$/),
        commitSha: expect.stringMatching(/^[\da-z]{40}$/),
        commitMessage: `delete: ${_id}${JSON_EXT}(${short_sha})`,
      });

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
        dbName,
        localDir,
      });

      await gitDDB.open();
      const _id = 'prof01';
      const doc = { _id: _id, name: 'shirase' };
      await gitDDB.put(doc);

      // Delete
      await expect(gitDDB.delete(doc)).resolves.toMatchObject({
        _id: expect.stringMatching('^' + _id + '$'),
        fileSha: expect.stringMatching(/^[\da-z]{40}$/),
        commitSha: expect.stringMatching(/^[\da-z]{40}$/),
        commitMessage: expect.stringMatching('.+'),
      });

      await gitDDB.destroy();
    });

    it('deletes a document which _id is non-ASCII.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });

      await gitDDB.open();
      const _id = '春はあけぼの';
      const doc = { _id: _id, name: 'shirase' };
      await gitDDB.put(doc);

      // Delete
      const deleteResult = await gitDDB.delete(_id);
      const short_sha = deleteResult.fileSha.substr(0, SHORT_SHA_LENGTH);
      expect(deleteResult).toMatchObject({
        _id: expect.stringMatching('^' + _id + '$'),
        fileSha: expect.stringMatching(/^[\da-z]{40}$/),
        commitSha: expect.stringMatching(/^[\da-z]{40}$/),
        commitMessage: `delete: ${_id}${JSON_EXT}(${short_sha})`,
      });

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
        dbName,
        localDir,
      });

      await gitDDB.open();
      // @ts-ignore
      await expect(gitDDB.delete()).rejects.toThrowError(UndefinedDocumentIdError);
      await gitDDB.destroy();
    });
  });

  describe('deleteWorker', () => {
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
        dbName,
        localDir,
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
        totalRows: 1,
        commitSha: expect.stringMatching(/^[\da-z]{40}$/),
        rows: [
          {
            _id: expect.stringMatching('^' + _id_p + '$'),
            fileSha: expect.stringMatching(/^[\da-z]{40}$/),
          },
        ],
      });

      await gitDDB.destroy();
    });

    it('called concurrently throws an error.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
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
          deleteWorker(gitDDB, _id_a, JSON_EXT, 'message'),
          deleteWorker(gitDDB, _id_b, JSON_EXT, 'message'),
          deleteWorker(gitDDB, _id_c01, JSON_EXT, 'message'),
          deleteWorker(gitDDB, _id_c02, JSON_EXT, 'message'),
          deleteWorker(gitDDB, _id_d, JSON_EXT, 'message'),
        ])
      ).rejects.toThrowError();

      await gitDDB.destroy();
    });
  });

  it('set taskId', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
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
