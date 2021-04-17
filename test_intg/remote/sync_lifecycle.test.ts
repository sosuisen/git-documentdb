/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

/**
 * Test lifecycle of synchronization (open, sync, tryPush, trySync, retrySync)
 * by using GitHub Personal Access Token
 * These tests create a new repository on GitHub if not exists.
 */
import path from 'path';
import fs from 'fs-extra';
import { Sync } from '../../src/remote/sync';
import { GitDocumentDB } from '../../src';
import { RemoteOptions } from '../../src/types';
import { CannotPushBecauseUnfetchedCommitExistsError } from '../../src/error';
import { sleep } from '../../src/utils';
import {
  destroyDBs,
  getChangedFile,
  removeRemoteRepositories,
} from '../../test/remote_utils';

const reposPrefix = 'test_sync_lifecycle___';
const localDir = `./test_intg/database_sync_lifecycle`;

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

afterAll(() => {
  // It may throw error due to memory leak with CannotPushBecauseUnfetchedCommitExistsErro
  // fs.removeSync(path.resolve(localDir));
});

// GITDDB_GITHUB_USER_URL: URL of your GitHub account
// e.g.) https://github.com/foo/
const maybe =
  process.env.GITDDB_GITHUB_USER_URL && process.env.GITDDB_PERSONAL_ACCESS_TOKEN
    ? describe
    : describe.skip;

