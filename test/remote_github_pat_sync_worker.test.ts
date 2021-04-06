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
  RemoteOptions,
  SyncResultFastForwardMerge,
  SyncResultMergeAndPush,
  SyncResultPush,
  SyncResultResolveConflictsAndPush,
} from '../src/types';
import { NoMergeBaseFoundError } from '../src/error';
import { removeRemoteRepositories } from './remote_utils';

const reposPrefix = 'test_pat_sync_worker___';
const localDir = `./test/database_remote_github_pat_sync_worker`;

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

// GITDDB_GITHUB_USER_URL: URL of your GitHub account
// e.g.) https://github.com/foo/
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
        expect(syncResult.operation).toBe('push');
        expect(syncResult.commits!.remote.length).toBe(1);
        expect(syncResult.commits!.remote[0].id).toBe(putResult.commit_sha);
        expect(syncResult.changes).toMatchObject({
          remote: {
            add: [
              {
                id: jsonA1._id,
                file_sha: putResult.file_sha,
                doc: jsonA1,
              },
            ],
            modify: [],
            remove: [],
          },
        });
        await dbA.destroy().catch(err => console.debug(err));
      });

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
        // (This behavior aligns with put() API)
        const putResult2 = await dbA.put(jsonA1);
        const syncResult2 = await remoteA.tryPush();
        expect(syncResult2.operation).toBe('push');
        expect(syncResult2.commits!.remote.length).toBe(1);
        expect(syncResult2.commits!.remote[0].id).toBe(putResult2.commit_sha);
        expect(syncResult2.changes.remote.add.length).toBe(0);
        expect(syncResult2.changes.remote.modify.length).toBe(0); // No file change

        await dbA.destroy().catch(err => console.debug(err));
      });

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
        await dbA.put(jsonA1);
        await remoteA.tryPush();

        // Put and push an updated document
        const jsonA1dash = { _id: '1', name: 'updated' };
        const putResult3 = await dbA.put(jsonA1dash);
        const syncResult3 = await remoteA.tryPush();
        expect(syncResult3.operation).toBe('push');
        expect(syncResult3.commits!.remote.length).toBe(1);
        expect(syncResult3.commits!.remote[0].id).toBe(putResult3.commit_sha);
        expect(syncResult3.changes.remote.add.length).toBe(0);
        expect(syncResult3.changes.remote.modify.length).toBe(1);
        expect(syncResult3.changes.remote.modify[0].doc).toMatchObject(jsonA1dash);

        await dbA.destroy().catch(err => console.debug(err));
      });

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
        const jsonA4 = { _id: '2', name: 'fromA' };
        const putResult4 = await dbA.put(jsonA4);
        const syncResult4 = await remoteA.tryPush();
        expect(syncResult4.operation).toBe('push');
        expect(syncResult4.commits!.remote.length).toBe(1);
        expect(syncResult4.commits!.remote[0].id).toBe(putResult4.commit_sha);
        expect(syncResult4.changes.remote.add.length).toBe(1);
        expect(syncResult4.changes.remote.add[0].doc).toMatchObject(jsonA4);
        expect(syncResult4.changes.remote.modify.length).toBe(0);

        await dbA.destroy().catch(err => console.debug(err));
      });
    });

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
      expect(syncResult.operation).toBe('push');
      expect(syncResult.commits!.remote.length).toBe(2);
      expect(syncResult.commits!.remote[0].id).toBe(putResult1.commit_sha);
      expect(syncResult.commits!.remote[1].id).toBe(putResult2.commit_sha);
      expect(syncResult.changes.remote.add.length).toBe(2);

      // put an updated document and another document
      const jsonA1dash = { _id: '1', name: 'updated' };
      const putResult3 = await dbA.put(jsonA1dash);
      const jsonA4 = { _id: '4', name: 'fromA' };
      const putResult4 = await dbA.put(jsonA4);
      const syncResult2 = await remoteA.tryPush();
      expect(syncResult2.operation).toBe('push');
      expect(syncResult2.commits!.remote.length).toBe(2);
      expect(syncResult2.commits!.remote[0].id).toBe(putResult3.commit_sha);
      expect(syncResult2.commits!.remote[1].id).toBe(putResult4.commit_sha);
      expect(syncResult2.changes.remote.add.length).toBe(1);
      expect(syncResult2.changes.remote.add[0].doc).toMatchObject(jsonA4);
      expect(syncResult2.changes.remote.modify.length).toBe(1);
      expect(syncResult2.changes.remote.modify[0].doc).toMatchObject(jsonA1dash);

      await dbA.destroy().catch(err => console.debug(err));
    });

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
      await dbA.put(jsonA1);
      const remoteA = dbA.getRemote(remoteURL);
      await remoteA.tryPush();

      // Remove the previous put document
      const removeResult1 = await dbA.remove(jsonA1);

      const syncResult1 = await remoteA.tryPush();
      expect(syncResult1.operation).toBe('push');
      expect(syncResult1.commits!.remote.length).toBe(1);
      expect(syncResult1.commits!.remote[0].id).toBe(removeResult1.commit_sha);
      expect(syncResult1.changes.remote.add.length).toBe(0);
      expect(syncResult1.changes.remote.modify.length).toBe(0);
      expect(syncResult1.changes.remote.remove.length).toBe(1);
      expect(syncResult1.changes.remote.remove[0].id).toBe('1');

      // Put and remove a document
      const putResult2 = await dbA.put(jsonA1);
      const removeResult2 = await dbA.remove(jsonA1);
      const syncResult2 = await remoteA.tryPush();
      expect(syncResult2.operation).toBe('push');
      expect(syncResult2.commits!.remote.length).toBe(2);
      expect(syncResult2.commits!.remote[0].id).toBe(putResult2.commit_sha);
      expect(syncResult2.commits!.remote[1].id).toBe(removeResult2.commit_sha);
      expect(syncResult2.changes.remote.add.length).toBe(0); // Must not be 1 but 0, because diff is empty.
      expect(syncResult2.changes.remote.modify.length).toBe(0);
      expect(syncResult2.changes.remote.remove.length).toBe(0); // Must no be 1 but 0, because diff is empty.

      await dbA.destroy().catch(err => console.debug(err));
    });
  });

  describe('Check sync result: ', () => {
    test('nop', async () => {
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

      expect(syncResult1.operation).toBe('nop');

      await dbA.destroy().catch(err => console.debug(err));
    });

    test('Just push', async () => {
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

      expect(syncResult1.operation).toBe('push');
      expect(syncResult1.commits!.remote.length).toBe(1);
      expect(syncResult1.commits!.remote[0].id).toBe(putResultA1.commit_sha);
      expect(syncResult1.changes.remote.add.length).toBe(1);

      await dbA.destroy().catch(err => console.debug(err));
    });

    describe('Fast-forward merge: ', () => {
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
        expect(syncResult1.operation).toBe('fast-forward merge');
        expect(syncResult1.commits!.local.length).toBe(1);
        expect(syncResult1.commits!.local[0].id).toBe(putResult1.commit_sha);
        expect(syncResult1.changes.local.add.length).toBe(1);
        expect(syncResult1.changes.local.modify.length).toBe(0);
        expect(syncResult1.changes.local.remove.length).toBe(0);
        expect(syncResult1.changes.local.add[0].doc).toMatchObject(jsonA1);

        await dbA.destroy().catch(e => console.debug(e));
        await dbB.destroy().catch(e => console.debug(e));
      });

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
        expect(syncResult1.operation).toBe('fast-forward merge');
        expect(syncResult1.commits!.local.length).toBe(2);
        expect(syncResult1.commits!.local[0].id).toBe(putResult1.commit_sha);
        expect(syncResult1.commits!.local[1].id).toBe(putResult2.commit_sha);
        expect(syncResult1.changes.local.add.length).toBe(2);
        expect(syncResult1.changes.local.modify.length).toBe(0);
        expect(syncResult1.changes.local.remove.length).toBe(0);

        await dbA.destroy().catch(err => console.debug(err));
        await dbB.destroy().catch(err => console.debug(err));
      });
    });

    describe('Normal merge: ', () => {
      test('add different two files', async () => {
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
        const jsonB1 = { _id: '2', name: 'fromB' };
        const putResultB1 = await dbB.put(jsonB1);
        const remoteB = dbB.getRemote(remoteURL);

        const syncResult1 = (await remoteB.trySync()) as SyncResultMergeAndPush;
        expect(syncResult1.operation).toBe('merge and push');
        expect(syncResult1.commits!.local.length).toBe(2); // put commit and merge commit
        expect(syncResult1.commits!.remote.length).toBe(2); // put commit and merge commit
        expect(syncResult1.commits!.local[0].id).toBe(putResultA1.commit_sha);
        expect(syncResult1.commits!.local[1].message).toBe('merge');
        expect(syncResult1.commits!.remote[0].id).toBe(putResultB1.commit_sha);
        expect(syncResult1.commits!.remote[1].message).toBe('merge');
        expect(syncResult1.changes.local.add.length).toBe(1);
        expect(syncResult1.changes.local.modify.length).toBe(0);
        expect(syncResult1.changes.local.remove.length).toBe(0);
        expect(syncResult1.changes.local.add[0].doc).toMatchObject(jsonA1);
        expect(syncResult1.changes.remote.add.length).toBe(1);
        expect(syncResult1.changes.remote.modify.length).toBe(0);
        expect(syncResult1.changes.remote.remove.length).toBe(0);
        expect(syncResult1.changes.remote.add[0].doc).toMatchObject(jsonB1);

        await dbA.destroy().catch(err => console.debug(err));
        await dbB.destroy().catch(err => console.debug(err));
      });

      test('add different more files', async () => {
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
        expect(syncResult1.operation).toBe('merge and push');
        expect(syncResult1.commits!.local.length).toBe(3); // Two put commits and a merge commit
        expect(syncResult1.commits!.remote.length).toBe(3); // Two put commits and a merge commit
        expect(syncResult1.commits!.local[0].id).toBe(putResultA1.commit_sha);
        expect(syncResult1.commits!.local[1].id).toBe(putResultA2.commit_sha);
        expect(syncResult1.commits!.local[2].message).toBe('merge');
        expect(syncResult1.commits!.remote[0].id).toBe(putResultB3.commit_sha);
        expect(syncResult1.commits!.remote[1].id).toBe(putResultB4.commit_sha);
        expect(syncResult1.commits!.remote[2].message).toBe('merge');
        expect(syncResult1.changes.local.add.length).toBe(2);
        expect(syncResult1.changes.local.modify.length).toBe(0);
        expect(syncResult1.changes.local.remove.length).toBe(0);
        expect(syncResult1.changes.local.add[0].doc).toMatchObject({
          _id: expect.stringMatching(/(1|2)/),
        });
        expect(syncResult1.changes.remote.add.length).toBe(2);
        expect(syncResult1.changes.remote.modify.length).toBe(0);
        expect(syncResult1.changes.remote.remove.length).toBe(0);
        expect(syncResult1.changes.remote.add[0].doc).toMatchObject({
          _id: expect.stringMatching(/(3|4)/),
        });
        await dbA.destroy().catch(err => console.debug(err));
        await dbB.destroy().catch(err => console.debug(err));
      });

      test('remove a file', async () => {
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
        const jsonB1 = { _id: '2', name: 'fromB' };
        const putResultB1 = await dbB.put(jsonB1);
        const remoteB = dbB.getRemote(remoteURL);

        const syncResult1 = (await remoteB.trySync()) as SyncResultMergeAndPush;
        expect(syncResult1.operation).toBe('merge and push');
        expect(syncResult1.commits!.local.length).toBe(2); // remove commit and merge commit
        expect(syncResult1.commits!.remote.length).toBe(2); // put commit and merge commit
        expect(syncResult1.commits!.local[0].id).toBe(removeResultA1.commit_sha);
        expect(syncResult1.commits!.local[1].message).toBe('merge');
        expect(syncResult1.commits!.remote[0].id).toBe(putResultB1.commit_sha);
        expect(syncResult1.commits!.remote[1].message).toBe('merge');
        expect(syncResult1.changes.local.add.length).toBe(0);
        expect(syncResult1.changes.local.modify.length).toBe(0);
        expect(syncResult1.changes.local.remove.length).toBe(1);
        expect(syncResult1.changes.local.remove![0].file_sha).toBe(removeResultA1.file_sha);
        expect(syncResult1.changes.remote.add.length).toBe(1);
        expect(syncResult1.changes.remote.modify.length).toBe(0);
        expect(syncResult1.changes.remote.remove.length).toBe(0);
        expect(syncResult1.changes.remote.add[0].doc).toMatchObject(jsonB1);

        await dbA.destroy().catch(err => console.debug(err));
        await dbB.destroy().catch(err => console.debug(err));
      });

      test('remove the same file', async () => {
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
        expect(syncResult1.operation).toBe('merge and push');
        expect(syncResult1.commits!.local.length).toBe(2); // remove commit and merge commit
        expect(syncResult1.commits!.remote.length).toBe(2); // remove commit and merge commit
        expect(syncResult1.commits!.local[0].id).toBe(removeResultA1.commit_sha);
        expect(syncResult1.commits!.local[1].message).toBe('merge');
        expect(syncResult1.commits!.remote[0].id).toBe(removeResultB1.commit_sha);
        expect(syncResult1.commits!.remote[1].message).toBe('merge');
        expect(syncResult1.changes.local.add.length).toBe(0);
        expect(syncResult1.changes.local.modify.length).toBe(0);
        expect(syncResult1.changes.local.remove.length).toBe(0); // Must no be 1 but 0, because diff is empty.
        expect(syncResult1.changes.remote.add.length).toBe(0);
        expect(syncResult1.changes.remote.modify.length).toBe(0);
        expect(syncResult1.changes.remote.remove.length).toBe(0); // Must no be 1 but 0, because diff is empty.

        await dbA.destroy().catch(err => console.debug(err));
        await dbB.destroy().catch(err => console.debug(err));
      });
    });

    describe('3-way merge: ', () => {
      test.only(`
case 1: accept theirs (add)
case 2: accept ours (add)
case 4: Conflict. Accept ours (overwrite): put with the same id`, async () => {
        /**
         * dbA   : jsonA1, jsonA2
         * dbB   : jsonB1,         jsonB3
         * result: jsonB1, jsonA2, jsonB3
         */
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

        // 4 - Conflict. Accept ours (put): 1.json
        // 1 - Accept theirs (add): 2.json
        // 2 - Accept ours (add): 3.json
        expect(syncResult1.operation).toBe('resolve conflicts and push');
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
              message: '[resolve conflicts] put-ours: 1',
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
              message: '[resolve conflicts] put-ours: 1',
            },
          ],
        });
        expect(syncResult1.changes).toMatchObject({
          local: {
            add: [
              {
                id: jsonA2._id,
                file_sha: putResultA2.file_sha,
                doc: jsonA2,
              },
            ], // jsonA2 is merged normally
            modify: [], // Must be 0, because diff is empty.
            remove: [],
          },
          remote: {
            add: [
              {
                id: jsonB3._id,
                file_sha: putResultB3.file_sha,
                doc: jsonB3,
              },
            ], // jsonB3 is merged normally
            modify: [
              {
                id: jsonB1._id,
                file_sha: putResultB1.file_sha,
                doc: jsonB1,
              },
            ], // Must be 1. jsonA1 is overwritten by jsonB1.
            remove: [],
          },
        });
        expect(syncResult1.conflicts).toEqual(
          expect.arrayContaining([
            {
              id: '1',
              strategy: 'ours',
              operation: 'put',
            },
          ])
        );
        expect(syncResult1.conflicts.length).toEqual(1);
        // Conflict occurs on 1.json

        await dbA.destroy().catch(err => console.debug(err));
        await dbB.destroy().catch(err => console.debug(err));
      });

      test('case (11): Resolve conflict: put and remove the same file', async () => {
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

        const removeResultA1 = await dbA.remove(jsonA1);
        const jsonA2 = { _id: '2', name: 'fromA' };
        const putResultA2 = await dbA.put(jsonA2);
        await remoteA.tryPush();

        // B updates and puts the same file and syncs
        const jsonB1 = { _id: '1', name: 'fromB' };
        const putResultB1 = await dbB.put(jsonB1);
        const remoteB = dbB.getRemote(remoteURL);

        const syncResult1 = (await remoteB.trySync()) as SyncResultResolveConflictsAndPush;
        // overwrite theirs by ours
        expect(syncResult1.operation).toBe('resolve conflicts and push');
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
              message: '[resolve conflicts] put-accept-ours: 1',
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
              message: '[resolve conflicts] put-accept-ours: 1',
            },
          ],
        });
        expect(syncResult1.changes).toMatchObject({
          local: {
            add: [
              {
                id: jsonA2._id,
                file_sha: putResultA2.file_sha,
                doc: jsonA2,
              },
            ], // jsonA2 is merged normally
            modify: [], // Must be 0, because diff is empty.
            remove: [],
          },
          remote: {
            add: [
              {
                id: jsonB1._id,
                file_sha: putResultB1.file_sha,
                doc: jsonB1,
              },
            ],
            modify: [], // Must be 1, because jsonA1 is overwritten by jsonB1
            remove: [],
          },
        });
        expect(syncResult1.conflicts).toMatchObject({
          ours: {
            put: ['1'],
            remove: [],
          },
          theirs: {
            put: [],
            remove: [],
          },
        }); // Conflicted document '1' is overwritten by jsonB1

        await dbA.destroy().catch(err => console.debug(err));
        await dbB.destroy().catch(err => console.debug(err));
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

      await dbA.destroy();
      await dbB.destroy();
    });
  });
});
