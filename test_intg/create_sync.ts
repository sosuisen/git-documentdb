/* eslint-disable @typescript-eslint/naming-convention */
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
import { GitDocumentDB } from '../src';
import { RemoteOptions } from '../src/types';
import { destroyDBs, removeRemoteRepositories } from '../test/remote_utils';
import { CannotConnectError } from '../src/error';
import { NETWORK_RETRY } from '../src/const';

const reposPrefix = 'test_remote_repository___';
const localDir = `./test/database_remote_repository`;

let idCounter = 0;
const serialId = () => {
  return `${reposPrefix}${idCounter++}`;
};

beforeEach(function () {
  // @ts-ignore
  console.log(`... ${this.currentTest.fullTitle()}`);
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
  process.env.GITDDB_GITHUB_USER_URL && process.env.GITDDB_personalAccessToken
    ? describe
    : describe.skip;

maybe('intg: <create_sync>: create DB with Sync: ', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_personalAccessToken!;

  beforeAll(async () => {
    // Remove remote
    await removeRemoteRepositories(reposPrefix);
  });

  describe('createDB()', () => {
    it('creates a remote repository on GitHub by using personal access token', async () => {
      const remoteURL = remoteURLBase + serialId();

      const dbNameA = serialId();

      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameA,
        localDir: localDir,
      });
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection: { type: 'github', personalAccessToken: token },
      };
      // Check dbInfo
      await expect(dbA.createDB(options)).resolves.toMatchObject({
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

      destroyDBs([dbA]);
    });

    it('throws CannotConnectError and retries in cloning', async () => {
      const remoteURL = 'https://xyz.invalid/xyz/https_repos';
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection: { type: 'github', personalAccessToken: token },
      };
      const dbNameA = serialId();
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameA,
        localDir: localDir,
      });
      await expect(dbA.createDB(options)).rejects.toThrowError(CannotConnectError);
      await dbA.destroy();

      const retry = await dbA.createDB(options).catch((err: CannotConnectError) => {
        return err.retry;
      });
      expect(retry).toBe(NETWORK_RETRY);

      await dbA.destroy();
    });
  });
});
