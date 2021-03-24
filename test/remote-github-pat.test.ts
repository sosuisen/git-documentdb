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
import { Octokit } from '@octokit/rest';
import fs from 'fs-extra';
import { monotonicFactory } from 'ulid';
import { GitDocumentDB } from '../src';
import {
  RemoteOptions,
  SyncResultFastForwardMerge,
  SyncResultMergeAndPush,
  SyncResultPush,
  SyncResultResolveConflictsAndPush,
} from '../src/types';
import {
  HttpProtocolRequiredError,
  IntervalTooSmallError,
  InvalidRepositoryURLError,
  NoMergeBaseFoundError,
  RepositoryNotOpenError,
  UndefinedPersonalAccessTokenError,
  UndefinedRemoteURLError,
} from '../src/error';
import { minimumSyncInterval, Sync } from '../src/remote/sync';
import { RemoteRepository } from '../src/remote/remote_repository';

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const idPool: string[] = [];
const allIds: string[] = [];
const MAX_ID = 60;
for (let i = 0; i < MAX_ID; i++) {
  idPool.push(`test_repos_${i}`);
  allIds.push(`test_repos_${i}`);
}
const serialId = () => {
  const id = idPool.shift();
  if (id === undefined) {
    throw new Error('Id pool is empty. Increase MAX_ID.');
  }
  return id;
};

// GITDDB_GITHUB_USER_URL: URL of your GitHub account
// e.g.) https://github.com/foo/
const maybe =
  process.env.GITDDB_GITHUB_USER_URL && process.env.GITDDB_PERSONAL_ACCESS_TOKEN
    ? describe
    : describe.skip;

