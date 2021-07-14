/* eslint-disable @typescript-eslint/naming-convention */
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
import expect from 'expect';
import sinon from 'sinon';
import { Sync } from '../src/remote/sync';
import { GitDocumentDB } from '../src/git_documentdb';
import { RemoteOptions, SyncResultPush } from '../src/types';
import { Err } from '../src/error';
import { sleep } from '../src/utils';
import {
  destroyDBs,
  getChangedFileInsert,
  getChangedFileUpdate,
  removeRemoteRepositories,
} from '../test/remote_utils';
import { JSON_EXT, MINIMUM_SYNC_INTERVAL, NETWORK_RETRY } from '../src/const';
import { pushWorker } from '../src/remote/push_worker';
import { syncWorker } from '../src/remote/sync_worker';
import { RemoteEngine } from '../src/remote/remote_engine';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pushWorker_module = require('../src/remote/push_worker');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const syncWorker_module = require('../src/remote/sync_worker');

const reposPrefix = 'test_sync_lifecycle___';
const localDir = `./test_intg/database_sync_lifecycle`;

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
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  GitDocumentDB.plugin(require('git-documentdb-plugin-remote-nodegit'));

  fs.removeSync(path.resolve(localDir));
});

after(() => {
  // It may throw error due to memory leak with UnfetchedCommitExistsError
  // fs.removeSync(path.resolve(localDir));
});

// GITDDB_GITHUB_USER_URL: URL of your GitHub account
// e.g.) https://github.com/foo/
const maybe =
  process.env.GITDDB_GITHUB_USER_URL && process.env.GITDDB_PERSONAL_ACCESS_TOKEN
    ? describe
    : describe.skip;

