/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

/**
 * Test sync
 * by using GitHub Personal Access Token
 * These tests create a new repository on GitHub if not exists.
 */
import path from 'path';
import fs from 'fs-extra';
import { GitDocumentDB } from '../../src';
import {
  SyncResult,
  SyncResultCancel,
  SyncResultFastForwardMerge,
  SyncResultMergeAndPush,
  SyncResultPush,
  SyncResultResolveConflictsAndPush,
} from '../../src/types';
import { NoMergeBaseFoundError } from '../../src/error';
import {
  compareWorkingDirAndBlobs,
  createClonedDatabases,
  createDatabase,
  destroyDBs,
  getChangedFile,
  getCommitInfo,
  getWorkingDirFiles,
  removeRemoteRepositories,
} from '../remote_utils';
import { sleep } from '../../src/utils';

const reposPrefix = 'test_sync_trysync___';
const localDir = `./test_intg/database_sync_trysync`;

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
  // It may throw error due to memory leak of getCommitLogs()
  // fs.removeSync(path.resolve(localDir));
});

// This test needs environment variables:
//  - GITDDB_GITHUB_USER_URL: URL of your GitHub account
// e.g.) https://github.com/foo/
//  - GITDDB_PERSONAL_ACCESS_TOKEN: A personal access token of your GitHub account
const maybe =
  process.env.GITDDB_GITHUB_USER_URL && process.env.GITDDB_PERSONAL_ACCESS_TOKEN
    ? describe
    : describe.skip;