maybe('remote: use personal access token: ', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  const localDir = `./test/database_remote_by_pat_${monoId()}`;

  const createRemoteRepository = async (remoteURL: string) => {
    await new RemoteRepository(remoteURL, {
      type: 'github',
      personal_access_token: token,
    })
      .create()
      .catch(() => {});
  };

  const destroyRemoteRepository = async (remoteURL: string) => {
    await new RemoteRepository(remoteURL, {
      type: 'github',
      personal_access_token: token,
    })
      .destroy()
      .catch(() => {});
  };

  beforeAll(async () => {
    console.log('deleting remote test repositories...');
    // Remove test repositories on remote
    const octokit = new Octokit({
      auth: token,
    });
    const urlArray = remoteURLBase!.split('/');
    const owner = urlArray[urlArray.length - 2];
    const promises: Promise<any>[] = [];
    allIds.forEach(id => {
      // console.log('delete: ' + owner + '/' + id);
      promises.push(
        octokit.repos.delete({ owner, repo: id }).catch(err => {
          if (err.status !== 404) {
            console.log(err);
          }
        })
      );
    });
    await Promise.all(promises);
    console.log('done.');
  });

  /**
   * Tests for constructor
   */
  describe.skip('constructor: ', () => {
    beforeAll(() => {
      // Remove local repositories
      fs.removeSync(path.resolve(localDir));
    });

    afterAll(() => {
      fs.removeSync(path.resolve(localDir));
    });

    test('Create and remove remote repository by personal access token', async () => {
      const dbName = serialId();
      const remoteURL = remoteURLBase + dbName;
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      // Check if the repository is deleted.
      const octokit = new Octokit({
        auth: token,
      });

      const urlArray = remoteURL.split('/');
      const owner = urlArray[urlArray.length - 2];
      const repo = urlArray[urlArray.length - 1];

      await createRemoteRepository(remoteURL);

      await expect(octokit.repos.listBranches({ owner, repo })).resolves.not.toThrowError();

      await destroyRemoteRepository(remoteURL);

      await expect(octokit.repos.listBranches({ owner, repo })).rejects.toThrowError();
    });

    test('Undefined remoteURL', async () => {
      const dbName = serialId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.open();
      const options: RemoteOptions = {
        auth: {
          type: 'github',
          personal_access_token: '',
        },
      };
      await expect(gitDDB.sync(options)).rejects.toThrowError(UndefinedRemoteURLError);
      await gitDDB.destroy();
    });

    test('HTTP protocol is required', async () => {
      const dbName = serialId();
      const remoteURL = 'ssh://github.com/';
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.open();
      const options: RemoteOptions = {
        remote_url: remoteURL,
        auth: {
          type: 'github',
          personal_access_token: 'foobar',
        },
      };
      await expect(gitDDB.sync(options)).rejects.toThrowError(HttpProtocolRequiredError);
      await gitDDB.destroy();
    });

    test('Undefined personal access token', async () => {
      const dbName = serialId();
      const remoteURL = remoteURLBase + dbName;
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.open();
      const options: RemoteOptions = {
        remote_url: remoteURL,
        auth: {
          type: 'github',
          personal_access_token: '',
        },
      };
      await expect(gitDDB.sync(options)).rejects.toThrowError(
        UndefinedPersonalAccessTokenError
      );
      await gitDDB.destroy();
    });

    test('Invalid Remote Repository URL', async () => {
      const dbName = serialId();
      const remoteURL = 'https://github.com/';
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.open();
      const options: RemoteOptions = {
        remote_url: remoteURL,
        auth: {
          type: 'github',
          personal_access_token: 'foobar',
        },
      };
      await expect(gitDDB.sync(options)).rejects.toThrowError(InvalidRepositoryURLError);
      await gitDDB.destroy();
    });

    test('Interval is too small', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbName = serialId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.open();
      const invalid_options: RemoteOptions = {
        remote_url: remoteURL,
        interval: minimumSyncInterval - 1,
        auth: {
          type: 'github',
          personal_access_token: '',
        },
      };
      await expect(gitDDB.sync(invalid_options)).rejects.toThrowError(
        IntervalTooSmallError
      );
      await gitDDB.destroy();

      await gitDDB.open();
      const valid_options: RemoteOptions = {
        remote_url: remoteURL,
        interval: minimumSyncInterval,
        auth: {
          type: 'github',
          personal_access_token: token,
        },
      };
      await expect(gitDDB.sync(valid_options)).resolves.not.toThrowError();

      await gitDDB.destroy();
    });
  });

  /**
   * connectToRemote
   */
  describe.skip('connect(): ', () => {
    beforeAll(() => {
      // Remove local repositories
      fs.removeSync(path.resolve(localDir));
    });

    afterAll(() => {
      fs.removeSync(path.resolve(localDir));
    });

    test('Repository not open', async () => {
      const dbName = serialId();
      const remoteURL = remoteURLBase + dbName;
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await expect(
        gitDDB.sync({
          remote_url: remoteURL,
          auth: { type: 'github', personal_access_token: token },
        })
      ).rejects.toThrowError(RepositoryNotOpenError);
      await gitDDB.destroy();
    });

    test('Create Sync with a new remote repository', async () => {
      const dbName = serialId();
      const remoteURL = remoteURLBase + dbName;
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.open();

      const options: RemoteOptions = {
        remote_url: remoteURL,
        auth: { type: 'github', personal_access_token: token },
      };
      const repos = gitDDB.repository();
      const remote = new Sync(gitDDB, options);
      await expect(remote.init(repos!)).resolves.toMatchObject({ operation: 'push' });
      expect(remote.upstream_branch).toBe(`origin/${gitDDB.defaultBranch}`);

      await gitDDB.destroy();
    });

    test('Create Sync with an existed remote repository', async () => {
      const dbName = serialId();
      const remoteURL = remoteURLBase + dbName;
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.open();

      const options: RemoteOptions = {
        remote_url: remoteURL,
        auth: { type: 'github', personal_access_token: token },
      };
      await gitDDB.sync(options);
      // A remote repository has been created by the first sync().

      gitDDB.removeRemote(remoteURL);

      // Sync with an existed remote repository
      const repos = gitDDB.repository();
      const remote = new Sync(gitDDB, options);
      await expect(remote.init(repos!)).resolves.toMatchObject({ operation: 'nop' });

      await gitDDB.destroy();
    });

    test('Get remote', async () => {
      const dbName = serialId();
      const remoteURL = remoteURLBase + dbName;
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.open();

      const remote = await gitDDB.sync({
        remote_url: remoteURL,
        auth: { type: 'github', personal_access_token: token },
      });
      expect(gitDDB.getRemote(remoteURL)).toBe(remote);

      await gitDDB.destroy();
    });
  });

  /**
   * Operate remote repository
   */
  describe.skip('Operate remote repository: ', () => {
    beforeAll(() => {
      // Remove local repositories
      fs.removeSync(path.resolve(localDir));
    });

    afterAll(() => {
      fs.removeSync(path.resolve(localDir));
    });

    test('Create remote repository', async () => {
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
      // Check dbInfo
      await expect(dbA.open(options)).resolves.toMatchObject({
        is_new: true,
        is_clone: false,
        is_created_by_gitddb: true,
        is_valid_version: true,
      });

      // Check remote
      const octokit = new Octokit({
        auth: token,
      });
      const urlArray = remoteURL.split('/');
      const owner = urlArray[urlArray.length - 2];
      const repo = urlArray[urlArray.length - 1];
      await expect(octokit.repos.listBranches({ owner, repo })).resolves.not.toThrowError();

      await dbA.destroy();
    });

    test.skip('Test _addRemoteRepository');
    test.skip('Remote remote repository');
  });

  describe.skip('Check push result: ', () => {
    describe('Put once followed by push', () => {
      test('Just put and push', async () => {
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
        await dbA.open(options);

        // Put and push
        const jsonA1 = { _id: '1', name: 'fromA' };
        const putResult = await dbA.put(jsonA1);
        const remoteA = dbA.getRemote(remoteURL);
        const syncResult = await remoteA.tryPush();
        expect(syncResult.operation).toBe('push');
        expect(syncResult.commits!.remote.length).toBe(1);
        expect(syncResult.commits!.remote[0].id).toBe(putResult.commit_sha);
        expect(syncResult.changes.remote.add.length).toBe(1); // A file is added
        expect(syncResult.changes.remote.add[0].doc).toMatchObject(jsonA1);

        await dbA.destroy().catch(err => console.log(err));
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
        await dbA.open(options);
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

        await dbA.destroy().catch(err => console.log(err));
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
        await dbA.open(options);
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
        await dbA.open(options);
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

        await dbA.destroy().catch(err => console.log(err));
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
      await dbA.open(options);

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

      await dbA.destroy().catch(err => console.log(err));
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
      await dbA.open(options);

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

      await dbA.destroy().catch(err => console.log(err));
    });
  });

  describe('Check sync result: ', () => {
    test.skip('nop', async () => {
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
      await dbA.open(options);
      const remoteA = dbA.getRemote(remoteURL);
      const syncResult1 = (await remoteA.trySync()) as SyncResultPush;

      expect(syncResult1.operation).toBe('nop');

      await dbA.destroy().catch(err => console.debug(err));
    });

    test.skip('Just push', async () => {
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
      await dbA.open(options);
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

    describe.skip('Fast-forward merge: ', () => {
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
        await dbA.open(options);

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameB,
          local_dir: localDir,
        });
        // Clone dbA
        await dbB.open(options);

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
        await dbA.open(options);

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameB,
          local_dir: localDir,
        });
        // Clone dbA
        await dbB.open(options);

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

    describe.skip('Normal merge: ', () => {
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
        await dbA.open(options);

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameB,
          local_dir: localDir,
        });
        // Clone dbA
        await dbB.open(options);

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
        await dbA.open(options);

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameB,
          local_dir: localDir,
        });
        // Clone dbA
        await dbB.open(options);

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
        await dbA.open(options);
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
        await dbB.open(options);

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
        await dbA.open(options);
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
        await dbB.open(options);

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

    describe('Resolve conflict: ', () => {
      test.skip('case (4): put with the same id', async () => {
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
        await dbA.open(options);

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameB,
          local_dir: localDir,
        });
        // Clone dbA
        await dbB.open(options);

        // A puts and pushes
        const jsonA1 = { _id: '1', name: 'fromA' };
        const putResultA1 = await dbA.put(jsonA1);
        const jsonA2 = { _id: '2', name: 'fromA' };
        const putResultA2 = await dbA.put(jsonA2);
        const remoteA = dbA.getRemote(remoteURL);
        await remoteA.tryPush();

        // B updates and puts the same file and syncs
        const jsonB1 = { _id: '1', name: 'fromB' };
        const putResultB1 = await dbB.put(jsonB1);
        const remoteB = dbB.getRemote(remoteURL);

        const syncResult1 = (await remoteB.trySync()) as SyncResultResolveConflictsAndPush;
        // overwrite theirs by ours
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
            add: [],
            modify: [
              {
                id: jsonB1._id,
                file_sha: putResultB1.file_sha,
                doc: jsonB1,
              },
            ], // Must be 1, because jsonA1 is overwritten by jsonB1
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

      test.skip('case (): put and remove the same file', async () => {
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
        await dbA.open(options);
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
        await dbB.open(options);

        const removeResultA1 = await dbA.remove(jsonA1);
        const jsonA2 = { _id: '2', name: 'fromA' };
        const putResultA2 = await dbA.put(jsonA2);

        // B updates and puts the same file and syncs
        const jsonB1 = { _id: '1', name: 'fromB' };
        const putResultB1 = await dbB.put(jsonB1);
        const remoteB = dbB.getRemote(remoteURL);

        const syncResult1 = (await remoteB.trySync()) as SyncResultResolveConflictsAndPush;
        // overwrite theirs by ours
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
            add: [],
            modify: [
              {
                id: jsonB1._id,
                file_sha: putResultB1.file_sha,
                doc: jsonB1,
              },
            ], // Must be 1, because jsonA1 is overwritten by jsonB1
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
   * Events
   */
  describe.skip('Events: ', () => {});

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

      await dbA.open(options);
      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);

      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameB,
        local_dir: localDir,
      });
      await dbB.open();

      await expect(dbB.sync(options)).rejects.toThrowError(NoMergeBaseFoundError);

      await dbA.destroy();
      await dbB.destroy();
    });
  });

  test.skip('Test network errors');

  test.skip('Multiple Sync');
});
