/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

/**
 * Test remote_repository.ts
 * by using GitHub Personal Access Token
 * These tests create a new repository on GitHub if not exists.
 */
import path from 'path';
import { Octokit } from '@octokit/rest';
import fs from 'fs-extra';
import { GitDocumentDB } from '../../src';
import { RemoteOptions } from '../../src/types';
import {
  createRemoteRepository,
  destroyRemoteRepository,
  removeRemoteRepositories,
} from '../remote_utils';

const reposPrefix = 'test_remote_repository___';
const localDir = `./test/database_remote_repository`;

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

maybe('remote: sync: remote_repository: ', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  beforeAll(async () => {
    // Remove remote
    await removeRemoteRepositories(reposPrefix);
  });

  test('Create and remove remote repository by personal access token', async () => {
    const remoteURL = remoteURLBase + serialId();

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

  test('Create remote repository in GitDocumentDB#create()', async () => {
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
    await expect(dbA.create(options)).resolves.toMatchObject({
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

  test.skip('Remove remote repository');

  describe('Network errors: ', () => {
    test.skip('Check CannotCreateRemoteRepository and retries in creating remote repository', async () => {});
  });
});
