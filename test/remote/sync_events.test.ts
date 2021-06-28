/* eslint-disable @typescript-eslint/naming-convention */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

/**
 * Test synchronization events
 * by using GitHub Personal Access Token
 * These tests create a new repository on GitHub if not exists.
 */
import path from 'path';
import fs from 'fs-extra';
import expect from 'expect';
import sinon from 'sinon';
import {
  ChangedFile,
  RemoteOptions,
  SyncResult,
  SyncResultFastForwardMerge,
  SyncResultMergeAndPush,
  SyncResultPush,
  TaskMetadata,
} from '../../src/types';
import { sleep } from '../../src/utils';
import {
  compareWorkingDirAndBlobs,
  createClonedDatabases,
  createDatabase,
  destroyDBs,
  destroyRemoteRepository,
  getChangedFileDelete,
  getChangedFileInsert,
  getChangedFileUpdate,
  getCommitInfo,
  getWorkingDirDocs,
  removeRemoteRepositories,
} from '../remote_utils';
import { GitDocumentDB } from '../../src/git_documentdb';
import { Sync } from '../../src/remote/sync';
import { Err } from '../../src/error';
import { MINIMUM_SYNC_INTERVAL, NETWORK_RETRY } from '../../src/const';
import { pushWorker } from '../../src/remote/push_worker';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pushWorker_module = require('../../src/remote/push_worker');

const reposPrefix = 'test_sync_events___';
const localDir = `./test/database_sync_events`;

let idCounter = 0;
const serialId = () => {
  return `${reposPrefix}${idCounter++}`;
};

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
  // It may throw error due to memory leak of getCommitLogs()
  // fs.removeSync(path.resolve(localDir));
});

// GITDDB_GITHUB_USER_URL: URL of your GitHub account
// e.g.) https://github.com/foo/
const maybe =
  process.env.GITDDB_GITHUB_USER_URL && process.env.GITDDB_PERSONAL_ACCESS_TOKEN
    ? describe
    : describe.skip;

