/* eslint-disable @typescript-eslint/naming-convention */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import git from 'isomorphic-git';
import fs from 'fs-extra';
import expect from 'expect';
import {
  CannotConnectError,
  HTTPError401AuthorizationRequired,
  HTTPError403Forbidden,
  HTTPError404NotFound,
  InvalidAuthenticationTypeError,
  InvalidGitRemoteError,
  InvalidRepositoryURLError,
  InvalidSSHKeyPathError,
  InvalidURLFormatError,
  NetworkError,
  UnfetchedCommitExistsError,
} from 'git-documentdb-remote-errors';
import sinon from 'sinon';
import { GitDocumentDB } from '../../src/git_documentdb';
import { RemoteOptions } from '../../src/types';
import { clone, push } from '../../src/plugin/remote-isomorphic-git';
import {
  createClonedDatabases,
  createGitRemote,
  createRemoteRepository,
  destroyDBs,
  removeRemoteRepositories,
} from '../remote_utils';

const reposPrefix = 'test_remote_isomorphic_git_push___';
const localDir = `./test/database_push`;

let idCounter = 0;
const serialId = () => {
  return `${reposPrefix}${idCounter++}`;
};

// Use sandbox to restore stub and spy in parallel mocha tests
let sandbox: sinon.SinonSandbox;
beforeEach(function () {
  sandbox = sinon.createSandbox();
  // @ts-ignore
  console.log(`... ${this.currentTest.fullTitle()}`);
});

afterEach(function () {
  sandbox.restore();
});

before(() => {
  fs.removeSync(path.resolve(localDir));
});

after(() => {
  //  fs.removeSync(path.resolve(localDir));
});

/**
 * Prerequisites
 *
 * Environment variables:
 *   GITDDB_GITHUB_USER_URL: URL of your GitHub account
 *     e.g.) https://github.com/foo/
 *   GITDDB_PERSONAL_ACCESS_TOKEN: The personal access token of your GitHub account
 * GitHub repositories:
 *   remoteURLBase + 'test-private.git' must be a private repository.
 */
const userHome = process.env[process.platform === 'win32' ? 'USERPROFILE' : 'HOME'] ?? '';

const maybe =
  process.env.GITDDB_GITHUB_USER_URL && process.env.GITDDB_PERSONAL_ACCESS_TOKEN
    ? describe
    : describe.skip;

