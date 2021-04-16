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
import {
  AuthenticationTypeNotAllowCreateRepositoryError,
  CannotConnectError,
  UndefinedPersonalAccessTokenError,
} from '../../src/error';
import { NETWORK_RETRY, NETWORK_RETRY_INTERVAL } from '../../src/const';
import {
  createRemoteRepository,
  destroyDBs,
  destroyRemoteRepository,
  removeRemoteRepositories,
} from '../remote_utils';
import { RemoteRepository } from '../../src/remote/remote_repository';

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

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

maybe('<remote/remote_repository> RemoteRepository', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  beforeAll(async () => {
    // Remove remote
    await removeRemoteRepositories(reposPrefix);
  });

  describe(': create()', () => {
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
      }).create();
      await expect(octokit.repos.listBranches({ owner, repo })).resolves.not.toThrowError();
    });

    it('throws UndefinedPersonalAccessTokenError()', async () => {
      const remoteURL = remoteURLBase + serialId();

      await expect(
        new RemoteRepository(remoteURL, {
          type: 'github',
          personal_access_token: undefined,
        }).create()
      ).rejects.toThrowError(UndefinedPersonalAccessTokenError);
    });

    it(`throws CannotConnectError() with ${NETWORK_RETRY} retries`, async () => {
      const remoteURL = remoteURLBase + serialId();
      await createRemoteRepository(remoteURL);

      const error = await new RemoteRepository(remoteURL, {
        type: 'github',
        personal_access_token: token,
      })
        .create()
        .catch(err => err);
      expect(error).toBeInstanceOf(CannotConnectError);
      expect((error as CannotConnectError).retry).toBe(NETWORK_RETRY);
    });

    it('throws AuthenticationTypeNotAllowCreateRepositoryError()', async () => {
      const remoteURL = remoteURLBase + serialId();

      await expect(
        new RemoteRepository(remoteURL, {
          type: 'none',
        }).create()
      ).rejects.toThrowError(AuthenticationTypeNotAllowCreateRepositoryError);
    });
  });

  describe(': destroy()', () => {
    it('removes a remote repository on GitHub by personal access token', async () => {
      const remoteURL = remoteURLBase + serialId();

      await createRemoteRepository(remoteURL);
      const octokit = new Octokit({
        auth: token,
      });
      const urlArray = remoteURL.split('/');
      const owner = urlArray[urlArray.length - 2];
      const repo = urlArray[urlArray.length - 1];

      await destroyRemoteRepository(remoteURL);

      await expect(octokit.repos.listBranches({ owner, repo })).rejects.toThrowError();
    });

    it('throws UndefinedPersonalAccessTokenError()', async () => {
      const remoteURL = remoteURLBase + serialId();

      await expect(
        new RemoteRepository(remoteURL, {
          type: 'github',
          personal_access_token: undefined,
        }).destroy()
      ).rejects.toThrowError(UndefinedPersonalAccessTokenError);
    });

    it(`throws CannotConnectError() with ${NETWORK_RETRY_INTERVAL} retries`, async () => {
      const remoteURL = remoteURLBase + serialId();

      const error = await new RemoteRepository(remoteURL, {
        type: 'github',
        personal_access_token: token,
      })
        .destroy()
        .catch(err => err);
      expect(error).toBeInstanceOf(CannotConnectError);
      expect((error as CannotConnectError).retry).toBe(NETWORK_RETRY);
    });

    it('throws AuthenticationTypeNotAllowCreateRepositoryError()', async () => {
      const remoteURL = remoteURLBase + serialId();

      await expect(
        new RemoteRepository(remoteURL, {
          type: 'none',
        }).destroy()
      ).rejects.toThrowError(AuthenticationTypeNotAllowCreateRepositoryError);
    });
  });

  describe(': _getOrCreateGitRemote()', () => {
    it('returns "add" when origin is undefined', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbName = monoId();
      const gitDDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.create();
      const remoteRepos = new RemoteRepository(remoteURL);
      // You can test private members by array access.
      // eslint-disable-next-line dot-notation
      const [result, remote] = await remoteRepos['_getOrCreateGitRemote'](
        gitDDB.repository()!,
        remoteURL
      );
      expect(result).toBe('add');

      destroyDBs([gitDDB]);
    });

    it('returns "change" when another origin exists', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbName = monoId();
      const gitDDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.create();
      const remoteRepos = new RemoteRepository(remoteURL);
      // You can test private members by array access.
      // eslint-disable-next-line dot-notation
      await remoteRepos['_getOrCreateGitRemote'](gitDDB.repository()!, remoteURL);

      const remoteURL2 = remoteURLBase + serialId();
      // eslint-disable-next-line dot-notation
      const [result, remote] = await remoteRepos['_getOrCreateGitRemote'](
        gitDDB.repository()!,
        remoteURL2
      );
      expect(result).toBe('change');

      destroyDBs([gitDDB]);
    });

    it('returns "exist" when the same origin exists', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbName = monoId();
      const gitDDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.create();
      const remoteRepos = new RemoteRepository(remoteURL);
      // You can test private members by array access.
      // eslint-disable-next-line dot-notation
      await remoteRepos['_getOrCreateGitRemote'](gitDDB.repository()!, remoteURL);

      const remoteURL2 = remoteURLBase + serialId();
      // eslint-disable-next-line dot-notation
      const [result, remote] = await remoteRepos['_getOrCreateGitRemote'](
        gitDDB.repository()!,
        remoteURL
      );
      expect(result).toBe('exist');

      destroyDBs([gitDDB]);
    });
  });

  describe(': _checkFetch()', () => {
    it.skip('');
  });

  describe(': _checkPush()', () => {
    it.skip('');
  });
});
