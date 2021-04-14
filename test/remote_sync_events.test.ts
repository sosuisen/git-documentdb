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
import { ChangedFile, RemoteOptions, SyncResultFastForwardMerge } from '../src/types';
import { sleep } from '../src/utils';
import {
  compareWorkingDirAndBlobs,
  createClonedDatabases,
  createDatabase,
  destroyDBs,
  destroyRemoteRepository,
  getChangedFile,
  getCommitInfo,
  getWorkingDirFiles,
  removeRemoteRepositories,
} from './remote_utils';
import { GitDocumentDB } from '../src';
import { Sync } from '../src/remote/sync';
import { SyncWorkerFetchError } from '../src/error';

const reposPrefix = 'test_sync_events___';
const localDir = `./test/database_sync_events`;

let idCounter = 0;
const serialId = () => {
  return `${reposPrefix}${idCounter++}`;
};

beforeEach(function () {
  // @ts-ignore
  console.log(`=== ${this.currentTest.fullTitle()}`);
});

beforeAll(() => {
  fs.removeSync(path.resolve(localDir));
});

afterAll(() => {
  // It may throw error due to memory leak of getCommitLogs()
  // fs.removeSync(path.resolve(localDir));
});

// GITDDB_GITHUB_USER_URL: URL of your GitHub account
// e.g.) https://github.com/foo/
const maybe =
  process.env.GITDDB_GITHUB_USER_URL && process.env.GITDDB_PERSONAL_ACCESS_TOKEN
    ? describe
    : describe.skip;

