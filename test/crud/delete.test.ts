/* eslint-disable @typescript-eslint/naming-convention */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import { monotonicFactory } from 'ulid';
import fs from 'fs-extra';
import git from 'isomorphic-git';
import expect from 'expect';
import sinon from 'sinon';
import { JSON_EXT, SHORT_SHA_LENGTH } from '../../src/const';
import { Err } from '../../src/error';
import { GitDocumentDB } from '../../src/git_documentdb';
import { deleteImpl, deleteWorker } from '../../src/crud/delete';
import { TaskMetadata } from '../../src/types';
import { sleep, toSortedJSONString } from '../../src/utils';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs_module = require('fs-extra');

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = `./test/database_crud_delete`;

// Use sandbox to restore stub and spy in parallel mocha tests
let sandbox: sinon.SinonSandbox;
beforeEach(function () {
  // @ts-ignore
  console.log(`... ${this.currentTest.fullTitle()}`);
  sandbox = sinon.createSandbox();
});

afterEach(function () {
  sandbox.restore();
});

before(() => {
  fs.removeSync(path.resolve(localDir));
});

after(() => {
  fs.removeSync(path.resolve(localDir));
});

describe('<crud/delete>', () => {
  describe('deleteImpl()', () => {
    it('throws DatabaseClosingError', async () => {
      const dbName = monoId();
      const gitDDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();

      for (let i = 0; i < 50; i++) {
        // put() will throw Error after the database is closed by force.
        gitDDB.put({ _id: i.toString(), name: i.toString() }).catch(() => {});
      }
      // Call close() without await
      gitDDB.close().catch(() => {});
      const _id = 'prof01';
      await expect(deleteImpl(gitDDB, '', _id, _id + JSON_EXT)).rejects.toThrowError(
        Err.DatabaseClosingError
      );

      // wait close
      while (gitDDB.isClosing) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(1000);
      }
      await gitDDB.destroy();
    });

    it('throws TaskCancelError', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();

      const workers = [];
      let taskCancelErrorCount = 0;
      for (let i = 0; i < 50; i++) {
        deleteImpl(gitDDB, '', i.toString(), i.toString()).catch(
          // eslint-disable-next-line no-loop-func
          err => {
            if (err instanceof Err.TaskCancelError) taskCancelErrorCount++;
          }
        );
      }
      gitDDB.taskQueue.stop();
      await sleep(3000);
      expect(taskCancelErrorCount).toBeGreaterThan(0);
      await gitDDB.destroy();
    });

    it('throws DocumentNotFoundError when a document does not exist', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });

      await gitDDB.open();
      const _id = 'prof01';
      const json = { _id: _id, name: 'shirase' };
      const putResult = await gitDDB.put(json);

      await expect(
        deleteImpl(gitDDB, '', _id, _id + JSON_EXT + '_invalid')
      ).rejects.toThrowError(Err.DocumentNotFoundError);

      await gitDDB.destroy();
    });

    it('deletes a document by id.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });

      await gitDDB.open();
      const _id = 'prof01';
      const json = { _id, name: 'Shirase' };
      const putResult = await gitDDB.put(json);

      const prevCommitOid = putResult.commit.oid;

      // Delete
      const { oid } = await git.hashBlob({ object: toSortedJSONString(json) });
      const beforeTimestamp = Math.floor(Date.now() / 1000) * 1000;
      const pickedDeleteResult = await deleteImpl(gitDDB, '', _id, _id + JSON_EXT);
      const afterTimestamp = Math.floor(Date.now() / 1000) * 1000;

      const currentCommitOid = await git.resolveRef({
        fs,
        dir: gitDDB.workingDir,
        ref: 'HEAD',
      });

      // Check NormalizedCommit
      expect(pickedDeleteResult.commit.oid).toBe(currentCommitOid);
      expect(pickedDeleteResult.commit.message).toBe(
        `delete: ${_id}${JSON_EXT}(${oid.substr(0, SHORT_SHA_LENGTH)})`
      );
      expect(pickedDeleteResult.commit.parent).toEqual([prevCommitOid]);
      expect(pickedDeleteResult.commit.author.name).toEqual(gitDDB.author.name);
      expect(pickedDeleteResult.commit.author.email).toEqual(gitDDB.author.email);
      expect(pickedDeleteResult.commit.author.timestamp).toBeGreaterThanOrEqual(
        beforeTimestamp
      );
      expect(pickedDeleteResult.commit.author.timestamp).toBeLessThanOrEqual(
        afterTimestamp
      );
      expect(pickedDeleteResult.commit.committer.name).toEqual(gitDDB.author.name);
      expect(pickedDeleteResult.commit.committer.email).toEqual(gitDDB.author.email);
      expect(pickedDeleteResult.commit.committer.timestamp).toBeGreaterThanOrEqual(
        beforeTimestamp
      );
      expect(pickedDeleteResult.commit.committer.timestamp).toBeLessThanOrEqual(
        afterTimestamp
      );

      await gitDDB.destroy();
    });

    it('deletes with a default commit message.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });

      await gitDDB.open();
      const _id = 'prof01';
      const json = { _id, name: 'Shirase' };
      const putResult = await gitDDB.put(json);

      // Delete
      const shortOid = putResult.fileOid.substr(0, SHORT_SHA_LENGTH);
      const pickedDeleteResult = await deleteImpl(gitDDB, '', _id, _id + JSON_EXT);

      expect(pickedDeleteResult.commit.message).toEqual(
        `delete: ${_id}${JSON_EXT}(${shortOid})`
      );

      // Check commit directly
      const commitOid = await git.resolveRef({ fs, dir: gitDDB.workingDir, ref: 'HEAD' });
      const { commit } = await git.readCommit({
        fs,
        dir: gitDDB.workingDir,
        oid: commitOid,
      });
      expect(commit.message).toEqual(`delete: ${_id}${JSON_EXT}(${shortOid})\n`);

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
      const putResult = await gitDDB.put(doc);

      // Delete
      const deleteResult = await deleteImpl(gitDDB, '', _id, _id + JSON_EXT);

      const shortOid = putResult.fileOid.substr(0, SHORT_SHA_LENGTH);
      expect(deleteResult.fileOid).toBe(putResult.fileOid);
      expect(deleteResult.commit.message).toBe(`delete: ${_id}${JSON_EXT}(${shortOid})`);

      // Check commit directly
      const commitOid = await git.resolveRef({ fs, dir: gitDDB.workingDir, ref: 'HEAD' });
      const { commit } = await git.readCommit({
        fs,
        dir: gitDDB.workingDir,
        oid: commitOid,
      });
      expect(commit.message).toEqual(`delete: ${_id}${JSON_EXT}(${shortOid})\n`);

      await gitDDB.destroy();
    });

    it('deletes all at once', async () => {
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
        deleteImpl(gitDDB, '', _id_a, _id_a + JSON_EXT),
        deleteImpl(gitDDB, '', _id_b, _id_b + JSON_EXT),
        deleteImpl(gitDDB, '', _id_c01, _id_c01 + JSON_EXT),
        deleteImpl(gitDDB, '', _id_c02, _id_c02 + JSON_EXT),
        deleteImpl(gitDDB, '', _id_d, _id_d + JSON_EXT),
      ]);

      await expect(gitDDB.findFatDoc({ recursive: true })).resolves.toEqual([
        {
          _id: _id_p,
          name: _id_p + JSON_EXT,
          fileOid: expect.stringMatching(/^[\da-z]{40}$/),
          type: 'json',
          doc: { _id: _id_p, name: name_p },
        },
      ]);

      await gitDDB.destroy();
    });

    it('set taskId and enqueueCallback', async () => {
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
      await deleteImpl(gitDDB, '', '1', '1.json', {
        taskId: id1,
        enqueueCallback: (taskMetadata: TaskMetadata) => {
          enqueueEvent.push(taskMetadata);
        },
      });
      await deleteImpl(gitDDB, '', '2', '2.json', {
        taskId: id2,
        enqueueCallback: (taskMetadata: TaskMetadata) => {
          enqueueEvent.push(taskMetadata);
        },
      });

      await sleep(2000);
      expect(enqueueEvent[0].taskId).toBe(id1);
      expect(enqueueEvent[1].taskId).toBe(id2);

      await gitDDB.destroy();
    });
  });

  describe('deleteWorker()', () => {
    it('throws UndefinedDBError when Undefined DB', async () => {
      // @ts-ignore
      await expect(deleteWorker(undefined)).rejects.toThrowError(Err.UndefinedDBError);
    });

    it('throws DocumentNotFoundError when collectionPath is undefined.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      // @ts-ignore
      await expect(deleteWorker(gitDDB, undefined, '')).rejects.toThrowError(
        Err.DocumentNotFoundError
      );

      await gitDDB.destroy();
    });

    it('throws DocumentNotFoundError when shortName is undefined.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      // @ts-ignore
      await expect(deleteWorker(gitDDB, '', undefined)).rejects.toThrowError(
        Err.DocumentNotFoundError
      );

      await gitDDB.destroy();
    });

    it('throws DocumentNotFoundError when both collectionPath and shortName are NULL string.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      await expect(deleteWorker(gitDDB, '', '', '')).rejects.toThrowError(
        Err.DocumentNotFoundError
      );

      await gitDDB.destroy();
    });

    it('throws CannotDeleteDataError', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();

      await gitDDB.put({ _id: 'prof01' });
      const stubEnsureDir = sandbox.stub(fs_module, 'remove');
      stubEnsureDir.rejects();

      await expect(deleteWorker(gitDDB, '', 'prof01' + JSON_EXT, '')).rejects.toThrowError(
        Err.CannotDeleteDataError
      );
      await gitDDB.destroy();
    });
  });
});
