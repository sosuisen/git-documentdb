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
import { RemoteOptions } from '../src/types';
import {
  CannotPushBecauseUnfetchedCommitExistsError,
  HttpProtocolRequiredError,
  IntervalTooSmallError,
  InvalidRepositoryURLError,
  NoMergeBaseFoundError,
  RepositoryNotOpenError,
  UndefinedPersonalAccessTokenError,
  UndefinedRemoteURLError,
} from '../src/error';
import {
  defaultRetry,
  defaultRetryInterval,
  minimumSyncInterval,
  Sync,
} from '../src/remote/sync';
import { sleep } from '../src/utils';
import { RemoteRepository } from '../src/remote/remote_repository';

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const idPool: string[] = [];
const allIds: string[] = [];
const MAX_ID = 90;
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
  describe('constructor: ', () => {
    const localDir = `./test/database_remote_by_pat_${monoId()}`;
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
  describe('connect(): ', () => {
    const localDir = `./test/database_remote_by_pat_${monoId()}`;
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
  describe('Operate remote repository: ', () => {
    const localDir = `./test/database_remote_by_pat_${monoId()}`;
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

  describe('Check push result', () => {
    const localDir = `./test/database_remote_by_pat_${monoId()}`;

    test('put once followed by push', async () => {
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

      // Put and push
      const jsonA1 = { _id: '1', name: 'fromA' };
      const putResult = await dbA.put(jsonA1);
      const remoteA = dbA.getRemote(remoteURL);
      const syncResult = await remoteA.tryPush();
      expect(syncResult.operation).toBe('push');
      expect(syncResult.commits!.length).toBe(1);
      expect(syncResult.commits![0].id).toBe(putResult.commit_sha);
      expect(syncResult.changes!.add.length).toBe(1); // A file is added
      expect(syncResult.changes!.add[0].doc).toMatchObject(jsonA1);

      // Put and push the same document again

      // This document is same as the previous document.
      // put() executes a commit though no change is occurred on the document.
      // (This behavior aligns with put() API)
      const putResult2 = await dbA.put(jsonA1);
      const syncResult2 = await remoteA.tryPush();
      expect(syncResult2.operation).toBe('push');
      expect(syncResult2.commits!.length).toBe(1);
      expect(syncResult2.commits![0].id).toBe(putResult2.commit_sha);
      expect(syncResult2.changes!.add.length).toBe(0);
      expect(syncResult2.changes!.modify.length).toBe(0); // No file change

      // Put and push an updated document
      const jsonA1dash = { _id: '1', name: 'updated' };
      const putResult3 = await dbA.put(jsonA1dash);
      const syncResult3 = await remoteA.tryPush();
      expect(syncResult3.operation).toBe('push');
      expect(syncResult3.commits!.length).toBe(1);
      expect(syncResult3.commits![0].id).toBe(putResult3.commit_sha);
      expect(syncResult3.changes!.add.length).toBe(0);
      expect(syncResult3.changes!.modify.length).toBe(1);
      expect(syncResult3.changes!.modify[0].doc).toMatchObject(jsonA1dash);

      // Put and push another document
      const jsonA4 = { _id: '2', name: 'fromA' };
      const putResult4 = await dbA.put(jsonA4);
      const syncResult4 = await remoteA.tryPush();
      expect(syncResult4.operation).toBe('push');
      expect(syncResult4.commits!.length).toBe(1);
      expect(syncResult4.commits![0].id).toBe(putResult4.commit_sha);
      expect(syncResult4.changes!.add.length).toBe(1);
      expect(syncResult4.changes!.add[0].doc).toMatchObject(jsonA4);
      expect(syncResult4.changes!.modify.length).toBe(0);

      await dbA.destroy();
    });

    test('put twice followed by push', async () => {
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

      // Two put commands and push
      const jsonA1 = { _id: '1', name: 'fromA' };
      const putResult1 = await dbA.put(jsonA1);
      const jsonA2 = { _id: '2', name: 'fromA' };
      const putResult2 = await dbA.put(jsonA2);
      const remoteA = dbA.getRemote(remoteURL);
      const syncResult = await remoteA.tryPush();
      expect(syncResult.operation).toBe('push');
      expect(syncResult.commits!.length).toBe(2);
      expect(syncResult.commits![0].id).toBe(putResult1.commit_sha);
      expect(syncResult.commits![1].id).toBe(putResult2.commit_sha);
      expect(syncResult.changes!.add.length).toBe(2);

      // put an updated document and another document
      const jsonA1dash = { _id: '1', name: 'updated' };
      const putResult3 = await dbA.put(jsonA1dash);
      const jsonA4 = { _id: '4', name: 'fromA' };
      const putResult4 = await dbA.put(jsonA4);
      const syncResult2 = await remoteA.tryPush();
      expect(syncResult2.operation).toBe('push');
      expect(syncResult2.commits!.length).toBe(2);
      expect(syncResult2.commits![0].id).toBe(putResult3.commit_sha);
      expect(syncResult2.commits![1].id).toBe(putResult4.commit_sha);
      expect(syncResult2.changes!.add.length).toBe(1);
      expect(syncResult2.changes!.add[0].doc).toMatchObject(jsonA4);
      expect(syncResult2.changes!.modify.length).toBe(1);
      expect(syncResult2.changes!.modify[0].doc).toMatchObject(jsonA1dash);

      await dbA.destroy();
    });

    test('put and remove followed by push', async () => {
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
      const remoteA = dbA.getRemote(remoteURL);
      await remoteA.tryPush();

      // Remove the previous put document
      const removeResult1 = await dbA.remove(jsonA1);
      const syncResult1 = await remoteA.tryPush();
      expect(syncResult1.operation).toBe('push');
      expect(syncResult1.commits!.length).toBe(1);
      expect(syncResult1.commits![0].id).toBe(removeResult1.commit_sha);
      expect(syncResult1.changes!.add.length).toBe(0);
      expect(syncResult1.changes!.modify.length).toBe(0);
      expect(syncResult1.changes!.remove.length).toBe(1);
      expect(syncResult1.changes!.remove[0].id).toBe('1');

      // Put and remove a document
      const putResult2 = await dbA.put(jsonA1);
      const removeResult2 = await dbA.remove(jsonA1);
      const syncResult2 = await remoteA.tryPush();
      expect(syncResult2.operation).toBe('push');
      expect(syncResult2.commits!.length).toBe(2);
      expect(syncResult2.commits![0].id).toBe(putResult2.commit_sha);
      expect(syncResult2.commits![1].id).toBe(removeResult2.commit_sha);
      expect(syncResult2.changes!.add.length).toBe(0); // Must not be 1 but 0, because diff is empty.
      expect(syncResult2.changes!.modify.length).toBe(0);
      expect(syncResult2.changes!.remove.length).toBe(0); // Must no be 1 but 0, because diff is empty.

      await dbA.destroy();
    });
  });

  describe.skip('Check sync result', () => {
    const localDir = `./test/database_remote_by_pat_${monoId()}`;

    test.skip('Fast-forward merge: add one file', async () => {
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

      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameB,
        local_dir: localDir,
      });
      // Clone dbA
      await dbB.open(options);

      // A puts and pushes
      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);
      const remoteA = dbA.getRemote(remoteURL);
      await remoteA.tryPush();

      // B syncs
      const remoteB = dbB.getRemote(remoteURL);
      const result = await remoteB.trySync();
      console.log('#Fast-forward merge: add 1.json');
      console.log(JSON.stringify(result));

      await dbA.destroy();
      await dbB.destroy();
    });

    test('Fast-forward merge: add two files', async () => {
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
      await dbA.put(jsonA1);
      await dbA.put(jsonA2);
      const remoteA = dbA.getRemote(remoteURL);
      await remoteA.tryPush();

      // B syncs
      const remoteB = dbB.getRemote(remoteURL);
      const result = await remoteB.trySync();
      console.log('#Fast-forward merge: add 1.json, 2.json');
      console.log(JSON.stringify(result));

      await dbA.destroy();
      await dbB.destroy();
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
      const localDir = `./test/database_remote_by_pat_${monoId()}`;
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
