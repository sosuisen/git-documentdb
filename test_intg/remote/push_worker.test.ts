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

const reposPrefix = 'test_push_worker___';
const localDir = `./test/database_push_worker`;

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

// This test needs environment variables:
//  - GITDDB_GITHUB_USER_URL: URL of your GitHub account
// e.g.) https://github.com/foo/
//  - GITDDB_PERSONAL_ACCESS_TOKEN: A personal access token of your GitHub account
const maybe =
  process.env.GITDDB_GITHUB_USER_URL && process.env.GITDDB_PERSONAL_ACCESS_TOKEN
    ? describe
    : describe.skip;

maybe('remote: push_worker: ', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  beforeAll(async () => {
    await removeRemoteRepositories(reposPrefix);
  });

  describe('Put once followed by push: ', () => {
    /**
     * before:
     * dbA   : +jsonA1
     * after :  jsonA1
     */
    test('Just put and push', async function () {
      const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId);

      // Put and push
      const jsonA1 = { _id: '1', name: 'fromA' };
      const putResult = await dbA.put(jsonA1);
      const syncResult = await remoteA.tryPush();
      expect(syncResult.action).toBe('push');
      expect(syncResult.commits).toMatchObject({
        remote: getCommitInfo([putResult]),
      });
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
    test('Put the same document again', async () => {
      const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId);
      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);
      await remoteA.tryPush();

      // This document is same as the previous document
      // while put() creates a new commit.
      // (This is valid behavior of put() API.)
      const putResult2 = await dbA.put(jsonA1);
      const syncResult2 = await remoteA.tryPush();
      expect(syncResult2.action).toBe('push');
      expect(syncResult2.commits).toMatchObject({
        remote: getCommitInfo([putResult2]),
      });
      expect(syncResult2.changes.remote.length).toBe(0); // no change

      expect(getWorkingDirFiles(dbA)).toEqual([jsonA1]);

      await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();

      await destroyDBs([dbA]);
    });

    /**
     * before:  jsonA1
     * dbA   : +jsonA1
     * after :  jsonA1
     */
    test('Put an updated document', async () => {
      const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId);
      const jsonA1 = { _id: '1', name: 'fromA' };
      const putResultA1 = await dbA.put(jsonA1);
      await remoteA.tryPush();

      // Put and push an updated document
      const jsonA1dash = { _id: '1', name: 'updated' };
      const putResult3 = await dbA.put(jsonA1dash);
      const syncResult3 = await remoteA.tryPush();
      expect(syncResult3.action).toBe('push');
      expect(syncResult3.commits).toMatchObject({
        remote: getCommitInfo([putResult3]),
      });
      expect(syncResult3.changes.remote.length).toBe(1);
      expect(syncResult3.changes.remote[0]).toMatchObject(
        getChangedFile('update', jsonA1dash, putResult3)
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
    test('Put another document', async () => {
      const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId);
      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);
      await remoteA.tryPush();

      // Put and push another document
      const jsonA2 = { _id: '2', name: 'fromA' };
      const putResultA2 = await dbA.put(jsonA2);
      const syncResult = await remoteA.tryPush();
      expect(syncResult.action).toBe('push');
      expect(syncResult.commits).toMatchObject({
        remote: getCommitInfo([putResultA2]),
      });
      expect(syncResult.changes.remote.length).toBe(1);
      expect(syncResult.changes.remote[0]).toMatchObject(
        getChangedFile('create', jsonA2, putResultA2)
      );

      expect(getWorkingDirFiles(dbA)).toEqual([jsonA1, jsonA2]);

      await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();

      await destroyDBs([dbA]);
    });
  });

  /**
   * before:
   * dbA   : +jsonA1 +jsonA2
   * after1:  jsonA1  jsonA2
   * dbA   : +jsonA1         +jsonA3
   * after2:  jsonA1  jsonA2  jsonA3
   */
  test('Put twice followed by push', async () => {
    const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId);

    // Two put commands and push
    const jsonA1 = { _id: '1', name: 'fromA' };
    const putResult1 = await dbA.put(jsonA1);
    const jsonA2 = { _id: '2', name: 'fromA' };
    const putResult2 = await dbA.put(jsonA2);
    const syncResult = await remoteA.tryPush();
    expect(syncResult.action).toBe('push');

    expect(syncResult.commits).toMatchObject({
      remote: getCommitInfo([putResult1, putResult2]),
    });
    expect(syncResult.changes.remote.length).toBe(2);
    expect(syncResult.changes.remote).toEqual(
      expect.arrayContaining([
        getChangedFile('create', jsonA1, putResult1),
        getChangedFile('create', jsonA2, putResult2),
      ])
    );

    expect(getWorkingDirFiles(dbA)).toEqual([jsonA1, jsonA2]);

    // put an updated document and another document
    const jsonA1dash = { _id: '1', name: 'updated' };
    const putResult1dash = await dbA.put(jsonA1dash);
    const jsonA3 = { _id: '3', name: 'fromA' };
    const putResult3 = await dbA.put(jsonA3);
    const syncResult2 = await remoteA.tryPush();
    expect(syncResult2.action).toBe('push');

    expect(syncResult2.commits).toMatchObject({
      remote: getCommitInfo([putResult1dash, putResult3]),
    });
    expect(syncResult2.changes.remote.length).toBe(2);
    expect(syncResult2.changes.remote).toEqual(
      expect.arrayContaining([
        getChangedFile('create', jsonA3, putResult3),
        getChangedFile('update', jsonA1dash, putResult1dash),
      ])
    );

    expect(getWorkingDirFiles(dbA)).toEqual([jsonA1dash, jsonA2, jsonA3]);

    await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();

    await destroyDBs([dbA]);
  });

  /**
   * before:  jsonA1
   * dbA   : -jsonA1
   * after :
   */
  test('Remove followed by push', async () => {
    const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId);

    const jsonA1 = { _id: '1', name: 'fromA' };
    await dbA.put(jsonA1);
    await remoteA.tryPush();

    // Remove the previous put document
    const deleteResult1 = await dbA.remove(jsonA1);

    const syncResult1 = await remoteA.tryPush();
    expect(syncResult1.action).toBe('push');

    expect(syncResult1.commits).toMatchObject({
      remote: getCommitInfo([deleteResult1]),
    });
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
  test('Put and remove followed by push', async () => {
    const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId);

    const jsonA1 = { _id: '1', name: 'fromA' };
    // Put and remove a document
    const putResult1 = await dbA.put(jsonA1);
    const deleteResult1 = await dbA.remove(jsonA1);

    const syncResult1 = await remoteA.tryPush();
    expect(syncResult1.action).toBe('push');
    expect(syncResult1.commits).toMatchObject({
      remote: getCommitInfo([putResult1, deleteResult1]),
    });
    expect(syncResult1.changes.remote.length).toBe(0); // no change

    expect(getWorkingDirFiles(dbA)).toEqual([]);

    await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();

    await destroyDBs([dbA]);
  });
});
