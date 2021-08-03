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
  InvalidURLFormatError,
  NetworkError,
  UnfetchedCommitExistsError,
} from 'git-documentdb-remote-errors';
import sinon from 'sinon';
import { GitDocumentDB } from '../../src/git_documentdb';
import { ConnectionSettingsGitHub, RemoteOptions } from '../../src/types';
import { clone, push } from '../../src/plugin/remote-isomorphic-git';
import {
  createClonedDatabases,
  createGitRemote,
  createRemoteRepository,
  destroyDBs,
  removeRemoteRepositories,
} from '../remote_utils';
import { Sync } from '../../src/remote/sync';

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

maybe('<internal_plugin/remote-isomorphic-git> push', () => {
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

    await destroyDBs([dbA]);
  });

  describe('succeeds', () => {
    it('when connect to empty repository with valid personal access token', async () => {
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: serialId(),
        localDir,
      });
      const remoteUrl = remoteURLBase + serialId();
      const remoteOptions = {
        remoteUrl,
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        connection: {
          type: 'github',
          personalAccessToken: token,
        } as ConnectionSettingsGitHub,
      };
      const sync = new Sync(dbA, remoteOptions);

      await dbA.open();
      await dbA.put({ name: 'fromA' });

      await createRemoteRepository(remoteUrl);
      await createGitRemote(dbA.workingDir, remoteUrl, sync.remoteName);
      const res = await push(
        dbA.workingDir,
        remoteOptions,
        sync.remoteName,
        dbA.defaultBranch,
        dbA.defaultBranch
      ).catch(error => error);

      expect(res).toBeUndefined();

      await destroyDBs([dbA]);
    });

    it('when connect to cloned repository with valid personal access token', async () => {
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: serialId(),
        localDir,
      });
      const remoteUrl = remoteURLBase + 'test-public.git';
      const remoteOptions = {
        remoteUrl,
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        connection: {
          type: 'github',
          personalAccessToken: token,
        } as ConnectionSettingsGitHub,
      };
      const sync = new Sync(dbA, remoteOptions);
      fs.ensureDirSync(dbA.workingDir);
      await clone(dbA.workingDir, remoteOptions, sync.remoteName);
      await dbA.open();
      await dbA.put({ name: 'fromA' });
      // await createGitRemote(dbA.workingDir, remoteUrl); // Not need because cloned repository.

      const res = await push(
        dbA.workingDir,
        remoteOptions,
        sync.remoteName,
        dbA.defaultBranch,
        dbA.defaultBranch
      ).catch(error => error);

      expect(res).toBeUndefined();

      await destroyDBs([dbA]);
    });

    it('when connect to private repository with valid personal access token', async () => {
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: serialId(),
        localDir,
      });

      const remoteUrl = remoteURLBase + 'test-private.git';
      const remoteOptions = {
        remoteUrl,
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        connection: {
          type: 'github',
          personalAccessToken: token,
        } as ConnectionSettingsGitHub,
      };
      const sync = new Sync(dbA, remoteOptions);
      fs.ensureDirSync(dbA.workingDir);
      await clone(dbA.workingDir, remoteOptions);
      await dbA.open();
      await dbA.put({ name: 'fromA' });
      await createGitRemote(dbA.workingDir, remoteUrl, sync.remoteName);

      const res = await push(
        dbA.workingDir,
        remoteOptions,
        sync.remoteName,
        dbA.defaultBranch,
        dbA.defaultBranch
      ).catch(error => error);

      expect(res).toBeUndefined();

      await destroyDBs([dbA]);
    });

    it('after retrying push()', async () => {
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: serialId(),
        localDir,
      });
      const remoteUrl = remoteURLBase + serialId();
      const remoteOptions = {
        remoteUrl,
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        connection: {
          type: 'github',
          personalAccessToken: token,
        } as ConnectionSettingsGitHub,
      };
      const sync = new Sync(dbA, remoteOptions);
      await dbA.open();
      await dbA.put({ name: 'fromA' });
      await createRemoteRepository(remoteUrl);
      await createGitRemote(dbA.workingDir, remoteUrl, sync.remoteName);

      const stubPush = sandbox.stub(git, 'push');
      stubPush.onCall(0).rejects(new Error('connect EACCES'));
      stubPush.onCall(1).rejects(new Error('connect EACCES'));
      stubPush.onCall(2).rejects(new Error('connect EACCES'));
      stubPush.onCall(3).resolves(undefined);

      const res = await push(
        dbA.workingDir,
        remoteOptions,
        sync.remoteName,
        dbA.defaultBranch,
        dbA.defaultBranch
      ).catch(error => error);

      expect(res).toBeUndefined();

      expect(stubPush.callCount).toBe(4);

      await destroyDBs([dbA]);
    });
  });

  it('throws NetworkError after retrying push()', async () => {
    const dbA: GitDocumentDB = new GitDocumentDB({
      dbName: serialId(),
      localDir,
    });
    const remoteUrl = remoteURLBase + serialId();
    const remoteOptions = {
      remoteUrl,
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      connection: {
        type: 'github',
        personalAccessToken: token,
      } as ConnectionSettingsGitHub,
    };
    const sync = new Sync(dbA, remoteOptions);
    await dbA.open();
    await dbA.put({ name: 'fromA' });
    await createRemoteRepository(remoteUrl);
    await createGitRemote(dbA.workingDir, remoteUrl, sync.remoteName);

    const stubPush = sandbox.stub(git, 'push');
    stubPush.rejects(new Error('connect EACCES'));

    const res = await push(
      dbA.workingDir,
      remoteOptions,
      sync.remoteName,
      dbA.defaultBranch,
      dbA.defaultBranch
    ).catch(error => error);

    expect(res).toBeInstanceOf(NetworkError);

    expect(stubPush.callCount).toBe(4);

    await destroyDBs([dbA]);
  });

  it('throws InvalidURLFormat by push when http protocol is missing', async () => {
    const dbA: GitDocumentDB = new GitDocumentDB({
      dbName: serialId(),
      localDir,
    });
    await dbA.open();

    const remoteUrl = 'foo-bar';
    await createGitRemote(dbA.workingDir, remoteUrl, 'origin');

    // type is 'none'
    const err = await push(dbA.workingDir, {
      remoteUrl,
      connection: { type: 'none' },
    }).catch(error => error);

    expect(err).toBeInstanceOf(InvalidURLFormatError);
    expect(err.message).toMatch(/^URL format is invalid: UrlParseError:/);

    await destroyDBs([dbA]);
  });

  it('throws InvalidURLFormatError by push when URL is malformed', async () => {
    const dbA: GitDocumentDB = new GitDocumentDB({
      dbName: serialId(),
      localDir,
    });
    await dbA.open();

    const remoteUrl = 'https://foo.example.com:xxxx';
    await createGitRemote(dbA.workingDir, remoteUrl, 'origin');

    const err = await push(dbA.workingDir, {
      remoteUrl,
      connection: { type: 'none' },
    }).catch(error => error);

    expect(err).toBeInstanceOf(InvalidURLFormatError);
    expect(err.message).toMatch(/^URL format is invalid: Error: getaddrinfo ENOTFOUND/);

    await destroyDBs([dbA]);
  });

  it('throws InvalidURLFormatError by checkFetch when HTTP host is invalid', async () => {
    const dbA: GitDocumentDB = new GitDocumentDB({
      dbName: serialId(),
      localDir,
    });
    await dbA.open();

    const remoteUrl = 'https://foo.bar.example.com/gitddb-plugin/sync-test-invalid.git';
    await createGitRemote(dbA.workingDir, remoteUrl, 'origin');

    const err = await push(dbA.workingDir, {
      remoteUrl,
      connection: { type: 'none' },
    }).catch(error => error);

    expect(err).toBeInstanceOf(InvalidURLFormatError);
    expect(err.message).toMatch(/^URL format is invalid: Error: getaddrinfo ENOTFOUND/);

    await destroyDBs([dbA]);
  });

  describe('throws NetworkError', () => {
    it('when IP address is invalid', async () => {
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: serialId(),
        localDir,
      });
      await dbA.open();

      const remoteUrl = 'https://127.0.0.1/gitddb-plugin/sync-test-invalid.git';
      await createGitRemote(dbA.workingDir, remoteUrl, 'origin');

      const err = await push(dbA.workingDir, {
        remoteUrl,
        connection: {
          type: 'github',
        },
      }).catch(error => error);

      expect(err).toBeInstanceOf(NetworkError);
      expect(err.message).toMatch(/^Network error: Error: connect ECONNREFUSED/);

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
      await createGitRemote(dbA.workingDir, remoteUrl, 'origin');

      const err = await push(dbA.workingDir, {
        remoteUrl,
        connection: { type: 'github' },
      }).catch(error => error);

      expect(err).toBeInstanceOf(HTTPError401AuthorizationRequired);
      expect(err.message).toMatch(/^HTTP Error: 401 Authorization required/);

      await destroyDBs([dbA]);
    });

    it('when connection setting not found', async () => {
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: serialId(),
        localDir,
      });
      await dbA.open();

      const remoteUrl = remoteURLBase + 'test-public.git';
      await createGitRemote(dbA.workingDir, remoteUrl, 'origin');

      const err = await push(dbA.workingDir, { remoteUrl }).catch(error => error);

      expect(err).toBeInstanceOf(HTTPError401AuthorizationRequired);
      expect(err.message).toMatch(/^HTTP Error: 401 Authorization required/);

      await destroyDBs([dbA]);
    });

    it('when invalid personal access token', async () => {
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: serialId(),
        localDir,
      });
      await dbA.open();

      const remoteUrl = remoteURLBase + 'test-private.git';
      await createGitRemote(dbA.workingDir, remoteUrl, 'origin');

      const err = await push(dbA.workingDir, {
        remoteUrl,
        connection: { type: 'github', personalAccessToken: 'foo-bar' },
      }).catch(error => error);

      expect(err).toBeInstanceOf(HTTPError401AuthorizationRequired);
      expect(err.message).toMatch(/^HTTP Error: 401 Authorization required/);

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
      await createGitRemote(dbA.workingDir, remoteUrl, 'origin');

      const err = await push(dbA.workingDir, {
        remoteUrl,
        connection: { type: 'github', personalAccessToken: token },
      }).catch(error => error);
      expect(err).toBeInstanceOf(HTTPError404NotFound);
      expect(err.message).toMatch(/^HTTP Error: 404 Not Found/);

      await destroyDBs([dbA]);
    });
  });

  it('throws InvalidURLFormatError by createCredentialForGitHub', async () => {
    const dbA: GitDocumentDB = new GitDocumentDB({
      dbName: serialId(),
      localDir,
    });
    await dbA.open();

    const remoteUrl = 'foo-bar';
    await createGitRemote(dbA.workingDir, remoteUrl, 'origin');

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
    await createGitRemote(dbA.workingDir, remoteUrl, 'origin');

    await expect(
      push(dbA.workingDir, {
        remoteUrl,
        connection: { type: 'github', personalAccessToken: token },
      })
    ).rejects.toThrowError(InvalidRepositoryURLError);

    await destroyDBs([dbA]);
  });

  it('throws InvalidAuthenticationTypeError', async () => {
    const dbA: GitDocumentDB = new GitDocumentDB({
      dbName: serialId(),
      localDir,
    });
    await dbA.open();

    const remoteUrl = remoteURLBase + 'test-private.git';
    await createGitRemote(dbA.workingDir, remoteUrl, 'origin');

    await expect(
      // @ts-ignore
      push(dbA.workingDir, { remoteUrl, connection: { type: 'foo' } })
    ).rejects.toThrowError(InvalidAuthenticationTypeError);

    await destroyDBs([dbA]);
  });

  it('throws InvalidAuthenticationTypeError with SSH', async () => {
    const dbA: GitDocumentDB = new GitDocumentDB({
      dbName: serialId(),
      localDir,
    });
    await dbA.open();

    const remoteUrl = remoteURLBase + 'test-private.git';
    await createGitRemote(dbA.workingDir, remoteUrl, 'origin');

    await expect(
      // @ts-ignore
      push(dbA.workingDir, {
        remoteUrl,
        connection: {
          type: 'ssh',
          publicKeyPath: path.resolve(userHome, '.ssh/invalid-test.pub'),
          privateKeyPath: path.resolve(userHome, '.ssh/invalid-test'),
          passPhrase: '',
        },
      })
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
      await createGitRemote(dbA.workingDir, remoteUrl, 'origin');

      const err = await push(dbA.workingDir, {
        remoteUrl,
        connection: { type: 'github', personalAccessToken: token },
      }).catch(error => error);
      expect(err).toBeInstanceOf(HTTPError403Forbidden);
      expect(err.message).toMatch(/^HTTP Error: 403 Forbidden/);

      await destroyDBs([dbA]);
    });
  });

  describe('throws UnfetchedCommitExistsError', () => {
    it('when unfetched commit exists', async () => {
      console.log('#start');
      const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
        remoteURLBase,
        localDir,
        serialId,
        {
          connection: {
            type: 'github',
            personalAccessToken: token,
            engine: 'isomorphic-git',
          },
        }
      );
      console.log('#end');
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
        connection: {
          type: 'github',
          personalAccessToken: token,
          engine: 'isomorphic-git',
        },
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
            connection: {
              type: 'github',
              personalAccessToken: token,
              engine: 'isomorphic-git',
            },
          }),
          push(dbB.workingDir, {
            remoteUrl: syncB.remoteURL,
            connection: {
              type: 'github',
              personalAccessToken: token,
              engine: 'isomorphic-git',
            },
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
