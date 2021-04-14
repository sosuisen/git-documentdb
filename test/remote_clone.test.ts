/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

/**
 * Test clone
 * by using GitHub Personal Access Token
 */
import path from 'path';
import fs from 'fs-extra';
import { GitDocumentDB } from '../src';
import { RemoteOptions } from '../src/types';
import { CannotConnectError } from '../src/error';
import { removeRemoteRepositories } from './remote_utils';
import { NETWORK_RETRY } from '../src/const';

const reposPrefix = 'test_clone___';
const localDir = `./test/database_remote_github_pat_remote_repository`;

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

maybe('remote: clone in GitDocumentDB#create(): ', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  beforeAll(async () => {
    // Remove remote
    await removeRemoteRepositories(reposPrefix);
  });

  test('Check CannotConnectError and retries in cloning', async () => {
    const remoteURL = 'https://xyz.invalid/xyz/https_repos';
    const options: RemoteOptions = {
      remote_url: remoteURL,
      auth: { type: 'github', personal_access_token: token },
    };
    const dbNameA = serialId();
    const dbA: GitDocumentDB = new GitDocumentDB({
      db_name: dbNameA,
      local_dir: localDir,
    });
    await expect(dbA.create(options)).rejects.toThrowError(CannotConnectError);
    await dbA.destroy();

    const retry = await dbA.create(options).catch((err: CannotConnectError) => {
      return err.retry;
    });
    expect(retry).toBe(NETWORK_RETRY);

    await dbA.destroy();
  });
});
