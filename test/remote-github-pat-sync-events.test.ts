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
import { Octokit } from '@octokit/rest';
import { monotonicFactory } from 'ulid';
import { GitDocumentDB } from '../src';
import {
  RemoteOptions,
  SyncResult,
  SyncResultFastForwardMerge,
  SyncResultMergeAndPush,
  SyncResultPush,
  SyncResultResolveConflictsAndPush,
} from '../src/types';
import { NoMergeBaseFoundError } from '../src/error';
import { sleep } from '../src/utils';

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

maybe('remote: use personal access token: events: ', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  const localDir = `./test/database_remote_by_pat_${monoId()}`;

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
   * Events
   */
  describe('change: ', () => {
    test('change once', async () => {
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
      let result: SyncResultFastForwardMerge | undefined;
      remoteB.on('change', syncResult => {
        result = syncResult as SyncResultFastForwardMerge;
      });
      await remoteB.trySync();

      // Wait change event occurs
      await sleep(1000);

      expect(result!.operation).toBe('fast-forward merge');
      expect(result!.commits!.local.length).toBe(1);
      expect(result!.commits!.local[0].id).toBe(putResult1.commit_sha);
      expect(result!.changes.local.add.length).toBe(1);
      expect(result!.changes.local.modify.length).toBe(0);
      expect(result!.changes.local.remove.length).toBe(0);
      expect(result!.changes.local.add[0].doc).toMatchObject(jsonA1);

      await dbA.destroy().catch(e => console.debug(e));
      await dbB.destroy().catch(e => console.debug(e));
    });
  });
});
