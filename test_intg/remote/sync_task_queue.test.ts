/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

/**
 * Test lifecycle of synchronization (open, sync, tryPush, trySync, retrySync)
 * by using GitHub Personal Access Token
 * These tests create a new repository on GitHub if not exists.
 */
import path from 'path';
import fs from 'fs-extra';
import { GitDocumentDB } from '../../src';
import { RemoteOptions } from '../../src/types';
import { sleep } from '../../src/utils';
import { destroyDBs, removeRemoteRepositories } from '../../test/remote_utils';

const reposPrefix = 'test_remote_task_queue___';
const localDir = `./test_intg/database_sync_task_queue`;

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
  fs.removeSync(path.resolve(localDir));
});

// GITDDB_GITHUB_USER_URL: URL of your GitHub account
// e.g.) https://github.com/foo/
const maybe =
  process.env.GITDDB_GITHUB_USER_URL && process.env.GITDDB_PERSONAL_ACCESS_TOKEN
    ? describe
    : describe.skip;

// Test lifecycle (open, sync, tryPush, trySync, retrySync)
maybe('remote: task_queue: ', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  beforeAll(async () => {
    await removeRemoteRepositories(reposPrefix);
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
    await dbA.create(options);

    const jsonA1 = { _id: '1', name: 'fromA' };
    await dbA.put(jsonA1);

    const remoteA = dbA.getRemote(remoteURL);

    for (let i = 0; i < 10; i++) {
      remoteA.trySync();
    }
    await sleep(5000);
    expect(dbA.taskQueue.statistics().sync).toBe(1);

    await destroyDBs([dbA]);
  });
});