// Test lifecycle of Sync (open, sync, tryPush, trySync)
maybe('intg <sync_lifecycle> Sync', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  before(async () => {
    await removeRemoteRepositories(reposPrefix);
  });

  /**
   * Initialize synchronization by open() with remoteURL
   * Initialize means creating local and remote repositories by using a remoteUrl
   */
  describe('initialized by open():', () => {
    it('getSync() returns an instance of Sync.', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbNameA = serialId();
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameA,
        localDir: localDir,
      });
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection: { type: 'github', personalAccessToken: token },
      };
      await dbA.open();
      const syncA = await dbA.sync(options);
      expect(syncA.remoteURL).toBe(remoteURL);
      destroyDBs([dbA]);
    });

    it('unregisterRemote() removes an instance of Sync.', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbNameA = serialId();
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameA,
        localDir: localDir,
      });
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection: { type: 'github', personalAccessToken: token },
      };
      await dbA.open();
      await dbA.sync(options);
      dbA.removeSync(remoteURL);
      expect(dbA.getSync(remoteURL)).toBeUndefined();
      destroyDBs([dbA]);
    });

    it.skip('getRemoteURLs() returns sync', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbNameA = serialId();
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameA,
        localDir: localDir,
        logLevel: 'trace',
      });
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection: { type: 'github', personalAccessToken: token },
      };
      await dbA.open();
      await dbA.sync(options);
      const remoteURL2 = remoteURLBase + serialId();
      const options2: RemoteOptions = {
        remoteUrl: remoteURL2,
        connection: { type: 'github', personalAccessToken: token },
      };
      await dbA.sync(options2);
      expect(dbA.getRemoteURLs()).toEqual([remoteURL, remoteURL2]);
      destroyDBs([dbA]);
    });

    /**
     * Basics: A is empty, creates remote, puts data; B is empty, clones the remote
     */
    describe('After dbA created remote repository, dbB clones it.', () => {
      it('dbA and dbB have the same document.', async () => {
        const remoteURL = remoteURLBase + serialId();

        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameA,
          localDir: localDir,
        });
        const options: RemoteOptions = {
          remoteUrl: remoteURL,
          connection: { type: 'github', personalAccessToken: token },
        };
        await dbA.open();
        const syncA = await dbA.sync(options);
        const jsonA1 = { _id: '1', name: 'fromA' };
        await dbA.put(jsonA1);
        await syncA.tryPush();

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameB,
          localDir: localDir,
        });
        await dbB.open();
        await dbB.sync(options);

        await expect(dbB.get(jsonA1._id)).resolves.toMatchObject(jsonA1);

        await destroyDBs([dbA, dbB]);
      });

      it('Race condition of two tryPush() calls throws UnfetchedCommitExistsError.', async () => {
        const remoteURL = remoteURLBase + serialId();

        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameA,
          localDir: localDir,
        });
        const options: RemoteOptions = {
          remoteUrl: remoteURL,
          connection: { type: 'github', personalAccessToken: token },
        };
        await dbA.open();
        const syncA = await dbA.sync(options);
        const jsonA1 = { _id: '1', name: 'fromA' };
        await dbA.put(jsonA1);

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameB,
          localDir: localDir,
        });
        await dbB.open();
        const syncB = await dbB.sync(options);
        const jsonB1 = { _id: '1', name: 'fromB' };
        await dbB.put(jsonB1);

        await expect(Promise.all([syncA.tryPush(), syncB.tryPush()])).rejects.toThrowError(
          RemoteEngine[syncA.engine].Err.UnfetchedCommitExistsError
        );

        await destroyDBs([dbA, dbB]);
      });

      it('Ordered condition of two tryPush() calls throws UnfetchedCommitExistsError.', async () => {
        const remoteURL = remoteURLBase + serialId();

        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameA,
          localDir: localDir,
        });
        const options: RemoteOptions = {
          remoteUrl: remoteURL,
          connection: { type: 'github', personalAccessToken: token },
        };
        await dbA.open();
        const syncA = await dbA.sync(options);
        const jsonA1 = { _id: '1', name: 'fromA' };
        await dbA.put(jsonA1);

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameB,
          localDir: localDir,
        });
        await dbB.open();
        const syncB = await dbB.sync(options);
        const jsonB1 = { _id: '1', name: 'fromB' };
        await dbB.put(jsonB1);

        await syncA.tryPush();
        await expect(syncB.tryPush()).rejects.toThrowError(
          RemoteEngine[syncB.engine].Err.UnfetchedCommitExistsError
        );

        await destroyDBs([dbA, dbB]);
      });

      it('Updating the same document results [resolve conflict and push] action.', async () => {
        const remoteURL = remoteURLBase + serialId();

        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameA,
          localDir: localDir,
        });
        const options: RemoteOptions = {
          remoteUrl: remoteURL,
          connection: { type: 'github', personalAccessToken: token },
        };
        await dbA.open();
        const syncA = await dbA.sync(options);

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameB,
          localDir: localDir,
        });
        await dbB.open();
        const syncB = await dbB.sync(options);

        const jsonA1 = { _id: '1', name: 'fromA' };
        const putResultA1 = await dbA.put(jsonA1);
        await syncA.tryPush();

        // The same id
        const jsonB1 = { _id: '1', name: 'fromB' };
        const putResultB1 = await dbB.put(jsonB1);

        await expect(syncB.trySync()).resolves.toMatchObject({
          action: 'resolve conflicts and push',
          changes: {
            local: [],
            remote: [getChangedFileUpdate(jsonA1, putResultA1, jsonB1, putResultB1)],
          },
          conflicts: [
            {
              fatDoc: {
                _id: jsonB1._id,
                name: jsonB1._id + JSON_EXT,
                fileOid: putResultB1.fileOid,
                type: 'json',
                doc: jsonB1,
              },
              operation: 'insert-merge',
              strategy: 'ours-diff',
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
      it('starts and pushes after interval when called from open() with live option.', async () => {
        const remoteURL = remoteURLBase + serialId();

        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameA,
          localDir: localDir,
        });
        const interval = MINIMUM_SYNC_INTERVAL;
        const options: RemoteOptions = {
          remoteUrl: remoteURL,
          live: true,
          syncDirection: 'both',
          interval,
          connection: { type: 'github', personalAccessToken: token },
        };
        await dbA.open();
        const syncA = await dbA.sync(options);

        const jsonA1 = { _id: '1', name: 'fromA' };
        await dbA.put(jsonA1);

        expect(syncA.options.live).toBeTruthy();
        expect(syncA.options.interval).toBe(interval);

        // Wait live sync()
        while (dbA.taskQueue.currentStatistics().sync === 0) {
          // eslint-disable-next-line no-await-in-loop
          await sleep(500);
        }

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameB,
          localDir: localDir,
        });
        await dbB.open();
        await dbB.sync(options);
        await expect(dbB.get(jsonA1._id)).resolves.toMatchObject(jsonA1);

        await destroyDBs([dbA, dbB]);
      });

      it('stops by pause()', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameA,
          localDir: localDir,
        });
        const interval = MINIMUM_SYNC_INTERVAL;
        const options: RemoteOptions = {
          remoteUrl: remoteURL,
          live: true,
          syncDirection: 'both',
          interval,
          connection: { type: 'github', personalAccessToken: token },
        };
        await dbA.open();
        const syncA = await dbA.sync(options);

        expect(syncA.options.live).toBeTruthy();
        const count = dbA.taskQueue.currentStatistics().sync;
        syncA.pause();
        await sleep(interval * 2);
        expect(syncA.options.live).toBeFalsy();
        expect(dbA.taskQueue.currentStatistics().sync).toBe(count);

        await destroyDBs([dbA]);
      });

      it('pause() and resume()', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameA,
          localDir: localDir,
        });
        const interval = MINIMUM_SYNC_INTERVAL;
        const options: RemoteOptions = {
          remoteUrl: remoteURL,
          live: true,
          syncDirection: 'both',
          interval,
          connection: { type: 'github', personalAccessToken: token },
        };
        await dbA.open();
        const syncA = await dbA.sync(options);

        expect(syncA.options.live).toBeTruthy();
        const count = dbA.taskQueue.currentStatistics().sync;
        expect(syncA.pause()).toBeTruthy();
        expect(syncA.pause()).toBeFalsy(); // ignored

        await sleep(interval * 2);
        expect(syncA.options.live).toBeFalsy();
        expect(dbA.taskQueue.currentStatistics().sync).toBe(count);

        expect(syncA.resume()).toBeTruthy();
        expect(syncA.resume()).toBeFalsy(); // ignored
        await sleep(interval * 2);
        expect(syncA.options.live).toBeTruthy();
        expect(dbA.taskQueue.currentStatistics().sync).toBeGreaterThan(count);

        await destroyDBs([dbA]);
      });

      it('stops by gitDDB.close()', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameA,
          localDir: localDir,
        });
        const interval = MINIMUM_SYNC_INTERVAL;
        const options: RemoteOptions = {
          remoteUrl: remoteURL,
          live: true,
          syncDirection: 'both',
          interval,
          connection: { type: 'github', personalAccessToken: token },
        };
        await dbA.open();
        const syncA = await dbA.sync(options);

        expect(syncA.options.live).toBeTruthy();
        const count = dbA.taskQueue.currentStatistics().sync;
        await dbA.close();

        syncA.resume(); // resume() must be ignored after close();

        await sleep(interval * 2);
        expect(syncA.options.live).toBeFalsy();
        expect(dbA.taskQueue.currentStatistics().sync).toBe(count);

        await destroyDBs([dbA]);
      });

      it('changes interval when resume() is called with new interval.', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameA,
          localDir: localDir,
        });
        const interval = MINIMUM_SYNC_INTERVAL;
        const options: RemoteOptions = {
          remoteUrl: remoteURL,
          live: true,
          syncDirection: 'both',
          interval,
          connection: { type: 'github', personalAccessToken: token },
        };
        await dbA.open();
        const syncA = await dbA.sync(options);

        expect(syncA.options.interval).toBe(interval);

        const jsonA1 = { _id: '1', name: 'fromA' };
        await dbA.put(jsonA1);
        // Wait live sync()
        while (dbA.taskQueue.currentStatistics().sync === 0) {
          // eslint-disable-next-line no-await-in-loop
          await sleep(500);
        }
        syncA.pause();

        const jsonA2 = { _id: '2', name: 'fromA' };
        await dbA.put(jsonA2);

        const currentCount = dbA.taskQueue.currentStatistics().sync;
        // Change interval
        syncA.resume({
          interval: interval * 3,
        });
        expect(syncA.options.interval).toBe(interval * 3);
        await sleep(interval);
        // Check count before next sync()
        expect(dbA.taskQueue.currentStatistics().sync).toBe(currentCount);

        await destroyDBs([dbA]);
      });

      it('repeats trySync() automatically.', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameA,
          localDir: localDir,
        });
        const interval = MINIMUM_SYNC_INTERVAL;
        const options: RemoteOptions = {
          remoteUrl: remoteURL,
          live: true,
          syncDirection: 'both',
          interval,
          connection: { type: 'github', personalAccessToken: token },
        };
        await dbA.open();
        const syncA = await dbA.sync(options);

        await sleep(interval * 5);
        expect(dbA.taskQueue.currentStatistics().sync).toBeGreaterThanOrEqual(3);

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
          dbName: dbNameA,
          localDir: localDir,
        });
        await dbA.open();

        const options: RemoteOptions = {
          remoteUrl: remoteURL,
          syncDirection: 'push',
          connection: { type: 'github', personalAccessToken: token },
        };

        const sync = new Sync(dbA, options);
        const stubNet = sandbox.stub(sync, 'canNetworkConnection');
        stubNet.resolves(false);

        const stubPush = sandbox.stub(pushWorker_module, 'pushWorker');
        stubPush.rejects();

        await expect(sync.init()).rejects.toThrowError();

        expect(stubPush.callCount).toBe(NETWORK_RETRY + 1);

        await destroyDBs([dbA]);
      });

      it('retries tryPush() in init() after connection errors, and succeeds.', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();
        const dbA: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameA,
          localDir: localDir,
        });
        await dbA.open();

        const options: RemoteOptions = {
          remoteUrl: remoteURL,
          syncDirection: 'push',
          connection: { type: 'github', personalAccessToken: token },
        };

        const sync = new Sync(dbA, options);
        const stubNet = sandbox.stub(sync, 'canNetworkConnection');
        stubNet.resolves(false);

        const stubPush = sandbox.stub(pushWorker_module, 'pushWorker');
        stubPush.onFirstCall().rejects();
        const syncResultPush: SyncResultPush = {
          action: 'push',
          changes: {
            remote: [],
          },
        };

        // Call pushWorker which is not spied by Sinon
        stubPush.onSecondCall().callsFake(async () => {
          stubPush.restore();
          return await pushWorker(dbA, sync, {
            label: 'sync',
            taskId: 'myTaskId',
          });
        });
        const syncResult = await sync.init();
        expect(syncResult).toEqual(syncResultPush);

        expect(stubPush.callCount).toBe(2);

        await destroyDBs([dbA]);
      });

      it('does not retry tryPush() in init() after error except connection errors and resolvable errors.', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();
        const dbA: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameA,
          localDir: localDir,
        });
        await dbA.open();

        const options: RemoteOptions = {
          remoteUrl: remoteURL,
          syncDirection: 'push',
          connection: { type: 'github', personalAccessToken: token },
        };

        const sync = new Sync(dbA, options);

        const stubPush = sandbox.stub(pushWorker_module, 'pushWorker');
        stubPush.rejects();

        // Call pushWorker which is not spied by Sinon
        stubPush.onSecondCall().callsFake(async () => {
          stubPush.restore();
          return await pushWorker(dbA, sync, {
            label: 'sync',
            taskId: 'myTaskId',
          });
        });

        await expect(sync.init()).rejects.toThrowError(Err.PushWorkerError);

        expect(stubPush.callCount).toBe(1);

        await destroyDBs([dbA]);
      });

      it('retries trySync() in init() after connection errors, and fails.', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();
        const dbA: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameA,
          localDir: localDir,
        });
        await dbA.open();

        const options: RemoteOptions = {
          remoteUrl: remoteURL,
          syncDirection: 'both',
          connection: { type: 'github', personalAccessToken: token },
        };

        const sync = await dbA.sync(options);

        const stubNet = sandbox.stub(sync, 'canNetworkConnection');
        stubNet.resolves(false);

        const stubSync = sandbox.stub(syncWorker_module, 'syncWorker');
        stubSync.rejects();

        // sync has already been initialized, so will run trySync()
        await expect(sync.init()).rejects.toThrowError();

        expect(stubSync.callCount).toBe(NETWORK_RETRY + 1);

        await destroyDBs([dbA]);
      });

      it('retries trySync() in init() after connection errors, and succeeds.', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();
        const dbA: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameA,
          localDir: localDir,
        });
        await dbA.open();

        const options: RemoteOptions = {
          remoteUrl: remoteURL,
          syncDirection: 'both',
          connection: { type: 'github', personalAccessToken: token },
        };

        const sync = await dbA.sync(options);

        const stubNet = sandbox.stub(sync, 'canNetworkConnection');
        stubNet.resolves(false);

        const stubSync = sandbox.stub(syncWorker_module, 'syncWorker');
        stubSync.onFirstCall().rejects();

        // Call pushWorker which is not spied by Sinon
        stubSync.onSecondCall().callsFake(async () => {
          stubSync.restore();
          return await syncWorker(dbA, sync, {
            label: 'sync',
            taskId: 'myTaskId',
          });
        });

        const jsonA1 = { _id: '1', name: 'profile01' };
        const putResult = await dbA.put(jsonA1);
        const syncResultPush: SyncResultPush = {
          action: 'push',
          changes: {
            remote: [getChangedFileInsert(jsonA1, putResult)],
          },
        };

        await expect(sync.init()).resolves.toEqual(syncResultPush);

        expect(stubSync.callCount).toBe(2);

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
          dbName: dbNameA,
          localDir: localDir,
        });
        // Set retry interval to 0ms
        const options: RemoteOptions = {
          remoteUrl: remoteURL,
          connection: { type: 'github', personalAccessToken: token },
          retryInterval: 0,
        };
        await dbA.open();
        const syncA = await dbA.sync(options);
        const jsonA1 = { _id: '1', name: 'fromA' };
        await dbA.put(jsonA1);

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameB,
          localDir: localDir,
        });
        await dbB.open();
        const syncB = await dbB.sync(options);
        const jsonB1 = { _id: '2', name: 'fromB' };
        await dbB.put(jsonB1);

        let errorOnA = false;
        let errorOnB = false;
        syncA.on('error', () => {
          errorOnA = true;
        });
        syncB.on('error', () => {
          errorOnB = true;
        });

        const spySync = sandbox.spy(syncWorker_module, 'syncWorker');

        // Either dbA or dbB will get UnfetchedCommitExistsError
        // and retry automatically.
        const [resultA, resultB] = await Promise.all([syncA.trySync(), syncB.trySync()]);

        const nextResultA = await syncA.trySync();
        const nextResultB = await syncB.trySync();

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

        await destroyDBs([dbA, dbB]);
      });

      it('does not retry trySync() in init() after error except connection errors and resolvable errors', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();
        const dbA: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameA,
          localDir: localDir,
        });
        await dbA.open();

        const options: RemoteOptions = {
          remoteUrl: remoteURL,
          syncDirection: 'both',
          connection: { type: 'github', personalAccessToken: token },
        };

        const sync = await dbA.sync(options);

        const stubSync = sandbox.stub(syncWorker_module, 'syncWorker');
        stubSync.rejects();

        await expect(sync.init()).rejects.toThrowError();

        expect(stubSync.callCount).toBe(1);

        await destroyDBs([dbA]);
      });

      it('does not occur when retry option is 0', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();
        const dbA: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameA,
          localDir: localDir,
        });
        await dbA.open();

        const options: RemoteOptions = {
          remoteUrl: remoteURL,
          syncDirection: 'push',
          retryInterval: 0,
          retry: 0,
          connection: { type: 'github', personalAccessToken: token },
        };

        const sync = new Sync(dbA, options);
        const stubNet = sandbox.stub(sync, 'canNetworkConnection');
        stubNet.resolves(false);

        const stubPush = sandbox.stub(pushWorker_module, 'pushWorker');
        stubPush.rejects();

        await expect(sync.init()).rejects.toThrowError();

        expect(stubPush.callCount).toBe(1);

        await destroyDBs([dbA]);
      });

      it('retries every retry interval', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();
        const dbA: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameA,
          localDir: localDir,
        });
        await dbA.open();

        const interval = 100000;
        const retryInterval = 5000;

        const options: RemoteOptions = {
          remoteUrl: remoteURL,
          syncDirection: 'push',
          interval,
          retryInterval,
          retry: 2,
          connection: { type: 'github', personalAccessToken: token },
        };

        const sync = new Sync(dbA, options);
        const stubNet = sandbox.stub(sync, 'canNetworkConnection');
        stubNet.resolves(false);

        const stubPush = sandbox.stub(pushWorker_module, 'pushWorker');
        stubPush.rejects();

        sync.init().catch(() => {});

        await sleep(retryInterval - 500);
        expect(stubPush.callCount).toBe(1);
        await sleep(retryInterval);
        expect(stubPush.callCount).toBe(2);
        await sleep(retryInterval);
        expect(stubPush.callCount).toBe(3);
        await sleep(retryInterval);

        await destroyDBs([dbA]);
      });
    });
  });

  /**
   * Initialize synchronization by sync() with remoteURL
   * Initialize means creating local and remote repositories by using a remoteUrl
   */
  describe('initialized by sync():', () => {
    it('throws RemoteAlreadyRegisteredError when sync() the same url twice.', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbNameA = serialId();

      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameA,
        localDir: localDir,
      });

      await dbA.open();

      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection: { type: 'github', personalAccessToken: token },
      };
      const syncA = await dbA.sync(options);
      await expect(dbA.sync(options)).rejects.toThrowError(
        Err.RemoteAlreadyRegisteredError
      );
      dbA.destroy();
    });

    it('After dbA#sync() created remote repository, dbB#open() clones it.', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbNameA = serialId();

      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameA,
        localDir: localDir,
      });

      await dbA.open();
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        syncDirection: 'both',
        connection: { type: 'github', personalAccessToken: token },
      };
      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);

      const syncA = await dbA.sync(options);

      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameB,
        localDir: localDir,
      });
      await dbB.open();
      await dbB.sync(options);
      await expect(dbB.get(jsonA1._id)).resolves.toMatchObject(jsonA1);

      await destroyDBs([dbA, dbB]);
    });

    it('After dbA#sync() created remote repository, dbB#open() clones it, close(), open() again with no remote, following sync().', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbNameA = serialId();

      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameA,
        localDir: localDir,
      });

      await dbA.open();
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        live: true,
        interval: MINIMUM_SYNC_INTERVAL,
        syncDirection: 'both',
        connection: { type: 'github', personalAccessToken: token },
      };
      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);

      const syncA = await dbA.sync(options);

      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameB,
        localDir: localDir,
      });
      await dbB.open();
      await dbB.sync(options);
      await dbB.close();

      await dbB.open();
      const jsonB1 = { _id: '1', name: 'fromB' };
      await dbB.put(jsonB1);

      await dbB.sync(options);
      await expect(dbB.get(jsonB1._id)).resolves.toMatchObject(jsonB1);

      // Wait next sync()
      const count = dbA.taskQueue.currentStatistics().sync;
      while (dbA.taskQueue.currentStatistics().sync === count) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(500);
      }
      await expect(dbA.get(jsonA1._id)).resolves.toMatchObject(jsonB1);

      await destroyDBs([dbA, dbB]);
    });
  });

  it.skip('Multiple Sync object');
});
