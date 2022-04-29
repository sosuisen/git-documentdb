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
import {
  HTTPError401AuthorizationRequired,
  HTTPError404NotFound,
  InvalidAuthenticationTypeError,
  InvalidRepositoryURLError,
  InvalidSSHKeyPathError,
  InvalidURLFormatError,
  NetworkError,
} from 'git-documentdb-remote-errors';
import git from 'isomorphic-git';
import sinon from 'sinon';
import { GitDocumentDB } from '../../src/git_documentdb';
import { clone } from '../../src/plugin/remote-isomorphic-git';
import { destroyDBs, removeRemoteRepositories } from '../remote_utils';

const reposPrefix = 'test_remote_isomorphic_git_clone___';
const localDir = `./test/database_clone`;

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

maybe('<internal_plugin/remote-isomorphic-git> clone', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  before(async () => {
    // Remove remote
    await removeRemoteRepositories(reposPrefix);
  });

  describe('succeeds', () => {
    it('when connect to public repository with no personal access token', async () => {
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: serialId(),
        localDir,
      });
      const remoteUrl = remoteURLBase + 'test-public.git';
      fs.ensureDirSync(dbA.workingDir);
      const res = await clone(dbA.workingDir, {
        remoteUrl,
        connection: { type: 'github' },
      }).catch(error => error);
      expect(res).toBeUndefined();

      await destroyDBs([dbA]);
    });

    it('when connect to public repository with valid personal access token', async () => {
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: serialId(),
        localDir,
      });
      const remoteUrl = remoteURLBase + 'test-public.git';
      fs.ensureDirSync(dbA.workingDir);
      const res = await clone(dbA.workingDir, {
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
      const res = await clone(dbA.workingDir, {
        remoteUrl,
        connection: { type: 'github', personalAccessToken: token },
      }).catch(error => error);
      expect(res).toBeUndefined();

      await destroyDBs([dbA]);
    });

    it('set default and another remote name', async () => {
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: serialId(),
        localDir,
      });
      const remoteUrl = remoteURLBase + 'test-public.git';
      fs.ensureDirSync(dbA.workingDir);
      const res = await clone(
        dbA.workingDir,
        {
          remoteUrl,
          connection: { type: 'github' },
        },
        'another'
      ).catch(error => error);
      expect(res).toBeUndefined();

      const urlDefault = await git.getConfig({
        fs,
        dir: dbA.workingDir,
        path: 'remote.origin.url',
      });
      expect(urlDefault).toBe(remoteUrl);

      const fetchDefault = await git.getConfig({
        fs,
        dir: dbA.workingDir,
        path: 'remote.origin.fetch',
      });
      expect(fetchDefault).toBe(`+refs/heads/*:refs/remotes/origin/*`);

      const url = await git.getConfig({
        fs,
        dir: dbA.workingDir,
        path: 'remote.another.url',
      });
      expect(url).toBe(remoteUrl);

      const fetch = await git.getConfig({
        fs,
        dir: dbA.workingDir,
        path: 'remote.another.fetch',
      });
      expect(fetch).toBe(`+refs/heads/*:refs/remotes/another/*`);

      await destroyDBs([dbA]);
    });

    it('after retries', async () => {
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: serialId(),
        localDir,
      });
      const remoteUrl = remoteURLBase + 'test-public.git';
      fs.ensureDirSync(dbA.workingDir);

      const cloneStub = sandbox.stub(git, 'clone');
      cloneStub.onCall(0).rejects(new Error('connect EACCES'));
      cloneStub.onCall(1).rejects(new Error('connect EACCES'));
      cloneStub.onCall(2).rejects(new Error('connect EACCES'));
      cloneStub.onCall(3).resolves(undefined);

      // Skip addRemote because repository is empty
      const remoteStub = sandbox.stub(git, 'addRemote');
      remoteStub.resolves();

      const res = await clone(dbA.workingDir, {
        remoteUrl,
        connection: { type: 'github' },
      }).catch(error => error);
      expect(res).toBeUndefined();

      expect(cloneStub.callCount).toBe(4);

      await destroyDBs([dbA]);
    });
  });

  it('throws NetworkError after retries', async () => {
    const dbA: GitDocumentDB = new GitDocumentDB({
      dbName: serialId(),
      localDir,
    });
    const remoteUrl = remoteURLBase + 'test-public.git';
    fs.ensureDirSync(dbA.workingDir);

    const cloneStub = sandbox.stub(git, 'clone');
    cloneStub.rejects(new Error('connect EACCES'));

    const res = await clone(dbA.workingDir, {
      remoteUrl,
      connection: { type: 'github' },
    }).catch(error => error);
    expect(res).toBeInstanceOf(NetworkError);

    expect(cloneStub.callCount).toBe(4);

    await destroyDBs([dbA]);
  });

  it('throws InvalidURLFormat by clone when http protocol is missing', async () => {
    const dbA: GitDocumentDB = new GitDocumentDB({
      dbName: serialId(),
      localDir,
    });
    const remoteUrl = 'foo-bar';
    fs.ensureDirSync(dbA.workingDir);
    const err = await clone(dbA.workingDir, { remoteUrl }).catch(error => error);
    await dbA.open();

    expect(err).toBeInstanceOf(InvalidURLFormatError);
    expect(err.message).toMatch(/^URL format is invalid: UrlParseError:/);

    await destroyDBs([dbA]);
  });

  it('throws InvalidURLFormatError by clone when URL is malformed', async () => {
    const dbA: GitDocumentDB = new GitDocumentDB({
      dbName: serialId(),
      localDir,
    });
    const remoteUrl = 'https://foo.example.com:xxxx';
    fs.ensureDirSync(dbA.workingDir);
    const err = await clone(dbA.workingDir, { remoteUrl }).catch(error => error);
    expect(err).toBeInstanceOf(InvalidURLFormatError);
    expect(err.message).toMatch(/^URL format is invalid: Error: getaddrinfo ENOTFOUND/);

    await destroyDBs([dbA]);
  });

  it('throws InvalidURLFormatError by checkFetch when HTTP host is invalid', async () => {
    const dbA: GitDocumentDB = new GitDocumentDB({
      dbName: serialId(),
      localDir,
    });
    const remoteUrl = 'https://foo.bar.example.com/gitddb-plugin/sync-test-invalid.git';
    fs.ensureDirSync(dbA.workingDir);
    const err = await clone(dbA.workingDir, { remoteUrl }).catch(error => error);
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
      const remoteUrl = 'https://127.0.0.1/gitddb-plugin/sync-test-invalid.git';
      fs.ensureDirSync(dbA.workingDir);
      const err = await clone(dbA.workingDir, { remoteUrl }).catch(error => error);
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
      const remoteUrl = remoteURLBase + 'test-private.git';
      fs.ensureDirSync(dbA.workingDir);
      const err = await clone(dbA.workingDir, {
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
      const remoteUrl = remoteURLBase + 'test-private.git';
      fs.ensureDirSync(dbA.workingDir);
      const err = await clone(dbA.workingDir, { remoteUrl }).catch(error => error);
      expect(err).toBeInstanceOf(HTTPError401AuthorizationRequired);
      expect(err.message).toMatch(/^HTTP Error: 401 Authorization required/);

      await destroyDBs([dbA]);
    });

    it('when invalid personal access token', async () => {
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: serialId(),
        localDir,
      });
      const remoteUrl = remoteURLBase + 'test-private.git';
      fs.ensureDirSync(dbA.workingDir);
      const err = await clone(dbA.workingDir, {
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
      const remoteUrl = remoteURLBase + 'sync-test-invalid.git';
      fs.ensureDirSync(dbA.workingDir);
      const err = await clone(dbA.workingDir, {
        remoteUrl,
        connection: { type: 'github', personalAccessToken: token },
      }).catch(error => error);
      expect(err).toBeInstanceOf(HTTPError404NotFound);
      expect(err.message).toMatch(/^HTTP Error: 404 Not Found/);

      await destroyDBs([dbA]);
    });
  });

  describe.skip('throws CannotFetchError', () => {
    // Other cases
  });

  it('throws InvalidURLFormatError by createCredentialForGitHub', async () => {
    const dbA: GitDocumentDB = new GitDocumentDB({
      dbName: serialId(),
      localDir,
    });
    const remoteUrl = 'foo-bar';
    fs.ensureDirSync(dbA.workingDir);
    const err = await clone(dbA.workingDir, {
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
    const remoteUrl = remoteURLBase + 'foo/bar/test.git';
    fs.ensureDirSync(dbA.workingDir);
    await expect(
      clone(dbA.workingDir, {
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
    const remoteUrl = remoteURLBase + 'test-private.git';
    fs.ensureDirSync(dbA.workingDir);
    await expect(
      // @ts-ignore
      clone(dbA.workingDir, { remoteUrl, connection: { type: 'foo' } })
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
    fs.ensureDirSync(dbA.workingDir);
    await expect(
      // @ts-ignore
      clone(dbA.workingDir, {
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
