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
import { CannotPushBecauseUnfetchedCommitExistsError } from '../src/error';
import { defaultRetry } from '../src/remote/sync';
import { sleep } from '../src/utils';
import { RemoteRepository } from '../src/remote/remote_repository';

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const idPool: string[] = [];
const allIds: string[] = [];
const MAX_ID = 80;
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
   * Initialize synchronization by open() with remoteURL
   * Initialize means creating local and remote repositories by using a remote_url
   */
  describe('Initialize synchronization by open(): ', () => {
    /**
     * Basics: A is empty, creates remote, puts data; B is empty, clones the remote
     */
    describe('Basics: A puts data; B clones the remote: ', () => {
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
          remote_url: remoteURL,
          auth: { type: 'github', personal_access_token: token },
        };
        await dbA.open(options);
        const jsonA1 = { _id: '1', name: 'fromA' };
        await dbA.put(jsonA1);
        const remoteA = dbA.getRemote(remoteURL);
        await remoteA.tryPush();

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameB,
          local_dir: localDir,
        });
        await dbB.open(options);
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
          remote_url: remoteURL,
          auth: { type: 'github', personal_access_token: token },
        };
        await dbA.open(options);
        const jsonA1 = { _id: '1', name: 'fromA' };
        await dbA.put(jsonA1);
        const remoteA = dbA.getRemote(remoteURL);

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameB,
          local_dir: localDir,
        });
        await dbB.open(options);
        const jsonB1 = { _id: '1', name: 'fromB' };
        await dbB.put(jsonB1);
        const remoteB = dbB.getRemote(remoteURL);

        await expect(
          Promise.all([remoteA.tryPush(), remoteB.tryPush()])
        ).rejects.toThrowError(CannotPushBecauseUnfetchedCommitExistsError);

        /**
         * TODO:
         * Memory may leak when CannotPushBecauseUnfetchedCommitExistsError occurs.
         * Some files cannot be removed because they are used by a process.
         */
        await dbA.destroy().catch(err => console.log(err));
        await dbB.destroy().catch(err => console.log(err));
      });

      test('Ordered condition of two tryPush() calls', async () => {
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

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameB,
          local_dir: localDir,
        });
        await dbB.open(options);
        const jsonB1 = { _id: '1', name: 'fromB' };
        await dbB.put(jsonB1);
        const remoteB = dbB.getRemote(remoteURL);

        await remoteA.tryPush();
        await expect(remoteB.tryPush()).rejects.toThrowError(
          CannotPushBecauseUnfetchedCommitExistsError
        );

        /**
         * TODO:
         * Memory may leak when CannotPushBecauseUnfetchedCommitExistsError occurs.
         * Some files cannot be removed because they are used by a process.
         */
        await dbA.destroy().catch(err => console.log(err));
        await dbB.destroy().catch(err => console.log(err));
      });

      test('Race condition of two trySync() calls: trySync() again by hand before retrySync()', async () => {
        console.log(
          '## Race condition of two trySync() calls: trySync() again by hand before retrySync()'
        );
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

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameB,
          local_dir: localDir,
        });
        await dbB.open(options);
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
          await expect(remoteA.trySync('1')).resolves.toMatchObject({
            operation: 'merge and push',
          });
        }
        else {
          await expect(remoteB.trySync('1')).resolves.toMatchObject({
            operation: 'merge and push',
          });
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
        // Set retry interval to 0ms
        const options: RemoteOptions = {
          remote_url: remoteURL,
          auth: { type: 'github', personal_access_token: token },
          retry_interval: 0,
        };
        await dbA.open(options);
        const jsonA1 = { _id: '1', name: 'fromA' };
        await dbA.put(jsonA1);
        const remoteA = dbA.getRemote(remoteURL);

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameB,
          local_dir: localDir,
        });
        await dbB.open(options);
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
          await expect(remoteA.trySync('1')).resolves.toMatchObject({ operation: 'nop' });
        }
        else {
          await expect(remoteB.trySync('1')).resolves.toMatchObject({ operation: 'nop' });
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
          remote_url: remoteURL,
          auth: { type: 'github', personal_access_token: token },
        };
        await dbA.open(options);
        const jsonA1 = { _id: '1', name: 'fromA' };
        await dbA.put(jsonA1);
        const remoteA = dbA.getRemote(remoteURL);

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameB,
          local_dir: localDir,
        });
        await dbB.open(options);
        // The same id
        const jsonB1 = { _id: '1', name: 'fromB' };
        await dbB.put(jsonB1);
        const remoteB = dbB.getRemote(remoteURL);

        await remoteA.tryPush();
        await expect(remoteB.trySync()).resolves.toMatchObject({
          operation: 'resolve conflicts and push',
        });

        await dbA.destroy();
        await dbB.destroy();
      });
    });

    /**
     * Sync automatically (live)
     */
    describe('Sync automatically (live): ', () => {
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
          remote_url: remoteURL,
          live: true,
          sync_direction: 'both',
          interval,
          auth: { type: 'github', personal_access_token: token },
        };
        await dbA.open(options);

        const jsonA1 = { _id: '1', name: 'fromA' };
        await dbA.put(jsonA1);

        const remoteA = dbA.getRemote(remoteURL);
        expect(remoteA.options().live).toBeTruthy();
        expect(remoteA.options().interval).toBe(interval);

        // Wait live sync()
        while (dbA.taskQueue.statistics().sync === 0) {
          // eslint-disable-next-line no-await-in-loop
          await sleep(500);
        }

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameB,
          local_dir: localDir,
        });
        await dbB.open(options);
        await expect(dbB.get(jsonA1._id)).resolves.toMatchObject(jsonA1);
        await dbA.destroy();
        await dbB.destroy();
      });

      test('cancel()', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        const interval = 1000;
        const options: RemoteOptions = {
          remote_url: remoteURL,
          live: true,
          sync_direction: 'both',
          interval,
          auth: { type: 'github', personal_access_token: token },
        };
        await dbA.open(options);

        const remoteA = dbA.getRemote(remoteURL);
        expect(remoteA.options().live).toBeTruthy();
        const count = dbA.taskQueue.statistics().sync;
        remoteA.cancel();
        await sleep(3000);
        expect(remoteA.options().live).toBeFalsy();
        expect(dbA.taskQueue.statistics().sync).toBe(count);

        await dbA.destroy();
      });

      test('pause() and resume()', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        const interval = 1000;
        const options: RemoteOptions = {
          remote_url: remoteURL,
          live: true,
          sync_direction: 'both',
          interval,
          auth: { type: 'github', personal_access_token: token },
        };
        await dbA.open(options);

        const remoteA = dbA.getRemote(remoteURL);
        expect(remoteA.options().live).toBeTruthy();
        const count = dbA.taskQueue.statistics().sync;
        expect(remoteA.pause()).toBeTruthy();
        expect(remoteA.pause()).toBeFalsy(); // ignored

        await sleep(3000);
        expect(remoteA.options().live).toBeFalsy();
        expect(dbA.taskQueue.statistics().sync).toBe(count);

        expect(remoteA.resume()).toBeTruthy();
        expect(remoteA.resume()).toBeFalsy(); // ignored
        await sleep(3000);
        expect(remoteA.options().live).toBeTruthy();
        expect(dbA.taskQueue.statistics().sync).toBeGreaterThan(count);

        await dbA.destroy();
      });

      test('Cancel when gitDDB.close()', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        const interval = 1000;
        const options: RemoteOptions = {
          remote_url: remoteURL,
          live: true,
          sync_direction: 'both',
          interval,
          auth: { type: 'github', personal_access_token: token },
        };
        await dbA.open(options);

        const remoteA = dbA.getRemote(remoteURL);
        expect(remoteA.options().live).toBeTruthy();
        const count = dbA.taskQueue.statistics().sync;
        await dbA.close();

        remoteA.resume(); // resume() must be ignored after close();

        await sleep(3000);
        expect(remoteA.options().live).toBeFalsy();
        expect(dbA.taskQueue.statistics().sync).toBe(count);

        await dbA.destroy();
      });

      test('Check intervals', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        const interval = 1000;
        const options: RemoteOptions = {
          remote_url: remoteURL,
          live: true,
          sync_direction: 'both',
          interval,
          auth: { type: 'github', personal_access_token: token },
        };
        await dbA.open(options);

        const remoteA = dbA.getRemote(remoteURL);
        expect(remoteA.options().interval).toBe(interval);

        const jsonA1 = { _id: '1', name: 'fromA' };
        await dbA.put(jsonA1);
        // Wait live sync()
        while (dbA.taskQueue.statistics().sync === 0) {
          // eslint-disable-next-line no-await-in-loop
          await sleep(500);
        }
        remoteA.pause();

        const jsonA2 = { _id: '2', name: 'fromA' };
        await dbA.put(jsonA2);

        const currentCount = dbA.taskQueue.statistics().sync;
        // Change interval
        remoteA.resume({
          interval: 5000,
        });
        expect(remoteA.options().interval).toBe(5000);
        await sleep(3000);
        // Check count before next sync()
        expect(dbA.taskQueue.statistics().sync).toBe(currentCount);

        await dbA.destroy();
      });

      test('Repeat trySync() automatically', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        const interval = 1000;
        const options: RemoteOptions = {
          remote_url: remoteURL,
          live: true,
          sync_direction: 'both',
          interval,
          auth: { type: 'github', personal_access_token: token },
        };
        await dbA.open(options);

        const remoteA = dbA.getRemote(remoteURL);

        await sleep(10000);
        expect(dbA.taskQueue.statistics().sync).toBeGreaterThan(5);

        await dbA.destroy();
      });

      test('Check skip of consecutive sync tasks', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        const interval = 30000;
        const options: RemoteOptions = {
          remote_url: remoteURL,
          live: true,
          sync_direction: 'both',
          interval,
          auth: { type: 'github', personal_access_token: token },
        };
        await dbA.open(options);

        const jsonA1 = { _id: '1', name: 'fromA' };
        await dbA.put(jsonA1);

        const remoteA = dbA.getRemote(remoteURL);

        for (let i = 0; i < 10; i++) {
          remoteA.trySync();
        }
        await sleep(5000);
        expect(dbA.taskQueue.statistics().sync).toBe(1);

        await dbA.destroy();
      });
    });

    /**
     * Retry sync
     */
    describe('Retry sync: ', () => {
      const localDir = `./test/database_remote_by_pat_${monoId()}`;
      test('No retry', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        const optionsA: RemoteOptions = {
          remote_url: remoteURL,
          live: true,
          interval: 1000,
          sync_direction: 'both',
          auth: { type: 'github', personal_access_token: token },
        };
        await dbA.open(optionsA);

        const remoteA = dbA.getRemote(remoteURL);
        expect(remoteA.options().retry).toBe(defaultRetry);

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameB,
          local_dir: localDir,
        });
        const optionsB: RemoteOptions = {
          remote_url: remoteURL,
          retry: 0, // no retry
          retry_interval: 0,
          sync_direction: 'both',
          auth: { type: 'github', personal_access_token: token },
        };

        await dbB.open(optionsB);

        const jsonA1 = { _id: '1', name: 'fromA' };
        await dbA.put(jsonA1);
        await sleep(3000);

        const jsonB1 = { _id: '1', name: 'fromB' };
        await dbB.put(jsonB1);
        const remoteB = dbB.getRemote(remoteURL);

        await expect(remoteB.tryPush()).rejects.toThrowError(
          CannotPushBecauseUnfetchedCommitExistsError
        );
        const currentSyncCount = dbB.taskQueue.statistics().sync;
        await sleep(5000);
        expect(dbB.taskQueue.statistics().sync).toBe(currentSyncCount);

        /**
         * TODO:
         * Memory may leak when CannotPushBecauseUnfetchedCommitExistsError occurs.
         * Some files cannot be removed because they are used by a process.
         */
        await dbA.destroy().catch(err => console.log(err));
        await dbB.destroy().catch(err => console.log(err));
      });

      test('Check retry interval', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameA,
          local_dir: localDir,
        });
        const optionsA: RemoteOptions = {
          remote_url: remoteURL,
          live: true,
          interval: 1000,
          sync_direction: 'both',
          auth: { type: 'github', personal_access_token: token },
        };
        await dbA.open(optionsA);

        const remoteA = dbA.getRemote(remoteURL);
        expect(remoteA.options().retry).toBe(defaultRetry);

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          db_name: dbNameB,
          local_dir: localDir,
        });
        const optionsB: RemoteOptions = {
          remote_url: remoteURL,
          retry_interval: 2000,
          sync_direction: 'both',
          auth: { type: 'github', personal_access_token: token },
        };

        await dbB.open(optionsB);

        const jsonA1 = { _id: '1', name: 'fromA' };
        await dbA.put(jsonA1);
        // Wait sync
        await sleep(3000);

        const jsonB1 = { _id: '1', name: 'fromB' };
        await dbB.put(jsonB1);
        const remoteB = dbB.getRemote(remoteURL);

        await expect(remoteB.tryPush()).rejects.toThrowError(
          CannotPushBecauseUnfetchedCommitExistsError
        );
        const currentSyncCount = dbB.taskQueue.statistics().sync;
        console.log('sync count:' + dbB.taskQueue.statistics().sync);
        expect(dbB.taskQueue.statistics().sync).toBe(currentSyncCount);
        console.log('wait next sync');
        // Need to wait retry_interval(2sec) + sync processing time(about lesser than 5sec))
        await sleep(7000);
        expect(dbB.taskQueue.statistics().sync).toBeGreaterThanOrEqual(
          currentSyncCount + 1
        );

        /**
         * TODO:
         * Memory may leak when CannotPushBecauseUnfetchedCommitExistsError occurs.
         * Some files cannot be removed because they are used by a process.
         */
        await dbA.destroy().catch(err => console.log(err));
        await dbB.destroy().catch(err => console.log(err));
      });

      test.skip('More retries', () => {
        // Test this using behavior_for_no_merge_base option
      });
    });
  });

  /**
   * Initialize synchronization by sync() with remoteURL
   * Initialize means creating local and remote repositories by using a remote_url
   */
  describe('Initialize synchronization by sync()', () => {
    const localDir = `./test/database_remote_by_pat_${monoId()}`;

    test('Overload of sync()', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbNameA = serialId();

      const dbA: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameA,
        local_dir: localDir,
      });

      await dbA.open();
      const options: RemoteOptions = {
        live: true,
        interval: 1000,
        sync_direction: 'both',
        auth: { type: 'github', personal_access_token: token },
      };
      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);

      const remoteA = await dbA.sync(remoteURL, options);

      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameB,
        local_dir: localDir,
      });
      await dbB.open(options);
      await expect(dbB.get(jsonA1._id)).resolves.toMatchObject(jsonA1);

      await dbA.destroy();
      await dbB.destroy();
    });

    test('A initializes synchronization by sync(); B initializes synchronization by open(), clones the remote: ', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbNameA = serialId();

      const dbA: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameA,
        local_dir: localDir,
      });

      await dbA.open();
      const options: RemoteOptions = {
        remote_url: remoteURL,
        live: true,
        interval: 1000,
        sync_direction: 'both',
        auth: { type: 'github', personal_access_token: token },
      };
      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);

      const remoteA = await dbA.sync(options);

      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameB,
        local_dir: localDir,
      });
      await dbB.open(options);
      await expect(dbB.get(jsonA1._id)).resolves.toMatchObject(jsonA1);

      await dbA.destroy();
      await dbB.destroy();
    });

    test('A initializes synchronization by sync(); B initialize synchronization by open(), close(), open() again with no remote, following sync(): ', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbNameA = serialId();

      const dbA: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameA,
        local_dir: localDir,
      });

      await dbA.open();
      const options: RemoteOptions = {
        remote_url: remoteURL,
        live: true,
        interval: 1000,
        sync_direction: 'both',
        auth: { type: 'github', personal_access_token: token },
      };
      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);

      const remoteA = await dbA.sync(options);

      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameB,
        local_dir: localDir,
      });
      await dbB.open(options);
      await dbB.close();

      await dbB.open();
      const jsonB1 = { _id: '1', name: 'fromB' };
      await dbB.put(jsonB1);

      await dbB.sync(options);
      await expect(dbB.get(jsonB1._id)).resolves.toMatchObject(jsonB1);

      // Wait next sync()
      const count = dbA.taskQueue.statistics().sync;
      while (dbA.taskQueue.statistics().sync === count) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(500);
      }
      await expect(dbA.get(jsonA1._id)).resolves.toMatchObject(jsonB1);

      await dbA.destroy();
      await dbB.destroy();
    });
  });

  /**
   * Initialize synchronization by open() with remoteURL, close(), open() again with another remoteURL
   * Initialize means creating local and remote repositories by using a remote_url
   */
  describe.skip('Initialize synchronization by open() with remote_url, close(), open() again with another remote_url: ', () => {
    test.skip('Open() again with the same repository with another remote_url');
    test.skip('Open() again with a different repository with another remote_url', () => {
      // no merge base
    });
  });
  /**
   * Initialize synchronization by open() with remoteURL, close(), open() again with no remoteURL, following sync() with another remoteURL
   * Initialize means creating local and remote repositories by using a remote_url
   */
  describe('Initialize synchronization by open() with remote_url, close(), open() again with no remoteURL, following sync() with another remote_url: ', () => {
    test.skip('Open() again with the same repository with another remote_url');
    test.skip('Open() again with a different repository with another remote_url', () => {
      // no merge base
    });
  });
});