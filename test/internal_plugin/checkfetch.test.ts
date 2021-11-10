/* eslint-disable @typescript-eslint/naming-convention */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import fs from 'fs-extra';
import expect from 'expect';
import git from '@sosuisen/isomorphic-git';
import {
  HTTPError401AuthorizationRequired,
  HTTPError404NotFound,
  InvalidAuthenticationTypeError,
  InvalidGitRemoteError,
  InvalidRepositoryURLError,
  InvalidURLFormatError,
  NetworkError,
} from 'git-documentdb-remote-errors';
import sinon from 'sinon';
import { GitDocumentDB } from '../../src/git_documentdb';
import { checkFetch } from '../../src/plugin/remote-isomorphic-git';
import {
  createGitRemote,
  createRemoteRepository,
  destroyDBs,
  destroyRemoteRepository,
  removeRemoteRepositories,
} from '../remote_utils';
import { ConnectionSettingsGitHub } from '../../src/types';
import { Sync } from '../../src/remote/sync';

const reposPrefix = 'test_remote_isomorphic_git_check_fetch___';
const localDir = `./test/database_check_fetch`;

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
  fs.removeSync(path.resolve(localDir));
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

maybe('<internal_plugin/remote-isomorphic-git> checkFetch', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  before(async () => {
    // Remove remote
    await removeRemoteRepositories(reposPrefix);
  });

  describe('returns true', () => {
    it('when connect to public repository with no personal access token', async () => {
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: serialId(),
        localDir,
      });
      await dbA.open();

      const remoteUrl = remoteURLBase + 'test-public.git';
      const remoteOptions = {
        remoteUrl,
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        connection: { type: 'github' } as ConnectionSettingsGitHub,
      };
      const sync = new Sync(dbA, remoteOptions);
      await createGitRemote(dbA.workingDir, remoteUrl, sync.remoteName);
      const res = await checkFetch(dbA.workingDir, remoteOptions, sync.remoteName).catch(
        error => error
      );
      expect(res).not.toBeInstanceOf(Error);

      await destroyDBs([dbA]);
    });

    it('when connect to public repository with valid personal access token', async () => {
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: serialId(),
        localDir,
      });
      await dbA.open();

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
      await createGitRemote(dbA.workingDir, remoteUrl, sync.remoteName);
      const res = await checkFetch(dbA.workingDir, remoteOptions, sync.remoteName).catch(
        error => error
      );
      expect(res).not.toBeInstanceOf(Error);

      await destroyDBs([dbA]);
    });

    it('when connect to private repository with valid personal access token', async () => {
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: serialId(),
        localDir,
      });
      await dbA.open();

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
      await createGitRemote(dbA.workingDir, remoteUrl, sync.remoteName);
      const res = await checkFetch(dbA.workingDir, remoteOptions, sync.remoteName).catch(
        error => error
      );

      expect(res).not.toBeInstanceOf(Error);

      await destroyDBs([dbA]);
    });

    it('after retries', async () => {
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: serialId(),
        localDir,
      });
      await dbA.open();

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
      await createGitRemote(dbA.workingDir, remoteUrl, sync.remoteName);

      const stubRemote = sandbox.stub(git, 'getRemoteInfo2');
      stubRemote.onCall(0).rejects(new Error('connect EACCES'));
      stubRemote.onCall(1).rejects(new Error('connect EACCES'));
      stubRemote.onCall(2).rejects(new Error('connect EACCES'));
      stubRemote.onCall(3).resolves(undefined);

      const res = await checkFetch(dbA.workingDir, remoteOptions, sync.remoteName).catch(
        error => error
      );
      expect(res).not.toBeInstanceOf(Error);

      expect(stubRemote.callCount).toBe(4);

      await destroyDBs([dbA]);
    });

    it('when fetch from multiple Sync instances', async () => {
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: serialId(),
        localDir,
      });
      await dbA.open();

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
      await createGitRemote(dbA.workingDir, remoteUrl, sync.remoteName);

      const res = await checkFetch(dbA.workingDir, remoteOptions, sync.remoteName).catch(
        error => error
      );
      expect(res).not.toBeInstanceOf(Error);

      const remoteUrl2 = remoteURLBase + 'test-public2.git';
      await destroyRemoteRepository(remoteUrl2);
      await createRemoteRepository(remoteUrl2);
      const remoteOptions2 = {
        remoteUrl: remoteUrl2,
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        connection: {
          type: 'github',
          personalAccessToken: token,
        } as ConnectionSettingsGitHub,
      };
      const sync2 = new Sync(dbA, remoteOptions2);
      await createGitRemote(dbA.workingDir, remoteUrl2, sync2.remoteName);

      const res2 = await checkFetch(dbA.workingDir, remoteOptions2, sync2.remoteName).catch(
        error => error
      );
      expect(res2).not.toBeInstanceOf(Error);

      await destroyDBs([dbA]);
    });
  });

  it('throws NetworkError after retries', async () => {
    const dbA: GitDocumentDB = new GitDocumentDB({
      dbName: serialId(),
      localDir,
    });
    await dbA.open();

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
    await createGitRemote(dbA.workingDir, remoteUrl, sync.remoteName);

    const stubRemote = sandbox.stub(git, 'getRemoteInfo2');
    stubRemote.rejects(new Error('connect EACCES'));

    const res = await checkFetch(dbA.workingDir, remoteOptions, sync.remoteName).catch(
      error => error
    );
    expect(res).toBeInstanceOf(NetworkError);

    expect(stubRemote.callCount).toBe(4);

    await destroyDBs([dbA]);
  });

  it('throws InvalidGitRemoteError', async () => {
    const dbA: GitDocumentDB = new GitDocumentDB({
      dbName: serialId(),
      localDir,
    });
    await dbA.open();
    const remoteUrl = 'foo-bar';

    const err = await checkFetch(dbA.workingDir, { remoteUrl }).catch(error => error);
    expect(err).toBeInstanceOf(InvalidGitRemoteError);

    await destroyDBs([dbA]);
  });

  it('throws InvalidURLFormat by checkFetch when http protocol is missing', async () => {
    const dbA: GitDocumentDB = new GitDocumentDB({
      dbName: serialId(),
      localDir,
    });
    await dbA.open();
    const remoteUrl = 'foo-bar';
    await createGitRemote(dbA.workingDir, remoteUrl, 'origin');
    const err = await checkFetch(dbA.workingDir, { remoteUrl }).catch(error => error);

    expect(err).toBeInstanceOf(InvalidURLFormatError);
    expect(err.message).toMatch(/^URL format is invalid: UrlParseError:/);

    await destroyDBs([dbA]);
  });

  it('throws InvalidURLFormatError by checkFetch when URL is malformed', async () => {
    const dbA: GitDocumentDB = new GitDocumentDB({
      dbName: serialId(),
      localDir,
    });
    await dbA.open();
    const remoteUrl = 'https://foo.example.com:xxxx';
    await createGitRemote(dbA.workingDir, remoteUrl, 'origin');
    const err = await checkFetch(dbA.workingDir, { remoteUrl }).catch(error => error);
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
    const err = await checkFetch(dbA.workingDir, { remoteUrl }).catch(error => error);
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
      const err = await checkFetch(dbA.workingDir, {
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

      const remoteUrl = remoteURLBase + 'test-private.git';
      await createGitRemote(dbA.workingDir, remoteUrl, 'origin');
      const err = await checkFetch(dbA.workingDir, {
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

      const remoteUrl = remoteURLBase + 'test-private.git';

      await createGitRemote(dbA.workingDir, remoteUrl, 'origin');
      const err = await checkFetch(dbA.workingDir, { remoteUrl }).catch(error => error);

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
      const err = await checkFetch(dbA.workingDir, {
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
      const err = await checkFetch(dbA.workingDir, {
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
    const err = await checkFetch(dbA.workingDir, {
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
      checkFetch(dbA.workingDir, {
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
      checkFetch(dbA.workingDir, { remoteUrl, connection: { type: 'foo' } })
    ).rejects.toThrowError(InvalidAuthenticationTypeError);

    await destroyDBs([dbA]);
  });

  it('throws InvalidAuthenticationTypeError with SSH', async () => {
    const dbA: GitDocumentDB = new GitDocumentDB({
      dbName: serialId(),
      localDir,
    });
    await dbA.open();

    const remoteUrl = 'git@foo.example.com:bar/sync-test.git';
    await createGitRemote(dbA.workingDir, remoteUrl, 'origin');
    await expect(
      checkFetch(dbA.workingDir, {
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

  describe('throws CannotConnectError', () => {
    // NetworkError is thrown when network is not connected.
    // CannotConnectError will be thrown when other unexpected cases.
  });
});
