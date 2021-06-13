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
import {
  ChangedFile,
  RemoteOptions,
  SyncResult,
  SyncResultFastForwardMerge,
  TaskMetadata,
} from '../../src/types';
import { sleep } from '../../src/utils';
import {
  compareWorkingDirAndBlobs,
  createClonedDatabases,
  createDatabase,
  destroyDBs,
  destroyRemoteRepository,
  getChangedFileInsert,
  getChangedFileUpdate,
  getCommitInfo,
  getWorkingDirDocs,
  removeRemoteRepositories,
} from '../remote_utils';
import { GitDocumentDB } from '../../src';
import { Sync } from '../../src/remote/sync';
import { SyncWorkerError } from '../../src/error';
import { MINIMUM_SYNC_INTERVAL } from '../../src/const';

const reposPrefix = 'test_sync_events___';
const localDir = `./test/database_sync_events`;

let idCounter = 0;
const serialId = () => {
  return `${reposPrefix}${idCounter++}`;
};

beforeEach(function () {
  // @ts-ignore
  console.log(`... ${this.currentTest.fullTitle()}`);
});

beforeAll(() => {
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

  beforeAll(async () => {
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

      syncA.resume({ ...syncA.options(), interval: 3000 });
      syncB.resume({ ...syncA.options(), interval: 3000 });

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

      // A puts and pushes
      const jsonA1 = { _id: '1', name: 'fromA' };
      const putResult1 = await dbA.put(jsonA1);
      const jsonA2 = { _id: '2', name: 'fromA' };
      const putResult2 = await dbA.put(jsonA2);
      await syncA.tryPush();

      await syncB.trySync();

      syncA.on('change', (result: SyncResult) => {
        // console.log('A: ' + JSON.stringify(result));
      });
      const resultsB: SyncResult[] = [];
      syncB.on('change', (result: SyncResult) => {
        // console.log('B: ' + JSON.stringify(result));
        resultsB.push(result);
      });

      await dbA.delete(jsonA1);
      await syncA.trySync();

      await dbA.delete(jsonA2);

      const jsonB3 = { _id: '3', name: 'fromB' };
      dbB
        .put(jsonB3)
        .then(() => {
          syncB.trySync(); // merge and push
          syncA.trySync(); // will invoke transactional conflict and retry on syncB
        })
        .catch(err => {
          console.log(err);
        });

      await sleep(15000);

      expect(resultsB.length).toBe(2);
      expect(resultsB[0].action).toBe('merge and push error');
      expect(resultsB[1].action).toBe('merge and push');

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
    it('occurs localChanges with every retry', async () => {
      const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
        remoteURLBase,
        localDir,
        serialId
      );

      // A puts and pushes
      const jsonA1 = { _id: '1', name: 'fromA' };
      const putResult1 = await dbA.put(jsonA1);
      const jsonA2 = { _id: '2', name: 'fromA' };
      const putResult2 = await dbA.put(jsonA2);
      await syncA.tryPush();

      await syncB.trySync();

      syncA.on('localChange', (changes: ChangedFile[]) => {
        // console.log('A local: ' + JSON.stringify(changes));
      });
      const localChangesB: ChangedFile[][] = [];
      syncB.on('localChange', (changes: ChangedFile[]) => {
        // console.log('B local: ' + JSON.stringify(changes));
        localChangesB.push(changes);
      });
      /*
      syncA.on('remoteChange', (remoteChanges: ChangedFile[]) => {
        console.log('A remote: ' + JSON.stringify(remoteChanges));
      });
      syncB.on('remoteChange', (remoteChanges: ChangedFile[]) => {
        console.log('B remote: ' + JSON.stringify(remoteChanges));
      });
*/
      await dbA.delete(jsonA1);
      await syncA.trySync();

      await dbA.delete(jsonA2);

      const jsonB3 = { _id: '3', name: 'fromB' };
      dbB
        .put(jsonB3)
        .then(() => {
          syncB.trySync(); // merge and push
          syncA.trySync(); // will invoke transactional conflict and retry on syncB
        })
        .catch(err => {
          console.log(err);
        });

      await sleep(15000);

      expect(localChangesB.length).toBe(2);

      await destroyDBs([dbA, dbB]);
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
    it('occurs remoteChanges with every retry', async () => {
      const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
        remoteURLBase,
        localDir,
        serialId
      );

      // A puts and pushes
      const jsonA1 = { _id: '1', name: 'fromA' };
      const putResult1 = await dbA.put(jsonA1);
      const jsonA2 = { _id: '2', name: 'fromA' };
      const putResult2 = await dbA.put(jsonA2);
      await syncA.tryPush();

      await syncB.trySync();

      const remoteChangesA: ChangedFile[][] = [];
      syncA.on('remoteChange', (changes: ChangedFile[]) => {
        // console.log('A remote: ' + JSON.stringify(remoteChanges));
        remoteChangesA.push(changes);
      });
      syncB.on('remoteChange', (changes: ChangedFile[]) => {
        // console.log('B remote: ' + JSON.stringify(changes));
      });

      await dbA.delete(jsonA1);
      await syncA.trySync();

      await dbA.delete(jsonA2);

      const jsonB3 = { _id: '3', name: 'fromB' };
      dbB
        .put(jsonB3)
        .then(() => {
          syncB.trySync(); // merge and push
          syncA.trySync(); // will invoke transactional conflict and retry on syncB
        })
        .catch(err => {
          console.log(err);
        });

      await sleep(15000);

      expect(remoteChangesA.length).toBe(2);

      await destroyDBs([dbA, dbB]);
    });

    it('paused and activates', async () => {
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

      let active = false;
      syncB.on('active', () => {
        active = true;
      });
      let paused = false;
      syncB.on('paused', () => {
        paused = true;
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
      expect(paused).toBe(true);
      expect(active).toBe(false);
      expect(syncB.options().live).toBe(false);

      // Check second complete event
      complete = false; // reset
      // fast forward timer
      await sleep(sleepTime + 1000);

      expect(complete).toBe(false); // complete will not happen because synchronization is paused.

      syncB.resume();
      expect(active).toBe(true);
      expect(syncB.options().live).toBe(true);

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
      const remote = new Sync(dbA, options);
      let active = false;
      remote.on('active', () => {
        active = true;
      });
      await remote.init(repos!);
      expect(active).toBe(true);

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

      await destroyRemoteRepository(syncA.remoteURL());
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
      await expect(syncA.trySync()).rejects.toThrowError(SyncWorkerError);

      expect(error).toBe(true);
      expect(startTaskId).toBe(errorTaskId);

      error = false;
      await expect(syncA.tryPush()).rejects.toThrowError(Error); // request failed with status code: 404

      expect(error).toBe(true);

      await destroyDBs([dbA, dbB]);
    });
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

  describe.skip('check various errors in sync_worker.ts', () => {});
});
