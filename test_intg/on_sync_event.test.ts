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
import path from 'path';
import fs from 'fs-extra';
import expect from 'expect';
import { UndefinedSyncError } from '../src/error';
import { SyncResult, SyncResultFastForwardMerge, TaskMetadata } from '../src/types';
import {
  createClonedDatabases,
  destroyDBs,
  getChangedFileInsert,
  getCommitInfo,
  removeRemoteRepositories,
} from '../test/remote_utils';
import { sleep } from '../src/utils';
import { GitDocumentDB } from '../src/git_documentdb';

const reposPrefix = 'test_3way_merge_ot___';
const localDir = `./test_intg/database_on_sync_event`;

let idCounter = 0;
const serialId = () => {
  return `${reposPrefix}${idCounter++}`;
};

beforeEach(function () {
  // @ts-ignore
  console.log(`... ${this.currentTest.fullTitle()}`);
});

before(() => {
  fs.removeSync(path.resolve(localDir));
});

after(() => {
  // It may throw error due to memory leak of getCommitLogs()
  // fs.removeSync(path.resolve(localDir));
});

// This test needs environment variables:
//  - GITDDB_GITHUB_USER_URL: URL of your GitHub account
// e.g.) https://github.com/foo/
//  - GITDDB_personalAccessToken: A personal access token of your GitHub account
const maybe =
  process.env.GITDDB_GITHUB_USER_URL && process.env.GITDDB_PERSONAL_ACCESS_TOKEN
    ? describe
    : describe.skip;

maybe('intg: <git_documentdb>', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  before(async () => {
    await removeRemoteRepositories(reposPrefix);
  });

  describe('onSyncEvent', () => {
    it('with remoteURL', async () => {
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

      dbB.onSyncEvent(
        syncB.remoteURL(),
        'change',
        (syncResult: SyncResult, taskMetadata: TaskMetadata) => {
          result = syncResult as SyncResultFastForwardMerge;
          changeTaskId = taskMetadata.taskId;
        }
      );
      let complete = false;
      let endTaskId = '';
      dbB.onSyncEvent(syncB.remoteURL(), 'complete', (taskMetadata: TaskMetadata) => {
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
      }).toThrowError(UndefinedSyncError);
    });

    it('with sync', async () => {
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
        serialId
      );

      const callback = (syncResult: SyncResult, taskMetadata: TaskMetadata) => {};
      dbB.onSyncEvent(syncB.remoteURL(), 'change', callback);
      expect(syncB.eventHandlers.change.length).toBe(1);
      dbB.offSyncEvent(syncB.remoteURL(), 'change', callback);
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
      }).toThrowError(UndefinedSyncError);
    });

    it('with sync', async () => {
      const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
        remoteURLBase,
        localDir,
        serialId
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

maybe('intg: <Collection>', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  before(async () => {
    await removeRemoteRepositories(reposPrefix);
  });

  describe('onSyncEvent', () => {
    it('with remoteURL', async () => {
      const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
        remoteURLBase,
        localDir,
        serialId
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
        syncB.remoteURL(),
        'change',
        (syncResult: SyncResult, taskMetadata: TaskMetadata) => {
          result = syncResult as SyncResultFastForwardMerge;
          changeTaskId = taskMetadata.taskId;
        }
      );
      let complete = false;
      let endTaskId = '';
      colB.onSyncEvent(syncB.remoteURL(), 'complete', (taskMetadata: TaskMetadata) => {
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
      }).toThrowError(UndefinedSyncError);
    });

    it('with sync', async () => {
      const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
        remoteURLBase,
        localDir,
        serialId
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
        serialId
      );

      const colB = dbB.collection('col');
      const callback = (syncResult: SyncResult, taskMetadata: TaskMetadata) => {};
      colB.onSyncEvent(syncB.remoteURL(), 'change', callback);
      expect(syncB.eventHandlers.change.length).toBe(1);
      colB.offSyncEvent(syncB.remoteURL(), 'change', callback);
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
      }).toThrowError(UndefinedSyncError);
    });

    it('with sync', async () => {
      const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
        remoteURLBase,
        localDir,
        serialId
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
