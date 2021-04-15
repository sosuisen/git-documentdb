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
import { NETWORK_RETRY_INTERVAL } from '../../src/const';
import { destroyRemoteRepository, removeRemoteRepositories } from '../remote_utils';
import { RemoteRepository } from '../../src/remote/remote_repository';

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
  process.env.GITDDB_GITHUB_USER_URL && process.env.GITDDB_PERSONAL_ACCESS_TOKEN
    ? describe
    : describe.skip;

maybe('<remote/remote_repository> RemoteRepository:', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  beforeAll(async () => {
    // Remove remote
    await removeRemoteRepositories(reposPrefix);
  });

  describe('create()', () => {
    it('creates a remote repository on GitHub by personal access token', async () => {
      const remoteURL = remoteURLBase + serialId();
      const octokit = new Octokit({
        auth: token,
      });
      const urlArray = remoteURL.split('/');
      const owner = urlArray[urlArray.length - 2];
      const repo = urlArray[urlArray.length - 1];

      await new RemoteRepository(remoteURL, {
        type: 'github',
        personal_access_token: token,
      })
        .create()
        .catch((err: Error) => {
          console.debug('Cannot create: ' + remoteURL);
          console.debug(err);
        });

      await expect(octokit.repos.listBranches({ owner, repo })).resolves.not.toThrowError();
    });

    it('throws UndefinedPersonalAccessTokenError()', async () => {});

    it(`throws CannotConnectError() with ${NETWORK_RETRY_INTERVAL} retries`, async () => {});

    it('throws AuthenticationTypeNotAllowCreateRepositoryError()', async () => {});
  });

  describe('destroy()', () => {
    it('removes a remote repository on GitHub by personal access token', async () => {
      const remoteURL = remoteURLBase + serialId();
      const octokit = new Octokit({
        auth: token,
      });
      const urlArray = remoteURL.split('/');
      const owner = urlArray[urlArray.length - 2];
      const repo = urlArray[urlArray.length - 1];

      await destroyRemoteRepository(remoteURL);

      await expect(octokit.repos.listBranches({ owner, repo })).rejects.toThrowError();
    });

    it('throws UndefinedPersonalAccessTokenError()', async () => {});

    it(`throws CannotConnectError() with ${NETWORK_RETRY_INTERVAL} retries`, async () => {});

    it('throws AuthenticationTypeNotAllowCreateRepositoryError()', async () => {});
  });

  describe('_getOrCreateGitRemote()', () => {
    it.skip('');
  });

  describe('connect()', () => {
    it.skip('');
  });

  describe('_checkFetch()', () => {
    it.skip('');
  });

  describe('_checkPush()', () => {
    it.skip('');
  });
});
