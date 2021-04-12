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
  getWorkingDirFiles,
  removeRemoteRepositories,
} from './remote_utils';

const reposPrefix = 'test_push_worker___';
const localDir = `./test/database_remote_push_worker`;

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

maybe('remote: push: ', () => {
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
      expect(syncResult.commits!.remote.length).toBe(1);
      expect(syncResult.commits!.remote[0].id).toBe(putResult.commit_sha);
      expect(syncResult.changes.remote.length).toBe(1);
      expect(syncResult.changes.remote).toEqual(
        expect.arrayContaining([
          {
            operation: 'create',
            data: {
              id: jsonA1._id,
              file_sha: putResult.file_sha,
              doc: jsonA1,
            },
          },
        ])
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
      expect(syncResult2.commits!.remote.length).toBe(1);
      expect(syncResult2.commits!.remote[0].id).toBe(putResult2.commit_sha);
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
      expect(syncResult3.commits!.remote.length).toBe(1);
      expect(syncResult3.commits!.remote[0].id).toBe(putResult3.commit_sha);
      expect(syncResult3.changes.remote.length).toBe(1);
      expect(syncResult3.changes.remote[0]).toMatchObject({
        operation: 'update',
        data: {
          id: putResult3.id,
          file_sha: putResult3.file_sha,
          doc: jsonA1dash,
        },
      });

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
      expect(syncResult.commits!.remote.length).toBe(1);
      expect(syncResult.commits!.remote[0].id).toBe(putResultA2.commit_sha);
      expect(syncResult.changes.remote.length).toBe(1);
      expect(syncResult.changes.remote[0]).toMatchObject({
        operation: 'create',
        data: {
          id: putResultA2.id,
          file_sha: putResultA2.file_sha,
          doc: jsonA2,
        },
      });

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
    expect(syncResult.commits!.remote.length).toBe(2);
    expect(syncResult.commits!.remote[0].id).toBe(putResult1.commit_sha);
    expect(syncResult.commits!.remote[1].id).toBe(putResult2.commit_sha);
    expect(syncResult.changes.remote.length).toBe(2);
    expect(syncResult.changes.remote).toEqual(
      expect.arrayContaining([
        {
          operation: 'create',
          data: {
            id: putResult1.id,
            file_sha: putResult1.file_sha,
            doc: jsonA1,
          },
        },
        {
          operation: 'create',
          data: {
            id: putResult2.id,
            file_sha: putResult2.file_sha,
            doc: jsonA2,
          },
        },
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
    expect(syncResult2.commits!.remote.length).toBe(2);
    expect(syncResult2.commits!.remote[0].id).toBe(putResult1dash.commit_sha);
    expect(syncResult2.commits!.remote[1].id).toBe(putResult3.commit_sha);
    expect(syncResult2.changes.remote.length).toBe(2);
    expect(syncResult2.changes.remote).toEqual(
      expect.arrayContaining([
        {
          operation: 'create',
          data: {
            id: putResult3.id,
            file_sha: putResult3.file_sha,
            doc: jsonA3,
          },
        },
        {
          operation: 'update',
          data: {
            id: putResult1dash.id,
            file_sha: putResult1dash.file_sha,
            doc: jsonA1dash,
          },
        },
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
    const removeResult1 = await dbA.remove(jsonA1);

    const syncResult1 = await remoteA.tryPush();
    expect(syncResult1.action).toBe('push');
    expect(syncResult1.commits!.remote.length).toBe(1);
    expect(syncResult1.commits!.remote[0].id).toBe(removeResult1.commit_sha);
    expect(syncResult1.changes.remote.length).toBe(1);
    expect(syncResult1.changes.remote).toEqual(
      expect.arrayContaining([
        {
          operation: 'delete',
          data: {
            id: removeResult1.id,
            file_sha: removeResult1.file_sha,
            doc: jsonA1,
          },
        },
      ])
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
    const removeResult1 = await dbA.remove(jsonA1);

    const syncResult1 = await remoteA.tryPush();
    expect(syncResult1.action).toBe('push');
    expect(syncResult1.commits!.remote.length).toBe(2);
    expect(syncResult1.commits!.remote[0].id).toBe(putResult1.commit_sha);
    expect(syncResult1.commits!.remote[1].id).toBe(removeResult1.commit_sha);
    expect(syncResult1.changes.remote.length).toBe(0); // no change

    expect(getWorkingDirFiles(dbA)).toEqual([]);

    await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();

    await destroyDBs([dbA]);
  });
});
