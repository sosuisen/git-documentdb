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
import path from 'path';
import fs from 'fs-extra';
import {
  compareWorkingDirAndBlobs,
  createDatabase,
  destroyDBs,
  getChangedFile,
  getCommitInfo,
  getWorkingDirFiles,
  removeRemoteRepositories,
} from '../../test/remote_utils';
import { SyncResultCancel, SyncResultPush } from '../../src/types';
import { sleep } from '../../src/utils';

const reposPrefix = 'test_sync_trypush___';
const localDir = `./test_intg/database_sync_trypush`;

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

maybe('intg <remote/sync_trypush>: Sync#tryPush():', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  beforeAll(async () => {
    await removeRemoteRepositories(reposPrefix);
  });

  /**
   * before:
   * dbA   : +jsonA1
   * after :  jsonA1
   */
  it('changes one remote creation when pushes after one put()', async function () {
    const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId);

    // Put and push
    const jsonA1 = { _id: '1', name: 'fromA' };
    const putResult = await dbA.put(jsonA1);
    const syncResult = await remoteA.tryPush();
    expect(syncResult.action).toBe('push');
    if (syncResult.action !== 'push') {
      // Check discriminated union
      return;
    }
    expect(syncResult.commits).toMatchObject({
      remote: getCommitInfo([putResult]),
    });

    // One remote creation
    expect(syncResult.changes.remote.length).toBe(1);
    expect(syncResult.changes.remote).toEqual(
      expect.arrayContaining([getChangedFile('create', jsonA1, putResult)])
    );

    expect(getWorkingDirFiles(dbA)).toEqual([jsonA1]);

    await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();

    await destroyDBs([dbA]);
  });

  /**
   * before:  jsonA1
   * dbA   : +jsonA1
   * after :  jsonA1
   */
  it('does not change remote when pushes after put() the same document again', async function () {
    const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId);
    const jsonA1 = { _id: '1', name: 'fromA' };
    await dbA.put(jsonA1);
    await remoteA.tryPush();

    // This document is same as the previous document
    // while put() creates a new commit.
    // (This is valid behavior of put() API.)
    const putResult = await dbA.put(jsonA1);
    const syncResult = await remoteA.tryPush();
    expect(syncResult.action).toBe('push');
    if (syncResult.action !== 'push') {
      // Check discriminated union
      return;
    }

    expect(syncResult.commits).toMatchObject({
      remote: getCommitInfo([putResult]),
    });

    // Does not change remote
    expect(syncResult.changes.remote.length).toBe(0);

    expect(getWorkingDirFiles(dbA)).toEqual([jsonA1]);

    await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();

    await destroyDBs([dbA]);
  });

  /**
   * before:  jsonA1
   * dbA   : +jsonA1
   * after :  jsonA1
   */
  it('changes one remote update when pushes after put() updated document', async function () {
    const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId);
    const jsonA1 = { _id: '1', name: 'fromA' };
    const putResultA1 = await dbA.put(jsonA1);
    await remoteA.tryPush();

    // Put and push an updated document
    const jsonA1dash = { _id: '1', name: 'updated' };
    const putResult = await dbA.put(jsonA1dash);
    const syncResult = await remoteA.tryPush();
    expect(syncResult.action).toBe('push');
    if (syncResult.action !== 'push') {
      // Check discriminated union
      return;
    }

    expect(syncResult.commits).toMatchObject({
      remote: getCommitInfo([putResult]),
    });

    // One remote update
    expect(syncResult.changes.remote.length).toBe(1);
    expect(syncResult.changes.remote[0]).toMatchObject(
      getChangedFile('update', jsonA1dash, putResult)
    );

    expect(getWorkingDirFiles(dbA)).toEqual([jsonA1dash]);

    await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();

    await destroyDBs([dbA]);
  });

  /**
   * before:  jsonA1
   * dbA   :         +jsonA2
   * after :  jsonA1  jsonA2
   */
  it('changes one remote creation when pushes after put() another document', async function () {
    const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId);
    const jsonA1 = { _id: '1', name: 'fromA' };
    await dbA.put(jsonA1);
    await remoteA.tryPush();

    // Put and push another document
    const jsonA2 = { _id: '2', name: 'fromA' };
    const putResultA2 = await dbA.put(jsonA2);
    const syncResult = await remoteA.tryPush();
    expect(syncResult.action).toBe('push');
    if (syncResult.action !== 'push') {
      // Check discriminated union
      return;
    }

    expect(syncResult.commits).toMatchObject({
      remote: getCommitInfo([putResultA2]),
    });

    // One remote creation
    expect(syncResult.changes.remote.length).toBe(1);
    expect(syncResult.changes.remote[0]).toMatchObject(
      getChangedFile('create', jsonA2, putResultA2)
    );

    expect(getWorkingDirFiles(dbA)).toEqual([jsonA1, jsonA2]);

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
  it('changes two remote creations when pushes after put() two documents', async function () {
    const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId);

    // Two put commands and push
    const jsonA1 = { _id: '1', name: 'fromA' };
    const putResult1 = await dbA.put(jsonA1);
    const jsonA2 = { _id: '2', name: 'fromA' };
    const putResult2 = await dbA.put(jsonA2);
    const syncResult = await remoteA.tryPush();
    expect(syncResult.action).toBe('push');
    if (syncResult.action !== 'push') {
      // Check discriminated union
      return;
    }

    expect(syncResult.commits).toMatchObject({
      remote: getCommitInfo([putResult1, putResult2]),
    });

    // Two remote creations
    expect(syncResult.changes.remote.length).toBe(2);
    expect(syncResult.changes.remote).toEqual(
      expect.arrayContaining([
        getChangedFile('create', jsonA1, putResult1),
        getChangedFile('create', jsonA2, putResult2),
      ])
    );

    expect(getWorkingDirFiles(dbA)).toEqual([jsonA1, jsonA2]);

    await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();

    await destroyDBs([dbA]);
  });

  /**
   * before:  jsonA1
   * dbA   : +jsonA1  jsonA2
   * after : +jsonA1  jsonA2
   */
  it('changes one remote creation and one remote update when pushes after put() updated document and another document', async function () {
    const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId);

    const jsonA1 = { _id: '1', name: 'fromA' };
    const putResult1 = await dbA.put(jsonA1);
    await remoteA.tryPush();

    const jsonA1dash = { _id: '1', name: 'updated' };
    const putResult1dash = await dbA.put(jsonA1dash);
    const jsonA2 = { _id: '2', name: 'fromA' };
    const putResult2 = await dbA.put(jsonA2);
    const syncResult = await remoteA.tryPush();
    expect(syncResult.action).toBe('push');
    if (syncResult.action !== 'push') {
      // Check discriminated union
      return;
    }

    expect(syncResult.commits).toMatchObject({
      remote: getCommitInfo([putResult1dash, putResult2]),
    });

    // One remote update and one remote creation
    expect(syncResult.changes.remote.length).toBe(2);
    expect(syncResult.changes.remote).toEqual(
      expect.arrayContaining([
        getChangedFile('update', jsonA1dash, putResult1dash),
        getChangedFile('create', jsonA2, putResult2),
      ])
    );

    expect(getWorkingDirFiles(dbA)).toEqual([jsonA1dash, jsonA2]);

    await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();

    await destroyDBs([dbA]);
  });

  /**
   * before:  jsonA1
   * dbA   : -jsonA1
   * after :
   */
  it('changes one remote delete when pushes after one delete()', async function () {
    const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId);

    const jsonA1 = { _id: '1', name: 'fromA' };
    await dbA.put(jsonA1);
    await remoteA.tryPush();

    const deleteResult1 = await dbA.delete(jsonA1);

    const syncResult1 = await remoteA.tryPush();
    expect(syncResult1.action).toBe('push');
    if (syncResult1.action !== 'push') {
      // Check discriminated union
      return;
    }

    expect(syncResult1.commits).toMatchObject({
      remote: getCommitInfo([deleteResult1]),
    });

    // One remote delete
    expect(syncResult1.changes.remote.length).toBe(1);
    expect(syncResult1.changes.remote).toEqual(
      expect.arrayContaining([getChangedFile('delete', jsonA1, deleteResult1)])
    );

    expect(getWorkingDirFiles(dbA)).toEqual([]);

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
    const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId);

    const jsonA1 = { _id: '1', name: 'fromA' };
    // Put and delete the same document
    const putResult1 = await dbA.put(jsonA1);
    const deleteResult1 = await dbA.delete(jsonA1);

    const syncResult1 = await remoteA.tryPush();
    expect(syncResult1.action).toBe('push');
    if (syncResult1.action !== 'push') {
      // Check discriminated union
      return;
    }

    expect(syncResult1.commits).toMatchObject({
      remote: getCommitInfo([putResult1, deleteResult1]),
    });

    // Does not change remote
    expect(syncResult1.changes.remote.length).toBe(0);

    expect(getWorkingDirFiles(dbA)).toEqual([]);

    await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();

    await destroyDBs([dbA]);
  });

  it('skips consecutive push tasks', async () => {
    const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId);

    const jsonA1 = { _id: '1', name: 'fromA' };
    await dbA.put(jsonA1);
    const results: (SyncResultPush | SyncResultCancel)[] = [];
    for (let i = 0; i < 10; i++) {
      // eslint-disable-next-line promise/catch-or-return
      remoteA.tryPush().then(result => results.push(result));
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
    // Only one tryPush() will be executed
    expect(dbA.taskQueue.statistics().push).toBe(1);

    await destroyDBs([dbA]);
  });
});
