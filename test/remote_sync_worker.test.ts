/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

/**
 * Test synchronization (pull & push)
 * by using GitHub Personal Access Token
 * These tests create a new repository on GitHub if not exists.
 */
import path from 'path';
import fs from 'fs-extra';
import { GitDocumentDB } from '../src';
import {
  SyncResultFastForwardMerge,
  SyncResultMergeAndPush,
  SyncResultPush,
  SyncResultResolveConflictsAndPush,
} from '../src/types';
import { NoMergeBaseFoundError } from '../src/error';
import {
  compareWorkingDirAndBlobs,
  createClonedDatabases,
  createDatabase,
  destroyDBs,
  getWorkingDirFiles,
  removeRemoteRepositories,
} from './remote_utils';

const reposPrefix = 'test_sync_worker___';
const localDir = `./test/database_remote_sync_worker`;

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

maybe('remote: sync: ', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  beforeAll(async () => {
    await removeRemoteRepositories(reposPrefix);
  });

  describe('Check sync result: ', () => {
    /**
     * before:
     * dbA   :
     * after :
     */
    test('Action: nop', async () => {
      const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId);

      const syncResult1 = (await remoteA.trySync()) as SyncResultPush;

      expect(syncResult1.action).toBe('nop');

      await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();

      await destroyDBs([dbA]);
    });

    describe('Action: push: ', () => {
      /**
       * before:
       * dbA   : +jsonA1
       * after :  jsonA1
       */
      test('add', async () => {
        const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId);

        // A puts and pushes
        const jsonA1 = { _id: '1', name: 'fromA' };
        const putResultA1 = await dbA.put(jsonA1);
        const syncResult1 = (await remoteA.trySync()) as SyncResultPush;

        expect(syncResult1.action).toBe('push');
        expect(syncResult1.commits!.remote.length).toBe(1);
        expect(syncResult1.commits!.remote[0].id).toBe(putResultA1.commit_sha);
        expect(syncResult1.changes.remote.length).toBe(1);
        expect(syncResult1.changes.remote).toEqual(
          expect.arrayContaining([
            {
              operation: 'create',
              data: {
                id: putResultA1.id,
                file_sha: putResultA1.file_sha,
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
       * dbA   : -jsonA1
       * after :
       */
      test('remove', async () => {
        const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId);

        // A puts and pushes
        const jsonA1 = { _id: '1', name: 'fromA' };
        const putResultA1 = await dbA.put(jsonA1);
        await remoteA.tryPush();

        const removeResultA1 = await dbA.remove(jsonA1);
        const syncResult1 = (await remoteA.trySync()) as SyncResultPush;

        expect(syncResult1.action).toBe('push');
        expect(syncResult1.commits!.remote.length).toBe(1);
        expect(syncResult1.commits!.remote[0].id).toBe(removeResultA1.commit_sha);
        expect(syncResult1.changes.remote.length).toBe(1);
        expect(syncResult1.changes.remote).toEqual(
          expect.arrayContaining([
            {
              operation: 'delete',
              data: {
                id: removeResultA1.id,
                file_sha: removeResultA1.file_sha,
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
       * before:  jsonA1
       * dbA   : +jsonA1
       * after :  jsonA1
       */
      test('update', async () => {
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
        expect(syncResult1.commits!.remote[0].id).toBe(putResultA1dash.commit_sha);
        expect(syncResult1.changes.remote.length).toBe(1);
        expect(syncResult1.changes.remote).toEqual(
          expect.arrayContaining([
            {
              operation: 'update',
              data: {
                id: putResultA1dash.id,
                file_sha: putResultA1dash.file_sha,
                doc: jsonA1dash,
              },
            },
          ])
        );

        expect(getWorkingDirFiles(dbA)).toEqual([jsonA1dash]);

        await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();

        await destroyDBs([dbA]);
      });
    });

    describe('Action: fast-forward merge: ', () => {
      /**
       * before:
       * dbA   : +jsonA1
       * dbB   :
       * after :  jsonA1
       */
      test('add one file', async () => {
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
        expect(syncResult1.commits!.local[0].id).toBe(putResult1.commit_sha);
        expect(syncResult1.changes.local.length).toBe(1);
        expect(syncResult1.changes.local).toEqual(
          expect.arrayContaining([
            {
              operation: 'create',
              data: {
                id: putResult1.id,
                file_sha: putResult1.file_sha,
                doc: jsonA1,
              },
            },
          ])
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
       * dbA   : +jsonA1 +jsonA2
       * dbB   :
       * after :  jsonA1  jsonA2
       */
      test('add two files', async () => {
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
        expect(syncResult1.commits!.local[0].id).toBe(putResult1.commit_sha);
        expect(syncResult1.commits!.local[1].id).toBe(putResult2.commit_sha);
        expect(syncResult1.changes.local.length).toBe(2);
        expect(syncResult1.changes.local).toEqual(
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

        expect(getWorkingDirFiles(dbB)).toEqual([jsonA1, jsonA2]);

        // Sync dbA
        const syncResult2 = (await remoteA.trySync()) as SyncResultMergeAndPush;
        expect(getWorkingDirFiles(dbA)).toEqual([jsonA1, jsonA2]);

        await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
        await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

        await destroyDBs([dbA, dbB]);
      });
    });

    describe('Action: merge and push: ', () => {
      /**
       * before:
       * dbA   : +jsonA1
       * dbB   :         +jsonB2
       * after :  jsonA1  jsonB2
       */
      test('create a remote file, and create another local file', async () => {
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
        expect(syncResult1.commits!.local[0].id).toBe(putResultA1.commit_sha);
        expect(syncResult1.commits!.local[1].message).toBe('merge');
        expect(syncResult1.commits!.remote[0].id).toBe(putResultB2.commit_sha);
        expect(syncResult1.commits!.remote[1].message).toBe('merge');

        expect(syncResult1.changes.local.length).toBe(1);
        expect(syncResult1.changes.local).toEqual(
          expect.arrayContaining([
            {
              operation: 'create',
              data: {
                id: putResultA1.id,
                file_sha: putResultA1.file_sha,
                doc: jsonA1,
              },
            },
          ])
        );

        expect(syncResult1.changes.remote.length).toBe(1);
        expect(syncResult1.changes.remote).toEqual(
          expect.arrayContaining([
            {
              operation: 'create',
              data: {
                id: putResultB2.id,
                file_sha: putResultB2.file_sha,
                doc: jsonB2,
              },
            },
          ])
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
       * dbA   : +jsonA1 +jsonA2
       * dbB   :                 +jsonB3 +jsonB4
       * after :  jsonA1  jsonA2  jsonB3  jsonB4
       */
      test('create two remote files, and create two different local files', async () => {
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
        expect(syncResult1.commits!.local.length).toBe(3); // Two put commits and a merge commit
        expect(syncResult1.commits!.remote.length).toBe(3); // Two put commits and a merge commit
        expect(syncResult1.commits!.local[0].id).toBe(putResultA1.commit_sha);
        expect(syncResult1.commits!.local[1].id).toBe(putResultA2.commit_sha);
        expect(syncResult1.commits!.local[2].message).toBe('merge');
        expect(syncResult1.commits!.remote[0].id).toBe(putResultB3.commit_sha);
        expect(syncResult1.commits!.remote[1].id).toBe(putResultB4.commit_sha);
        expect(syncResult1.commits!.remote[2].message).toBe('merge');

        expect(syncResult1.changes.local.length).toBe(2);
        expect(syncResult1.changes.local).toEqual(
          expect.arrayContaining([
            {
              operation: 'create',
              data: {
                id: putResultA1.id,
                file_sha: putResultA1.file_sha,
                doc: jsonA1,
              },
            },
            {
              operation: 'create',
              data: {
                id: putResultA2.id,
                file_sha: putResultA2.file_sha,
                doc: jsonA2,
              },
            },
          ])
        );

        expect(syncResult1.changes.remote.length).toBe(2);
        expect(syncResult1.changes.remote).toEqual(
          expect.arrayContaining([
            {
              operation: 'create',
              data: {
                id: putResultB3.id,
                file_sha: putResultB3.file_sha,
                doc: jsonB3,
              },
            },
            {
              operation: 'create',
              data: {
                id: putResultB4.id,
                file_sha: putResultB4.file_sha,
                doc: jsonB4,
              },
            },
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
       * dbA   : +jsonA1
       * dbB   : +jsonA1
       * after :  jsonA1
       */
      test.only('create a remote file, and create the same local file with the same contents', async () => {
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

        expect(syncResult1.commits!.local[0]).toMatchObject({
          id: putResultA1.commit_sha,
          author: expect.stringMatching(/^.+$/),
          date: expect.any(Date),
          message: expect.stringMatching(/^.+$/),
        });
        expect(syncResult1.commits!.local[1].message).toBe('merge');
        expect(syncResult1.commits!.remote[0]).toMatchObject({
          id: putResultB1.commit_sha,
          author: expect.stringMatching(/^.+$/),
          date: expect.any(Date),
          message: expect.stringMatching(/^.+$/),
        });
        expect(syncResult1.commits!.remote[1].message).toBe('merge');
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
      test('update a remote file, and update the same local file with the same contents', async () => {
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
        const remoteB = dbB.getRemote(remoteA.remoteURL());

        // A updates and pushes
        const jsonA1dash = { _id: '1', name: 'updated' };
        const putResultA1dash = await dbA.put(jsonA1dash);
        await remoteA.tryPush();

        // B updates the same file with exactly the same contents
        const putResultB1dash = await dbB.put(jsonA1dash);

        const syncResult1 = (await remoteB.trySync()) as SyncResultMergeAndPush;
        expect(syncResult1.action).toBe('merge and push');

        expect(syncResult1.commits!.local[0]).toMatchObject({
          id: putResultA1dash.commit_sha,
          author: expect.stringMatching(/^.+$/),
          date: expect.any(Date),
          message: expect.stringMatching(/^.+$/),
        });
        expect(syncResult1.commits!.local[1].message).toBe('merge');
        expect(syncResult1.commits!.remote[0]).toMatchObject({
          id: putResultB1dash.commit_sha,
          author: expect.stringMatching(/^.+$/),
          date: expect.any(Date),
          message: expect.stringMatching(/^.+$/),
        });
        expect(syncResult1.commits!.remote[1].message).toBe('merge');
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
       * dbA   :         +jsonA2
       * dbB   : -jsonA1
       * after :          jsonA2
       */
      test('create a remote file, and remove another local file', async () => {
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
        const remoteB = dbB.getRemote(remoteA.remoteURL());

        // A puts and pushes
        const jsonA2 = { _id: '2', name: 'fromA' };
        const putResultA2 = await dbA.put(jsonA2);
        await remoteA.tryPush();

        // B removes and syncs
        const removeResultB1 = await dbB.remove(jsonA1);

        const syncResult1 = (await remoteB.trySync()) as SyncResultMergeAndPush;
        expect(syncResult1.action).toBe('merge and push');
        expect(syncResult1.commits!.local.length).toBe(2); // put commit and merge commit
        expect(syncResult1.commits!.remote.length).toBe(2); // remove commit and merge commit
        expect(syncResult1.commits!.local[0].id).toBe(putResultA2.commit_sha);
        expect(syncResult1.commits!.local[1].message).toBe('merge');
        expect(syncResult1.commits!.remote[0].id).toBe(removeResultB1.commit_sha);
        expect(syncResult1.commits!.remote[1].message).toBe('merge');

        expect(syncResult1.changes.local.length).toBe(1);
        expect(syncResult1.changes.local).toEqual(
          expect.arrayContaining([
            {
              operation: 'create',
              data: {
                id: putResultA2.id,
                file_sha: putResultA2.file_sha,
                doc: jsonA2,
              },
            },
          ])
        );

        expect(syncResult1.changes.remote.length).toBe(1);
        expect(syncResult1.changes.remote).toEqual(
          expect.arrayContaining([
            {
              operation: 'delete',
              data: {
                id: removeResultB1.id,
                file_sha: removeResultB1.file_sha,
                doc: jsonA1,
              },
            },
          ])
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
       * dbB   :         +jsonB2
       * after :          jsonB2
       */
      test('remove a remote file, and create another local file', async () => {
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
        const remoteB = dbB.getRemote(remoteA.remoteURL());

        // A removes and pushes
        const removeResultA1 = await dbA.remove(jsonA1);
        await remoteA.tryPush();

        // B put another file and syncs
        const jsonB2 = { _id: '2', name: 'fromB' };
        const putResultB2 = await dbB.put(jsonB2);

        const syncResult1 = (await remoteB.trySync()) as SyncResultMergeAndPush;
        expect(syncResult1.action).toBe('merge and push');
        expect(syncResult1.commits!.local.length).toBe(2); // remove commit and merge commit
        expect(syncResult1.commits!.remote.length).toBe(2); // put commit and merge commit
        expect(syncResult1.commits!.local[0].id).toBe(removeResultA1.commit_sha);
        expect(syncResult1.commits!.local[1].message).toBe('merge');
        expect(syncResult1.commits!.remote[0].id).toBe(putResultB2.commit_sha);
        expect(syncResult1.commits!.remote[1].message).toBe('merge');

        expect(syncResult1.changes.local.length).toBe(1);
        expect(syncResult1.changes.local).toEqual(
          expect.arrayContaining([
            {
              operation: 'delete',
              data: {
                id: removeResultA1.id,
                file_sha: removeResultA1.file_sha,
                doc: jsonA1,
              },
            },
          ])
        );

        expect(syncResult1.changes.remote.length).toBe(1);
        expect(syncResult1.changes.remote).toEqual(
          expect.arrayContaining([
            {
              operation: 'create',
              data: {
                id: putResultB2.id,
                file_sha: putResultB2.file_sha,
                doc: jsonB2,
              },
            },
          ])
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
      test('remove a remote file, and remove the same local file', async () => {
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
        const remoteB = dbB.getRemote(remoteA.remoteURL());

        // A removes and pushes
        const removeResultA1 = await dbA.remove(jsonA1);
        await remoteA.tryPush();

        // B remove the same file and syncs
        const removeResultB1 = await dbB.remove(jsonA1);

        const syncResult1 = (await remoteB.trySync()) as SyncResultMergeAndPush;
        expect(syncResult1.action).toBe('merge and push');
        expect(syncResult1.commits!.local.length).toBe(2); // remove commit and merge commit
        expect(syncResult1.commits!.remote.length).toBe(2); // remove commit and merge commit
        expect(syncResult1.commits!.local[0].id).toBe(removeResultA1.commit_sha);
        expect(syncResult1.commits!.local[1].message).toBe('merge');
        expect(syncResult1.commits!.remote[0].id).toBe(removeResultB1.commit_sha);
        expect(syncResult1.commits!.remote[1].message).toBe('merge');

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
  });

  /**
   * No merge base
   */
  describe.skip('No merge base: ', () => {
    // behavior_for_no_merge_base が nop のときリトライしないこと。
    test.skip('Test ours option for behavior_for_no_merge_base', async () => {
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
