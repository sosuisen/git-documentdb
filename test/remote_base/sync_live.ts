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
import expect from 'expect';
import { GitDocumentDB } from '../../src/git_documentdb';
import { ConnectionSettings, RemoteOptions } from '../../src/types';
import { sleep } from '../../src/utils';
import { destroyDBs, removeRemoteRepositories } from '../remote_utils';
import { MINIMUM_SYNC_INTERVAL } from '../../src/const';

export const syncLiveBase = (
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

  /**
   * Test periodic Sync (live)
   */

  describe('<sync_live> periodic Sync', () => {
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
        connection,
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
        connection,
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
        connection,
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
        connection,
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
        connection,
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

    it('repeats tryPush() automatically.', async () => {
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
        syncDirection: 'push',
        interval,
        connection,
      };
      await dbA.open();
      const syncA = await dbA.sync(options);
      syncA.on('error', (err: Error) => {
        console.log(err);
      });
      await sleep(interval * 5);
      expect(dbA.taskQueue.currentStatistics().push).toBeGreaterThanOrEqual(3);

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
        connection,
      };
      await dbA.open();
      const syncA = await dbA.sync(options);
      syncA.on('error', (err: Error) => {
        console.log(err);
      });
      await sleep(interval * 5);
      expect(dbA.taskQueue.currentStatistics().sync).toBeGreaterThanOrEqual(3);

      await destroyDBs([dbA]);
    });

    it('skips pushWorker after pause.', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbNameA = serialId();

      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameA,
        localDir: localDir,
      });
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        live: true,
        syncDirection: 'push',
        interval: 1000000,
        connection,
      };
      await dbA.open();
      const syncA = await dbA.sync(options);
      syncA.pause();
      await expect(syncA.tryPushImpl(true)).resolves.toEqual({ action: 'canceled' });
      syncA.resume();
      await expect(syncA.tryPushImpl(true)).resolves.toMatchObject({ action: 'nop' });

      await destroyDBs([dbA]);
    });

    it('skips syncWorker after pause.', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbNameA = serialId();

      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameA,
        localDir: localDir,
      });
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        live: true,
        syncDirection: 'both',
        interval: 1000000,
        connection,
      };
      await dbA.open();
      const syncA = await dbA.sync(options);
      syncA.pause();
      await expect(syncA.trySyncImpl(true)).resolves.toEqual({ action: 'canceled' });
      syncA.resume();
      await expect(syncA.trySyncImpl(true)).resolves.toMatchObject({ action: 'nop' });

      await destroyDBs([dbA]);
    });
  });
};
