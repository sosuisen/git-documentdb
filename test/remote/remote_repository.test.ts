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
import { createCredential } from '../../src/remote/authentication';
import { GitDocumentDB } from '../../src/git_documentdb';
import { Err } from '../../src/error';
import { NETWORK_RETRY, NETWORK_RETRY_INTERVAL } from '../../src/const';
import {
  createRemoteRepository,
  destroyDBs,
  destroyRemoteRepository,
  removeRemoteRepositories,
} from '../remote_utils';
import { RemoteRepository } from '../../src/remote/remote_repository';
import { RemoteOptions } from '../../src/types';

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

  describe(': create()', () => {
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

    it(`throws CannotConnectError() with ${NETWORK_RETRY} retries`, async () => {
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
      expect(error).toBeInstanceOf(Err.CannotConnectError);
      // This may be tested by using sinon.spy
      expect((error as Err.CannotConnectError).retry).toBe(NETWORK_RETRY);
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
        new RemoteRepository({
          remoteUrl: remoteURL,
          connection: {
            type: 'github',
            personalAccessToken: undefined,
          },
        }).destroy()
      ).rejects.toThrowError(Err.UndefinedPersonalAccessTokenError);
    });

    it(`throws CannotConnectError() with ${NETWORK_RETRY_INTERVAL} retries`, async () => {
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
      expect(error).toBeInstanceOf(Err.CannotConnectError);
      expect((error as Err.CannotConnectError).retry).toBe(NETWORK_RETRY);
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

  describe(': _getOrCreateGitRemote()', () => {
    it('returns "add" when origin is undefined', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbName = monoId();
      const gitDDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const remoteRepos = new RemoteRepository({
        remoteUrl: remoteURL,
      });
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
        dbName,
        localDir,
      });
      await gitDDB.open();
      const remoteRepos = new RemoteRepository({
        remoteUrl: remoteURL,
      });
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
        dbName,
        localDir,
      });
      await gitDDB.open();
      const remoteRepos = new RemoteRepository({
        remoteUrl: remoteURL,
      });
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
    it('returns exist', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbName = monoId();
      const gitDDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const remoteRepos = new RemoteRepository({
        remoteUrl: remoteURL,
      });
      // You can test private members by array access.
      // eslint-disable-next-line dot-notation
      const [result, remote] = await remoteRepos['_getOrCreateGitRemote'](
        gitDDB.repository()!,
        remoteURL
      );
      await createRemoteRepository(remoteURL);
      const cred = createCredential({
        remoteUrl: remoteURL,
        connection: {
          type: 'github',
          personalAccessToken: token,
        },
      });
      // eslint-disable-next-line dot-notation
      await expect(remoteRepos['_checkFetch'](remote, cred)).resolves.toBe('exist');

      destroyDBs([gitDDB]);
    });

    it('throws InvalidURLError when a url starts with git@', async () => {
      const remoteURL = 'git@github.com/xyz/' + serialId();
      const dbName = monoId();
      const gitDDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const remoteRepos = new RemoteRepository({
        remoteUrl: remoteURL,
      });
      // You can test private members by array access.
      // eslint-disable-next-line dot-notation
      const [result, remote] = await remoteRepos['_getOrCreateGitRemote'](
        gitDDB.repository()!,
        remoteURL
      );

      const cred = createCredential({
        remoteUrl: remoteURLBase + serialId(),
        connection: {
          type: 'github',
          personalAccessToken: token,
        },
      });

      // eslint-disable-next-line dot-notation
      await expect(remoteRepos['_checkFetch'](remote, cred)).rejects.toThrowError(
        Err.InvalidURLError
      );

      destroyDBs([gitDDB]);
    });

    it('throws InvalidURLError when a url starts invalid scheme', async () => {
      const remoteURL = 'xttp://github.com/xyz/' + serialId();
      const dbName = monoId();
      const gitDDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const remoteRepos = new RemoteRepository({
        remoteUrl: remoteURL,
      });
      // You can test private members by array access.
      // eslint-disable-next-line dot-notation
      const [result, remote] = await remoteRepos['_getOrCreateGitRemote'](
        gitDDB.repository()!,
        remoteURL
      );

      const cred = createCredential({
        remoteUrl: remoteURLBase + serialId(),
        connection: {
          type: 'github',
          personalAccessToken: token,
        },
      });

      // eslint-disable-next-line dot-notation
      await expect(remoteRepos['_checkFetch'](remote, cred)).rejects.toThrowError(
        Err.InvalidURLError
      );

      destroyDBs([gitDDB]);
    });

    it('throws InvalidURLError when a host name is invalid', async () => {
      const remoteURL = 'http://github.test/xyz/' + serialId();
      const dbName = monoId();
      const gitDDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const remoteRepos = new RemoteRepository({
        remoteUrl: remoteURL,
      });
      // You can test private members by array access.
      // eslint-disable-next-line dot-notation
      const [result, remote] = await remoteRepos['_getOrCreateGitRemote'](
        gitDDB.repository()!,
        remoteURL
      );

      const cred = createCredential({
        remoteUrl: remoteURLBase + serialId(),
        connection: {
          type: 'github',
          personalAccessToken: token,
        },
      });

      // eslint-disable-next-line dot-notation
      await expect(remoteRepos['_checkFetch'](remote, cred)).rejects.toThrowError(
        Err.InvalidURLError
      );

      destroyDBs([gitDDB]);
    });

    it('throws RepositoryNotFoundError when a remote repository does not exist', async () => {
      const remoteURL = 'http://github.com/xyz/' + monoId();
      const dbName = monoId();
      const gitDDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const remoteRepos = new RemoteRepository({
        remoteUrl: remoteURL,
      });
      // You can test private members by array access.
      // eslint-disable-next-line dot-notation
      const [result, remote] = await remoteRepos['_getOrCreateGitRemote'](
        gitDDB.repository()!,
        remoteURL
      );

      const cred = createCredential({
        remoteUrl: remoteURL,
        connection: {
          type: 'github',
          personalAccessToken: token,
        },
      });

      // eslint-disable-next-line dot-notation
      await expect(remoteRepos['_checkFetch'](remote, cred)).rejects.toThrowError(
        Err.RemoteRepositoryNotFoundError
      );

      destroyDBs([gitDDB]);
    });

    it('throws FetchPermissionDeniedError when ssh key pair does not exist', async () => {
      const remoteURL = 'http://github.com/xyz/' + monoId();
      const dbName = monoId();
      const gitDDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const remoteRepos = new RemoteRepository({
        remoteUrl: remoteURL,
      });
      // You can test private members by array access.
      // eslint-disable-next-line dot-notation
      const [result, remote] = await remoteRepos['_getOrCreateGitRemote'](
        gitDDB.repository()!,
        remoteURL
      );

      const cred = createCredential({
        remoteUrl: remoteURL,
        connection: {
          type: 'ssh',
          privateKeyPath: '/not/exist',
          publicKeyPath: '/not/exist',
        },
      });

      // eslint-disable-next-line dot-notation
      await expect(remoteRepos['_checkFetch'](remote, cred)).rejects.toThrowError(
        Err.FetchPermissionDeniedError
      );

      destroyDBs([gitDDB]);
    });

    it.skip('throws Error when private repository');

    it.skip('throws FetchPermissionError when invalid ssh key pair exists');
  });

  describe(': _checkPush()', () => {
    it('returns ok', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbName = monoId();
      const gitDDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const remoteRepos = new RemoteRepository({
        remoteUrl: remoteURL,
      });
      // You can test private members by array access.
      // eslint-disable-next-line dot-notation
      const [result, remote] = await remoteRepos['_getOrCreateGitRemote'](
        gitDDB.repository()!,
        remoteURL
      );
      await createRemoteRepository(remoteURL);
      const cred = createCredential({
        remoteUrl: remoteURL,
        connection: {
          type: 'github',
          personalAccessToken: token,
        },
      });
      // eslint-disable-next-line dot-notation
      await expect(remoteRepos['_checkPush'](remote, cred)).resolves.toBe('ok');

      destroyDBs([gitDDB]);
    });

    it('throws PushPermissionDeniedError when personalAccessToken is invalid', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbName = monoId();
      const gitDDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const remoteRepos = new RemoteRepository({
        remoteUrl: remoteURL,
      });
      // You can test private members by array access.
      // eslint-disable-next-line dot-notation
      const [result, remote] = await remoteRepos['_getOrCreateGitRemote'](
        gitDDB.repository()!,
        remoteURL
      );
      await new RemoteRepository({
        remoteUrl: remoteURL,
        connection: {
          type: 'github',
          personalAccessToken: token,
        },
      }).create();

      const cred = createCredential({
        remoteUrl: remoteURL,
        connection: {
          type: 'github',
          personalAccessToken: token + '_invalid',
        },
      });
      // eslint-disable-next-line dot-notation
      const error = await remoteRepos['_checkPush'](remote, cred).catch(err => err);
      if (error instanceof Err.PushConnectionFailedError) {
        // Notice that it sometimes throw Err.RemoteRepositoryNotFoundError
      }
      else {
        expect(error).toBeInstanceOf(Err.RemoteRepositoryNotFoundError);
      }

      destroyDBs([gitDDB]);
    });

    it("throws RemoteRepositoryNotFoundError when try to push to others' repository", async () => {
      const remoteURL = 'https://github.com/sosuisen/git-documentdb';
      const dbName = monoId();
      const gitDDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const remoteRepos = new RemoteRepository({
        remoteUrl: remoteURL,
      });
      // You can test private members by array access.
      // eslint-disable-next-line dot-notation
      const [result, remote] = await remoteRepos['_getOrCreateGitRemote'](
        gitDDB.repository()!,
        remoteURL
      );
      const cred = createCredential({
        remoteUrl: remoteURL,
        connection: {
          type: 'github',
          personalAccessToken: token,
        },
      });
      // eslint-disable-next-line dot-notation
      await expect(remoteRepos['_checkPush'](remote, cred)).rejects.toThrowError(
        Err.RemoteRepositoryNotFoundError
      );

      destroyDBs([gitDDB]);
    });
  });

  describe(': connect()', () => {
    it(`returns ['add', 'create'] when both local and GitHub repository do not exist`, async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbName = monoId();
      const gitDDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();

      const remoteOptions: RemoteOptions = {
        remoteUrl: remoteURL,
        connection: {
          type: 'github',
          personalAccessToken: token,
        },
      };
      // @ts-ignore
      const remoteRepos = new RemoteRepository(remoteOptions);
      const cred = createCredential(remoteOptions);
      const onlyFetch = true;
      await expect(
        remoteRepos.connect(gitDDB.repository()!, cred, onlyFetch)
      ).resolves.toEqual(['add', 'create']);

      destroyDBs([gitDDB]);
    });

    it(`returns ['add', 'exist'] when a local repository does not exist and a GitHub repository exists`, async () => {
      const readonlyURL = 'https://github.com/sosuisen/git-documentdb';
      const dbName = monoId();
      const gitDDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();

      const remoteOptions: RemoteOptions = {
        remoteUrl: readonlyURL,
        connection: {
          type: 'github',
          personalAccessToken: token,
        },
      };
      // @ts-ignore
      const remoteRepos = new RemoteRepository(remoteOptions);
      const cred = createCredential(remoteOptions);
      const onlyFetch = true;
      await expect(
        remoteRepos.connect(gitDDB.repository()!, cred, onlyFetch)
      ).resolves.toEqual(['add', 'exist']);

      destroyDBs([gitDDB]);
    });

    it(`throws FetchConnectionFailedError when remote url is invalid`, async () => {
      const readonlyURL = 'https://github.test/invalid/host';
      const dbName = monoId();
      const gitDDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();

      const remoteOptions: RemoteOptions = {
        remoteUrl: readonlyURL,
        connection: {
          type: 'github',
          personalAccessToken: token,
        },
      };
      // @ts-ignore
      const remoteRepos = new RemoteRepository(remoteOptions);
      const cred = createCredential(remoteOptions);
      const onlyFetch = true;
      await expect(
        remoteRepos.connect(gitDDB.repository()!, cred, onlyFetch)
      ).rejects.toThrowError(Err.FetchConnectionFailedError);

      destroyDBs([gitDDB]);
    });

    it(`throws CannotCreateRemoteRepositoryError when a personal access token is for another account`, async () => {
      const readonlyURL = 'https://github.com/sosuisen/' + serialId();
      const dbName = monoId();
      const gitDDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();

      const remoteOptions: RemoteOptions = {
        remoteUrl: readonlyURL,
        connection: {
          type: 'github',
          personalAccessToken: token, // It is valid but for another account
        },
      };
      // @ts-ignore
      const remoteRepos = new RemoteRepository(remoteOptions);
      const cred = createCredential(remoteOptions);
      const onlyFetch = true;
      await expect(
        remoteRepos.connect(gitDDB.repository()!, cred, onlyFetch)
      ).rejects.toThrowError(Err.CannotCreateRemoteRepositoryError);

      destroyDBs([gitDDB]);
    });

    it(`to a read only repository throws PushConnectionFailedError when onlyFetch is false`, async () => {
      const readonlyURL = 'https://github.com/sosuisen/git-documentdb';
      const dbName = monoId();
      const gitDDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();

      const remoteOptions: RemoteOptions = {
        remoteUrl: readonlyURL,
        connection: {
          type: 'github',
          personalAccessToken: token,
        },
      };
      // @ts-ignore
      const remoteRepos = new RemoteRepository(remoteOptions);
      const cred = createCredential(remoteOptions);
      const onlyFetch = false;
      await expect(
        remoteRepos.connect(gitDDB.repository()!, cred, onlyFetch)
      ).rejects.toThrowError(Err.PushConnectionFailedError);

      destroyDBs([gitDDB]);
    });
  });
});
