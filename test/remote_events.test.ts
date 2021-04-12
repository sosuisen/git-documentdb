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
import { SyncResultFastForwardMerge } from '../src/types';
import { sleep } from '../src/utils';
import { createClonedDatabases, removeRemoteRepositories } from './remote_utils';
import sinon from 'sinon';

const reposPrefix = 'test_pat_sync_events___';
const localDir = `./test/database_remote_events`;

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

maybe('remote: events: ', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  beforeAll(async () => {
    await removeRemoteRepositories(reposPrefix);
  });

  /**
   * Events
   */
  describe('change: ', () => {
    test('change once', async () => {
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
      let result: SyncResultFastForwardMerge | undefined;
      remoteB.on('change', syncResult => {
        result = syncResult as SyncResultFastForwardMerge;
      });
      let complete = false;
      remoteB.on('complete', () => {
        complete = true;
      });
      await remoteB.trySync();

      // eslint-disable-next-line no-unmodified-loop-condition
      while (!complete) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(1000);
      }

      expect(result!.action).toBe('fast-forward merge');
      expect(result!.commits!.local.length).toBe(1);
      expect(result!.commits!.local[0].id).toBe(putResult1.commit_sha);
      expect(result!.changes.local.length).toBe(1);

      expect(result!.changes.local).toEqual(
        expect.arrayContaining([
          {
            operation: 'create',
            data: {
              id: jsonA1._id,
              file_sha: putResult1.file_sha,
              doc: jsonA1,
            },
          },
        ])
      );

      await dbA.destroy().catch(e => console.debug(e));
      await dbB.destroy().catch(e => console.debug(e));
    });

    test.skip('localChange');
    test.skip('remoteChange');
    test.skip('paused');
    test.skip('active');
    test.skip('start');
    test.skip('complete');
    test.skip('error');
  });

  describe.skip('on and off', () => {});
});
