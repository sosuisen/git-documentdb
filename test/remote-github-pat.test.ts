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
  InvalidRepositoryURLError,
  NoMergeBaseFoundError,
  RepositoryNotOpenError,
  UndefinedPersonalAccessTokenError,
  UndefinedRemoteURLError,
} from '../src/error';
import { RemoteAccess } from '../src/crud/remote_access';
import { sleep } from '../src/utils';

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const idPool: string[] = [];
const allIds: string[] = [];
const MAX_ID = 40;
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

  const createRemoteRepository = async (gitDDB: GitDocumentDB, remoteURL: string) => {
    await new RemoteAccess(gitDDB, remoteURL, {
      live: false,
      auth: { type: 'github', personal_access_token: token },
    })
      .createRepositoryOnRemote(remoteURL)
      .catch(() => {});
  };

  const destroyRemoteRepository = async (gitDDB: GitDocumentDB, remoteURL: string) => {
    await new RemoteAccess(gitDDB, remoteURL, {
      live: false,
      auth: { type: 'github', personal_access_token: token },
    })
      .destroyRepositoryOnRemote(remoteURL)
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

      await createRemoteRepository(gitDDB, remoteURL);

      await expect(octokit.repos.listBranches({ owner, repo })).resolves.not.toThrowError();

      await destroyRemoteRepository(gitDDB, remoteURL);

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
        live: false,
        auth: {
          type: 'github',
          personal_access_token: '',
        },
      };
      await expect(gitDDB.sync('', options)).rejects.toThrowError(UndefinedRemoteURLError);
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
        live: false,
        auth: {
          type: 'github',
          personal_access_token: 'foobar',
        },
      };
      await expect(gitDDB.sync(remoteURL, options)).rejects.toThrowError(
        HttpProtocolRequiredError
      );
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
        live: false,
        auth: {
          type: 'github',
          personal_access_token: '',
        },
      };
      await expect(gitDDB.sync(remoteURL, options)).rejects.toThrowError(
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
        live: false,
        auth: {
          type: 'github',
          personal_access_token: 'foobar',
        },
      };
      await expect(gitDDB.sync(remoteURL, options)).rejects.toThrowError(
        InvalidRepositoryURLError
      );
      await gitDDB.destroy();
    });
  });

  /**
   * connectToRemote
   */
  describe('connectToRemote: ', () => {
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
        gitDDB.sync(remoteURL, {
          live: false,
          auth: { type: 'github', personal_access_token: token },
        })
      ).rejects.toThrowError(RepositoryNotOpenError);
      await gitDDB.destroy();
    });

    test('Create RemoteAccess with a new remote repository', async () => {
      const dbName = serialId();
      const remoteURL = remoteURLBase + dbName;
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.open();

      const options: RemoteOptions = {
        live: false,
        auth: { type: 'github', personal_access_token: token },
      };
      const repos = gitDDB.getRepository();
      const remote = new RemoteAccess(gitDDB, remoteURL, options);
      await expect(remote.connectToRemote(repos!)).resolves.toBe('push');
      expect(remote.upstream_branch).toBe(`origin/${gitDDB.defaultBranch}`);

      await gitDDB.destroy();
    });

    test('Create RemoteAccess with an existed remote repository', async () => {
      const dbName = serialId();
      const remoteURL = remoteURLBase + dbName;
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.open();

      const options: RemoteOptions = {
        live: false,
        auth: { type: 'github', personal_access_token: token },
      };
      await gitDDB.sync(remoteURL, options);
      // A remote repository has been created by the first sync().

      gitDDB.removeRemote(remoteURL);

      // Sync with an existed remote repository
      const repos = gitDDB.getRepository();
      const remote = new RemoteAccess(gitDDB, remoteURL, options);
      await expect(remote.connectToRemote(repos!)).resolves.toBe('nop');

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

      const remote = await gitDDB.sync(remoteURL, {
        live: false,
        auth: { type: 'github', personal_access_token: token },
      });
      expect(gitDDB.getRemote(remoteURL)).toBe(remote);

      await gitDDB.destroy();
    });
  });

  /**
   * Sync between two clients
   */
  describe('open() with remoteURL: ', () => {
    const localDir = `./test/database_remote_by_pat_${monoId()}`;
    beforeAll(() => {
      // Remove local repositories
      fs.removeSync(path.resolve(localDir));
    });

    afterAll(() => {
      fs.removeSync(path.resolve(localDir));
    });

    describe('Local repos [no], remote repos [no]', () => {
      test('Create remote repository', async () => {
        const remoteURL = remoteURLBase + serialId();

        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        const options: RemoteOptions = {
          live: false,
          auth: { type: 'github', personal_access_token: token },
        };
        // Check dbInfo
        await expect(dbA.open(remoteURL, options)).resolves.toMatchObject({
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
        await expect(
          octokit.repos.listBranches({ owner, repo })
        ).resolves.not.toThrowError();

        await dbA.destroy();
      });
    });
  });

  describe('A is empty, creates remote, puts data; B is empty, clones the remote: ', () => {
    const localDir = `./test/database_remote_by_pat_${monoId()}`;
    beforeAll(() => {
      // Remove local repositories
      fs.removeSync(path.resolve(localDir));
    });

    afterAll(() => {
      // fs.removeSync(path.resolve(localDir));
    });

    test('B checks cloned document', async () => {
      const remoteURL = remoteURLBase + serialId();

      const dbNameA = serialId();

      const dbA: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameA,
        local_dir: localDir,
      });
      const options: RemoteOptions = {
        live: false,
        auth: { type: 'github', personal_access_token: token },
      };
      await dbA.open(remoteURL, options);
      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);
      const remoteA = dbA.getRemote(remoteURL);
      await remoteA.tryPush();

      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameB,
        local_dir: localDir,
      });
      await dbB.open(remoteURL, options);
      await expect(dbB.get(jsonA1._id)).resolves.toMatchObject(jsonA1);

      await dbA.destroy();
      await dbB.destroy();
    });

    test('Race condition of two tryPush() calls', async () => {
      const remoteURL = remoteURLBase + serialId();

      const dbNameA = serialId();

      const dbA: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameA,
        local_dir: localDir,
      });
      const options: RemoteOptions = {
        live: false,
        auth: { type: 'github', personal_access_token: token },
      };
      await dbA.open(remoteURL, options);
      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);
      const remoteA = dbA.getRemote(remoteURL);

      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameB,
        local_dir: localDir,
      });
      await dbB.open(remoteURL, options);
      const jsonB1 = { _id: '1', name: 'fromB' };
      await dbB.put(jsonB1);
      const remoteB = dbB.getRemote(remoteURL);

      await expect(
        Promise.all([remoteA.tryPush(), remoteB.tryPush()])
      ).rejects.toThrowError(CannotPushBecauseUnfetchedCommitExistsError);

      await dbA.destroy();
      await dbB.destroy();
    });

    test('Ordered condition of two tryPush() calls', async () => {
      const remoteURL = remoteURLBase + serialId();

      const dbNameA = serialId();

      const dbA: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameA,
        local_dir: localDir,
      });
      const options: RemoteOptions = {
        live: false,
        auth: { type: 'github', personal_access_token: token },
      };
      await dbA.open(remoteURL, options);
      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);
      const remoteA = dbA.getRemote(remoteURL);

      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameB,
        local_dir: localDir,
      });
      await dbB.open(remoteURL, options);
      const jsonB1 = { _id: '1', name: 'fromB' };
      await dbB.put(jsonB1);
      const remoteB = dbB.getRemote(remoteURL);

      await remoteA.tryPush();
      await expect(remoteB.tryPush()).rejects.toThrowError(
        CannotPushBecauseUnfetchedCommitExistsError
      );

      await dbA.destroy();
      await dbB.destroy();
    });

    test('Race condition of two trySync() calls: trySync() again by hand before retrySync()', async () => {
      const remoteURL = remoteURLBase + serialId();

      const dbNameA = serialId();

      const dbA: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameA,
        local_dir: localDir,
      });
      const options: RemoteOptions = {
        live: false,
        auth: { type: 'github', personal_access_token: token },
      };
      await dbA.open(remoteURL, options);
      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);
      const remoteA = dbA.getRemote(remoteURL);

      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameB,
        local_dir: localDir,
      });
      await dbB.open(remoteURL, options);
      const jsonB1 = { _id: '2', name: 'fromB' };
      await dbB.put(jsonB1);
      const remoteB = dbB.getRemote(remoteURL);

      const [resultA, resultB] = await Promise.all([
        remoteA.trySync().catch(() => undefined),
        remoteB.trySync().catch(() => undefined),
      ]);
      // CannotPushBecauseUnfetchedCommitExistsError
      expect(resultA === undefined || resultB === undefined).toBe(true);
      if (resultA === undefined) {
        await expect(remoteA.trySync('1')).resolves.toBe('merge and push');
      }
      else {
        await expect(remoteB.trySync('1')).resolves.toBe('merge and push');
      }

      await dbA.destroy();
      await dbB.destroy();
    });

    test('Race condition of two trySync() calls: retrySync() will occur (interval 0ms) before trySync by hand', async () => {
      const remoteURL = remoteURLBase + serialId();

      const dbNameA = serialId();

      const dbA: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameA,
        local_dir: localDir,
      });
      // Set interval to 0ms
      const options: RemoteOptions = {
        live: false,
        auth: { type: 'github', personal_access_token: token },
        interval: 0,
      };
      await dbA.open(remoteURL, options);
      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);
      const remoteA = dbA.getRemote(remoteURL);

      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameB,
        local_dir: localDir,
      });
      await dbB.open(remoteURL, options);
      const jsonB1 = { _id: '2', name: 'fromB' };
      await dbB.put(jsonB1);
      const remoteB = dbB.getRemote(remoteURL);

      const [resultA, resultB] = await Promise.all([
        remoteA.trySync().catch(() => undefined),
        remoteB.trySync().catch(() => undefined),
      ]);
      // CannotPushBecauseUnfetchedCommitExistsError

      // Problem has been solved automatically by retrySync(),
      // so next trySync do nothing.
      await sleep(3000);
      if (resultA === undefined) {
        await expect(remoteA.trySync('1')).resolves.toBe('nop');
      }
      else {
        await expect(remoteB.trySync('1')).resolves.toBe('nop');
      }

      await dbA.destroy();
      await dbB.destroy();
    });

    test('Resolve conflict', async () => {
      const remoteURL = remoteURLBase + serialId();

      const dbNameA = serialId();

      const dbA: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameA,
        local_dir: localDir,
      });
      const options: RemoteOptions = {
        live: false,
        auth: { type: 'github', personal_access_token: token },
      };
      await dbA.open(remoteURL, options);
      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);
      const remoteA = dbA.getRemote(remoteURL);

      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameB,
        local_dir: localDir,
      });
      await dbB.open(remoteURL, options);
      // The same id
      const jsonB1 = { _id: '1', name: 'fromB' };
      await dbB.put(jsonB1);
      const remoteB = dbB.getRemote(remoteURL);

      await remoteA.tryPush();
      await expect(remoteB.trySync()).resolves.toBe('resolve conflicts and push');

      await dbA.destroy();
      await dbB.destroy();
    });
  });

  describe('Test live', () => {
    const localDir = `./test/database_remote_by_pat_${monoId()}`;
    test('Live starts from open(): Check if live starts', async () => {
      const remoteURL = remoteURLBase + serialId();

      const dbNameA = serialId();

      const dbA: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameA,
        local_dir: localDir,
      });
      const interval = 3000;
      const options: RemoteOptions = {
        live: true,
        sync_direction: 'both',
        interval,
        auth: { type: 'github', personal_access_token: token },
      };
      await dbA.open(remoteURL, options);

      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);

      const remoteA = dbA.getRemote(remoteURL);
      expect(remoteA.getLiveStatus()).toBeTruthy();
      expect(remoteA.getInterval()).toBe(interval);

      // Wait live sync()
      while (dbA.statistics().taskCount.sync === 0) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(500);
      }

      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameB,
        local_dir: localDir,
      });
      await dbB.open(remoteURL, options);
      await expect(dbB.get(jsonA1._id)).resolves.toMatchObject(jsonA1);

      await dbA.destroy();
      await dbB.destroy();
    });
    test.skip('cancel()', () => {
      // check getLiveStatus()
    });
    test.skip('pause()', () => {});
    test.skip('resume()', () => {});

    test.skip('Check intervals', () => {
      // getInterval
    });
    test.skip('Check skip of consecutive sync tasks', () => {});
  });

  describe.skip('Test retry options ', () => {
    test.skip('Check retry counter', () => {});
    test.skip('Check retry interval', () => {});
    test.skip('Cancel retrying', () => {
      // nop（成功） でリトライやめること。
    });
  });

  describe.skip('Remote exists; B is empty, clones the remote; B closes and opens again with remote params: ', () => {});
  describe.skip('Remote exists; B is empty, clones the remote; B closes and opens again, calls sync() with remote params: ', () => {});
  describe.skip('A is not empty, starts sync(), creates remote, puts data; B is empty, clones the remote: ', () => {});

  // Do later
  describe.skip('A is not empty, starts sync(), creates remote, puts data; B is not empty, clone invokes no_merge_base: ', () => {
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
        live: false,
        auth: { type: 'github', personal_access_token: token },
      };

      await dbA.open(remoteURL, options);
      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);

      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameB,
        local_dir: localDir,
      });
      await dbB.open();

      await expect(dbB.sync(remoteURL, options)).rejects.toThrowError(
        NoMergeBaseFoundError
      );

      await dbA.destroy();
      await dbB.destroy();
    });
  });
  test.skip('Remove remote');
  test.skip('Test network errors');
  test.skip('Test _addRemoteRepository');
});