maybe('<remote/sync_trysync>: Sync#trySync()', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  beforeAll(async () => {
    await removeRemoteRepositories(reposPrefix);
  });

  /**
   * before:
   * dbA   :
   * after :
   */
  it('returns SyncResultNop when no commit', async () => {
    const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId);

    const syncResult1 = (await remoteA.trySync()) as SyncResultPush;

    expect(syncResult1.action).toBe('nop');

    await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();

    await destroyDBs([dbA]);
  });

  describe('returns SyncResultPush', () => {
    /**
     * before:
     * dbA   :  jsonA1
     * after :  jsonA1
     */
    it('which includes one remote creation when a local db creates a document', async () => {
      const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId);

      // A puts and pushes
      const jsonA1 = { _id: '1', name: 'fromA' };
      const putResultA1 = await dbA.put(jsonA1);
      const syncResult1 = (await remoteA.trySync()) as SyncResultPush;

      expect(syncResult1.action).toBe('push');
      expect(syncResult1.commits!.remote.length).toBe(1);
      expect(syncResult1.commits!.remote[0].sha).toBe(putResultA1.commit_sha);
      expect(syncResult1.changes.remote.length).toBe(1);
      expect(syncResult1.changes.remote).toEqual(
        expect.arrayContaining([getChangedFile('create', jsonA1, putResultA1)])
      );

      expect(getWorkingDirFiles(dbA)).toEqual([jsonA1]);

      await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();

      await destroyDBs([dbA]);
    });

    /**
     * before:  jsonA1
     * dbA   : -jsonA1
     * after :
     */
    it('which includes one remote delete when a local db deletes a document', async () => {
      const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId);

      // A puts and pushes
      const jsonA1 = { _id: '1', name: 'fromA' };
      const putResultA1 = await dbA.put(jsonA1);
      await remoteA.tryPush();

      const deleteResultA1 = await dbA.delete(jsonA1);
      const syncResult1 = (await remoteA.trySync()) as SyncResultPush;

      expect(syncResult1.action).toBe('push');
      expect(syncResult1.commits!.remote.length).toBe(1);
      expect(syncResult1.commits!.remote[0].sha).toBe(deleteResultA1.commit_sha);
      expect(syncResult1.changes.remote.length).toBe(1);
      expect(syncResult1.changes.remote).toEqual(
        expect.arrayContaining([getChangedFile('delete', jsonA1, deleteResultA1)])
      );

      expect(getWorkingDirFiles(dbA)).toEqual([]);

      await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();

      await destroyDBs([dbA]);
    });

    /**
     * before:  jsonA1
     * dbA   : +jsonA1
     * after :  jsonA1
     */
    it('which includes one remote update when a local db a document', async () => {
      const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId);
      // A puts and pushes
      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);
      await remoteA.tryPush();

      const jsonA1dash = { _id: '1', name: 'updated' };
      const putResultA1dash = await dbA.put(jsonA1dash);
      const syncResult1 = (await remoteA.trySync()) as SyncResultPush;

      expect(syncResult1.action).toBe('push');
      expect(syncResult1.commits!.remote.length).toBe(1);
      expect(syncResult1.commits!.remote[0].sha).toBe(putResultA1dash.commit_sha);
      expect(syncResult1.changes.remote.length).toBe(1);
      expect(syncResult1.changes.remote).toEqual(
        expect.arrayContaining([getChangedFile('update', jsonA1dash, putResultA1dash)])
      );

      expect(getWorkingDirFiles(dbA)).toEqual([jsonA1dash]);

      await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();

      await destroyDBs([dbA]);
    });
  });

  describe('returns SyncResultFastForwardMerge', () => {
    /**
     * before:
     * dbA   :  jsonA1
     * dbB   :
     * after :  jsonA1
     */
    it('which includes one local creation when a remote db creates a document', async () => {
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
      const syncResult1 = (await remoteB.trySync()) as SyncResultFastForwardMerge;
      expect(syncResult1.action).toBe('fast-forward merge');
      expect(syncResult1.commits!.local.length).toBe(1);
      expect(syncResult1.commits!.local[0].sha).toBe(putResult1.commit_sha);
      expect(syncResult1.changes.local.length).toBe(1);
      expect(syncResult1.changes.local).toEqual(
        expect.arrayContaining([getChangedFile('create', jsonA1, putResult1)])
      );

      expect(getWorkingDirFiles(dbB)).toEqual([jsonA1]);

      // Sync dbA
      const syncResult2 = (await remoteA.trySync()) as SyncResultMergeAndPush;
      expect(getWorkingDirFiles(dbA)).toEqual([jsonA1]);

      await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
      await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

      await destroyDBs([dbA, dbB]);
    });

    /**
     * before:
     * dbA   :  jsonA1  jsonA2
     * dbB   :
     * after :  jsonA1  jsonA2
     */
    it('which includes two local creations when a remote db creates two documents', async () => {
      const [dbA, dbB, remoteA, remoteB] = await createClonedDatabases(
        remoteURLBase,
        localDir,
        serialId
      );

      // A puts and pushes
      const jsonA1 = { _id: '1', name: 'fromA' };
      const jsonA2 = { _id: '2', name: 'fromA' };
      const putResult1 = await dbA.put(jsonA1);
      const putResult2 = await dbA.put(jsonA2);
      await remoteA.tryPush();

      // B syncs
      const syncResult1 = (await remoteB.trySync()) as SyncResultResolveConflictsAndPush;
      expect(syncResult1.action).toBe('fast-forward merge');
      expect(syncResult1.commits!.local.length).toBe(2);
      expect(syncResult1.commits!.local[0].sha).toBe(putResult1.commit_sha);
      expect(syncResult1.commits!.local[1].sha).toBe(putResult2.commit_sha);
      expect(syncResult1.changes.local.length).toBe(2);
      expect(syncResult1.changes.local).toEqual(
        expect.arrayContaining([
          getChangedFile('create', jsonA1, putResult1),
          getChangedFile('create', jsonA2, putResult2),
        ])
      );

      expect(getWorkingDirFiles(dbB)).toEqual([jsonA1, jsonA2]);

      // Sync dbA
      const syncResult2 = (await remoteA.trySync()) as SyncResultMergeAndPush;
      expect(getWorkingDirFiles(dbA)).toEqual([jsonA1, jsonA2]);

      await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
      await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

      await destroyDBs([dbA, dbB]);
    });
  });

  describe('returns SyncResultMergeAndPush', () => {
    /**
     * before:
     * dbA   :  jsonA1
     * dbB   :          jsonB2
     * after :  jsonA1  jsonB2
     */
    it('which includes local and remote creations when a remote db creates a document and a local db creates another document', async () => {
      const [dbA, dbB, remoteA, remoteB] = await createClonedDatabases(
        remoteURLBase,
        localDir,
        serialId
      );
      // A puts and pushes
      const jsonA1 = { _id: '1', name: 'fromA' };
      const putResultA1 = await dbA.put(jsonA1);
      await remoteA.tryPush();

      // B syncs
      const jsonB2 = { _id: '2', name: 'fromB' };
      const putResultB2 = await dbB.put(jsonB2);

      // Sync dbB
      const syncResult1 = (await remoteB.trySync()) as SyncResultMergeAndPush;
      expect(syncResult1.action).toBe('merge and push');
      expect(syncResult1.commits!.local.length).toBe(2); // put commit and merge commit
      expect(syncResult1.commits!.remote.length).toBe(2); // put commit and merge commit
      expect(syncResult1.commits!.local[0].sha).toBe(putResultA1.commit_sha);
      expect(syncResult1.commits!.local[1].message).toBe('merge');
      expect(syncResult1.commits!.remote[0].sha).toBe(putResultB2.commit_sha);
      expect(syncResult1.commits!.remote[1].message).toBe('merge');

      expect(syncResult1.changes.local.length).toBe(1);
      expect(syncResult1.changes.local).toEqual(
        expect.arrayContaining([getChangedFile('create', jsonA1, putResultA1)])
      );

      expect(syncResult1.changes.remote.length).toBe(1);
      expect(syncResult1.changes.remote).toEqual(
        expect.arrayContaining([getChangedFile('create', jsonB2, putResultB2)])
      );

      expect(getWorkingDirFiles(dbB)).toEqual([jsonA1, jsonB2]);

      // Sync dbA
      const syncResult2 = (await remoteA.trySync()) as SyncResultMergeAndPush;
      expect(getWorkingDirFiles(dbA)).toEqual([jsonA1, jsonB2]);

      await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
      await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

      await destroyDBs([dbA, dbB]);
    });

    /**
     * before:
     * dbA   :  jsonA1  jsonA2
     * dbB   :                  jsonB3  jsonB4
     * after :  jsonA1  jsonA2  jsonB3  jsonB4
     */
    it('which includes two local creations and two remote creations when a remote db creates two documents and a local db creates two different documents', async () => {
      const [dbA, dbB, remoteA, remoteB] = await createClonedDatabases(
        remoteURLBase,
        localDir,
        serialId
      );

      // A puts and pushes
      const jsonA1 = { _id: '1', name: 'fromA' };
      const putResultA1 = await dbA.put(jsonA1);
      const jsonA2 = { _id: '2', name: 'fromA' };
      const putResultA2 = await dbA.put(jsonA2);
      await remoteA.tryPush();

      // B syncs
      const jsonB3 = { _id: '3', name: 'fromB' };
      const putResultB3 = await dbB.put(jsonB3);
      const jsonB4 = { _id: '4', name: 'fromB' };
      const putResultB4 = await dbB.put(jsonB4);

      const syncResult1 = (await remoteB.trySync()) as SyncResultMergeAndPush;
      expect(syncResult1.action).toBe('merge and push');
      expect(syncResult1.commits).toMatchObject({
        local: getCommitInfo([putResultA1, putResultA2, 'merge']),
        remote: getCommitInfo([putResultB3, putResultB4, 'merge']),
      });

      expect(syncResult1.changes.local.length).toBe(2);
      expect(syncResult1.changes.local).toEqual(
        expect.arrayContaining([
          getChangedFile('create', jsonA1, putResultA1),
          getChangedFile('create', jsonA2, putResultA2),
        ])
      );

      expect(syncResult1.changes.remote.length).toBe(2);
      expect(syncResult1.changes.remote).toEqual(
        expect.arrayContaining([
          getChangedFile('create', jsonB3, putResultB3),
          getChangedFile('create', jsonB4, putResultB4),
        ])
      );

      expect(getWorkingDirFiles(dbB)).toEqual([jsonA1, jsonA2, jsonB3, jsonB4]);

      // Sync dbA
      const syncResult2 = (await remoteA.trySync()) as SyncResultMergeAndPush;
      expect(getWorkingDirFiles(dbA)).toEqual([jsonA1, jsonA2, jsonB3, jsonB4]);

      await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
      await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

      await destroyDBs([dbA, dbB]);
    });

    /**
     * before:
     * dbA   :  jsonA1
     * dbB   :  jsonA1
     * after :  jsonA1
     */
    it('which does not include changes after a remote db creates a document and a local db creates exactly the same document', async () => {
      const [dbA, dbB, remoteA, remoteB] = await createClonedDatabases(
        remoteURLBase,
        localDir,
        serialId
      );

      // A puts and pushes
      const jsonA1 = { _id: '1', name: 'fromA' };
      const putResultA1 = await dbA.put(jsonA1);
      await remoteA.tryPush();

      // B puts the same file with exactly the same contents
      const putResultB1 = await dbB.put(jsonA1);

      const syncResult1 = (await remoteB.trySync()) as SyncResultMergeAndPush;
      expect(syncResult1.action).toBe('merge and push');

      expect(syncResult1.commits).toMatchObject({
        local: getCommitInfo([putResultA1, 'merge']),
        remote: getCommitInfo([putResultB1, 'merge']),
      });

      expect(syncResult1.changes.local.length).toBe(0);
      expect(syncResult1.changes.remote.length).toBe(0);

      expect(getWorkingDirFiles(dbA)).toEqual([jsonA1]);
      expect(getWorkingDirFiles(dbB)).toEqual([jsonA1]);

      await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
      await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

      await destroyDBs([dbA, dbB]);
    });

    /**
     * before:  jsonA1
     * dbA   : +jsonA1
     * dbB   : +jsonA1
     * after :  jsonA1
     */
    it('which does not include changes after a remote db updates a document and a local db updates exactly the same update', async () => {
      const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId);

      // A puts and pushes
      const jsonA1 = { _id: '1', name: 'fromA' };
      const putResultA1 = await dbA.put(jsonA1);
      await remoteA.tryPush();

      // Clone
      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameB,
        local_dir: localDir,
      });
      // Clone dbA
      await dbB.create(remoteA.options());
      const remoteB = dbB.getSynchronizer(remoteA.remoteURL());

      // A updates and pushes
      const jsonA1dash = { _id: '1', name: 'updated' };
      const putResultA1dash = await dbA.put(jsonA1dash);
      await remoteA.tryPush();

      // B updates the same file with exactly the same contents
      const putResultB1dash = await dbB.put(jsonA1dash);

      const syncResult1 = (await remoteB.trySync()) as SyncResultMergeAndPush;
      expect(syncResult1.action).toBe('merge and push');

      expect(syncResult1.commits).toMatchObject({
        local: getCommitInfo([putResultA1dash, 'merge']),
        remote: getCommitInfo([putResultB1dash, 'merge']),
      });

      expect(syncResult1.changes.local.length).toBe(0);
      expect(syncResult1.changes.remote.length).toBe(0);

      expect(getWorkingDirFiles(dbA)).toEqual([jsonA1dash]);
      expect(getWorkingDirFiles(dbB)).toEqual([jsonA1dash]);

      await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
      await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

      await destroyDBs([dbA, dbB]);
    });

    /**
     * before:  jsonA1
     * dbA   :          jsonA2
     * dbB   : -jsonA1
     * after :          jsonA2
     */
    it('which include a local create and a remote delete when a remote db creates a document and a local db deletes another document', async () => {
      const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId);
      // A puts and pushes
      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);
      await remoteA.tryPush();

      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameB,
        local_dir: localDir,
      });
      // Clone dbA
      await dbB.create(remoteA.options());
      const remoteB = dbB.getSynchronizer(remoteA.remoteURL());

      // A puts and pushes
      const jsonA2 = { _id: '2', name: 'fromA' };
      const putResultA2 = await dbA.put(jsonA2);
      await remoteA.tryPush();

      // B removes and syncs
      const deleteResultB1 = await dbB.remove(jsonA1);

      const syncResult1 = (await remoteB.trySync()) as SyncResultMergeAndPush;
      expect(syncResult1.action).toBe('merge and push');

      expect(syncResult1.commits).toMatchObject({
        local: getCommitInfo([putResultA2, 'merge']),
        remote: getCommitInfo([deleteResultB1, 'merge']),
      });

      expect(syncResult1.changes.local.length).toBe(1);
      expect(syncResult1.changes.local).toEqual(
        expect.arrayContaining([getChangedFile('create', jsonA2, putResultA2)])
      );

      expect(syncResult1.changes.remote.length).toBe(1);
      expect(syncResult1.changes.remote).toEqual(
        expect.arrayContaining([getChangedFile('delete', jsonA1, deleteResultB1)])
      );

      expect(getWorkingDirFiles(dbB)).toEqual([jsonA2]);

      // Sync dbA
      const syncResult2 = (await remoteA.trySync()) as SyncResultMergeAndPush;
      expect(getWorkingDirFiles(dbA)).toEqual([jsonA2]);

      await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
      await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

      await destroyDBs([dbA, dbB]);
    });

    /**
     * before:  jsonA1
     * dbA   : -jsonA1
     * dbB   :          jsonB2
     * after :          jsonB2
     */
    it('which include a remote create and a local delete when a remote db deletes a document and a local db creates another document', async () => {
      const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId);

      // A puts and pushes
      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);
      await remoteA.tryPush();

      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameB,
        local_dir: localDir,
      });
      // Clone dbA
      await dbB.create(remoteA.options());
      const remoteB = dbB.getSynchronizer(remoteA.remoteURL());

      // A removes and pushes
      const deleteResultA1 = await dbA.remove(jsonA1);
      await remoteA.tryPush();

      // B put another file and syncs
      const jsonB2 = { _id: '2', name: 'fromB' };
      const putResultB2 = await dbB.put(jsonB2);

      const syncResult1 = (await remoteB.trySync()) as SyncResultMergeAndPush;
      expect(syncResult1.action).toBe('merge and push');

      expect(syncResult1.commits).toMatchObject({
        local: getCommitInfo([deleteResultA1, 'merge']),
        remote: getCommitInfo([putResultB2, 'merge']),
      });

      expect(syncResult1.changes.local.length).toBe(1);
      expect(syncResult1.changes.local).toEqual(
        expect.arrayContaining([getChangedFile('delete', jsonA1, deleteResultA1)])
      );

      expect(syncResult1.changes.remote.length).toBe(1);
      expect(syncResult1.changes.remote).toEqual(
        expect.arrayContaining([getChangedFile('create', jsonB2, putResultB2)])
      );

      expect(getWorkingDirFiles(dbB)).toEqual([jsonB2]);

      // Sync dbA
      const syncResult2 = (await remoteA.trySync()) as SyncResultMergeAndPush;
      expect(getWorkingDirFiles(dbA)).toEqual([jsonB2]);

      await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
      await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

      await destroyDBs([dbA, dbB]);
    });

    /**
     * before:  jsonA1
     * dbA   : -jsonA1
     * dbB   : -jsonA1
     * after :
     */
    it('which does not include changes when a remote db deletes a document and a local db deletes the same document', async () => {
      const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId);
      // A puts and pushes
      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);
      await remoteA.tryPush();

      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameB,
        local_dir: localDir,
      });
      // Clone dbA
      await dbB.create(remoteA.options());
      const remoteB = dbB.getSynchronizer(remoteA.remoteURL());

      // A removes and pushes
      const deleteResultA1 = await dbA.remove(jsonA1);
      await remoteA.tryPush();

      // B remove the same file and syncs
      const deleteResultB1 = await dbB.remove(jsonA1);

      const syncResult1 = (await remoteB.trySync()) as SyncResultMergeAndPush;
      expect(syncResult1.action).toBe('merge and push');

      expect(syncResult1.commits).toMatchObject({
        local: getCommitInfo([deleteResultA1, 'merge']),
        remote: getCommitInfo([deleteResultB1, 'merge']),
      });

      expect(syncResult1.changes.local.length).toBe(0); // Must no be 1 but 0, because diff is empty.
      expect(syncResult1.changes.remote.length).toBe(0); // Must no be 1 but 0, because diff is empty.

      expect(getWorkingDirFiles(dbB)).toEqual([]);

      // Sync dbA
      const syncResult2 = (await remoteA.trySync()) as SyncResultMergeAndPush;
      expect(getWorkingDirFiles(dbA)).toEqual([]);

      await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
      await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

      await destroyDBs([dbA, dbB]);
    });
  });

  it('skips consecutive sync tasks', async () => {
    const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId);

    const jsonA1 = { _id: '1', name: 'fromA' };
    await dbA.put(jsonA1);
    const results: SyncResult[] = [];
    for (let i = 0; i < 10; i++) {
      // eslint-disable-next-line promise/catch-or-return
      remoteA.trySync().then(result => results.push(result));
    }
    await sleep(5000);

    const syncResultCancel: SyncResultCancel = {
      action: 'canceled',
    };
    // results will be include 9 cancels
    expect(results).toEqual(
      expect.arrayContaining([
        syncResultCancel,
        syncResultCancel,
        syncResultCancel,
        syncResultCancel,
        syncResultCancel,
        syncResultCancel,
        syncResultCancel,
        syncResultCancel,
        syncResultCancel,
      ])
    );
    // Only one trySync() will be executed
    expect(dbA.taskQueue.statistics().sync).toBe(1);

    await destroyDBs([dbA]);
  });

  /**
   * No merge base
   */
  describe.skip('No merge base', () => {
    // behavior_for_no_merge_base が nop のときリトライしないこと。
    it.skip('Test ours option for behavior_for_no_merge_base', async () => {
      const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId);

      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);

      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameB,
        local_dir: localDir,
      });
      await dbB.create();

      await expect(dbB.sync(remoteA.options())).rejects.toThrowError(NoMergeBaseFoundError);

      await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
      await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

      await destroyDBs([dbA, dbB]);
    });
  });
});
