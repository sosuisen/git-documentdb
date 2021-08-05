/* eslint-disable @typescript-eslint/naming-convention */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

/**
 * Test push
 * by using GitHub Personal Access Token
 * These tests create a new repository on GitHub if not exists.
 */
import expect from 'expect';
import sinon from 'sinon';
import { GitDocumentDB } from '../../src/git_documentdb';
import {
  compareWorkingDirAndBlobs,
  createDatabase,
  destroyDBs,
  getChangedFileDelete,
  getChangedFileInsert,
  getChangedFileUpdate,
  getCommitInfo,
  getWorkingDirDocs,
  removeRemoteRepositories,
} from '../remote_utils';
import {
  ConnectionSettings,
  RemoteOptions,
  SyncResultCancel,
  SyncResultNop,
  SyncResultPush,
} from '../../src/types';
import { sleep } from '../../src/utils';
import { RemoteEngine, RemoteErr } from '../../src/remote/remote_engine';

export const syncTryPushBase = (
  connection: ConnectionSettings,
  remoteURLBase: string,
  reposPrefix: string,
  localDir: string
) => () => {
  let idCounter = 0;
  const serialId = () => {
    return `${reposPrefix}${idCounter++}`;
  };

  // Use sandbox to restore stub and spy in parallel mocha tests
  let sandbox: sinon.SinonSandbox;
  beforeEach(function () {
    sandbox = sinon.createSandbox();
  });

  afterEach(function () {
    sandbox.restore();
  });

  before(async () => {
    await removeRemoteRepositories(reposPrefix);
  });

  describe('<remote/sync_trypush>: Sync#tryPush()', () => {
    /**
     * before:
     * dbA   : +jsonA1
     * after :  jsonA1
     */
    it('changes one remote insertion when pushes after one put()', async function () {
      const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
        connection,
      });

      // Put and push
      const jsonA1 = { _id: '1', name: 'fromA' };
      const putResult = await dbA.put(jsonA1);
      const syncResult = await syncA.tryPush();
      expect(syncResult.action).toBe('push');
      if (syncResult.action !== 'push') {
        // Check discriminated union
        throw new Error('invalid result');
      }
      expect(syncResult.commits).toMatchObject({
        remote: getCommitInfo([putResult]),
      });

      // One remote creation
      expect(syncResult.changes.remote.length).toBe(1);
      expect(syncResult.changes.remote).toEqual([getChangedFileInsert(jsonA1, putResult)]);

      expect(getWorkingDirDocs(dbA)).toEqual([jsonA1]);

      await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();

      await destroyDBs([dbA]);
    });

    /**
     * before:  jsonA1
     * dbA   : +jsonA1
     * after :  jsonA1
     */
    it('does not change remote when pushes after put() the same document again', async function () {
      const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
        connection,
      });
      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);
      await syncA.tryPush();

      // This document is same as the previous document
      // while put() creates a new commit.
      // (This is valid behavior of put() API.)
      const putResult = await dbA.put(jsonA1);
      const syncResult = await syncA.tryPush();
      expect(syncResult.action).toBe('push');
      if (syncResult.action !== 'push') {
        // Check discriminated union
        throw new Error('invalid result');
      }

      expect(syncResult.commits).toMatchObject({
        remote: getCommitInfo([putResult]),
      });

      // Does not change remote
      expect(syncResult.changes.remote.length).toBe(0);

      expect(getWorkingDirDocs(dbA)).toEqual([jsonA1]);

      await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();

      await destroyDBs([dbA]);
    });

    /**
     * before:  jsonA1
     * dbA   : +jsonA1
     * after :  jsonA1
     */
    it('changes one remote update when pushes after put() updated document', async function () {
      const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
        connection,
      });
      const jsonA1 = { _id: '1', name: 'fromA' };
      const putResultA1 = await dbA.put(jsonA1);
      await syncA.tryPush();

      // Put and push an updated document
      const jsonA1dash = { _id: '1', name: 'updated' };
      const putResult = await dbA.put(jsonA1dash);
      const syncResult = await syncA.tryPush();
      expect(syncResult.action).toBe('push');
      if (syncResult.action !== 'push') {
        // Check discriminated union
        throw new Error('invalid result');
      }

      expect(syncResult.commits).toMatchObject({
        remote: getCommitInfo([putResult]),
      });

      // One remote update
      expect(syncResult.changes.remote.length).toBe(1);
      expect(syncResult.changes.remote[0]).toMatchObject(
        getChangedFileUpdate(jsonA1, putResultA1, jsonA1dash, putResult)
      );

      expect(getWorkingDirDocs(dbA)).toEqual([jsonA1dash]);

      await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();

      await destroyDBs([dbA]);
    });

    /**
     * before:  jsonA1
     * dbA   :         +jsonA2
     * after :  jsonA1  jsonA2
     */
    it('changes one remote insertion when pushes after put() another document', async function () {
      const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
        connection,
      });
      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);
      await syncA.tryPush();

      // Put and push another document
      const jsonA2 = { _id: '2', name: 'fromA' };
      const putResultA2 = await dbA.put(jsonA2);
      const syncResult = await syncA.tryPush();
      expect(syncResult.action).toBe('push');
      if (syncResult.action !== 'push') {
        // Check discriminated union
        throw new Error('invalid result');
      }

      expect(syncResult.commits).toMatchObject({
        remote: getCommitInfo([putResultA2]),
      });

      // One remote creation
      expect(syncResult.changes.remote.length).toBe(1);
      expect(syncResult.changes.remote[0]).toMatchObject(
        getChangedFileInsert(jsonA2, putResultA2)
      );

      expect(getWorkingDirDocs(dbA)).toEqual([jsonA1, jsonA2]);

      await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();

      await destroyDBs([dbA]);
    });

    /**
     * before:
     * dbA   : +jsonA1 +jsonA2
     * after1:  jsonA1  jsonA2
     * dbA   : +jsonA1         +jsonA3
     * after2:  jsonA1  jsonA2  jsonA3
     */
    it('changes two remote insertions when pushes after put() two documents', async function () {
      const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
        connection,
      });

      // Two put commands and push
      const jsonA1 = { _id: '1', name: 'fromA' };
      const putResult1 = await dbA.put(jsonA1);
      const jsonA2 = { _id: '2', name: 'fromA' };
      const putResult2 = await dbA.put(jsonA2);
      const syncResult = await syncA.tryPush();
      expect(syncResult.action).toBe('push');
      if (syncResult.action !== 'push') {
        // Check discriminated union
        throw new Error('invalid result');
      }

      expect(syncResult.commits).toMatchObject({
        remote: getCommitInfo([putResult1, putResult2]),
      });

      // Two remote creations
      expect(syncResult.changes.remote.length).toBe(2);
      expect(syncResult.changes.remote).toEqual([
        getChangedFileInsert(jsonA1, putResult1),
        getChangedFileInsert(jsonA2, putResult2),
      ]);

      expect(getWorkingDirDocs(dbA)).toEqual([jsonA1, jsonA2]);

      await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();

      await destroyDBs([dbA]);
    });

    /**
     * before:  jsonA1
     * dbA   : +jsonA1  jsonA2
     * after : +jsonA1  jsonA2
     */
    it('changes one remote insertion and one remote update when pushes after put() updated document and another document', async function () {
      const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
        connection,
      });

      const jsonA1 = { _id: '1', name: 'fromA' };
      const putResult1 = await dbA.put(jsonA1);
      await syncA.tryPush();

      const jsonA1dash = { _id: '1', name: 'updated' };
      const putResult1dash = await dbA.put(jsonA1dash);
      const jsonA2 = { _id: '2', name: 'fromA' };
      const putResult2 = await dbA.put(jsonA2);
      const syncResult = await syncA.tryPush();
      expect(syncResult.action).toBe('push');
      if (syncResult.action !== 'push') {
        // Check discriminated union
        throw new Error('invalid result');
      }

      expect(syncResult.commits).toMatchObject({
        remote: getCommitInfo([putResult1dash, putResult2]),
      });

      // One remote update and one remote creation
      expect(syncResult.changes.remote.length).toBe(2);
      expect(syncResult.changes.remote).toEqual([
        getChangedFileUpdate(jsonA1, putResult1, jsonA1dash, putResult1dash),
        getChangedFileInsert(jsonA2, putResult2),
      ]);

      expect(getWorkingDirDocs(dbA)).toEqual([jsonA1dash, jsonA2]);

      await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();

      await destroyDBs([dbA]);
    });

    /**
     * before:  jsonA1
     * dbA   : -jsonA1
     * after :
     */
    it('changes one remote delete when pushes after one delete()', async function () {
      const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
        connection,
      });

      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);
      await syncA.tryPush();

      const deleteResult1 = await dbA.delete(jsonA1);

      const syncResult1 = await syncA.tryPush();
      expect(syncResult1.action).toBe('push');
      if (syncResult1.action !== 'push') {
        // Check discriminated union
        throw new Error('invalid result');
      }

      expect(syncResult1.commits).toMatchObject({
        remote: getCommitInfo([deleteResult1]),
      });

      // One remote delete
      expect(syncResult1.changes.remote.length).toBe(1);
      expect(syncResult1.changes.remote).toEqual([
        getChangedFileDelete(jsonA1, deleteResult1),
      ]);

      expect(getWorkingDirDocs(dbA)).toEqual([]);

      await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();

      await destroyDBs([dbA]);
    });

    /**
     * before:
     * dbA   : +jsonA1
     * dbA   : -jsonA1
     * after :
     */
    it('does not change remote when pushes after put() and delete()', async function () {
      const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
        connection,
      });

      const jsonA1 = { _id: '1', name: 'fromA' };
      // Put and delete the same document
      const putResult1 = await dbA.put(jsonA1);
      const deleteResult1 = await dbA.delete(jsonA1);

      const syncResult1 = await syncA.tryPush();
      expect(syncResult1.action).toBe('push');
      if (syncResult1.action !== 'push') {
        // Check discriminated union
        throw new Error('invalid result');
      }

      expect(syncResult1.commits).toMatchObject({
        remote: getCommitInfo([putResult1, deleteResult1]),
      });

      // Does not change remote
      expect(syncResult1.changes.remote.length).toBe(0);

      expect(getWorkingDirDocs(dbA)).toEqual([]);

      await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();

      await destroyDBs([dbA]);
    });

    it('returns SyncResultNop when local does not have ahead commits.', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbNameA = serialId();

      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameA,
        localDir: localDir,
      });
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection,
      };
      await dbA.open();
      const syncA = await dbA.sync(options);
      await expect(syncA.tryPush()).resolves.toEqual({ action: 'nop' });

      await destroyDBs([dbA]);
    });

    it('skips consecutive push tasks', async () => {
      const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
        connection,
      });

      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);
      const results: (SyncResultPush | SyncResultCancel | SyncResultNop)[] = [];
      for (let i = 0; i < 10; i++) {
        // eslint-disable-next-line promise/catch-or-return
        syncA.tryPush().then(result => results.push(result));
      }
      await sleep(5000);

      const syncResultCancel: SyncResultCancel = {
        action: 'canceled',
      };
      // results will be include 7 or more cancels
      let cancelCount = 0;
      results.forEach(res => {
        if (res.action === 'canceled') cancelCount++;
      });
      expect(cancelCount).toBeGreaterThan(6);

      // 3 or less tryPushes will be executed
      expect(dbA.taskQueue.currentStatistics().push).toBeLessThanOrEqual(3);

      await destroyDBs([dbA]);
    });

    it('pauses live push after error', async () => {
      const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
        connection,
        live: true,
        interval: 3000,
        syncDirection: 'push',
      });
      expect(syncA.options.live).toBeTruthy();

      dbA.put({ name: 'fromA' });

      let error: Error | undefined;
      syncA.on('error', (err: Error) => {
        error = err;
      });
      const stubPush = sandbox.stub(RemoteEngine[syncA.engine], 'push');
      stubPush.onFirstCall().throwsException(new RemoteErr.NetworkError('foo'));

      for (let i = 0; i < 10; i++) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(1000);
        if (error instanceof Error) {
          break;
        }
      }

      expect(error).toBeInstanceOf(RemoteErr.NetworkError);
      expect(syncA.options.live).toBeFalsy();

      await destroyDBs([dbA]);
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
        connection,
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
        RemoteErr.UnfetchedCommitExistsError
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
        connection,
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
        RemoteErr.UnfetchedCommitExistsError
      );

      await destroyDBs([dbA, dbB]);
    });
  });
};
