/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

/**
 * Test lifecycle of synchronization (open, sync, tryPush, trySync)
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
import { NETWORK_RETRY, NETWORK_RETRY_INTERVAL } from '../../src/const';
import { push_worker } from '../../src/remote/push_worker';
import { sync_worker } from '../../src/remote/sync_worker';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const push_worker_module = require('../../src/remote/push_worker');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sync_worker_module = require('../../src/remote/sync_worker');

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

// Test lifecycle (open, sync, tryPush, trySync)
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
     * Repetitive Sync (live)
     */
    describe('Repetitive Sync (live)', () => {
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

        await sleep(10000);
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
    describe('Failed sync', () => {
      it('retries tryPush() in init() after connection errors, and fails.', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();
        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        await dbA.create();

        const options: RemoteOptions = {
          remote_url: remoteURL,
          sync_direction: 'push',
          connection: { type: 'github', personal_access_token: token },
        };

        const sync = new Sync(dbA, options);
        const stubNet = sinon.stub(sync, 'canNetworkConnection');
        stubNet.resolves(false);

        const stubPush = sinon.stub(push_worker_module, 'push_worker');
        stubPush.rejects();

        await expect(sync.init(dbA.repository()!)).rejects.toThrowError(Error);

        expect(stubPush.callCount).toBe(NETWORK_RETRY + 1);

        stubNet.restore();
        stubPush.restore();
        await destroyDBs([dbA]);
      });

      it('retries tryPush() in init() after connection errors, and succeeds.', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();
        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        await dbA.create();

        const options: RemoteOptions = {
          remote_url: remoteURL,
          sync_direction: 'push',
          connection: { type: 'github', personal_access_token: token },
        };

        const sync = new Sync(dbA, options);
        const stubNet = sinon.stub(sync, 'canNetworkConnection');
        stubNet.resolves(false);

        const stubPush = sinon.stub(push_worker_module, 'push_worker');
        stubPush.onFirstCall().rejects();
        const syncResultPush: SyncResultPush = {
          action: 'push',
          changes: {
            remote: [],
          },
        };

        // Call push_worker which is not spied by Sinon
        stubPush.onSecondCall().callsFake(async () => {
          stubPush.restore();
          return await push_worker(dbA, sync, 'myTaskId');
        });

        await expect(sync.init(dbA.repository()!)).resolves.toMatchObject(syncResultPush);

        expect(stubPush.callCount).toBe(2);

        stubNet.restore();
        stubPush.restore();
        await destroyDBs([dbA]);
      });

      it('does not retry tryPush() in init() after error except connection errors and resolvable errors.', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();
        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        await dbA.create();

        const options: RemoteOptions = {
          remote_url: remoteURL,
          sync_direction: 'push',
          connection: { type: 'github', personal_access_token: token },
        };

        const sync = new Sync(dbA, options);

        const stubPush = sinon.stub(push_worker_module, 'push_worker');
        stubPush.rejects();

        // Call push_worker which is not spied by Sinon
        stubPush.onSecondCall().callsFake(async () => {
          stubPush.restore();
          return await push_worker(dbA, sync, 'myTaskId');
        });

        await expect(sync.init(dbA.repository()!)).rejects.toThrowError(PushWorkerError);

        expect(stubPush.callCount).toBe(1);

        stubPush.restore();
        await destroyDBs([dbA]);
      });

      it('retries trySync() in init() after connection errors, and fails.', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();
        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        await dbA.create();

        const options: RemoteOptions = {
          remote_url: remoteURL,
          sync_direction: 'both',
          connection: { type: 'github', personal_access_token: token },
        };

        await dbA.sync(options);
        const sync = dbA.getRemote(remoteURL);

        const stubNet = sinon.stub(sync, 'canNetworkConnection');
        stubNet.resolves(false);

        const stubSync = sinon.stub(sync_worker_module, 'sync_worker');
        stubSync.rejects();

        // sync has already been initialized, so will run trySync()
        await expect(sync.init(dbA.repository()!)).rejects.toThrowError(Error);

        expect(stubSync.callCount).toBe(NETWORK_RETRY + 1);

        stubNet.restore();
        stubSync.restore();

        await destroyDBs([dbA]);
      });

      it('retries trySync() in init() after connection errors, and succeeds.', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();
        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        await dbA.create();

        const options: RemoteOptions = {
          remote_url: remoteURL,
          sync_direction: 'both',
          connection: { type: 'github', personal_access_token: token },
        };

        await dbA.sync(options);
        const sync = dbA.getRemote(remoteURL);

        const stubNet = sinon.stub(sync, 'canNetworkConnection');
        stubNet.resolves(false);

        const stubSync = sinon.stub(sync_worker_module, 'sync_worker');
        stubSync.onFirstCall().rejects();

        // Call push_worker which is not spied by Sinon
        stubSync.onSecondCall().callsFake(async () => {
          stubSync.restore();
          return await sync_worker(dbA, sync, 'myTaskId');
        });

        const jsonA1 = { _id: '1', name: 'profile01' };
        const putResult = await dbA.put(jsonA1);
        const syncResultPush: SyncResultPush = {
          action: 'push',
          changes: {
            remote: [
              {
                operation: 'create',
                data: {
                  id: putResult.id,
                  file_sha: putResult.file_sha,
                  doc: jsonA1,
                },
              },
            ],
          },
        };

        await expect(sync.init(dbA.repository()!)).resolves.toMatchObject(syncResultPush);

        expect(stubSync.callCount).toBe(2);

        stubNet.restore();
        stubSync.restore();
        await destroyDBs([dbA]);
      });

      it('retries trySync() in init() after resolvable errors, and succeeds.', async () => {
        /**
         * After race condition of trySync() throws Error,
         * db retries trySync() and resolves the problems automatically.
         */
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

        let errorOnA = false;
        let errorOnB = false;
        remoteA.on('error', () => {
          errorOnA = true;
        });
        remoteB.on('error', () => {
          errorOnB = true;
        });

        const spySync = sinon.spy(sync_worker_module, 'sync_worker');

        // Either dbA or dbB will get CannotPushBecauseUnfetchedCommitExistsError
        // and retry automatically.
        const [resultA, resultB] = await Promise.all([
          remoteA.trySync(),
          remoteB.trySync(),
        ]);

        const nextResultA = await remoteA.trySync();
        const nextResultB = await remoteB.trySync();

        if (errorOnA) {
          expect(resultA.action).toBe('merge and push');
          expect(nextResultA.action).toBe('nop');
          expect(resultB.action).toBe('push');
          expect(nextResultB.action).toBe('fast-forward merge');
        }
        else {
          expect(resultA.action).toBe('push');
          expect(nextResultA.action).toBe('fast-forward merge');
          expect(resultB.action).toBe('merge and push');
          expect(nextResultB.action).toBe('nop');
        }
        expect(spySync.callCount).toBe(5);

        spySync.restore();

        await destroyDBs([dbA, dbB]);
      });

      it('does not retry trySync() in init() after error except connection errors and resolvable errors', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();
        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        await dbA.create();

        const options: RemoteOptions = {
          remote_url: remoteURL,
          sync_direction: 'both',
          connection: { type: 'github', personal_access_token: token },
        };

        await dbA.sync(options);
        const sync = dbA.getRemote(remoteURL);

        const stubSync = sinon.stub(sync_worker_module, 'sync_worker');
        stubSync.rejects();

        await expect(sync.init(dbA.repository()!)).rejects.toThrowError(Error);

        expect(stubSync.callCount).toBe(1);

        stubSync.restore();
        await destroyDBs([dbA]);
      });

      it('does not occur when retry option is 0', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();
        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        await dbA.create();

        const options: RemoteOptions = {
          remote_url: remoteURL,
          sync_direction: 'push',
          retry_interval: 0,
          retry: 0,
          connection: { type: 'github', personal_access_token: token },
        };

        const sync = new Sync(dbA, options);
        const stubNet = sinon.stub(sync, 'canNetworkConnection');
        stubNet.resolves(false);

        const stubPush = sinon.stub(push_worker_module, 'push_worker');
        stubPush.rejects();

        await expect(sync.init(dbA.repository()!)).rejects.toThrowError(Error);

        expect(stubPush.callCount).toBe(1);

        stubNet.restore();
        stubPush.restore();
        await destroyDBs([dbA]);
      });

      it.only('retries every retry interval', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();
        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        await dbA.create();

        const options: RemoteOptions = {
          remote_url: remoteURL,
          sync_direction: 'push',
          retry_interval: 5000,
          retry: 2,
          connection: { type: 'github', personal_access_token: token },
        };

        const sync = new Sync(dbA, options);
        const stubNet = sinon.stub(sync, 'canNetworkConnection');
        stubNet.resolves(false);

        const stubPush = sinon.stub(push_worker_module, 'push_worker');
        stubPush.rejects();

        sync.init(dbA.repository()!).catch(() => {});

        await sleep(3000);
        expect(stubPush.callCount).toBe(1);
        await sleep(5000);
        expect(stubPush.callCount).toBe(2);
        await sleep(5000);
        expect(stubPush.callCount).toBe(3);
        await sleep(5000);

        stubNet.restore();
        stubPush.restore();
        await destroyDBs([dbA]);
      });

      it('More retries', () => {});
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
