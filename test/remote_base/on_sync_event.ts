/* eslint-disable @typescript-eslint/naming-convention */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

/**
 * Test Operational Transformation in 3-way merge
 * by using GitHub Personal Access Token
 * These tests create a new repository on GitHub if not exists.
 */
import expect from 'expect';
import { Err } from '../../src/error';
import {
  ConnectionSettings,
  SyncResult,
  SyncResultFastForwardMerge,
  TaskMetadata,
} from '../../src/types';
import {
  createClonedDatabases,
  destroyDBs,
  getChangedFileInsert,
  getCommitInfo,
  removeRemoteRepositories,
} from '../remote_utils';
import { sleep } from '../../src/utils';
import { GitDocumentDB } from '../../src/git_documentdb';

export const onSyncEventBase = (
  connection: ConnectionSettings,
  remoteURLBase: string,
  reposPrefix: string,
  localDir: string
) => () => {
  let idCounter = 0;
  const serialId = () => {
    return `${reposPrefix}${idCounter++}`;
  };

  before(async () => {
    await removeRemoteRepositories(reposPrefix);
  });

  describe('<remote/on_sync_event> GitDocumentDB', () => {
    describe('onSyncEvent', () => {
      it('with remoteURL', async () => {
        const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
          remoteURLBase,
          localDir,
          serialId,
          {
            connection,
          }
        );

        // A puts and pushes
        const jsonA1 = { _id: '1', name: 'fromA' };
        const putResult1 = await dbA.put(jsonA1);
        await syncA.tryPush();

        // B syncs
        let result: SyncResultFastForwardMerge | undefined;
        let changeTaskId = '';

        dbB.onSyncEvent(
          syncB.remoteURL,
          'change',
          (syncResult: SyncResult, taskMetadata: TaskMetadata) => {
            result = syncResult as SyncResultFastForwardMerge;
            changeTaskId = taskMetadata.taskId;
          }
        );
        let complete = false;
        let endTaskId = '';
        dbB.onSyncEvent(syncB.remoteURL, 'complete', (taskMetadata: TaskMetadata) => {
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

      it('with remoteURL throws UndefinedSyncError', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();
        const dbA: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameA,
          localDir: localDir,
        });
        await dbA.open();

        expect(() => {
          dbA.onSyncEvent('https://test.example.com', 'change', () => {});
        }).toThrowError(Err.UndefinedSyncError);

        await destroyDBs([dbA]);
      });

      it('with sync', async () => {
        const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
          remoteURLBase,
          localDir,
          serialId,
          {
            connection,
          }
        );

        // A puts and pushes
        const jsonA1 = { _id: '1', name: 'fromA' };
        const putResult1 = await dbA.put(jsonA1);
        await syncA.tryPush();

        // B syncs
        let result: SyncResultFastForwardMerge | undefined;
        let changeTaskId = '';

        dbB.onSyncEvent(
          syncB,
          'change',
          (syncResult: SyncResult, taskMetadata: TaskMetadata) => {
            result = syncResult as SyncResultFastForwardMerge;
            changeTaskId = taskMetadata.taskId;
          }
        );
        let complete = false;
        let endTaskId = '';
        dbB.onSyncEvent(syncB, 'complete', (taskMetadata: TaskMetadata) => {
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
    });

    describe('offSyncEvent', () => {
      it('with remoteURL', async () => {
        const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
          remoteURLBase,
          localDir,
          serialId,
          {
            connection,
          }
        );

        const callback = (syncResult: SyncResult, taskMetadata: TaskMetadata) => {};
        dbB.onSyncEvent(syncB.remoteURL, 'change', callback);
        expect(syncB.eventHandlers.change.length).toBe(1);
        dbB.offSyncEvent(syncB.remoteURL, 'change', callback);
        expect(syncB.eventHandlers.change.length).toBe(0);

        await destroyDBs([dbA, dbB]);
      });

      it('with remoteURL throws UndefinedSyncError', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();
        const dbA: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameA,
          localDir: localDir,
        });
        await dbA.open();

        expect(() => {
          dbA.offSyncEvent('https://test.example.com', 'change', () => {});
        }).toThrowError(Err.UndefinedSyncError);

        await destroyDBs([dbA]);
      });

      it('with sync', async () => {
        const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
          remoteURLBase,
          localDir,
          serialId,
          {
            connection,
          }
        );

        const callback = (syncResult: SyncResult, taskMetadata: TaskMetadata) => {};
        dbB.onSyncEvent(syncB, 'change', callback);
        expect(syncB.eventHandlers.change.length).toBe(1);
        dbB.offSyncEvent(syncB, 'change', callback);
        expect(syncB.eventHandlers.change.length).toBe(0);

        await destroyDBs([dbA, dbB]);
      });
    });
  });

  describe('<remote/on_sync_event> Collection', () => {
    describe('onSyncEvent', () => {
      it('with remoteURL', async () => {
        const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
          remoteURLBase,
          localDir,
          serialId,
          {
            connection,
          }
        );
        const colA = dbA.collection('col');
        const colB = dbB.collection('col');

        // A puts and pushes
        const jsonA1 = { _id: '1', name: 'fromA' };
        const putResult1 = await colA.put(jsonA1);
        await syncA.tryPush();

        // B syncs
        let result: SyncResultFastForwardMerge | undefined;
        let changeTaskId = '';

        colB.onSyncEvent(
          syncB.remoteURL,
          'change',
          (syncResult: SyncResult, taskMetadata: TaskMetadata) => {
            result = syncResult as SyncResultFastForwardMerge;
            changeTaskId = taskMetadata.taskId;
          }
        );
        let complete = false;
        let endTaskId = '';
        colB.onSyncEvent(syncB.remoteURL, 'complete', (taskMetadata: TaskMetadata) => {
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

      it('with remoteURL throws UndefinedSyncError', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();
        const dbA: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameA,
          localDir: localDir,
        });
        await dbA.open();
        const colA = dbA.collection('col');
        expect(() => {
          colA.onSyncEvent('https://test.example.com', 'change', () => {});
        }).toThrowError(Err.UndefinedSyncError);

        await destroyDBs([dbA]);
      });

      it('with sync', async () => {
        const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
          remoteURLBase,
          localDir,
          serialId,
          {
            connection,
          }
        );

        const colA = dbA.collection('col');
        const colB = dbB.collection('col');

        // A puts and pushes
        const jsonA1 = { _id: '1', name: 'fromA' };
        const putResult1 = await colA.put(jsonA1);
        await syncA.tryPush();

        // B syncs
        let result: SyncResultFastForwardMerge | undefined;
        let changeTaskId = '';

        colB.onSyncEvent(
          syncB,
          'change',
          (syncResult: SyncResult, taskMetadata: TaskMetadata) => {
            result = syncResult as SyncResultFastForwardMerge;
            changeTaskId = taskMetadata.taskId;
          }
        );
        let complete = false;
        let endTaskId = '';
        colB.onSyncEvent(syncB, 'complete', (taskMetadata: TaskMetadata) => {
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
    });

    describe('offSyncEvent', () => {
      it('with remoteURL', async () => {
        const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
          remoteURLBase,
          localDir,
          serialId,
          {
            connection,
          }
        );

        const colB = dbB.collection('col');
        const callback = (syncResult: SyncResult, taskMetadata: TaskMetadata) => {};
        colB.onSyncEvent(syncB.remoteURL, 'change', callback);
        expect(syncB.eventHandlers.change.length).toBe(1);
        colB.offSyncEvent(syncB.remoteURL, 'change', callback);
        expect(syncB.eventHandlers.change.length).toBe(0);

        await destroyDBs([dbA, dbB]);
      });

      it('with remoteURL throws UndefinedSyncError', async () => {
        const dbNameA = serialId();
        const dbA: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameA,
          localDir: localDir,
        });
        await dbA.open();

        const colA = dbA.collection('col');

        expect(() => {
          colA.offSyncEvent('https://test.example.com', 'change', () => {});
        }).toThrowError(Err.UndefinedSyncError);

        await destroyDBs([dbA]);
      });

      it('with sync', async () => {
        const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
          remoteURLBase,
          localDir,
          serialId,
          {
            connection,
          }
        );

        const colB = dbB.collection('col');

        const callback = (syncResult: SyncResult, taskMetadata: TaskMetadata) => {};
        colB.onSyncEvent(syncB, 'change', callback);
        expect(syncB.eventHandlers.change.length).toBe(1);
        colB.offSyncEvent(syncB, 'change', callback);
        expect(syncB.eventHandlers.change.length).toBe(0);

        await destroyDBs([dbA, dbB]);
      });
    });
  });
};