maybe('<remote-nodegit> push', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  before(async () => {
    // Remove remote
    await removeRemoteRepositories(reposPrefix).catch(err => console.log(err));
  });

  it('throws InvalidGitRemoteError', async () => {
    const dbA: GitDocumentDB = new GitDocumentDB({
      dbName: serialId(),
      localDir,
    });
    await dbA.open();

    const remoteUrl = 'foo-bar';

    const err = await push(dbA.workingDir, { remoteUrl }, undefined, undefined).catch(
      error => error
    );

    expect(err).toBeInstanceOf(InvalidGitRemoteError);
    expect(err.message).toMatch(/^Invalid Git remote: remote 'origin' does not exist/);

    await destroyDBs([dbA]);
  });

  describe('succeeds', () => {
    it('when connect to empty repository with valid personal access token', async () => {
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: serialId(),
        localDir,
      });
      const remoteUrl = remoteURLBase + serialId();
      await dbA.open();
      await createRemoteRepository(remoteUrl);
      await createGitRemote(dbA.workingDir, remoteUrl);
      const res = await push(dbA.workingDir, {
        remoteUrl,
        connection: { type: 'github', personalAccessToken: token },
      }).catch(error => error);

      expect(res).toBeUndefined();

      await destroyDBs([dbA]);
    });

    it('when connect to cloned repository with valid personal access token', async () => {
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: serialId(),
        localDir,
      });
      const remoteUrl = remoteURLBase + 'test-public.git';
      fs.ensureDirSync(dbA.workingDir);
      await clone(dbA.workingDir, {
        remoteUrl: remoteUrl,
        connection: { type: 'github', personalAccessToken: token },
      });
      await dbA.open();
      // await createGitRemote(dbA.workingDir, remoteUrl); // Not need because cloned repository.

      const res = await push(dbA.workingDir, {
        remoteUrl,
        connection: { type: 'github', personalAccessToken: token },
      }).catch(error => error);

      expect(res).toBeUndefined();

      await destroyDBs([dbA]);
    });

    it('when connect to private repository with valid personal access token', async () => {
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: serialId(),
        localDir,
      });

      const remoteUrl = remoteURLBase + 'test-private.git';
      fs.ensureDirSync(dbA.workingDir);
      await clone(dbA.workingDir, {
        remoteUrl: remoteUrl,
        connection: { type: 'github', personalAccessToken: token },
      });
      await dbA.open();
      await createGitRemote(dbA.workingDir, remoteUrl);

      const res = await push(dbA.workingDir, {
        remoteUrl,
        connection: { type: 'github', personalAccessToken: token },
      }).catch(error => error);
      expect(res).toBeUndefined();

      await destroyDBs([dbA]);
    });

    it('after retrying push()', async () => {
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: serialId(),
        localDir,
      });
      const remoteUrl = remoteURLBase + serialId();
      await dbA.open();
      await createRemoteRepository(remoteUrl);
      await createGitRemote(dbA.workingDir, remoteUrl);

      let pushCounter = 0;
      const stubOpen = sandbox.stub(nodegit.Repository, 'open');
      // Create fake Repository.open() that returns fake Remote by calling getRemote()
      stubOpen.callsFake(async function (dir) {
        const repos = await stubOpen.wrappedMethod(dir); // Call original nodegit.Repository.open();
        // @ts-ignore
        repos.getRemote = () => {
          return Promise.resolve({
            push: () => {
              if (pushCounter < 3) {
                pushCounter++;
                return Promise.reject(new Error('failed to send request'));
              }
              pushCounter++;
              return Promise.resolve(1);
            },
            fetch: () => {
              return Promise.resolve(undefined);
            },
            disconnect: () => {},
          });
        };
        return repos;
      });

      sandbox.stub(git, 'resolveRef').resolves(undefined);
      sandbox.stub(git, 'findMergeBase').resolves([undefined]);

      const res = await push(dbA.workingDir, {
        remoteUrl,
        connection: { type: 'github', personalAccessToken: token },
      }).catch((error: Error) => error);

      expect(res).toBeUndefined();

      expect(pushCounter).toBe(4);

      await destroyDBs([dbA]);
    });

    it('after retrying validatePushResult()', async () => {
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: serialId(),
        localDir,
      });
      const remoteUrl = remoteURLBase + serialId();
      await dbA.open();
      await createRemoteRepository(remoteUrl);
      await createGitRemote(dbA.workingDir, remoteUrl);

      let pushValidateCounter = 0;
      const stubOpen = sandbox.stub(nodegit.Repository, 'open');
      // Create fake Repository.open() that returns fake Remote by calling getRemote()
      stubOpen.callsFake(async function (dir) {
        const repos = await stubOpen.wrappedMethod(dir); // Call original nodegit.Repository.open();
        // @ts-ignore
        repos.getRemote = () => {
          return Promise.resolve({
            push: () => {
              return Promise.resolve(1);
            },
            fetch: () => {
              if (pushValidateCounter < 3) {
                pushValidateCounter++;
                return Promise.reject(new Error('foo'));
              }
              pushValidateCounter++;
              return Promise.resolve(undefined);
            },
            disconnect: () => {},
          });
        };
        return repos;
      });

      sandbox.stub(git, 'resolveRef').resolves(undefined);
      sandbox.stub(git, 'findMergeBase').resolves([undefined]);

      const res = await push(dbA.workingDir, {
        remoteUrl,
        connection: { type: 'github', personalAccessToken: token },
      }).catch((error: Error) => error);

      expect(res).toBeUndefined();

      expect(pushValidateCounter).toBe(4);

      await destroyDBs([dbA]);
    });
  });

  it('throws NetworkError after retrying push()', async () => {
    const dbA: GitDocumentDB = new GitDocumentDB({
      dbName: serialId(),
      localDir,
    });
    const remoteUrl = remoteURLBase + serialId();
    await dbA.open();
    await createRemoteRepository(remoteUrl);
    await createGitRemote(dbA.workingDir, remoteUrl);

    let pushCounter = 0;
    const stubOpen = sandbox.stub(nodegit.Repository, 'open');
    // Create fake Repository.open() that returns fake Remote by calling getRemote()
    stubOpen.callsFake(async function (dir) {
      const repos = await stubOpen.wrappedMethod(dir); // Call original nodegit.Repository.open();
      // @ts-ignore
      repos.getRemote = () => {
        return Promise.resolve({
          push: () => {
            pushCounter++;
            return Promise.reject(new Error('failed to send request'));
          },
          fetch: () => {
            return Promise.resolve(undefined);
          },
          disconnect: () => {},
        });
      };
      return repos;
    });

    sandbox.stub(git, 'resolveRef').resolves(undefined);
    sandbox.stub(git, 'findMergeBase').resolves([undefined]);

    const res = await push(dbA.workingDir, {
      remoteUrl,
      connection: { type: 'github', personalAccessToken: token },
    }).catch((error: Error) => error);

    expect(res).toBeInstanceOf(NetworkError);

    expect(pushCounter).toBe(4);

    await destroyDBs([dbA]);
  });

  it('throws CannotConnectError after retrying validatePushResult()', async () => {
    const dbA: GitDocumentDB = new GitDocumentDB({
      dbName: serialId(),
      localDir,
    });
    const remoteUrl = remoteURLBase + serialId();
    await dbA.open();
    await createRemoteRepository(remoteUrl);
    await createGitRemote(dbA.workingDir, remoteUrl);

    let pushValidateCounter = 0;
    const stubOpen = sandbox.stub(nodegit.Repository, 'open');
    // Create fake Repository.open() that returns fake Remote by calling getRemote()
    stubOpen.callsFake(async function (dir) {
      const repos = await stubOpen.wrappedMethod(dir); // Call original nodegit.Repository.open();
      // @ts-ignore
      repos.getRemote = () => {
        return Promise.resolve({
          push: () => {
            return Promise.resolve(1);
          },
          fetch: () => {
            pushValidateCounter++;
            return Promise.reject(new Error('foo'));
          },
          disconnect: () => {},
        });
      };
      return repos;
    });

    sandbox.stub(git, 'resolveRef').resolves(undefined);
    sandbox.stub(git, 'findMergeBase').resolves([undefined]);

    const res = await push(dbA.workingDir, {
      remoteUrl,
      connection: { type: 'github', personalAccessToken: token },
    }).catch((error: Error) => error);

    expect(res).toBeInstanceOf(CannotConnectError);

    expect(pushValidateCounter).toBe(4);

    await destroyDBs([dbA]);
  });

  it('throws InvalidURLFormat by push when http protocol is missing', async () => {
    const dbA: GitDocumentDB = new GitDocumentDB({
      dbName: serialId(),
      localDir,
    });
    await dbA.open();

    const remoteUrl = 'foo-bar';
    await createGitRemote(dbA.workingDir, remoteUrl);

    const err = await push(dbA.workingDir, {
      remoteUrl,
      connection: { type: 'none' },
    }).catch(error => error);

    expect(err).toBeInstanceOf(InvalidURLFormatError);
    expect(err.message).toMatch(/^URL format is invalid: unsupported URL protocol/);

    await destroyDBs([dbA]);
  });

  it('throws InvalidURLFormatError by push when URL is malformed', async () => {
    const dbA: GitDocumentDB = new GitDocumentDB({
      dbName: serialId(),
      localDir,
    });
    await dbA.open();

    const remoteUrl = 'https://foo.example.com:xxxx';
    await createGitRemote(dbA.workingDir, remoteUrl);

    const err = await push(dbA.workingDir, {
      remoteUrl,
      connection: { type: 'none' },
    }).catch(error => error);

    expect(err).toBeInstanceOf(InvalidURLFormatError);
    expect(err.message).toMatch(/^URL format is invalid: malformed URL/);

    await destroyDBs([dbA]);
  });

  describe('throws NetworkError', () => {
    it('when HTTP host is invalid', async () => {
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: serialId(),
        localDir,
      });
      await dbA.open();

      const remoteUrl = 'https://foo.bar.example.com/gitddb-plugin/sync-test-invalid.git';
      await createGitRemote(dbA.workingDir, remoteUrl);

      const err = await push(dbA.workingDir, {
        remoteUrl,
        connection: { type: 'none' },
      }).catch(error => error);

      expect(err).toBeInstanceOf(NetworkError);
      expect(err.message).toMatch(/^Network error: failed to send request/);

      await destroyDBs([dbA]);
    });

    it('when IP address is invalid', async () => {
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: serialId(),
        localDir,
      });
      await dbA.open();

      const remoteUrl = 'https://127.0.0.1/gitddb-plugin/sync-test-invalid.git';
      await createGitRemote(dbA.workingDir, remoteUrl);

      const err = await push(dbA.workingDir, {
        remoteUrl,
        connection: {
          type: 'github',
        },
      }).catch(error => error);

      expect(err).toBeInstanceOf(NetworkError);
      expect(err.message).toMatch(/^Network error: failed to send request/);

      await destroyDBs([dbA]);
    });

    it('when SSH host is invalid', async () => {
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: serialId(),
        localDir,
      });
      await dbA.open();

      const remoteUrl = 'git@foo.example.com:bar/sync-test.git';
      await createGitRemote(dbA.workingDir, remoteUrl);

      const err = await push(dbA.workingDir, {
        remoteUrl,
        connection: {
          type: 'ssh',
          publicKeyPath: path.resolve(userHome, '.ssh/invalid-test.pub'),
          privateKeyPath: path.resolve(userHome, '.ssh/invalid-test'),
          passPhrase: '',
        },
      }).catch(error => error);

      expect(err).toBeInstanceOf(NetworkError);
      expect(err.message).toMatch(/^Network error: failed to resolve address/);

      await destroyDBs([dbA]);
    });
  });

  describe('throws HttpError401AuthorizationRequired', () => {
    it('when personal access token does not exist', async () => {
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: serialId(),
        localDir,
      });
      await dbA.open();

      const remoteUrl = remoteURLBase + 'test-public.git';
      await createGitRemote(dbA.workingDir, remoteUrl);

      const err = await push(dbA.workingDir, {
        remoteUrl,
        connection: { type: 'github' },
      }).catch(error => error);

      expect(err).toBeInstanceOf(HTTPError401AuthorizationRequired);
      expect(err.message).toMatch(
        /^HTTP Error: 401 Authorization required: request failed with status code: 401/
      );

      await destroyDBs([dbA]);
    });

    it('when connection setting not found', async () => {
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: serialId(),
        localDir,
      });
      await dbA.open();

      const remoteUrl = remoteURLBase + 'test-public.git';
      await createGitRemote(dbA.workingDir, remoteUrl);

      let err;
      for (let i = 0; i < 3; i++) {
        // eslint-disable-next-line no-await-in-loop
        err = await push(dbA.workingDir, { remoteUrl }).catch(error => error);
        if (
          !err.message.startsWith(
            'HTTP Error: 401 Authorization required: too many redirects or authentication replays'
          )
        ) {
          break;
        }
      }
      expect(err).toBeInstanceOf(HTTPError401AuthorizationRequired);
      if (process.platform === 'win32') {
        expect(err.message).toMatch(
          /^HTTP Error: 401 Authorization required: request failed with status code: 401/
        );
      }
      else {
        expect(err.message).toMatch(
          /^HTTP Error: 401 Authorization required: unexpected HTTP status code: 401/
        );
      }

      await destroyDBs([dbA]);
    });

    it.skip('when XXXX?', async () => {
      // TODO: This will invoke on ubuntu
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: serialId(),
        localDir,
      });
      await dbA.open();

      const remoteUrl = remoteURLBase + 'test-private.git';
      await createGitRemote(dbA.workingDir, remoteUrl);

      const err = await push(dbA.workingDir, { remoteUrl }).catch(error => error);
      expect(err).toBeInstanceOf(HTTPError401AuthorizationRequired);
      expect(err.message).toMatch(
        /^HTTP Error: 401 Authorization required: remote credential provider returned an invalid cred type/
      );

      await destroyDBs([dbA]);
    });

    it.skip('when invalid SSH key format', async () => {
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: serialId(),
        localDir,
      });
      await dbA.open();

      // TODO: set SSH url for test
      const remoteUrl = 'git@github.com:xxxxxxxxxxxxxxxxxx/sync-test.git';
      await createGitRemote(dbA.workingDir, remoteUrl);

      const err = await push(dbA.workingDir, {
        remoteUrl,
        connection: {
          type: 'ssh',
          publicKeyPath: path.resolve(userHome, '.ssh/invalid-test.pub'),
          privateKeyPath: path.resolve(userHome, '.ssh/invalid-test'),
          passPhrase: '',
        },
      }).catch(error => error);

      expect(err).toBeInstanceOf(HTTPError401AuthorizationRequired);
      // TODO: How to invoke this error
      expect(err.message).toMatch(
        /^HTTP Error: 401 Authorization required: Failed to retrieve list of SSH authentication methods/
      );

      await destroyDBs([dbA]);
    });

    it('when invalid personal access token', async () => {
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: serialId(),
        localDir,
      });
      await dbA.open();

      const remoteUrl = remoteURLBase + 'test-private.git';
      await createGitRemote(dbA.workingDir, remoteUrl);

      const err = await push(dbA.workingDir, {
        remoteUrl,
        connection: { type: 'github', personalAccessToken: 'foo-bar' },
      }).catch(error => error);

      expect(err).toBeInstanceOf(HTTPError401AuthorizationRequired);
      expect(err.message).toMatch(
        /^HTTP Error: 401 Authorization required: too many redirects or authentication replays/
      );

      await destroyDBs([dbA]);
    });

    it('when invalid pair of url and SSH auth', async () => {
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: serialId(),
        localDir,
      });
      await dbA.open();

      const remoteUrl = remoteURLBase + 'test-private.git';
      await createGitRemote(dbA.workingDir, remoteUrl);

      const err = await push(dbA.workingDir, {
        remoteUrl,
        connection: {
          type: 'ssh',
          publicKeyPath: path.resolve(userHome, '.ssh/invalid-test.pub'),
          privateKeyPath: path.resolve(userHome, '.ssh/invalid-test'),
          passPhrase: '',
        },
      }).catch(error => error);

      expect(err).toBeInstanceOf(HTTPError401AuthorizationRequired);
      expect(err.message).toMatch(
        /^HTTP Error: 401 Authorization required: too many redirects or authentication replays/
      );

      await destroyDBs([dbA]);
    });
  });

  describe('throws HttpError404NotFound', () => {
    it('when valid auth and repository does not exist', async () => {
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: serialId(),
        localDir,
      });
      await dbA.open();

      const remoteUrl = remoteURLBase + 'sync-test-invalid.git';
      await createGitRemote(dbA.workingDir, remoteUrl);

      const err = await push(dbA.workingDir, {
        remoteUrl,
        connection: { type: 'github', personalAccessToken: token },
      }).catch(error => error);
      expect(err).toBeInstanceOf(HTTPError404NotFound);
      if (process.platform === 'win32') {
        expect(err.message).toMatch(
          /^HTTP Error: 404 Not Found: request failed with status code: 404/
        );
      }
      else {
        expect(err.message).toMatch(
          /^HTTP Error: 404 Not Found: unexpected HTTP status code: 404/
        );
      }

      await destroyDBs([dbA]);
    });
  });

  describe.skip('throws CannotPushError', () => {
    // Other cases
  });

  it('throws InvalidURLFormatError by createCredentialForGitHub', async () => {
    const dbA: GitDocumentDB = new GitDocumentDB({
      dbName: serialId(),
      localDir,
    });
    await dbA.open();

    const remoteUrl = 'foo-bar';
    await createGitRemote(dbA.workingDir, remoteUrl);

    const err = await push(dbA.workingDir, {
      remoteUrl,
      connection: { type: 'github', personalAccessToken: token },
    }).catch(error => error);
    expect(err).toBeInstanceOf(InvalidURLFormatError);
    expect(err.message).toMatch(
      /^URL format is invalid: http protocol required in createCredentialForGitHub/
    );

    await destroyDBs([dbA]);
  });

  it('throws InvalidRepositoryURLError', async () => {
    const dbA: GitDocumentDB = new GitDocumentDB({
      dbName: serialId(),
      localDir,
    });
    await dbA.open();

    const remoteUrl = remoteURLBase + 'foo/bar/test.git';
    await createGitRemote(dbA.workingDir, remoteUrl);

    await expect(
      push(dbA.workingDir, {
        remoteUrl,
        connection: { type: 'github', personalAccessToken: token },
      })
    ).rejects.toThrowError(InvalidRepositoryURLError);

    await destroyDBs([dbA]);
  });

  it('throws InvalidSSHKeyPathError', async () => {
    const dbA: GitDocumentDB = new GitDocumentDB({
      dbName: serialId(),
      localDir,
    });
    await dbA.open();

    const remoteUrl = 'git@github.com:xxxxxxxxxxxxxxxxxx/sync-test.git';
    await createGitRemote(dbA.workingDir, remoteUrl);

    await expect(
      push(dbA.workingDir, {
        remoteUrl,
        connection: {
          type: 'ssh',
          publicKeyPath: path.resolve(userHome, 'foo'),
          privateKeyPath: path.resolve(userHome, 'bar'),
          passPhrase: '',
        },
      })
    ).rejects.toThrowError(InvalidSSHKeyPathError);

    await destroyDBs([dbA]);
  });

  it('throws InvalidAuthenticationTypeError', async () => {
    const dbA: GitDocumentDB = new GitDocumentDB({
      dbName: serialId(),
      localDir,
    });
    await dbA.open();

    const remoteUrl = remoteURLBase + 'test-private.git';
    await createGitRemote(dbA.workingDir, remoteUrl);

    await expect(
      // @ts-ignore
      push(dbA.workingDir, { remoteUrl, connection: { type: 'foo' } })
    ).rejects.toThrowError(InvalidAuthenticationTypeError);

    await destroyDBs([dbA]);
  });

  describe('throws HttpError403Forbidden', () => {
    it('when access repository of another account with your account', async () => {
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: serialId(),
        localDir,
      });
      await dbA.open();

      // const remoteUrl = privateRepositoryOfAnotherUser;
      const remoteUrl = 'https://github.com/sosuisen/git-documentdb.git';
      await createGitRemote(dbA.workingDir, remoteUrl);

      const err = await push(dbA.workingDir, {
        remoteUrl,
        connection: { type: 'github', personalAccessToken: token },
      }).catch(error => error);
      expect(err).toBeInstanceOf(HTTPError403Forbidden);

      if (process.platform === 'win32') {
        expect(err.message).toMatch(
          /^HTTP Error: 403 Forbidden: request failed with status code: 403/
        );
      }
      else {
        expect(err.message).toMatch(
          /^HTTP Error: 403 Forbidden: unexpected HTTP status code: 403/
        );
      }

      await destroyDBs([dbA]);
    });
  });

  describe('throws UnfetchedCommitExistsError', () => {
    it('when unfetched commit exists', async () => {
      const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
        remoteURLBase,
        localDir,
        serialId
      );

      await dbB.put({ name: 'foo' });
      await syncB.tryPush();

      const err = await push(dbA.workingDir, {
        remoteUrl: syncA.remoteURL,
        connection: { type: 'github', personalAccessToken: token },
      }).catch(error => error);
      expect(err).toBeInstanceOf(UnfetchedCommitExistsError);

      await destroyDBs([dbA, dbB]);
    });

    it('Race condition of two push() calls throws UnfetchedCommitExistsError in validatePushResult', async () => {
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
      await dbA.open();
      const syncA = await dbA.sync(options);
      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);

      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameB,
        localDir: localDir,
      });
      await dbB.open();
      const syncB = await dbB.sync(options);
      const jsonB1 = { _id: '1', name: 'fromB' };
      await dbB.put(jsonB1);

      await expect(
        Promise.all([
          push(dbA.workingDir, {
            remoteUrl: syncA.remoteURL,
            connection: { type: 'github', personalAccessToken: token },
          }),
          push(dbB.workingDir, {
            remoteUrl: syncB.remoteURL,
            connection: { type: 'github', personalAccessToken: token },
          }),
        ])
      ).rejects.toThrowError(UnfetchedCommitExistsError);

      await destroyDBs([dbA, dbB]);
    });
  });

  describe('throws CannotConnectError', () => {
    // NetworkError is thrown when network is not connected.
    // CannotConnectError will be thrown when other unexpected cases.
  });
});