maybe('remote: sync: events: ', () => {
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
  describe('change: ', () => {
    test('change once', async () => {
      const [dbA, dbB, remoteA, remoteB] = await createClonedDatabases(
        remoteURLBase,
        localDir,
        serialId
      );

      // A puts and pushes
      const jsonA1 = { _id: '1', name: 'fromA' };
      const putResult1 = await dbA.put(jsonA1);
      await remoteA.tryPush();

      // B syncs
      let result: SyncResultFastForwardMerge | undefined;
      remoteB.on('change', syncResult => {
        result = syncResult as SyncResultFastForwardMerge;
      });
      let complete = false;
      remoteB.on('complete', () => {
        complete = true;
      });
      await remoteB.trySync();

      // eslint-disable-next-line no-unmodified-loop-condition
      while (!complete) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(1000);
      }

      expect(result!.action).toBe('fast-forward merge');

      expect(result!.commits).toMatchObject({
        local: getCommitInfo([putResult1]),
      });

      expect(result!.changes.local).toEqual(
        expect.arrayContaining([getChangedFile('create', jsonA1, putResult1)])
      );

      await destroyDBs([dbA, dbB]);
    });

    test('propagate changes between local and remote sites', async () => {
      const [dbA, dbB, remoteA, remoteB] = await createClonedDatabases(
        remoteURLBase,
        localDir,
        serialId
      );

      // A puts and pushes
      const jsonA1 = { _id: '1', name: 'fromA' };
      const putResultA1 = await dbA.put(jsonA1);
      await remoteA.trySync();

      // B puts and pushes
      const jsonB1 = { _id: '1', name: 'fromB' };
      const putResultB1 = await dbB.put(jsonB1);

      let resultA: SyncResultFastForwardMerge | undefined;
      let completeA = false;
      remoteA.on('change', syncResult => {
        resultA = syncResult as SyncResultFastForwardMerge;
        console.log('A: ' + resultA.action);
        if (resultA.action === 'fast-forward merge') {
          completeA = true;
        }
      });

      let resultB: SyncResultFastForwardMerge | undefined;
      remoteB.on('change', syncResult => {
        resultB = syncResult as SyncResultFastForwardMerge;
        console.log('B: ' + resultB.action);
      });
      let completeB = false;
      remoteB.on('complete', () => {
        completeB = true;
      });

      remoteA.resume({ ...remoteA.options(), interval: 3000 });
      remoteB.resume({ ...remoteA.options(), interval: 3000 });

      // eslint-disable-next-line no-unmodified-loop-condition
      while (!completeA || !completeB) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(1000);
      }

      expect(resultA!.action).toBe('fast-forward merge');

      expect(resultA!.changes.local).toEqual(
        expect.arrayContaining([getChangedFile('update', jsonB1, putResultB1)])
      );

      expect(resultB!.action).toBe('resolve conflicts and push');

      expect(resultB!.changes.local).toEqual([]);

      expect(getWorkingDirFiles(dbA)).toEqual([jsonB1]);
      expect(getWorkingDirFiles(dbB)).toEqual([jsonB1]);

      await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
      await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

      await destroyDBs([dbA, dbB]);
    });

    test('localChange', async () => {
      const [dbA, dbB, remoteA, remoteB] = await createClonedDatabases(
        remoteURLBase,
        localDir,
        serialId
      );

      // A puts and pushes
      const jsonA1 = { _id: '1', name: 'fromA' };
      const putResult1 = await dbA.put(jsonA1);
      await remoteA.tryPush();

      // B syncs
      let changes: ChangedFile[] = [];
      remoteB.on('localChange', localChanges => {
        changes = localChanges;
      });
      let complete = false;
      remoteB.on('complete', () => {
        complete = true;
      });
      await remoteB.trySync();

      // eslint-disable-next-line no-unmodified-loop-condition
      while (!complete) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(1000);
      }

      expect(changes.length).toBe(1);
      expect(changes).toEqual(
        expect.arrayContaining([getChangedFile('create', jsonA1, putResult1)])
      );

      await destroyDBs([dbA, dbB]);
    });

    test('remoteChange', async () => {
      const [dbA, dbB, remoteA, remoteB] = await createClonedDatabases(
        remoteURLBase,
        localDir,
        serialId
      );

      let changes: ChangedFile[] = [];
      remoteB.on('remoteChange', remoteChanges => {
        changes = remoteChanges;
      });
      let complete = false;
      remoteB.on('complete', () => {
        complete = true;
      });

      // B puts and syncs
      const jsonB1 = { _id: '1', name: 'fromB' };
      const putResult1 = await dbB.put(jsonB1);
      await remoteB.trySync();

      // eslint-disable-next-line no-unmodified-loop-condition
      while (!complete) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(1000);
      }

      expect(changes.length).toBe(1);

      expect(changes).toEqual(
        expect.arrayContaining([getChangedFile('create', jsonB1, putResult1)])
      );

      await destroyDBs([dbA, dbB]);
    });

    test('paused and active', async () => {
      const [dbA, dbB, remoteA, remoteB] = await createClonedDatabases(
        remoteURLBase,
        localDir,
        serialId,
        {
          auth: { type: 'github', personal_access_token: token },
          include_commits: true,
          live: true,
          interval: 3000,
        }
      );

      let active = false;
      remoteB.on('active', () => {
        active = true;
      });
      let paused = false;
      remoteB.on('paused', () => {
        paused = true;
      });
      let complete = false;
      remoteB.on('complete', () => {
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

      remoteB.pause();
      expect(paused).toBe(true);
      expect(active).toBe(false);
      expect(remoteB.options().live).toBe(false);

      // Check second complete event
      complete = false; // reset
      // fast forward timer
      await sleep(sleepTime + 1000);

      expect(complete).toBe(false); // complete will not happen because synchronization is paused.

      remoteB.resume();
      expect(active).toBe(true);
      expect(remoteB.options().live).toBe(true);

      // Check third complete event
      complete = false; // reset
      // fast forward timer
      await sleep(sleepTime + 1000);

      expect(complete).toBe(true);

      await destroyDBs([dbA, dbB]);
    });

    test('active at initialization', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbNameA = serialId();
      const dbA: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameA,
        local_dir: localDir,
      });
      const options: RemoteOptions = {
        remote_url: remoteURL,
        auth: { type: 'github', personal_access_token: token },
        include_commits: true,
        live: true,
      };
      await dbA.create();

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

    test('start once', async () => {
      const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId, {
        auth: { type: 'github', personal_access_token: token },
        include_commits: true,
        live: true,
        interval: 3000,
      });

      let start = false;
      remoteA.on('start', () => {
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

    test('start repeatedly', async () => {
      const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId, {
        auth: { type: 'github', personal_access_token: token },
        include_commits: true,
        live: true,
        interval: 1000,
      });

      let counter = 0;
      remoteA.on('start', () => {
        counter++;
      });

      await sleep(15000);

      expect(counter).toBeGreaterThanOrEqual(3);

      await destroyDBs([dbA]);
    });

    test('complete once', async () => {
      const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId, {
        auth: { type: 'github', personal_access_token: token },
        include_commits: true,
        live: true,
        interval: 1000,
      });

      let complete = false;
      remoteA.on('complete', () => {
        complete = true;
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
      expect(sleepTime).toBeLessThan(5000);

      await destroyDBs([dbA]);
    });

    test('complete repeatedly', async () => {
      const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId, {
        auth: { type: 'github', personal_access_token: token },
        include_commits: true,
        live: true,
        interval: 1000,
      });

      let counter = 0;
      remoteA.on('complete', () => {
        counter++;
      });

      await sleep(15000);

      expect(counter).toBeGreaterThanOrEqual(3);

      await destroyDBs([dbA]);
    });

    test('error', async () => {
      const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId);
      await dbA.put({ _id: '1', name: 'fromA' });
      await remoteA.trySync();

      await destroyRemoteRepository(remoteA.remoteURL());
      // Create different repository with the same repository name.
      const [dbB, remoteB] = await createDatabase(remoteURLBase, localDir, serialId);
      await dbB.put({ _id: '1', name: 'fromB' });
      await remoteB.trySync();

      let error = false;
      remoteA.on('error', () => {
        error = true;
      });
      await expect(remoteA.trySync()).rejects.toThrowError(SyncWorkerFetchError);

      expect(error).toBe(true);

      error = false;
      await expect(remoteA.tryPush()).rejects.toThrowError(Error); // request failed with status code: 404

      expect(error).toBe(true);

      await destroyDBs([dbA, dbB]);
    });
  });

  test('on and off', async () => {
    const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId, {
      auth: { type: 'github', personal_access_token: token },
      include_commits: true,
      live: true,
      interval: 1000,
    });

    let counter = 0;
    const increment = () => {
      counter++;
    };
    remoteA.on('start', increment);

    await sleep(3000);

    expect(counter).toBeGreaterThanOrEqual(1);
    expect(counter).toBeLessThanOrEqual(4);

    remoteA.off('start', increment);

    await sleep(10000);

    expect(counter).toBeLessThanOrEqual(4);

    await destroyDBs([dbA]);
  });

  describe.skip('check various errors in sync_worker.ts', () => {});
});
