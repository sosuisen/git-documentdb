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

// Test live
maybe('<sync_live> Sync', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  before(async () => {
    await removeRemoteRepositories(reposPrefix);
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
});
