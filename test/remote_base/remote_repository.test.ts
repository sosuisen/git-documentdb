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
import expect from 'expect';
import fs from 'fs-extra';
import { monotonicFactory } from 'ulid';
import { Err } from '../../src/error';
import { NETWORK_RETRY, NETWORK_RETRY_INTERVAL } from '../../src/const';
import {
  createRemoteRepository,
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

before(() => {
  fs.removeSync(path.resolve(localDir));
});

after(() => {
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

  before(async () => {
    // Remove remote
    await removeRemoteRepositories(reposPrefix);
  });

  describe('create()', () => {
    it('throws InvalidAuthenticationTypeError', () => {
      const remoteURL = remoteURLBase + serialId();
      expect(() => {
        const repo = new RemoteRepository({
          remoteUrl: remoteURL,
          connection: {
            // @ts-ignore
            type: 'gitlab',
          },
        });
      });
    });

    it('creates a remote repository on GitHub by personal access token', async () => {
      const remoteURL = remoteURLBase + serialId();
      const octokit = new Octokit({
        auth: token,
      });
      const urlArray = remoteURL.split('/');
      const owner = urlArray[urlArray.length - 2];
      const repo = urlArray[urlArray.length - 1];

      await new RemoteRepository({
        remoteUrl: remoteURL,
        connection: {
          type: 'github',
          personalAccessToken: token,
        },
      }).create();
      await expect(octokit.repos.listBranches({ owner, repo })).resolves.not.toThrowError();
    });

    it('creates a remote repository by url which ends with .git.', async () => {
      let remoteURL = remoteURLBase + serialId();
      const octokit = new Octokit({
        auth: token,
      });
      const urlArray = remoteURL.split('/');
      const owner = urlArray[urlArray.length - 2];
      const repo = urlArray[urlArray.length - 1];

      remoteURL += '.git';
      await new RemoteRepository({
        remoteUrl: remoteURL,
        connection: {
          type: 'github',
          personalAccessToken: token,
        },
      }).create();
      await expect(octokit.repos.listBranches({ owner, repo })).resolves.not.toThrowError();
    });

    it('creates a private remote repository', async () => {
      const remoteURL = remoteURLBase + serialId();
      const octokit = new Octokit({
        auth: token,
      });
      const urlArray = remoteURL.split('/');
      const owner = urlArray[urlArray.length - 2];
      const repo = urlArray[urlArray.length - 1];

      await new RemoteRepository({
        remoteUrl: remoteURL,
        connection: {
          type: 'github',
          personalAccessToken: token,
          private: true,
        },
      }).create();
      const repos = await octokit.repos.get({ owner, repo });
      expect(repos.data.private).toBeTruthy();
    });

    it('creates a private remote repository by default', async () => {
      const remoteURL = remoteURLBase + serialId();
      const octokit = new Octokit({
        auth: token,
      });
      const urlArray = remoteURL.split('/');
      const owner = urlArray[urlArray.length - 2];
      const repo = urlArray[urlArray.length - 1];

      await new RemoteRepository({
        remoteUrl: remoteURL,
        connection: {
          type: 'github',
          personalAccessToken: token,
        },
      }).create();
      const repos = await octokit.repos.get({ owner, repo });
      expect(repos.data.private).toBeTruthy();
    });

    it('creates a public remote repository', async () => {
      const remoteURL = remoteURLBase + serialId();
      const octokit = new Octokit({
        auth: token,
      });
      const urlArray = remoteURL.split('/');
      const owner = urlArray[urlArray.length - 2];
      const repo = urlArray[urlArray.length - 1];

      await new RemoteRepository({
        remoteUrl: remoteURL,
        connection: {
          type: 'github',
          personalAccessToken: token,
          private: false,
        },
      }).create();
      const repos = await octokit.repos.get({ owner, repo });
      expect(repos.data.private).toBeFalsy();
    });

    it('throws UndefinedPersonalAccessTokenError()', async () => {
      const remoteURL = remoteURLBase + serialId();

      await expect(
        new RemoteRepository({
          remoteUrl: remoteURL,
          connection: {
            type: 'github',
            personalAccessToken: undefined,
          },
        }).create()
      ).rejects.toThrowError(Err.UndefinedPersonalAccessTokenError);
    });

    it('throws PersonalAccessTokenForAnotherAccountError()', async () => {
      const readonlyURL = 'https://github.com/sosuisen/' + serialId();

      await expect(
        new RemoteRepository({
          remoteUrl: readonlyURL,
          connection: {
            type: 'github',
            personalAccessToken: token, // This is valid but for another account.
          },
        }).create()
      ).rejects.toThrowError(Err.PersonalAccessTokenForAnotherAccountError);
    });

    it(`throws CannotConnectRemoteRepositoryError() with ${NETWORK_RETRY} retries`, async () => {
      const remoteURL = remoteURLBase + serialId();
      await createRemoteRepository(remoteURL);

      const error = await new RemoteRepository({
        remoteUrl: remoteURL,
        connection: {
          type: 'github',
          personalAccessToken: token,
        },
      })
        .create()
        .catch(err => err);
      expect(error).toBeInstanceOf(Err.CannotConnectRemoteRepositoryError);
      // This may be tested by using sinon.spy
      expect((error as Err.CannotConnectRemoteRepositoryError).retry).toBe(NETWORK_RETRY);
    });

    it('throws AuthenticationTypeNotAllowCreateRepositoryError()', async () => {
      const remoteURL = remoteURLBase + serialId();

      await expect(
        new RemoteRepository({
          remoteUrl: remoteURL,
          connection: {
            type: 'none',
          },
        }).create()
      ).rejects.toThrowError(Err.AuthenticationTypeNotAllowCreateRepositoryError);
    });
  });

  describe('destroy()', () => {
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
        new RemoteRepository({
          remoteUrl: remoteURL,
          connection: {
            type: 'github',
            personalAccessToken: undefined,
          },
        }).destroy()
      ).rejects.toThrowError(Err.UndefinedPersonalAccessTokenError);
    });

    it(`throws CannotConnectRemoteRepositoryError() with ${NETWORK_RETRY_INTERVAL} retries`, async () => {
      const remoteURL = remoteURLBase + serialId();

      const error = await new RemoteRepository({
        remoteUrl: remoteURL,
        connection: {
          type: 'github',
          personalAccessToken: token,
        },
      })
        .destroy()
        .catch(err => err);
      expect(error).toBeInstanceOf(Err.CannotConnectRemoteRepositoryError);
      expect((error as Err.CannotConnectRemoteRepositoryError).retry).toBe(NETWORK_RETRY);
    });

    it('throws AuthenticationTypeNotAllowCreateRepositoryError()', async () => {
      const remoteURL = remoteURLBase + serialId();

      await expect(
        new RemoteRepository({
          remoteUrl: remoteURL,
          connection: {
            type: 'none',
          },
        }).destroy()
      ).rejects.toThrowError(Err.AuthenticationTypeNotAllowCreateRepositoryError);
    });
  });
});
