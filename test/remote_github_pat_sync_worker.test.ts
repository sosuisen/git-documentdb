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
import sinon from 'sinon';
import { GitDocumentDB } from '../src';
import {
  RemoteOptions,
  SyncResultFastForwardMerge,
  SyncResultMergeAndPush,
  SyncResultPush,
  SyncResultResolveConflictsAndPush,
} from '../src/types';
import { NoMergeBaseFoundError } from '../src/error';
import { removeRemoteRepositories } from './remote_utils';
import { FILE_REMOVE_TIMEOUT } from '../src/const';

const reposPrefix = 'test_pat_sync_worker___';
const localDir = `./test/database_remote_github_pat_sync_worker`;

let idCounter = 0;
const serialId = () => {
  return `${reposPrefix}${idCounter++}`;
};

const getWorkingDirFiles = (gitDDB: GitDocumentDB) => {
  const listFiles = (dir: string): string[] =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .flatMap(dirent =>
        dirent.isFile()
          ? [`${dir}/${dirent.name}`.replace(gitDDB.workingDir() + '/', '')]
          : listFiles(`${dir}/${dirent.name}`)
      )
      .filter(name => !name.match(/^(\.gitddb|\.git)/));

  return listFiles(gitDDB.workingDir()).map(filepath =>
    fs.readJSONSync(gitDDB.workingDir() + '/' + filepath)
  );
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

maybe('remote: use personal access token: sync_worker: ', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  beforeAll(async () => {
    await removeRemoteRepositories(reposPrefix);
  });

  describe('Check push result: ', () => {
    describe('Put once followed by push: ', () => {
      /**
       * before:
       * dbA   : +jsonA1
       * after :  jsonA1
       */
      test('Just put and push', async function () {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();
        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        const options: RemoteOptions = {
          remote_url: remoteURL,
          auth: { type: 'github', personal_access_token: token },
          include_commits: true,
        };
        await dbA.create(options);

        // Put and push
        const jsonA1 = { _id: '1', name: 'fromA' };
        const putResult = await dbA.put(jsonA1);
        const remoteA = dbA.getRemote(remoteURL);
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

        /**
         * ! NOTICE: sinon.useFakeTimers() is used in each test to skip FileRemoveTimeoutError.
         */
        const clock = sinon.useFakeTimers();
        dbA.destroy().catch(err => console.debug(err.toString()));
        await clock.tickAsync(FILE_REMOVE_TIMEOUT);
        clock.restore();
      });

      /**
       * before:  jsonA1
       * dbA   : +jsonA1
       * after :  jsonA1
       */
      test('Put the same document again', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();
        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        const options: RemoteOptions = {
          remote_url: remoteURL,
          auth: { type: 'github', personal_access_token: token },
          include_commits: true,
        };
        await dbA.create(options);
        const jsonA1 = { _id: '1', name: 'fromA' };
        const remoteA = dbA.getRemote(remoteURL);
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

        const clock = sinon.useFakeTimers();
        dbA.destroy().catch(err => console.debug(err.toString()));
        await clock.tickAsync(FILE_REMOVE_TIMEOUT);
        clock.restore();
      });

      /**
       * before:  jsonA1
       * dbA   : +jsonA1
       * after :  jsonA1
       */
      test('Put an updated document', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();
        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        const options: RemoteOptions = {
          remote_url: remoteURL,
          auth: { type: 'github', personal_access_token: token },
          include_commits: true,
        };
        await dbA.create(options);
        const jsonA1 = { _id: '1', name: 'fromA' };
        const remoteA = dbA.getRemote(remoteURL);
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

        const clock = sinon.useFakeTimers();
        dbA.destroy().catch(err => console.debug(err.toString()));
        await clock.tickAsync(FILE_REMOVE_TIMEOUT);
        clock.restore();
      });

      /**
       * before:  jsonA1
       * dbA   :         +jsonA2
       * after :  jsonA1  jsonA2
       */
      test('Put another document', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();
        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        const options: RemoteOptions = {
          remote_url: remoteURL,
          auth: { type: 'github', personal_access_token: token },
          include_commits: true,
        };
        await dbA.create(options);
        const jsonA1 = { _id: '1', name: 'fromA' };
        const remoteA = dbA.getRemote(remoteURL);
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

        const clock = sinon.useFakeTimers();
        dbA.destroy().catch(err => console.debug(err.toString()));
        await clock.tickAsync(FILE_REMOVE_TIMEOUT);
        clock.restore();
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
      const remoteURL = remoteURLBase + serialId();
      const dbNameA = serialId();
      const dbA: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameA,
        local_dir: localDir,
      });
      const options: RemoteOptions = {
        remote_url: remoteURL,
        auth: { type: 'github', personal_access_token: token },
        include_commits: true,
      };
      await dbA.create(options);

      // Two put commands and push
      const jsonA1 = { _id: '1', name: 'fromA' };
      const putResult1 = await dbA.put(jsonA1);
      const jsonA2 = { _id: '2', name: 'fromA' };
      const putResult2 = await dbA.put(jsonA2);
      const remoteA = dbA.getRemote(remoteURL);
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

      const clock = sinon.useFakeTimers();
      dbA.destroy().catch(err => console.debug(err.toString()));
      await clock.tickAsync(FILE_REMOVE_TIMEOUT);
      clock.restore();
    });

    /**
     * before:  jsonA1
     * dbA   : -jsonA1
     * after :
     */
    test('Remove followed by push', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbNameA = serialId();
      const dbA: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameA,
        local_dir: localDir,
      });
      const options: RemoteOptions = {
        remote_url: remoteURL,
        auth: { type: 'github', personal_access_token: token },
        include_commits: true,
      };
      await dbA.create(options);

      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);
      const remoteA = dbA.getRemote(remoteURL);
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

      const clock = sinon.useFakeTimers();
      dbA.destroy().catch(err => console.debug(err.toString()));
      await clock.tickAsync(FILE_REMOVE_TIMEOUT);
      clock.restore();
    });

    /**
     * before:
     * dbA   : +jsonA1
     * dbA   : -jsonA1
     * after :
     */
    test('Put and remove followed by push', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbNameA = serialId();
      const dbA: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameA,
        local_dir: localDir,
      });
      const options: RemoteOptions = {
        remote_url: remoteURL,
        auth: { type: 'github', personal_access_token: token },
        include_commits: true,
      };
      await dbA.create(options);

      const jsonA1 = { _id: '1', name: 'fromA' };
      // Put and remove a document
      const putResult1 = await dbA.put(jsonA1);
      const removeResult1 = await dbA.remove(jsonA1);

      const remoteA = dbA.getRemote(remoteURL);

      const syncResult1 = await remoteA.tryPush();
      expect(syncResult1.action).toBe('push');
      expect(syncResult1.commits!.remote.length).toBe(2);
      expect(syncResult1.commits!.remote[0].id).toBe(putResult1.commit_sha);
      expect(syncResult1.commits!.remote[1].id).toBe(removeResult1.commit_sha);
      expect(syncResult1.changes.remote.length).toBe(0); // no change

      expect(getWorkingDirFiles(dbA)).toEqual([]);

      const clock = sinon.useFakeTimers();
      dbA.destroy().catch(err => console.debug(err.toString()));
      await clock.tickAsync(FILE_REMOVE_TIMEOUT);
      clock.restore();
    });
  });

  describe('Check sync result: ', () => {
    /**
     * before:
     * dbA   :
     * after :
     */
    test('Action: nop', async () => {
      const remoteURL = remoteURLBase + serialId();

      const dbNameA = serialId();

      const dbA: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameA,
        local_dir: localDir,
      });
      const options: RemoteOptions = {
        remote_url: remoteURL,
        auth: { type: 'github', personal_access_token: token },
        include_commits: true,
      };
      await dbA.create(options);
      const remoteA = dbA.getRemote(remoteURL);
      const syncResult1 = (await remoteA.trySync()) as SyncResultPush;

      expect(syncResult1.action).toBe('nop');

      const clock = sinon.useFakeTimers();
      dbA.destroy().catch(err => console.debug(err.toString()));
      await clock.tickAsync(FILE_REMOVE_TIMEOUT);
      clock.restore();
    });

    describe('Action: push: ', () => {
      /**
       * before:
       * dbA   : +jsonA1
       * after :  jsonA1
       */
      test('add', async () => {
        const remoteURL = remoteURLBase + serialId();

        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        const options: RemoteOptions = {
          remote_url: remoteURL,
          auth: { type: 'github', personal_access_token: token },
          include_commits: true,
        };
        await dbA.create(options);
        // A puts and pushes
        const jsonA1 = { _id: '1', name: 'fromA' };
        const putResultA1 = await dbA.put(jsonA1);
        const remoteA = dbA.getRemote(remoteURL);
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

        const clock = sinon.useFakeTimers();
        dbA.destroy().catch(err => console.debug(err.toString()));
        await clock.tickAsync(FILE_REMOVE_TIMEOUT);
        clock.restore();
      });

      /**
       * before:  jsonA1
       * dbA   : -jsonA1
       * after :
       */
      test('remove', async () => {
        const remoteURL = remoteURLBase + serialId();

        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        const options: RemoteOptions = {
          remote_url: remoteURL,
          auth: { type: 'github', personal_access_token: token },
          include_commits: true,
        };
        await dbA.create(options);
        // A puts and pushes
        const jsonA1 = { _id: '1', name: 'fromA' };
        const putResultA1 = await dbA.put(jsonA1);
        const remoteA = dbA.getRemote(remoteURL);
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

        const clock = sinon.useFakeTimers();
        dbA.destroy().catch(err => console.debug(err.toString()));
        await clock.tickAsync(FILE_REMOVE_TIMEOUT);
        clock.restore();
      });

      /**
       * before:  jsonA1
       * dbA   : +jsonA1
       * after :  jsonA1
       */
      test('update', async () => {
        const remoteURL = remoteURLBase + serialId();

        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        const options: RemoteOptions = {
          remote_url: remoteURL,
          auth: { type: 'github', personal_access_token: token },
          include_commits: true,
        };
        await dbA.create(options);
        // A puts and pushes
        const jsonA1 = { _id: '1', name: 'fromA' };
        await dbA.put(jsonA1);
        const remoteA = dbA.getRemote(remoteURL);
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

        expect(getWorkingDirFiles(dbA)).toEqual([jsonA1]);

        const clock = sinon.useFakeTimers();
        dbA.destroy().catch(err => console.debug(err.toString()));
        await clock.tickAsync(FILE_REMOVE_TIMEOUT);
        clock.restore();
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
        const remoteURL = remoteURLBase + serialId();

        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        const options: RemoteOptions = {
          remote_url: remoteURL,
          auth: { type: 'github', personal_access_token: token },
          include_commits: true,
        };
        await dbA.create(options);

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameB,
          local_dir: localDir,
        });
        // Clone dbA
        await dbB.create(options);

        // A puts and pushes
        const jsonA1 = { _id: '1', name: 'fromA' };
        const putResult1 = await dbA.put(jsonA1);
        const remoteA = dbA.getRemote(remoteURL);
        await remoteA.tryPush();

        // B syncs
        const remoteB = dbB.getRemote(remoteURL);
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

        const clock = sinon.useFakeTimers();
        dbA.destroy().catch(err => console.debug(err.toString()));
        dbB.destroy().catch(err => console.debug(err.toString()));
        await clock.tickAsync(FILE_REMOVE_TIMEOUT);
        clock.restore();
      });

      /**
       * before:
       * dbA   : +jsonA1 +jsonA2
       * dbB   :
       * after :  jsonA1  jsonA2
       */
      test('add two files', async () => {
        const remoteURL = remoteURLBase + serialId();

        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        const options: RemoteOptions = {
          remote_url: remoteURL,
          auth: { type: 'github', personal_access_token: token },
          include_commits: true,
        };
        await dbA.create(options);

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameB,
          local_dir: localDir,
        });
        // Clone dbA
        await dbB.create(options);

        // A puts and pushes
        const jsonA1 = { _id: '1', name: 'fromA' };
        const jsonA2 = { _id: '2', name: 'fromA' };
        const putResult1 = await dbA.put(jsonA1);
        const putResult2 = await dbA.put(jsonA2);
        const remoteA = dbA.getRemote(remoteURL);
        await remoteA.tryPush();

        // B syncs
        const remoteB = dbB.getRemote(remoteURL);
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

        const clock = sinon.useFakeTimers();
        dbA.destroy().catch(err => console.debug(err.toString()));
        dbB.destroy().catch(err => console.debug(err.toString()));
        await clock.tickAsync(FILE_REMOVE_TIMEOUT);
        clock.restore();
      });
    });

    describe('Action: merge and push: ', () => {
      /**
       * before:
       * dbA   : +jsonA1
       * dbB   :         +jsonB2
       * after :  jsonA1  jsonB2
       */
      test('add a remote file and add a different local file', async () => {
        const remoteURL = remoteURLBase + serialId();

        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        const options: RemoteOptions = {
          remote_url: remoteURL,
          auth: { type: 'github', personal_access_token: token },
          include_commits: true,
        };
        await dbA.create(options);

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameB,
          local_dir: localDir,
        });
        // Clone dbA
        await dbB.create(options);

        // A puts and pushes
        const jsonA1 = { _id: '1', name: 'fromA' };
        const putResultA1 = await dbA.put(jsonA1);
        const remoteA = dbA.getRemote(remoteURL);
        await remoteA.tryPush();

        // B syncs
        const jsonB2 = { _id: '2', name: 'fromB' };
        const putResultB2 = await dbB.put(jsonB2);
        const remoteB = dbB.getRemote(remoteURL);

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

        const clock = sinon.useFakeTimers();
        dbA.destroy().catch(err => console.debug(err.toString()));
        dbB.destroy().catch(err => console.debug(err.toString()));
        await clock.tickAsync(FILE_REMOVE_TIMEOUT);
        clock.restore();
      });

      /**
       * before:
       * dbA   : +jsonA1 +jsonA2
       * dbB   :                 +jsonB3 +jsonB4
       * after :  jsonA1  jsonA2  jsonB3  jsonB4
       */
      test('add two remote files and add two different local files', async () => {
        const remoteURL = remoteURLBase + serialId();

        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        const options: RemoteOptions = {
          remote_url: remoteURL,
          auth: { type: 'github', personal_access_token: token },
          include_commits: true,
        };
        await dbA.create(options);

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameB,
          local_dir: localDir,
        });
        // Clone dbA
        await dbB.create(options);

        // A puts and pushes
        const jsonA1 = { _id: '1', name: 'fromA' };
        const putResultA1 = await dbA.put(jsonA1);
        const remoteA = dbA.getRemote(remoteURL);
        const jsonA2 = { _id: '2', name: 'fromA' };
        const putResultA2 = await dbA.put(jsonA2);
        await remoteA.tryPush();

        // B syncs
        const jsonB3 = { _id: '3', name: 'fromB' };
        const putResultB3 = await dbB.put(jsonB3);
        const jsonB4 = { _id: '4', name: 'fromB' };
        const putResultB4 = await dbB.put(jsonB4);

        const remoteB = dbB.getRemote(remoteURL);

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

        const clock = sinon.useFakeTimers();
        dbA.destroy().catch(err => console.debug(err.toString()));
        dbB.destroy().catch(err => console.debug(err.toString()));
        await clock.tickAsync(FILE_REMOVE_TIMEOUT);
        clock.restore();
      });

      /**
       * before:  jsonA1
       * dbA   : -jsonA1
       * dbB   :         +jsonB2
       * after :          jsonB2
       */
      test('remove a remote file and add a local file', async () => {
        const remoteURL = remoteURLBase + serialId();

        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        const options: RemoteOptions = {
          remote_url: remoteURL,
          auth: { type: 'github', personal_access_token: token },
          include_commits: true,
        };
        await dbA.create(options);
        // A puts and pushes
        const jsonA1 = { _id: '1', name: 'fromA' };
        await dbA.put(jsonA1);
        const remoteA = dbA.getRemote(remoteURL);
        await remoteA.tryPush();

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameB,
          local_dir: localDir,
        });
        // Clone dbA
        await dbB.create(options);

        // A removes and pushes
        const removeResultA1 = await dbA.remove(jsonA1);
        await remoteA.tryPush();

        // B put another file and syncs
        const jsonB2 = { _id: '2', name: 'fromB' };
        const putResultB2 = await dbB.put(jsonB2);
        const remoteB = dbB.getRemote(remoteURL);

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

        const clock = sinon.useFakeTimers();
        dbA.destroy().catch(err => console.debug(err.toString()));
        dbB.destroy().catch(err => console.debug(err.toString()));
        await clock.tickAsync(FILE_REMOVE_TIMEOUT);
        clock.restore();
      });

      /**
       * before:  jsonA1
       * dbA   :         +jsonA2
       * dbB   : -jsonA1
       * after :          jsonA2
       */
      test.only('remove a local file and add a different remote file', async () => {
        const remoteURL = remoteURLBase + serialId();

        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        const options: RemoteOptions = {
          remote_url: remoteURL,
          auth: { type: 'github', personal_access_token: token },
          include_commits: true,
        };
        await dbA.create(options);
        // A puts and pushes
        const jsonA1 = { _id: '1', name: 'fromA' };
        await dbA.put(jsonA1);
        const remoteA = dbA.getRemote(remoteURL);
        await remoteA.tryPush();

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameB,
          local_dir: localDir,
        });
        // Clone dbA
        await dbB.create(options);

        // A puts and pushes
        const jsonA2 = { _id: '2', name: 'fromA' };
        const putResultA2 = await dbA.put(jsonA2);
        await remoteA.tryPush();

        // B removes and syncs
        const removeResultB1 = await dbB.remove(jsonA1);
        const remoteB = dbB.getRemote(remoteURL);

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

        const clock = sinon.useFakeTimers();
        dbA.destroy().catch(err => console.debug(err.toString()));
        dbB.destroy().catch(err => console.debug(err.toString()));
        await clock.tickAsync(FILE_REMOVE_TIMEOUT);
        clock.restore();
      });

      /**
       * before:  jsonA1
       * dbA   : -jsonA1
       * dbB   : -jsonA1
       * after :
       */
      test('remove the same file on both sides', async () => {
        const remoteURL = remoteURLBase + serialId();

        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        const options: RemoteOptions = {
          remote_url: remoteURL,
          auth: { type: 'github', personal_access_token: token },
          include_commits: true,
        };
        await dbA.create(options);
        // A puts and pushes
        const jsonA1 = { _id: '1', name: 'fromA' };
        await dbA.put(jsonA1);
        const remoteA = dbA.getRemote(remoteURL);
        await remoteA.tryPush();

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameB,
          local_dir: localDir,
        });
        // Clone dbA
        await dbB.create(options);

        // A removes and pushes
        const removeResultA1 = await dbA.remove(jsonA1);
        await remoteA.tryPush();

        // B remove the same file and syncs
        const removeResultB1 = await dbB.remove(jsonA1);
        const remoteB = dbB.getRemote(remoteURL);

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

        const clock = sinon.useFakeTimers();
        dbA.destroy().catch(err => console.debug(err.toString()));
        dbB.destroy().catch(err => console.debug(err.toString()));
        await clock.tickAsync(FILE_REMOVE_TIMEOUT);
        clock.restore();
      });
    });

    describe('resolve conflicts and push (3-way merge): ', () => {
      /**
       * before:
       * dbA   : +jsonA1 +jsonA2
       * dbB   : +jsonB1         +jsonB3
       * after :  jsonB1  jsonA2  jsonB3
       *
       * 3-way merge:
       *   jsonB1: 4 - Conflict. Accept ours (put)
       *   jsonA2: 1 - Accept theirs (add)
       *   jsonB3: 2 - Accept ours (add)
       */
      test(`case 1: accept theirs (create), case 2: accept ours (create), case 4: Conflict. Accept ours (update): put with the same id`, async () => {
        const remoteURL = remoteURLBase + serialId();

        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        const options: RemoteOptions = {
          remote_url: remoteURL,
          auth: { type: 'github', personal_access_token: token },
          include_commits: true,
        };
        await dbA.create(options);

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameB,
          local_dir: localDir,
        });
        // Clone dbA
        await dbB.create(options);

        // A puts and pushes
        const jsonA1 = { _id: '1', name: 'fromA' };
        const putResultA1 = await dbA.put(jsonA1);
        const jsonA2 = { _id: '2', name: 'fromA' };
        const putResultA2 = await dbA.put(jsonA2);
        const remoteA = dbA.getRemote(remoteURL);
        await remoteA.tryPush();

        // B puts the same file
        const jsonB1 = { _id: '1', name: 'fromB' };
        const putResultB1 = await dbB.put(jsonB1);

        // B puts a new file
        const jsonB3 = { _id: '3', name: 'fromB' };
        const putResultB3 = await dbB.put(jsonB3);
        const remoteB = dbB.getRemote(remoteURL);

        // It will occur conflict on id 1.json.
        const syncResult1 = (await remoteB.trySync()) as SyncResultResolveConflictsAndPush;
        expect(syncResult1.action).toBe('resolve conflicts and push');
        expect(syncResult1.commits).toMatchObject({
          // two put commits and a merge commit
          local: [
            {
              id: putResultA1.commit_sha,
              author: expect.stringMatching(/^.+$/),
              date: expect.any(Date),
              message: expect.stringMatching(/^.+$/),
            },
            {
              id: putResultA2.commit_sha,
              author: expect.stringMatching(/^.+$/),
              date: expect.any(Date),
              message: expect.stringMatching(/^.+$/),
            },
            {
              id: expect.stringMatching(/^.+$/),
              author: expect.stringMatching(/^.+$/),
              date: expect.any(Date),
              message: '[resolve conflicts] update-ours: 1',
            },
          ],
          remote: [
            // two put commits and a merge commit
            {
              id: putResultB1.commit_sha,
              author: expect.stringMatching(/^.+$/),
              date: expect.any(Date),
              message: expect.stringMatching(/^.+$/),
            },
            {
              id: putResultB3.commit_sha,
              author: expect.stringMatching(/^.+$/),
              date: expect.any(Date),
              message: expect.stringMatching(/^.+$/),
            },
            {
              id: expect.stringMatching(/^.+$/),
              author: expect.stringMatching(/^.+$/),
              date: expect.any(Date),
              message: '[resolve conflicts] update-ours: 1',
            },
          ],
        });
        expect(syncResult1.changes.local.length).toBe(1);
        expect(syncResult1.changes.local).toEqual(
          expect.arrayContaining([
            {
              operation: 'create',
              data: {
                id: jsonA2._id,
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
                id: jsonB3._id,
                file_sha: putResultB3.file_sha,
                doc: jsonB3,
              },
            },
            {
              operation: 'update',
              data: {
                id: jsonB1._id,
                file_sha: putResultB1.file_sha,
                doc: jsonB1,
              },
            },
          ])
        );

        expect(syncResult1.conflicts.length).toEqual(1);
        expect(syncResult1.conflicts).toEqual(
          expect.arrayContaining([
            {
              id: '1',
              strategy: 'ours',
              operation: 'update',
            },
          ])
        );
        // Conflict occurs on 1.json

        expect(getWorkingDirFiles(dbB)).toEqual([jsonB1, jsonA2, jsonB3]);
        // Sync dbA
        const syncResult2 = (await remoteA.trySync()) as SyncResultMergeAndPush;
        expect(getWorkingDirFiles(dbA)).toEqual([jsonB1, jsonA2, jsonB3]);

        const clock = sinon.useFakeTimers();
        dbA.destroy().catch(err => console.debug(err.toString()));
        dbB.destroy().catch(err => console.debug(err.toString()));
        await clock.tickAsync(FILE_REMOVE_TIMEOUT);
        clock.restore();
      });

      /**
       * before:  jsonA1
       * dbA   : -jsonA1 +jsonA2
       * dbB   : +jsonB1
       * result:  jsonB1  jsonA2
       *
       * 3-way merge:
       *  jsonB1: 11 - Conflict. Accept ours (update)
       *  jsonA2:  1 - Accept theirs (create)
       */
      test('case 1: Accept theirs (create), case 11: accept ours', async () => {
        const remoteURL = remoteURLBase + serialId();

        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        const options: RemoteOptions = {
          remote_url: remoteURL,
          auth: { type: 'github', personal_access_token: token },
          include_commits: true,
        };
        await dbA.create(options);
        // A puts and pushes
        const jsonA1 = { _id: '1', name: 'fromA' };
        const putResultA1 = await dbA.put(jsonA1);
        const remoteA = dbA.getRemote(remoteURL);
        await remoteA.tryPush();

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameB,
          local_dir: localDir,
        });
        // Clone dbA
        await dbB.create(options);

        // A removes the old file and puts a new file
        const removeResultA1 = await dbA.remove(jsonA1);
        const jsonA2 = { _id: '2', name: 'fromA' };
        const putResultA2 = await dbA.put(jsonA2);
        await remoteA.tryPush();

        // B updates the old file and syncs
        const jsonB1 = { _id: '1', name: 'fromB' };
        const putResultB1 = await dbB.put(jsonB1);
        const remoteB = dbB.getRemote(remoteURL);

        const syncResult1 = (await remoteB.trySync()) as SyncResultResolveConflictsAndPush;
        expect(syncResult1.action).toBe('resolve conflicts and push');
        expect(syncResult1.commits).toMatchObject({
          // a remove commit, a put commit and a merge commit
          local: [
            {
              id: removeResultA1.commit_sha,
              author: expect.stringMatching(/^.+$/),
              date: expect.any(Date),
              message: expect.stringMatching(/^.+$/),
            },
            {
              id: putResultA2.commit_sha,
              author: expect.stringMatching(/^.+$/),
              date: expect.any(Date),
              message: expect.stringMatching(/^.+$/),
            },
            {
              id: expect.stringMatching(/^.+$/),
              author: expect.stringMatching(/^.+$/),
              date: expect.any(Date),
              message: '[resolve conflicts] update-ours: 1',
            },
          ],
          remote: [
            // put commit and merge commit
            {
              id: putResultB1.commit_sha,
              author: expect.stringMatching(/^.+$/),
              date: expect.any(Date),
              message: expect.stringMatching(/^.+$/),
            },
            {
              id: expect.stringMatching(/^.+$/),
              author: expect.stringMatching(/^.+$/),
              date: expect.any(Date),
              message: '[resolve conflicts] update-ours: 1',
            },
          ],
        });
        expect(syncResult1.changes.local.length).toBe(1);
        expect(syncResult1.changes.local).toEqual(
          expect.arrayContaining([
            {
              operation: 'create',
              data: {
                id: jsonA2._id,
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
              operation: 'create',
              data: {
                id: jsonB1._id,
                file_sha: putResultB1.file_sha,
                doc: jsonB1,
              },
            },
          ])
        );

        expect(syncResult1.conflicts.length).toEqual(1);
        expect(syncResult1.conflicts).toEqual(
          expect.arrayContaining([
            {
              id: '1',
              strategy: 'ours',
              operation: 'update',
            },
          ])
        );
        // Conflict occurs on 1.json

        expect(getWorkingDirFiles(dbB)).toEqual([jsonB1, jsonA2]);

        // Sync dbA
        const syncResult2 = (await remoteA.trySync()) as SyncResultMergeAndPush;
        expect(getWorkingDirFiles(dbA)).toEqual([jsonB1, jsonA2]);

        const clock = sinon.useFakeTimers();
        dbA.destroy().catch(err => console.debug(err.toString()));
        dbB.destroy().catch(err => console.debug(err.toString()));
        await clock.tickAsync(FILE_REMOVE_TIMEOUT);
        clock.restore();
      });
    });
  });

  /**
   * No merge base
   */
  describe.skip('No merge base: ', () => {
    // behavior_for_no_merge_base が nop のときリトライしないこと。
    test.skip('Test ours option for behavior_for_no_merge_base', async () => {
      const remoteURL = remoteURLBase + serialId();

      const dbNameA = serialId();

      const dbA: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameA,
        local_dir: localDir,
      });
      const options: RemoteOptions = {
        remote_url: remoteURL,
        auth: { type: 'github', personal_access_token: token },
      };

      await dbA.create(options);
      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);

      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameB,
        local_dir: localDir,
      });
      await dbB.create();

      await expect(dbB.sync(options)).rejects.toThrowError(NoMergeBaseFoundError);

      const clock = sinon.useFakeTimers();
      dbA.destroy();
      dbB.destroy();
      await clock.tickAsync(FILE_REMOVE_TIMEOUT);
      clock.restore();
    });
  });
});