// Test lifecycle (open, sync, tryPush, trySync, retrySync)
maybe('remote: sync: lifecycle', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  beforeAll(async () => {
    await removeRemoteRepositories(reposPrefix);
  });

  /**
   * Initialize synchronization by create() with remoteURL
   * Initialize means creating local and remote repositories by using a remote_url
   */
  describe('Init sync by create(): ', () => {
    /**
     * Basics: A is empty, creates remote, puts data; B is empty, clones the remote
     */
    describe('Basics: A puts data; B clones the remote: ', () => {
      test('B checks cloned document', async () => {
        const remoteURL = remoteURLBase + serialId();

        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        const options: RemoteOptions = {
          remote_url: remoteURL,
          connection: { type: 'github', personal_access_token: token },
        };
        // console.time('create dbA');
        await dbA.create(options);
        // console.timeEnd('create dbA');

        // console.time('put jsonA1');
        const jsonA1 = { _id: '1', name: 'fromA' };
        await dbA.put(jsonA1);
        // console.timeEnd('put jsonA1');

        // console.time('push dbA');
        const remoteA = dbA.getRemote(remoteURL);
        await remoteA.tryPush();
        // console.timeEnd('push dbA');

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameB,
          local_dir: localDir,
        });
        // console.time('create dbB');
        await dbB.create(options);
        // console.timeEnd('create dbB');

        // console.time('get jsonA1');
        await expect(dbB.get(jsonA1._id)).resolves.toMatchObject(jsonA1);
        // console.timeEnd('get jsonA1');

        // console.time('destroy');
        await destroyDBs([dbA, dbB]);
        // console.timeEnd('destroy');
      });

      test('Race condition of two tryPush() calls', async () => {
        const remoteURL = remoteURLBase + serialId();

        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        const options: RemoteOptions = {
          remote_url: remoteURL,
          connection: { type: 'github', personal_access_token: token },
        };
        await dbA.create(options);
        const jsonA1 = { _id: '1', name: 'fromA' };
        await dbA.put(jsonA1);
        const remoteA = dbA.getRemote(remoteURL);

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameB,
          local_dir: localDir,
        });
        await dbB.create(options);
        const jsonB1 = { _id: '1', name: 'fromB' };
        await dbB.put(jsonB1);
        const remoteB = dbB.getRemote(remoteURL);

        await expect(
          Promise.all([remoteA.tryPush(), remoteB.tryPush()])
        ).rejects.toThrowError(CannotPushBecauseUnfetchedCommitExistsError);

        await destroyDBs([dbA, dbB]);
      });

      test('Ordered condition of two tryPush() calls', async () => {
        const remoteURL = remoteURLBase + serialId();

        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        const options: RemoteOptions = {
          remote_url: remoteURL,
          connection: { type: 'github', personal_access_token: token },
        };
        await dbA.create(options);
        const jsonA1 = { _id: '1', name: 'fromA' };
        await dbA.put(jsonA1);
        const remoteA = dbA.getRemote(remoteURL);

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameB,
          local_dir: localDir,
        });
        await dbB.create(options);
        const jsonB1 = { _id: '1', name: 'fromB' };
        await dbB.put(jsonB1);
        const remoteB = dbB.getRemote(remoteURL);

        await remoteA.tryPush();
        await expect(remoteB.tryPush()).rejects.toThrowError(
          CannotPushBecauseUnfetchedCommitExistsError
        );

        await destroyDBs([dbA, dbB]);
      });

      test('Race condition of two trySync() calls: trySync() again by hand before retrySync()', async () => {
        const remoteURL = remoteURLBase + serialId();

        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        const options: RemoteOptions = {
          remote_url: remoteURL,
          connection: { type: 'github', personal_access_token: token },
          retry_interval: Sync.defaultRetryInterval + 10000,
        };
        await dbA.create(options);

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameB,
          local_dir: localDir,
        });
        await dbB.create(options);

        const jsonA1 = { _id: '1', name: 'fromA' };
        const putResultA1 = await dbA.put(jsonA1);
        const remoteA = dbA.getRemote(remoteURL);

        const jsonB1 = { _id: '2', name: 'fromB' };
        const putResultB1 = await dbB.put(jsonB1);
        const remoteB = dbB.getRemote(remoteURL);

        const [resultA, resultB] = await Promise.all([
          remoteA.trySync().catch(() => undefined),
          remoteB.trySync().catch(() => undefined),
        ]);
        // CannotPushBecauseUnfetchedCommitExistsError
        expect(resultA === undefined || resultB === undefined).toBe(true);
        if (resultA === undefined) {
          await expect(remoteA.trySync()).resolves.toMatchObject({
            action: 'merge and push',
            changes: {
              local: [
                {
                  data: {
                    doc: jsonB1,
                    file_sha: putResultB1.file_sha,
                    id: jsonB1._id,
                  },
                  operation: 'create',
                },
              ],
              remote: [
                {
                  data: {
                    doc: jsonA1,
                    file_sha: putResultA1.file_sha,
                    id: jsonA1._id,
                  },
                  operation: 'create',
                },
              ],
            },
          });
        }
        else {
          await expect(remoteB.trySync()).resolves.toMatchObject({
            action: 'merge and push',
            changes: {
              local: [
                {
                  data: {
                    doc: jsonA1,
                    file_sha: putResultA1.file_sha,
                    id: jsonA1._id,
                  },
                  operation: 'create',
                },
              ],
              remote: [
                {
                  data: {
                    doc: jsonB1,
                    file_sha: putResultB1.file_sha,
                    id: jsonB1._id,
                  },
                  operation: 'create',
                },
              ],
            },
          });
        }

        await destroyDBs([dbA, dbB]);
      });

      test('Race condition of two trySync() calls: retrySync() will occur (interval 0ms) before trySync by hand', async () => {
        const remoteURL = remoteURLBase + serialId();

        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        // Set retry interval to 0ms
        const options: RemoteOptions = {
          remote_url: remoteURL,
          connection: { type: 'github', personal_access_token: token },
          retry_interval: 0,
        };
        await dbA.create(options);
        const jsonA1 = { _id: '1', name: 'fromA' };
        await dbA.put(jsonA1);
        const remoteA = dbA.getRemote(remoteURL);

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameB,
          local_dir: localDir,
        });
        await dbB.create(options);
        const jsonB1 = { _id: '2', name: 'fromB' };
        await dbB.put(jsonB1);
        const remoteB = dbB.getRemote(remoteURL);

        const [resultA, resultB] = await Promise.all([
          remoteA.trySync().catch(() => undefined),
          remoteB.trySync().catch(() => undefined),
        ]);
        // CannotPushBecauseUnfetchedCommitExistsError

        // Problem has been solved automatically by retrySync(),
        // so next trySync do nothing.
        await sleep(3000);
        if (resultA === undefined) {
          await expect(remoteA.trySync()).resolves.toMatchObject({ action: 'nop' });
        }
        else {
          await expect(remoteB.trySync()).resolves.toMatchObject({ action: 'nop' });
        }

        await destroyDBs([dbA, dbB]);
      });

      test('Resolve conflict', async () => {
        const remoteURL = remoteURLBase + serialId();

        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        const options: RemoteOptions = {
          remote_url: remoteURL,
          connection: { type: 'github', personal_access_token: token },
        };
        await dbA.create(options);

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameB,
          local_dir: localDir,
        });
        await dbB.create(options);

        const jsonA1 = { _id: '1', name: 'fromA' };
        await dbA.put(jsonA1);
        const remoteA = dbA.getRemote(remoteURL);
        await remoteA.tryPush();

        // The same id
        const jsonB1 = { _id: '1', name: 'fromB' };
        const putResultB1 = await dbB.put(jsonB1);
        const remoteB = dbB.getRemote(remoteURL);

        await expect(remoteB.trySync()).resolves.toMatchObject({
          action: 'resolve conflicts and push',
          changes: {
            local: [],
            remote: [getChangedFile('update', jsonB1, putResultB1)],
          },
          conflicts: [
            {
              target: {
                id: jsonB1._id,
                file_sha: putResultB1.file_sha,
              },
              operation: 'create',
              strategy: 'ours',
            },
          ],
        });

        await destroyDBs([dbA, dbB]);
      });
    });

    /**
     * Sync automatically (live)
     */
    describe('Sync automatically (live): ', () => {
      test('Live starts from create(): Check if live starts', async () => {
        const remoteURL = remoteURLBase + serialId();

        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        const interval = 3000;
        const options: RemoteOptions = {
          remote_url: remoteURL,
          live: true,
          sync_direction: 'both',
          interval,
          connection: { type: 'github', personal_access_token: token },
        };
        await dbA.create(options);

        const jsonA1 = { _id: '1', name: 'fromA' };
        await dbA.put(jsonA1);

        const remoteA = dbA.getRemote(remoteURL);
        expect(remoteA.options().live).toBeTruthy();
        expect(remoteA.options().interval).toBe(interval);

        // Wait live sync()
        while (dbA.taskQueue.statistics().sync === 0) {
          // eslint-disable-next-line no-await-in-loop
          await sleep(500);
        }

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameB,
          local_dir: localDir,
        });
        await dbB.create(options);
        await expect(dbB.get(jsonA1._id)).resolves.toMatchObject(jsonA1);

        await destroyDBs([dbA, dbB]);
      });

      test('cancel()', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        const interval = 1000;
        const options: RemoteOptions = {
          remote_url: remoteURL,
          live: true,
          sync_direction: 'both',
          interval,
          connection: { type: 'github', personal_access_token: token },
        };
        await dbA.create(options);

        const remoteA = dbA.getRemote(remoteURL);
        expect(remoteA.options().live).toBeTruthy();
        const count = dbA.taskQueue.statistics().sync;
        remoteA.cancel();
        await sleep(3000);
        expect(remoteA.options().live).toBeFalsy();
        expect(dbA.taskQueue.statistics().sync).toBe(count);

        await destroyDBs([dbA]);
      });

      test('pause() and resume()', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        const interval = 1000;
        const options: RemoteOptions = {
          remote_url: remoteURL,
          live: true,
          sync_direction: 'both',
          interval,
          connection: { type: 'github', personal_access_token: token },
        };
        await dbA.create(options);

        const remoteA = dbA.getRemote(remoteURL);
        expect(remoteA.options().live).toBeTruthy();
        const count = dbA.taskQueue.statistics().sync;
        expect(remoteA.pause()).toBeTruthy();
        expect(remoteA.pause()).toBeFalsy(); // ignored

        await sleep(3000);
        expect(remoteA.options().live).toBeFalsy();
        expect(dbA.taskQueue.statistics().sync).toBe(count);

        expect(remoteA.resume()).toBeTruthy();
        expect(remoteA.resume()).toBeFalsy(); // ignored
        await sleep(3000);
        expect(remoteA.options().live).toBeTruthy();
        expect(dbA.taskQueue.statistics().sync).toBeGreaterThan(count);

        await destroyDBs([dbA]);
      });

      test('Cancel when gitDDB.close()', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        const interval = 1000;
        const options: RemoteOptions = {
          remote_url: remoteURL,
          live: true,
          sync_direction: 'both',
          interval,
          connection: { type: 'github', personal_access_token: token },
        };
        await dbA.create(options);

        const remoteA = dbA.getRemote(remoteURL);
        expect(remoteA.options().live).toBeTruthy();
        const count = dbA.taskQueue.statistics().sync;
        await dbA.close();

        remoteA.resume(); // resume() must be ignored after close();

        await sleep(3000);
        expect(remoteA.options().live).toBeFalsy();
        expect(dbA.taskQueue.statistics().sync).toBe(count);

        await destroyDBs([dbA]);
      });

      test('Check intervals', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        const interval = 1000;
        const options: RemoteOptions = {
          remote_url: remoteURL,
          live: true,
          sync_direction: 'both',
          interval,
          connection: { type: 'github', personal_access_token: token },
        };
        await dbA.create(options);

        const remoteA = dbA.getRemote(remoteURL);
        expect(remoteA.options().interval).toBe(interval);

        const jsonA1 = { _id: '1', name: 'fromA' };
        await dbA.put(jsonA1);
        // Wait live sync()
        while (dbA.taskQueue.statistics().sync === 0) {
          // eslint-disable-next-line no-await-in-loop
          await sleep(500);
        }
        remoteA.pause();

        const jsonA2 = { _id: '2', name: 'fromA' };
        await dbA.put(jsonA2);

        const currentCount = dbA.taskQueue.statistics().sync;
        // Change interval
        remoteA.resume({
          interval: 5000,
        });
        expect(remoteA.options().interval).toBe(5000);
        await sleep(3000);
        // Check count before next sync()
        expect(dbA.taskQueue.statistics().sync).toBe(currentCount);

        await destroyDBs([dbA]);
      });

      test('Repeat trySync() automatically', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        const interval = 1000;
        const options: RemoteOptions = {
          remote_url: remoteURL,
          live: true,
          sync_direction: 'both',
          interval,
          connection: { type: 'github', personal_access_token: token },
        };
        await dbA.create(options);

        const remoteA = dbA.getRemote(remoteURL);

        await sleep(10000);
        expect(dbA.taskQueue.statistics().sync).toBeGreaterThan(5);

        await destroyDBs([dbA]);
      });
    });

    /**
     * Retry sync
     */
    describe('Retry sync: ', () => {
      test('No retry', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        const optionsA: RemoteOptions = {
          remote_url: remoteURL,
          live: true,
          interval: 1000,
          sync_direction: 'both',
          connection: { type: 'github', personal_access_token: token },
        };
        await dbA.create(optionsA);

        const remoteA = dbA.getRemote(remoteURL);
        expect(remoteA.options().retry).toBe(Sync.defaultRetry);

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameB,
          local_dir: localDir,
        });
        const optionsB: RemoteOptions = {
          remote_url: remoteURL,
          retry: 0, // no retry
          retry_interval: 0,
          sync_direction: 'both',
          connection: { type: 'github', personal_access_token: token },
        };

        await dbB.create(optionsB);

        const jsonA1 = { _id: '1', name: 'fromA' };
        await dbA.put(jsonA1);
        await sleep(3000);

        const jsonB1 = { _id: '1', name: 'fromB' };
        await dbB.put(jsonB1);
        const remoteB = dbB.getRemote(remoteURL);

        await expect(remoteB.tryPush()).rejects.toThrowError(
          CannotPushBecauseUnfetchedCommitExistsError
        );
        const currentSyncCount = dbB.taskQueue.statistics().sync;
        await sleep(5000);
        expect(dbB.taskQueue.statistics().sync).toBe(currentSyncCount);

        await destroyDBs([dbA, dbB]);
      });

      test('Check retry interval', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        const optionsA: RemoteOptions = {
          remote_url: remoteURL,
          live: true,
          interval: 1000,
          sync_direction: 'both',
          connection: { type: 'github', personal_access_token: token },
        };
        await dbA.create(optionsA);

        const remoteA = dbA.getRemote(remoteURL);
        expect(remoteA.options().retry).toBe(Sync.defaultRetry);

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameB,
          local_dir: localDir,
        });
        const optionsB: RemoteOptions = {
          remote_url: remoteURL,
          retry_interval: 2000,
          sync_direction: 'both',
          connection: { type: 'github', personal_access_token: token },
        };

        await dbB.create(optionsB);

        const jsonA1 = { _id: '1', name: 'fromA' };
        await dbA.put(jsonA1);
        // Wait sync
        await sleep(3000);

        const jsonB1 = { _id: '1', name: 'fromB' };
        await dbB.put(jsonB1);
        const remoteB = dbB.getRemote(remoteURL);

        await expect(remoteB.tryPush()).rejects.toThrowError(
          CannotPushBecauseUnfetchedCommitExistsError
        );
        const currentSyncCount = dbB.taskQueue.statistics().sync;
        // console.log('sync count:' + dbB.taskQueue.statistics().sync);
        expect(dbB.taskQueue.statistics().sync).toBe(currentSyncCount);
        // console.log('wait next sync');
        // Need to wait retry_interval(2sec) + sync processing time(about lesser than 5sec))
        await sleep(7000);
        expect(dbB.taskQueue.statistics().sync).toBeGreaterThanOrEqual(
          currentSyncCount + 1
        );

        await destroyDBs([dbA, dbB]);
      });

      test.skip('More retries', () => {
        // Test this using behavior_for_no_merge_base option
      });
    });
  });

  /**
   * Initialize synchronization by sync() with remoteURL
   * Initialize means creating local and remote repositories by using a remote_url
   */
  describe('Init sync by sync()', () => {
    test('Overload of sync()', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbNameA = serialId();

      const dbA: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameA,
        local_dir: localDir,
      });

      await dbA.create();
      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);

      const options: RemoteOptions = {
        live: true,
        interval: 1000,
        sync_direction: 'both',
        connection: { type: 'github', personal_access_token: token },
      };
      const remoteA = await dbA.sync(remoteURL, options);
      let complete = false;
      remoteA.on('complete', () => {
        complete = true;
      });
      // eslint-disable-next-line no-unmodified-loop-condition
      while (!complete) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(1000);
      }

      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameB,
        local_dir: localDir,
      });
      await dbB.create(options);
      await expect(dbB.get(jsonA1._id)).resolves.toMatchObject(jsonA1);

      await destroyDBs([dbA, dbB]);
    });

    test('A initializes synchronization by sync(); B initializes synchronization by create(), clones the remote: ', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbNameA = serialId();

      const dbA: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameA,
        local_dir: localDir,
      });

      await dbA.create();
      const options: RemoteOptions = {
        remote_url: remoteURL,
        live: true,
        interval: 1000,
        sync_direction: 'both',
        connection: { type: 'github', personal_access_token: token },
      };
      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);

      const remoteA = await dbA.sync(options);

      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameB,
        local_dir: localDir,
      });
      await dbB.create(options);
      await expect(dbB.get(jsonA1._id)).resolves.toMatchObject(jsonA1);

      await destroyDBs([dbA, dbB]);
    });

    test('A initializes synchronization by sync(); B initialize synchronization by create(), close(), open() again with no remote, following sync(): ', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbNameA = serialId();

      const dbA: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameA,
        local_dir: localDir,
      });

      await dbA.create();
      const options: RemoteOptions = {
        remote_url: remoteURL,
        live: true,
        interval: 1000,
        sync_direction: 'both',
        connection: { type: 'github', personal_access_token: token },
      };
      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);

      const remoteA = await dbA.sync(options);

      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameB,
        local_dir: localDir,
      });
      await dbB.create(options);
      await dbB.close();

      await dbB.open();
      const jsonB1 = { _id: '1', name: 'fromB' };
      await dbB.put(jsonB1);

      await dbB.sync(options);
      await expect(dbB.get(jsonB1._id)).resolves.toMatchObject(jsonB1);

      // Wait next sync()
      const count = dbA.taskQueue.statistics().sync;
      while (dbA.taskQueue.statistics().sync === count) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(500);
      }
      await expect(dbA.get(jsonA1._id)).resolves.toMatchObject(jsonB1);

      await destroyDBs([dbA, dbB]);
    });
  });

  /**
   * Initialize synchronization by create() with remoteURL, close(), open() again with another remoteURL
   * Initialize means creating local and remote repositories by using a remote_url
   */
  describe('Init sync by create() with remote_url, close(), open() again with another remote_url: ', () => {
    test.skip('Open() again with the same repository with another remote_url');
    test.skip('Open() again with a different repository with another remote_url', () => {
      // no merge base
    });
  });
  /**
   * Initialize synchronization by create() with remoteURL, close(), open() again with no remoteURL, following sync() with another remoteURL
   * Initialize means creating local and remote repositories by using a remote_url
   */
  describe('Init sync by create() with remote_url, close(), open() again with no remoteURL, following sync() with another remote_url: ', () => {
    test.skip('Open() again with the same repository with another remote_url');
    test.skip('Open() again with a different repository with another remote_url', () => {
      // no merge base
    });
  });

  test.skip('Multiple Sync');
});
