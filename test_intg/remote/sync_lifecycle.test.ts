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
import sinon from 'sinon';
import { Sync } from '../../src/remote/sync';
import { GitDocumentDB } from '../../src';
import { RemoteOptions, SyncResultPush } from '../../src/types';
import { PushWorkerError } from '../../src/error';
import { sleep } from '../../src/utils';
import {
  destroyDBs,
  getChangedFile,
  removeRemoteRepositories,
} from '../../test/remote_utils';
import { NETWORK_RETRY } from '../../src/const';
import { RemoteRepository } from '../../src/remote/remote_repository';

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
maybe('intg <remote/sync_lifecycle> Sync', () => {
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
  describe('initialized by create():', () => {
    /**
     * Basics: A is empty, creates remote, puts data; B is empty, clones the remote
     */
    describe('After dbA created remote repository, dbB clones it.', () => {
      it('dbA and dbB have the same document.', async () => {
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
        await remoteA.tryPush();

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameB,
          local_dir: localDir,
        });
        await dbB.create(options);

        await expect(dbB.get(jsonA1._id)).resolves.toMatchObject(jsonA1);

        await destroyDBs([dbA, dbB]);
      });

      it('Race condition of two tryPush() calls throws PushWorkerError.', async () => {
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
        ).rejects.toThrowError(PushWorkerError);

        await destroyDBs([dbA, dbB]);
      });

      it('Ordered condition of two tryPush() calls throws PushWorkerError.', async () => {
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
        await expect(remoteB.tryPush()).rejects.toThrowError(PushWorkerError);

        await destroyDBs([dbA, dbB]);
      });

      it('After race condition throws Error, trySync() again (before retrySync() is called) results [merge and push] action.', async () => {
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

        // Race condition
        const [resultA, resultB] = await Promise.all([
          remoteA.trySync().catch(() => undefined),
          remoteB.trySync().catch(() => undefined),
        ]);
        // PushWorkerError (CannotPushBecauseUnfetchedCommitExistsError)
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

      it('After race condition throws Error, retrySync() will occur (interval 0ms) before trySync by hand.', async () => {
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

      it('Updating the same document results [resolve conflict and push] action.', async () => {
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
    describe('Automated Sync (live)', () => {
      it('starts and pushes after interval when called from create() with live option.', async () => {
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

      it('stops by cancel()', async () => {
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

      it('pause() and resume()', async () => {
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

      it('stops by gitDDB.close()', async () => {
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

      it('changes interval when resume() is called with new interval.', async () => {
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

      it('repeats trySync() automatically.', async () => {
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
    describe('Retry sync', () => {
      it('retries tryPush() in init() after connection failed, and fails it.', async () => {
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
          sync_direction: 'push',
          connection: { type: 'github', personal_access_token: token },
        };

        const sync = new Sync(dbA, options);
        const stubNet = sinon.stub(sync, 'checkNetworkConnection');
        stubNet.rejects();

        const stubPush = sinon.stub(sync, 'tryPush');
        stubPush.rejects();

        const stubSync = sinon.stub(sync, 'trySync');
        stubSync.rejects();

        await expect(sync.init(dbA.repository()!)).rejects.toThrowError(Error);

        expect(stubSync.callCount).toBe(NETWORK_RETRY);

        stubNet.restore();
        stubPush.restore();
        await destroyDBs([dbA]);
      });

      it.only('retries tryPush() in init() after connection failed, and succeeds it.', async () => {
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
          sync_direction: 'push',
          connection: { type: 'github', personal_access_token: token },
        };

        const sync = new Sync(dbA, options);
        const stubNet = sinon.stub(sync, 'checkNetworkConnection');
        stubNet.rejects();

        const stubPush = sinon.stub(sync, 'tryPush');
        stubPush.onFirstCall().rejects();
        const syncResultPush: SyncResultPush = {
          action: 'push',
          changes: {
            remote: [],
          },
        };

        // Call sync2.tryPush which is not spied by Sinon
        const sync2 = new Sync(dbA, options);
        stubPush.onSecondCall().callsFake(async () => {
          return await sync2.tryPush();
        });

        await expect(sync.init(dbA.repository()!)).resolves.toMatchObject(syncResultPush);

        expect(stubPush.callCount).toBe(2);

        stubNet.restore();
        stubPush.restore();
        await destroyDBs([dbA]);
      });

      it('does not retry tryPush() in init() after error except connection error.', async () => {});

      it('retries trySync() in init() after connection fails, and fails it.', () => {});

      it('retries trySync() in init() after connection fails, and succeeds it.', () => {});

      it('does not retry trySync() in init() after error except connection error', () => {});

      it('does not occur when retry option is 0', async () => {
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

        await expect(remoteB.tryPush()).rejects.toThrowError(PushWorkerError);
        const currentSyncCount = dbB.taskQueue.statistics().sync;
        await sleep(5000);
        expect(dbB.taskQueue.statistics().sync).toBe(currentSyncCount);

        await destroyDBs([dbA, dbB]);
      });

      it('occurs every retry interval', async () => {
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

        await expect(remoteB.tryPush()).rejects.toThrowError(PushWorkerError);
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

      it.skip('More retries', () => {
        // Test this using behavior_for_no_merge_base option
      });
    });
  });

  /**
   * Initialize synchronization by sync() with remoteURL
   * Initialize means creating local and remote repositories by using a remote_url
   */
  describe('initialized by sync():', () => {
    it('can be called with remoteURL and RemoteOption (overload).', async () => {
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

    it('After dbA#sync() created remote repository, dbB#create() clones it.', async () => {
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

    it('After dbA#sync() created remote repository, dbB#create() clones it, close(), open() again with no remote, following sync().', async () => {
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
    it.skip('Open() again with the same repository with another remote_url');
    it.skip('Open() again with a different repository with another remote_url', () => {
      // no merge base
    });
  });
  /**
   * Initialize synchronization by create() with remoteURL, close(), open() again with no remoteURL, following sync() with another remoteURL
   * Initialize means creating local and remote repositories by using a remote_url
   */
  describe('Init sync by create() with remote_url, close(), open() again with no remoteURL, following sync() with another remote_url: ', () => {
    it.skip('Open() again with the same repository with another remote_url');
    it.skip('Open() again with a different repository with another remote_url', () => {
      // no merge base
    });
  });

  it.skip('Multiple Sync object');
});
function SyncResult (SyncResult: any) {
  throw new Error('Function not implemented.');
}