maybe('<remote/sync> [event]', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  before(async () => {
    await removeRemoteRepositories(reposPrefix);
  });

  /**
   * Events
   */
  describe('change', () => {
    it('occurs once', async () => {
      const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
        remoteURLBase,
        localDir,
        serialId
      );

      // A puts and pushes
      const jsonA1 = { _id: '1', name: 'fromA' };
      const putResult1 = await dbA.put(jsonA1);
      await syncA.tryPush();

      // B syncs
      let result: SyncResultFastForwardMerge | undefined;
      let changeTaskId = '';
      syncB.on('change', (syncResult: SyncResult, taskMetadata: TaskMetadata) => {
        result = syncResult as SyncResultFastForwardMerge;
        changeTaskId = taskMetadata.taskId;
      });
      let complete = false;
      let endTaskId = '';
      syncB.on('complete', (taskMetadata: TaskMetadata) => {
        complete = true;
        endTaskId = taskMetadata.taskId;
      });
      await syncB.trySync();

      // eslint-disable-next-line no-unmodified-loop-condition
      while (!complete) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(1000);
      }

      expect(result!.action).toBe('fast-forward merge');

      expect(result!.commits).toMatchObject({
        local: getCommitInfo([putResult1]),
      });

      expect(result!.changes.local).toEqual([getChangedFileInsert(jsonA1, putResult1)]);

      expect(changeTaskId).toBe(endTaskId);

      await destroyDBs([dbA, dbB]);
    });

    it('is propagated between local and remote sites', async () => {
      const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
        remoteURLBase,
        localDir,
        serialId
      );

      // A puts and pushes
      const jsonA1 = { _id: '1', name: 'fromA' };
      const putResultA1 = await dbA.put(jsonA1);
      await syncA.trySync();

      // B puts and pushes
      const jsonB1 = { _id: '1', name: 'fromB' };
      const putResultB1 = await dbB.put(jsonB1);

      let resultA: SyncResultFastForwardMerge | undefined;
      let completeA = false;
      syncA.on('change', (syncResult: SyncResult) => {
        resultA = syncResult as SyncResultFastForwardMerge;
        console.log('A: ' + resultA.action);
        if (resultA.action === 'fast-forward merge') {
          completeA = true;
        }
      });

      let resultB: SyncResultFastForwardMerge | undefined;
      syncB.on('change', (syncResult: SyncResult) => {
        resultB = syncResult as SyncResultFastForwardMerge;
        console.log('B: ' + resultB.action);
      });
      let completeB = false;
      syncB.on('complete', () => {
        completeB = true;
      });

      syncA.resume({ ...syncA.options, interval: 3000 });
      syncB.resume({ ...syncA.options, interval: 3000 });

      // eslint-disable-next-line no-unmodified-loop-condition
      while (!completeA || !completeB) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(1000);
      }

      expect(resultA!.action).toBe('fast-forward merge');

      expect(resultA!.changes.local).toEqual([
        getChangedFileUpdate(jsonA1, putResultA1, jsonB1, putResultB1),
      ]);

      expect(resultB!.action).toBe('resolve conflicts and push');

      expect(resultB!.changes.local).toEqual([]);

      expect(getWorkingDirDocs(dbA)).toEqual([jsonB1]);
      expect(getWorkingDirDocs(dbB)).toEqual([jsonB1]);

      await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
      await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

      await destroyDBs([dbA, dbB]);
    });

    /**
     * before:  jsonA1  jsonA2
     * dbA   : -jsonA1 -jsonA2
     * dbB   :                 jsonB3
     * after :                 jsonB3
     */
    it('occurs with every retry', async () => {
      const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
        remoteURLBase,
        localDir,
        serialId
      );

      await dbA.put({ _id: '1' });
      await syncA.tryPush();

      await dbB.put({ _id: '2' });

      const stubPush = sandbox.stub(pushWorker_module, 'pushWorker');
      stubPush.onFirstCall().rejects(new Err.UnfetchedCommitExistsError());

      const resultsB: SyncResult[] = [];
      syncB.on('change', (result: SyncResult) => {
        if (resultsB.length === 0) {
          // Restore stub after first change event.
          stubPush.restore();
        }
        //  console.log('B: ' + JSON.stringify(result));
        resultsB.push(result);
      });
      await syncB.trySync();

      await sleep(syncA.options.retryInterval! + 5000);
      expect(resultsB.length).toBe(2);
      expect(resultsB[0].action).toBe('merge and push error');
      expect(resultsB[1].action).toBe('push');

      await destroyDBs([dbA, dbB]);
    });

    it('is followed by localChange', async () => {
      const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
        remoteURLBase,
        localDir,
        serialId
      );

      // A puts and pushes
      const jsonA1 = { _id: '1', name: 'fromA' };
      const putResult1 = await dbA.put(jsonA1);
      await syncA.tryPush();

      // B syncs
      let changes: ChangedFile[] = [];
      let changeTaskId = '';
      syncB.on('localChange', (localChanges: ChangedFile[], taskMetadata: TaskMetadata) => {
        changes = localChanges;
        changeTaskId = taskMetadata.taskId;
      });
      let complete = false;
      let endTaskId = '';
      syncB.on('complete', (taskMetadata: TaskMetadata) => {
        complete = true;
        endTaskId = taskMetadata.taskId;
      });
      await syncB.trySync();

      // eslint-disable-next-line no-unmodified-loop-condition
      while (!complete) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(1000);
      }

      expect(changes.length).toBe(1);
      expect(changes).toEqual([getChangedFileInsert(jsonA1, putResult1)]);

      expect(changeTaskId).toBe(endTaskId);

      await destroyDBs([dbA, dbB]);
    });

    /**
     * before:  jsonA1  jsonA2
     * dbA   : -jsonA1 -jsonA2
     * dbB   :                 jsonB3
     * after :                 jsonB3
     */
    it('occurs localChanges when SyncResultMergeAndPushError', async () => {
      const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
        remoteURLBase,
        localDir,
        serialId
      );

      await dbA.put({ _id: '1' });
      await syncA.tryPush();

      await dbB.put({ _id: '2' });

      const stubPush = sandbox.stub(pushWorker_module, 'pushWorker');
      stubPush.onFirstCall().rejects(new Err.UnfetchedCommitExistsError());

      const localChangesB: ChangedFile[][] = [];
      syncB.on('localChange', (changes: ChangedFile[]) => {
        if (localChangesB.length === 0) {
          // Restore stub after first change event.
          stubPush.restore();
        }
        localChangesB.push(changes);
      });

      await syncB.trySync();

      await sleep(syncB.options.retryInterval! + 5000);
      expect(localChangesB.length).toBe(1);

      await syncB.trySync();
    });

    it('is followed by remoteChange', async () => {
      const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
        remoteURLBase,
        localDir,
        serialId
      );

      let changes: ChangedFile[] = [];
      let changeTaskId = '';
      syncB.on(
        'remoteChange',
        (remoteChanges: ChangedFile[], taskMetadata: TaskMetadata) => {
          changes = remoteChanges;
          changeTaskId = taskMetadata.taskId;
        }
      );
      let complete = false;
      let endTaskId = '';
      syncB.on('complete', (taskMetadata: TaskMetadata) => {
        complete = true;
        endTaskId = taskMetadata.taskId;
      });

      // B puts and syncs
      const jsonB1 = { _id: '1', name: 'fromB' };
      const putResult1 = await dbB.put(jsonB1);
      await syncB.trySync();

      // eslint-disable-next-line no-unmodified-loop-condition
      while (!complete) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(1000);
      }

      expect(changes.length).toBe(1);

      expect(changes).toEqual([getChangedFileInsert(jsonB1, putResult1)]);

      expect(changeTaskId).toBe(endTaskId);

      await destroyDBs([dbA, dbB]);
    });

    /**
     * before:  jsonA1  jsonA2
     * dbA   : -jsonA1 -jsonA2
     * dbB   :                 jsonB3
     * after :                 jsonB3
     */
    it('occurs remoteChanges after SyncResultMergeAndPushError', async () => {
      const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
        remoteURLBase,
        localDir,
        serialId
      );

      await dbA.put({ _id: '1' });
      await syncA.tryPush();

      await dbB.put({ _id: '2' });

      const stubPush = sandbox.stub(pushWorker_module, 'pushWorker');
      stubPush.onFirstCall().rejects(new Err.UnfetchedCommitExistsError());

      let firstChange = true;
      syncB.on('change', (changes: ChangedFile[]) => {
        if (firstChange) {
          firstChange = false;
          // Restore stub after first change event.
          stubPush.restore();
        }
      });
      const remoteChangesB: ChangedFile[][] = [];
      syncB.on('remoteChange', (changes: ChangedFile[]) => {
        remoteChangesB.push(changes);
      });

      await syncB.trySync();

      await sleep(syncB.options.retryInterval! + 5000);
      expect(remoteChangesB.length).toBe(1);

      await syncB.trySync();
    });
  });

  describe('filtered by collectionPath', () => {
    it('occurs change and localChange events', async () => {
      const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
        remoteURLBase,
        localDir,
        serialId
      );

      // A puts and pushes
      const col01 = dbA.collection('col01');
      const col02 = dbA.collection('col02');
      const jsonA1 = { _id: '1', name: 'fromA' };
      const jsonA2 = { _id: '2', name: 'fromA' };
      const putResult1 = await col01.put(jsonA1);
      const putResult2 = await col02.put(jsonA2);

      const jsonA1dash = { _id: 'col01/1', name: 'fromA' };
      const putResult1dash = { ...putResult1, _id: 'col01/1' };
      const jsonA2dash = { _id: 'col02/2', name: 'fromA' };
      const putResult2dash = { ...putResult2, _id: 'col02/2' };

      await syncA.tryPush();

      // B syncs
      let col01Result: SyncResultFastForwardMerge | undefined;
      let col01ChangeTaskId: string | undefined;
      syncB.on(
        'change',
        (syncResult: SyncResult, taskMetadata: TaskMetadata) => {
          col01Result = syncResult as SyncResultFastForwardMerge;
          col01ChangeTaskId = taskMetadata.taskId;
        },
        'col01'
      );

      let changedFiles: ChangedFile[];
      syncB.on(
        'localChange',
        (files: ChangedFile[], taskMetadata: TaskMetadata) => {
          changedFiles = files;
        },
        'col02'
      );

      let rootResult: SyncResultFastForwardMerge | undefined;
      let rootChangeTaskId: string | undefined;
      syncB.on(
        'change',
        (syncResult: SyncResult, taskMetadata: TaskMetadata) => {
          rootResult = syncResult as SyncResultFastForwardMerge;
          rootChangeTaskId = taskMetadata.taskId;
        },
        ''
      );

      let complete = false;
      let endTaskId = '';
      let completeCollectionPath: string | undefined;
      syncB.on('complete', (taskMetadata: TaskMetadata) => {
        complete = true;
        endTaskId = taskMetadata.taskId;
        completeCollectionPath = taskMetadata.collectionPath;
      });
      await syncB.trySync();

      // eslint-disable-next-line no-unmodified-loop-condition
      while (!complete) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(1000);
      }

      expect(col01Result?.action).toBe('fast-forward merge');
      expect(rootResult?.action).toBe('fast-forward merge');

      expect(col01Result?.commits).toMatchObject({
        local: getCommitInfo([putResult1, putResult2]),
      });
      expect(rootResult?.commits).toMatchObject({
        local: getCommitInfo([putResult1, putResult2]),
      });

      expect(col01Result?.changes.local).toEqual([
        getChangedFileInsert(jsonA1, putResult1),
      ]);
      expect(changedFiles!).toEqual([getChangedFileInsert(jsonA2, putResult2)]);

      expect(rootResult?.changes.local).toEqual([
        getChangedFileInsert(jsonA1dash, putResult1dash),
        getChangedFileInsert(jsonA2dash, putResult2dash),
      ]);

      expect(col01ChangeTaskId).toBe(endTaskId);
      expect(rootChangeTaskId).toBe(endTaskId);

      expect(completeCollectionPath).toBe('');

      await destroyDBs([dbA, dbB]);
    });

    it('occurs change events with update and delete', async () => {
      const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
        remoteURLBase,
        localDir,
        serialId
      );

      // A puts and pushes
      const col01 = dbA.collection('col01');
      const col02 = dbA.collection('col02');
      const jsonA1 = { _id: '1', name: 'fromA' };
      const jsonA2 = { _id: '2', name: 'fromA' };
      const putResult1 = await col01.put(jsonA1);
      await col02.put(jsonA2);
      await syncA.trySync();
      const jsonA1updated = { _id: '1', name: 'updated' };
      const putResult1updated = await col01.put(jsonA1updated);
      const deleteResult2 = await col02.delete(jsonA2);

      let col01Result: SyncResultPush | undefined;
      let col01ChangeTaskId: string | undefined;
      syncA.on(
        'change',
        (syncResult: SyncResult, taskMetadata: TaskMetadata) => {
          col01Result = syncResult as SyncResultPush;
          col01ChangeTaskId = taskMetadata.taskId;
        },
        'col01'
      );

      let changedFiles: ChangedFile[];
      syncA.on(
        'remoteChange',
        (files: ChangedFile[], taskMetadata: TaskMetadata) => {
          changedFiles = files;
        },
        'col02'
      );

      let complete = false;
      syncA.on('complete', (taskMetadata: TaskMetadata) => {
        complete = true;
      });
      await syncA.tryPush();

      // eslint-disable-next-line no-unmodified-loop-condition
      while (!complete) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(1000);
      }

      expect(col01Result?.action).toBe('push');

      expect(col01Result?.commits).toMatchObject({
        remote: getCommitInfo([putResult1updated, deleteResult2]),
      });

      expect(col01Result?.changes.remote).toEqual([
        getChangedFileUpdate(jsonA1, putResult1, jsonA1updated, putResult1updated),
      ]);
      expect(changedFiles!).toEqual([getChangedFileDelete(jsonA2, deleteResult2)]);

      await destroyDBs([dbA, dbB]);
    });

    it('occurs change and remoteChange events by trySync', async () => {
      const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
        remoteURLBase,
        localDir,
        serialId
      );

      // A puts and pushes
      const col01 = dbA.collection('col01');
      const col02 = dbA.collection('col02');
      const jsonA1 = { _id: '1', name: 'fromA' };
      const jsonA2 = { _id: '2', name: 'fromA' };
      const putResult1 = await col01.put(jsonA1);
      const putResult2 = await col02.put(jsonA2);

      const jsonA1dash = { _id: 'col01/1', name: 'fromA' };
      const putResult1dash = { ...putResult1, _id: 'col01/1' };
      const jsonA2dash = { _id: 'col02/2', name: 'fromA' };
      const putResult2dash = { ...putResult2, _id: 'col02/2' };

      let col01Result: SyncResultPush | undefined;
      let col01ChangeTaskId: string | undefined;
      syncA.on(
        'change',
        (syncResult: SyncResult, taskMetadata: TaskMetadata) => {
          col01Result = syncResult as SyncResultPush;
          col01ChangeTaskId = taskMetadata.taskId;
        },
        'col01'
      );

      let changedFiles: ChangedFile[];
      syncA.on(
        'remoteChange',
        (files: ChangedFile[], taskMetadata: TaskMetadata) => {
          changedFiles = files;
        },
        'col02'
      );

      let rootResult: SyncResultPush | undefined;
      let rootChangeTaskId: string | undefined;
      syncA.on(
        'change',
        (syncResult: SyncResult, taskMetadata: TaskMetadata) => {
          rootResult = syncResult as SyncResultPush;
          rootChangeTaskId = taskMetadata.taskId;
        },
        ''
      );

      let complete = false;
      let endTaskId = '';
      let completeCollectionPath: string | undefined;
      syncA.on('complete', (taskMetadata: TaskMetadata) => {
        complete = true;
        endTaskId = taskMetadata.taskId;
        completeCollectionPath = taskMetadata.collectionPath;
      });
      await syncA.trySync();

      // eslint-disable-next-line no-unmodified-loop-condition
      while (!complete) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(1000);
      }

      expect(col01Result?.action).toBe('push');
      expect(rootResult?.action).toBe('push');

      expect(col01Result?.commits).toMatchObject({
        remote: getCommitInfo([putResult1, putResult2]),
      });
      expect(rootResult?.commits).toMatchObject({
        remote: getCommitInfo([putResult1, putResult2]),
      });

      expect(col01Result?.changes.remote).toEqual([
        getChangedFileInsert(jsonA1, putResult1),
      ]);
      expect(changedFiles!).toEqual([getChangedFileInsert(jsonA2, putResult2)]);

      expect(rootResult?.changes.remote).toEqual([
        getChangedFileInsert(jsonA1dash, putResult1dash),
        getChangedFileInsert(jsonA2dash, putResult2dash),
      ]);

      expect(col01ChangeTaskId).toBe(endTaskId);
      expect(rootChangeTaskId).toBe(endTaskId);

      expect(completeCollectionPath).toBe('');

      await destroyDBs([dbA, dbB]);
    });

    it('occurs change and remoteChange events by tryPush', async () => {
      const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
        remoteURLBase,
        localDir,
        serialId
      );

      // A puts and pushes
      const col01 = dbA.collection('col01');
      const col02 = dbA.collection('col02');
      const jsonA1 = { _id: '1', name: 'fromA' };
      const jsonA2 = { _id: '2', name: 'fromA' };
      const putResult1 = await col01.put(jsonA1);
      const putResult2 = await col02.put(jsonA2);

      const jsonA1dash = { _id: 'col01/1', name: 'fromA' };
      const putResult1dash = { ...putResult1, _id: 'col01/1' };
      const jsonA2dash = { _id: 'col02/2', name: 'fromA' };
      const putResult2dash = { ...putResult2, _id: 'col02/2' };

      let col01Result: SyncResultPush | undefined;
      let col01ChangeTaskId: string | undefined;
      syncA.on(
        'change',
        (syncResult: SyncResult, taskMetadata: TaskMetadata) => {
          col01Result = syncResult as SyncResultPush;
          col01ChangeTaskId = taskMetadata.taskId;
        },
        'col01'
      );

      let changedFiles: ChangedFile[];
      syncA.on(
        'remoteChange',
        (files: ChangedFile[], taskMetadata: TaskMetadata) => {
          changedFiles = files;
        },
        'col02'
      );

      let rootResult: SyncResultPush | undefined;
      let rootChangeTaskId: string | undefined;
      syncA.on(
        'change',
        (syncResult: SyncResult, taskMetadata: TaskMetadata) => {
          rootResult = syncResult as SyncResultPush;
          rootChangeTaskId = taskMetadata.taskId;
        },
        ''
      );

      let complete = false;
      let endTaskId = '';
      let completeCollectionPath: string | undefined;
      syncA.on('complete', (taskMetadata: TaskMetadata) => {
        complete = true;
        endTaskId = taskMetadata.taskId;
        completeCollectionPath = taskMetadata.collectionPath;
      });
      await syncA.tryPush();

      // eslint-disable-next-line no-unmodified-loop-condition
      while (!complete) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(1000);
      }

      expect(col01Result?.action).toBe('push');
      expect(rootResult?.action).toBe('push');

      expect(col01Result?.commits).toMatchObject({
        remote: getCommitInfo([putResult1, putResult2]),
      });
      expect(rootResult?.commits).toMatchObject({
        remote: getCommitInfo([putResult1, putResult2]),
      });

      expect(col01Result?.changes.remote).toEqual([
        getChangedFileInsert(jsonA1, putResult1),
      ]);
      expect(changedFiles!).toEqual([getChangedFileInsert(jsonA2, putResult2)]);

      expect(rootResult?.changes.remote).toEqual([
        getChangedFileInsert(jsonA1dash, putResult1dash),
        getChangedFileInsert(jsonA2dash, putResult2dash),
      ]);

      expect(col01ChangeTaskId).toBe(endTaskId);
      expect(rootChangeTaskId).toBe(endTaskId);

      expect(completeCollectionPath).toBe('');

      await destroyDBs([dbA, dbB]);
    });

    it('occurs change, localChange, and remoteChange events by merge and push', async () => {
      const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
        remoteURLBase,
        localDir,
        serialId
      );

      // A puts and pushes
      const col01 = dbA.collection('col01');
      const col02 = dbA.collection('col02');
      const jsonA1 = { _id: '1', name: 'fromA' };
      const jsonA2 = { _id: '2', name: 'fromA' };
      const putResult1 = await col01.put(jsonA1);
      const putResult2 = await col02.put(jsonA2);

      const jsonA1dash = { _id: 'col01/1', name: 'fromA' };
      const putResult1dash = { ...putResult1, _id: 'col01/1' };
      const jsonA2dash = { _id: 'col02/2', name: 'fromA' };
      const putResult2dash = { ...putResult2, _id: 'col02/2' };

      const jsonB3 = { _id: '3', name: 'fromB' };
      const putResult3 = await dbB.collection('col01').put(jsonB3);
      const jsonB3dash = { _id: 'col01/3', name: 'fromB' };
      const putResult3dash = { ...putResult3, _id: 'col01/3' };
      await syncB.trySync();

      let col01Result: SyncResultMergeAndPush | undefined;
      let col01ChangeTaskId: string | undefined;
      syncA.on(
        'change',
        (syncResult: SyncResult, taskMetadata: TaskMetadata) => {
          col01Result = syncResult as SyncResultMergeAndPush;
          col01ChangeTaskId = taskMetadata.taskId;
        },
        'col01'
      );

      let localChangedFiles: ChangedFile[];
      syncA.on(
        'localChange',
        (files: ChangedFile[], taskMetadata: TaskMetadata) => {
          localChangedFiles = files;
        },
        'col01'
      );

      let remoteChangedFiles: ChangedFile[];
      syncA.on(
        'remoteChange',
        (files: ChangedFile[], taskMetadata: TaskMetadata) => {
          remoteChangedFiles = files;
        },
        'col02'
      );

      let rootResult: SyncResultMergeAndPush | undefined;
      let rootChangeTaskId: string | undefined;
      syncA.on(
        'change',
        (syncResult: SyncResult, taskMetadata: TaskMetadata) => {
          rootResult = syncResult as SyncResultMergeAndPush;
          rootChangeTaskId = taskMetadata.taskId;
        },
        ''
      );

      let complete = false;
      let endTaskId = '';
      let completeCollectionPath: string | undefined;
      syncA.on(
        'complete',
        (taskMetadata: TaskMetadata) => {
          complete = true;
          endTaskId = taskMetadata.taskId;
          completeCollectionPath = taskMetadata.collectionPath;
        },
        'col01'
      );
      await syncA.trySync();

      // eslint-disable-next-line no-unmodified-loop-condition
      while (!complete) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(1000);
      }

      expect(col01Result?.action).toBe('merge and push');
      expect(rootResult?.action).toBe('merge and push');

      expect(col01Result?.commits).toMatchObject({
        remote: getCommitInfo([putResult1, putResult2, 'merge']),
        local: getCommitInfo([putResult3, 'merge']),
      });
      expect(rootResult?.commits).toMatchObject({
        remote: getCommitInfo([putResult1, putResult2, 'merge']),
        local: getCommitInfo([putResult3, 'merge']),
      });

      expect(col01Result?.changes.remote).toEqual([
        getChangedFileInsert(jsonA1, putResult1),
      ]);
      expect(col01Result?.changes.local).toEqual([
        getChangedFileInsert(jsonB3, putResult3),
      ]);
      expect(localChangedFiles!).toEqual([getChangedFileInsert(jsonB3, putResult3)]);
      expect(remoteChangedFiles!).toEqual([getChangedFileInsert(jsonA2, putResult2)]);

      expect(rootResult?.changes.remote).toEqual([
        getChangedFileInsert(jsonA1dash, putResult1dash),
        getChangedFileInsert(jsonA2dash, putResult2dash),
      ]);
      expect(rootResult?.changes.local).toEqual([
        getChangedFileInsert(jsonB3dash, putResult3dash),
      ]);

      expect(col01ChangeTaskId).toBe(endTaskId);
      expect(rootChangeTaskId).toBe(endTaskId);

      expect(completeCollectionPath).toBe('col01/');

      await destroyDBs([dbA, dbB]);
    });
  });

  it('pause and resume', async () => {
    const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
      remoteURLBase,
      localDir,
      serialId,
      {
        connection: { type: 'github', personalAccessToken: token },
        includeCommits: true,
        live: true,
        interval: 3000,
      }
    );

    let resume = false;
    syncB.on('resume', () => {
      resume = true;
    });
    let pause = false;
    syncB.on('pause', () => {
      pause = true;
    });
    let complete = false;
    syncB.on('complete', () => {
      complete = true;
    });

    // Check first complete event

    let sleepTime = 0;
    // eslint-disable-next-line no-unmodified-loop-condition
    while (!complete) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(1000);
      sleepTime += 1000;
    }

    syncB.pause();
    expect(pause).toBe(true);
    expect(resume).toBe(false);
    expect(syncB.options.live).toBe(false);

    // Check second complete event
    complete = false; // reset
    // fast forward timer
    await sleep(sleepTime + 1000);

    expect(complete).toBe(false); // complete will not happen because synchronization is paused.

    syncB.resume();
    expect(resume).toBe(true);
    expect(syncB.options.live).toBe(true);

    // Check third complete event
    complete = false; // reset
    // fast forward timer
    await sleep(sleepTime + 1000);

    expect(complete).toBe(true);

    await destroyDBs([dbA, dbB]);
  });

  it('active at initialization', async () => {
    const remoteURL = remoteURLBase + serialId();
    const dbNameA = serialId();
    const dbA: GitDocumentDB = new GitDocumentDB({
      dbName: dbNameA,
      localDir,
    });
    const options: RemoteOptions = {
      remoteUrl: remoteURL,
      connection: { type: 'github', personalAccessToken: token },
      includeCommits: true,
      live: true,
    };
    await dbA.open();

    const repos = dbA.repository();
    const sync = new Sync(dbA, options);
    let resume = false;
    sync.on('resume', () => {
      resume = true;
    });

    const syncResult = await sync.init(repos!);
    console.log(JSON.stringify(syncResult));
    expect(resume).toBe(true);

    sync.close();

    await destroyDBs([dbA]);
  });

  it('starts once', async () => {
    const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
      connection: { type: 'github', personalAccessToken: token },
      includeCommits: true,
      live: true,
      interval: 3000,
    });

    let start = false;
    syncA.on('start', () => {
      start = true;
    });

    expect(start).toBe(false);

    let sleepTime = 0;
    // eslint-disable-next-line no-unmodified-loop-condition
    while (!start) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(1000);
      sleepTime += 1000;
    }

    expect(start).toBe(true);
    expect(sleepTime).toBeLessThan(5000);

    await destroyDBs([dbA]);
  });

  it('starts repeatedly', async () => {
    const interval = MINIMUM_SYNC_INTERVAL;
    const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
      connection: { type: 'github', personalAccessToken: token },
      includeCommits: true,
      live: true,
      interval,
    });

    let counter = 0;
    syncA.on('start', () => {
      counter++;
    });

    await sleep(interval * 5);

    expect(counter).toBeGreaterThanOrEqual(3);

    await destroyDBs([dbA]);
  });

  it('starts event returns taskMetaData and current retries', async () => {
    const interval = MINIMUM_SYNC_INTERVAL;
    const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
      connection: { type: 'github', personalAccessToken: token },
      includeCommits: true,
      live: true,
      interval,
    });

    let counter = 0;
    let taskId = '';
    let currentRetries = -1;
    syncA.on('start', (taskMetadata: TaskMetadata, _currentRetries: number) => {
      counter++;
      taskId = taskMetadata.taskId;
      currentRetries = _currentRetries;
    });

    await sleep(interval * 5);

    expect(counter).toBeGreaterThanOrEqual(3);
    expect(taskId).not.toBe('');
    expect(currentRetries).toBe(0);

    await destroyDBs([dbA]);
  });

  it('completes once', async () => {
    const interval = MINIMUM_SYNC_INTERVAL;
    const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
      connection: { type: 'github', personalAccessToken: token },
      includeCommits: true,
      live: true,
      interval,
    });

    let startTaskId = '';
    syncA.on('start', (taskMetadata: TaskMetadata) => {
      startTaskId = taskMetadata.taskId;
    });

    let complete = false;
    let endTaskId = '';
    syncA.on('complete', (taskMetadata: TaskMetadata) => {
      complete = true;
      endTaskId = taskMetadata.taskId;
    });

    expect(complete).toBe(false);

    let sleepTime = 0;
    // eslint-disable-next-line no-unmodified-loop-condition
    while (!complete) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(1000);
      sleepTime += 1000;
    }

    expect(complete).toBe(true);
    expect(startTaskId).toBe(endTaskId);
    expect(sleepTime).toBeLessThan(interval * 2);

    await destroyDBs([dbA]);
  });

  it('completes repeatedly', async () => {
    const interval = MINIMUM_SYNC_INTERVAL;
    const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
      connection: { type: 'github', personalAccessToken: token },
      includeCommits: true,
      live: true,
      interval,
    });

    let counter = 0;
    syncA.on('complete', () => {
      counter++;
    });

    await sleep(interval * 5);

    expect(counter).toBeGreaterThanOrEqual(3);

    await destroyDBs([dbA]);
  });

  it('error', async () => {
    const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId);
    await dbA.put({ _id: '1', name: 'fromA' });
    await syncA.trySync();

    await destroyRemoteRepository(syncA.remoteURL);
    // Create different repository with the same repository name.
    const [dbB, syncB] = await createDatabase(remoteURLBase, localDir, serialId);
    await dbB.put({ _id: '1', name: 'fromB' });
    await syncB.trySync();

    let startTaskId = '';
    syncA.on('start', (taskMetadata: TaskMetadata) => {
      startTaskId = taskMetadata.taskId;
    });

    let error = false;
    let errorTaskId = '';
    syncA.on('error', (e: Error, taskMetadata: TaskMetadata) => {
      error = true;
      errorTaskId = taskMetadata.taskId;
    });
    await expect(syncA.trySync()).rejects.toThrowError(Err.SyncWorkerError);

    expect(error).toBe(true);
    expect(startTaskId).toBe(errorTaskId);

    error = false;
    await expect(syncA.tryPush()).rejects.toThrowError(); // request failed with status code: 404

    expect(error).toBe(true);

    await destroyDBs([dbA, dbB]);
  });

  it('on and off', async () => {
    const interval = MINIMUM_SYNC_INTERVAL;
    const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
      connection: { type: 'github', personalAccessToken: token },
      includeCommits: true,
      live: true,
      interval,
    });

    let counter = 0;
    const increment = () => {
      counter++;
    };
    syncA.on('start', increment);

    await sleep(interval * 3);

    expect(counter).toBeGreaterThanOrEqual(1);
    expect(counter).toBeLessThanOrEqual(3);

    syncA.off('start', increment);

    await sleep(interval * 3);

    expect(counter).toBeLessThanOrEqual(3);

    await destroyDBs([dbA]);
  });
});
