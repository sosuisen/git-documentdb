/* eslint-disable @typescript-eslint/naming-convention */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

/**
 * Test constructor
 * by using GitHub Personal Access Token
 * These tests create a new repository on GitHub if not exists.
 */

import crypto from 'crypto';
import fs from 'fs';
import { Octokit } from '@octokit/rest';
import git from 'isomorphic-git';
import expect from 'expect';
import sinon from 'sinon';
import * as RemoteEngineErr from 'git-documentdb-remote-errors';
import { sleep } from '../../src/utils';
import { MINIMUM_SYNC_INTERVAL } from '../../src/const';
import { GitDocumentDB } from '../../src/git_documentdb';
import { ConnectionSettings, RemoteOptions } from '../../src/types';
import { Err } from '../../src/error';
import { encodeToGitRemoteName, Sync, syncImpl } from '../../src/remote/sync';
import { removeRemoteRepositories } from '../remote_utils';
import { RemoteEngine, RemoteErr } from '../../src/remote/remote_engine';

export const syncBase = (
  connection: ConnectionSettings,
  remoteURLBase: string,
  reposPrefix: string,
  localDir: string,
  token: string
) => () => {
  let idCounter = 0;
  const serialId = () => {
    return `${reposPrefix}${idCounter++}`;
  };

  // Use sandbox to restore stub and spy in parallel mocha tests
  let sandbox: sinon.SinonSandbox;
  beforeEach(function () {
    sandbox = sinon.createSandbox();
  });

  afterEach(function () {
    sandbox.restore();
  });

  before(async () => {
    // Remove remote
    await removeRemoteRepositories(reposPrefix);
  });

  describe('encode Git remote name', () => {
    it('always generates the same name', async () => {
      const remoteURL = 'ssh://user@github.com:443/foo-bar/baz.git';
      const encoded = encodeToGitRemoteName(remoteURL);
      await sleep(1500);
      const encoded2 = encodeToGitRemoteName(remoteURL);
      expect(encoded).toBe(encoded2);
    });

    it('ssh://user@github.com:443/foo-bar/baz.git', () => {
      const remoteURL = 'ssh://user@github.com:443/foo-bar/baz.git';
      const encoded = encodeToGitRemoteName(remoteURL);
      const shortHash = crypto
        .createHash('sha1')
        .update(remoteURL)
        .digest('hex')
        .substr(0, 7);
      expect(encoded).toBe('github_com_' + shortHash);
    });

    it('ssh://user@127.0.0.1:443/foo-bar/baz.git', () => {
      const remoteURL = 'ssh://user@127.0.0.1:443/foo-bar/baz.git';
      const encoded = encodeToGitRemoteName(remoteURL);
      const shortHash = crypto
        .createHash('sha1')
        .update(remoteURL)
        .digest('hex')
        .substr(0, 7);
      expect(encoded).toBe('127_0_0_1_' + shortHash);
    });

    it('https://github.com:80/foo-bar/baz.git', () => {
      const remoteURL = 'https://github.com:80/foo-bar/baz.git';
      const encoded = encodeToGitRemoteName(remoteURL);
      const shortHash = crypto
        .createHash('sha1')
        .update(remoteURL)
        .digest('hex')
        .substr(0, 7);
      expect(encoded).toBe('github_com_' + shortHash);
    });

    it('ssh://user@github.com/foo-bar/baz.git', () => {
      const remoteURL = 'ssh://user@github.com/foo-bar/baz.git';
      const encoded = encodeToGitRemoteName(remoteURL);
      const shortHash = crypto
        .createHash('sha1')
        .update(remoteURL)
        .digest('hex')
        .substr(0, 7);
      expect(encoded).toBe('github_com_' + shortHash);
    });

    it('https://github.com/foo-bar/baz.git', () => {
      const remoteURL = 'https://github.com/foo-bar/baz.git';
      const encoded = encodeToGitRemoteName(remoteURL);
      const shortHash = crypto
        .createHash('sha1')
        .update(remoteURL)
        .digest('hex')
        .substr(0, 7);
      expect(encoded).toBe('github_com_' + shortHash);
    });

    it('git@github.com:foo-bar/baz.git', () => {
      const remoteURL = 'git@github.com:foo-bar/baz.git';
      const encoded = encodeToGitRemoteName(remoteURL);
      const shortHash = crypto
        .createHash('sha1')
        .update(remoteURL)
        .digest('hex')
        .substr(0, 7);
      expect(encoded).toBe('github_com_' + shortHash);
    });
  });

  /**
   * Tests for constructor
   */
  describe('<remote/sync> constructor', () => {
    it('set live to false by default', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbName = serialId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection,
      };
      const sync = new Sync(gitDDB, options);
      expect(sync.options.live).toBe(false);

      await gitDDB.destroy();
    });

    it('set syncDirection to both by default', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbName = serialId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection,
      };
      const sync = new Sync(gitDDB, options);
      expect(sync.options.syncDirection).toBe('both');

      await gitDDB.destroy();
    });

    it('set combineDbStrategy to combine-head-with-theirs by default', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbName = serialId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection,
      };
      const sync = new Sync(gitDDB, options);
      expect(sync.options.combineDbStrategy).toBe('combine-head-with-theirs');

      await gitDDB.destroy();
    });

    it('set includeCommits to false by default', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbName = serialId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection,
      };
      const sync = new Sync(gitDDB, options);
      expect(sync.options.includeCommits).toBe(false);

      await gitDDB.destroy();
    });

    it('set conflictResolutionStrategy to ours-diff by default', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbName = serialId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection,
      };
      const sync = new Sync(gitDDB, options);
      expect(sync.options.conflictResolutionStrategy).toBe('ours-diff');

      await gitDDB.destroy();
    });

    it('accepts remoteURL which ends with .git', async () => {
      const remoteURL = remoteURLBase + serialId() + '.git';
      const dbName = serialId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection,
      };
      expect(() => new Sync(gitDDB, options)).not.toThrowError();

      await gitDDB.destroy();
    });

    it('throws UndefinedRemoteURLError when remoteURL is undefined.', async () => {
      const dbName = serialId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const options: RemoteOptions = {
        connection: {
          type: 'github',
          personalAccessToken: '',
        },
      };
      expect(() => new Sync(gitDDB, options)).toThrowError(Err.UndefinedRemoteURLError);
      await gitDDB.destroy();
    });

    it('throws IntervalTooSmallError when interval is less than minimumSyncInterval.', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbName = serialId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const invalid_options: RemoteOptions = {
        remoteUrl: remoteURL,
        interval: MINIMUM_SYNC_INTERVAL - 1,
        connection: {
          type: 'github',
          personalAccessToken: '',
        },
      };
      expect(() => new Sync(gitDDB, invalid_options)).toThrowError(
        Err.IntervalTooSmallError
      );
      await gitDDB.destroy();

      await gitDDB.open();
      const valid_options: RemoteOptions = {
        remoteUrl: remoteURL,
        interval: MINIMUM_SYNC_INTERVAL,
        connection,
      };
      expect(() => new Sync(gitDDB, valid_options)).not.toThrowError();

      await gitDDB.destroy();
    });

    it('throws SyncIntervalLessThanOrEqualToRetryIntervalError', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbName = serialId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const retryInterval = 5000;
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        interval: retryInterval - 1,
        retryInterval,
        connection,
      };
      // less than
      expect(() => new Sync(gitDDB, options)).toThrowError(
        Err.SyncIntervalLessThanOrEqualToRetryIntervalError
      );
      await gitDDB.destroy();

      // equal to
      await gitDDB.open();
      options.interval = retryInterval;
      expect(() => new Sync(gitDDB, options)).toThrowError(
        Err.SyncIntervalLessThanOrEqualToRetryIntervalError
      );
      await gitDDB.destroy();

      // more than
      await gitDDB.open();
      // eslint-disable-next-line require-atomic-updates
      options.interval = retryInterval + 1;
      expect(() => new Sync(gitDDB, options)).not.toThrowError();

      await gitDDB.destroy();
    });
  });

  describe('<remote/sync> init()', () => {
    it('throws RemoteErr.InvalidURLFormatError.', async () => {
      const dbName = serialId();
      const remoteURL = remoteURLBase + serialId;

      const stubCheckFetch = sandbox.stub(RemoteEngine[connection.engine!], 'checkFetch');
      stubCheckFetch.onFirstCall().rejects(new RemoteEngineErr.InvalidURLFormatError(''));

      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection,
      };
      const sync = new Sync(gitDDB, options);
      await expect(sync.init()).rejects.toThrowError(RemoteErr.InvalidURLFormatError);
      await gitDDB.destroy();
    });

    it('throws RemoteErr.InvalidRepositoryURLError.', async () => {
      const dbName = serialId();
      const remoteURL = remoteURLBase + serialId();

      const stubCheckFetch = sandbox.stub(RemoteEngine[connection.engine!], 'checkFetch');
      stubCheckFetch
        .onFirstCall()
        .rejects(new RemoteEngineErr.InvalidRepositoryURLError(''));

      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection,
      };
      const sync = new Sync(gitDDB, options);
      await expect(sync.init()).rejects.toThrowError(RemoteErr.InvalidRepositoryURLError);
      await gitDDB.destroy();
    });

    it('throws RemoteErr.InvalidSSHKeyPathError.', async () => {
      const dbName = serialId();
      const remoteURL = remoteURLBase + serialId();

      const stubCheckFetch = sandbox.stub(RemoteEngine[connection.engine!], 'checkFetch');
      stubCheckFetch.onFirstCall().rejects(new RemoteEngineErr.InvalidSSHKeyPathError());

      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection,
      };
      const sync = new Sync(gitDDB, options);
      await expect(sync.init()).rejects.toThrowError(RemoteErr.InvalidSSHKeyPathError);
      await gitDDB.destroy();
    });

    it('throws RemoteErr.InvalidAuthenticationTypeError.', async () => {
      const dbName = serialId();
      const remoteURL = remoteURLBase + serialId();

      const stubCheckFetch = sandbox.stub(RemoteEngine[connection.engine!], 'checkFetch');
      stubCheckFetch
        .onFirstCall()
        .rejects(new RemoteEngineErr.InvalidAuthenticationTypeError(''));

      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection,
      };
      const sync = new Sync(gitDDB, options);
      await expect(sync.init()).rejects.toThrowError(
        RemoteErr.InvalidAuthenticationTypeError
      );
      await gitDDB.destroy();
    });

    it('throws RemoteErr.HTTPError401AuthorizationRequired.', async () => {
      const dbName = serialId();
      const remoteURL = remoteURLBase + serialId();

      const stubCheckFetch = sandbox.stub(RemoteEngine[connection.engine!], 'checkFetch');
      stubCheckFetch
        .onFirstCall()
        .rejects(new RemoteEngineErr.HTTPError401AuthorizationRequired(''));

      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection,
      };
      const sync = new Sync(gitDDB, options);
      await expect(sync.init()).rejects.toThrowError(
        RemoteErr.HTTPError401AuthorizationRequired
      );
      await gitDDB.destroy();
    });

    it('throws CannotCreateRemoteRepositoryError', async () => {
      const remoteURL = remoteURLBase + serialId();

      const dbNameA = serialId();

      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameA,
        localDir: localDir,
      });
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection,
      };
      await gitDDB.open();

      const sync = new Sync(gitDDB, options);

      const stubReposCreate = sandbox.stub(sync.remoteRepository, 'create');
      stubReposCreate
        .onFirstCall()
        .rejects(new Err.CannotConnectRemoteRepositoryError(0, '', ''));

      await expect(sync.init()).rejects.toThrowError(Err.CannotCreateRemoteRepositoryError);

      await gitDDB.destroy();
    });

    it('creates a remote repository on GitHub by using personal access token', async () => {
      const remoteURL = remoteURLBase + serialId();

      const dbNameA = serialId();

      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameA,
        localDir: localDir,
      });
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection,
      };
      await gitDDB.open();
      await gitDDB.sync(options);

      // Check remote
      const octokit = new Octokit({
        auth: token,
      });
      const urlArray = remoteURL.split('/');
      const owner = urlArray[urlArray.length - 2];
      const repo = urlArray[urlArray.length - 1];
      await expect(octokit.repos.listBranches({ owner, repo })).resolves.not.toThrowError();

      await gitDDB.destroy();
    });

    it('succeeds after retries when NetworkError', async () => {
      const dbName = serialId();
      const remoteURL = remoteURLBase + serialId();

      const stubCheckFetch = sandbox.stub(RemoteEngine[connection.engine!], 'checkFetch');
      stubCheckFetch.onFirstCall().rejects(new RemoteEngineErr.NetworkError(''));
      stubCheckFetch.onSecondCall().rejects(new RemoteEngineErr.HTTPError404NotFound(''));

      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection,
      };
      const sync = new Sync(gitDDB, options);

      await expect(sync.init()).resolves.toEqual({
        action: 'push',
        changes: { remote: [] },
      });

      expect(stubCheckFetch.callCount).toBe(2);

      await gitDDB.destroy();
    });

    it('throws after retries when NetworkError', async () => {
      const dbName = serialId();
      const remoteURL = remoteURLBase + serialId();

      const stubCheckFetch = sandbox.stub(RemoteEngine[connection.engine!], 'checkFetch');
      stubCheckFetch.rejects(new RemoteEngineErr.NetworkError(''));

      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection,
      };
      const sync = new Sync(gitDDB, options);

      await expect(sync.init()).rejects.toThrowError(RemoteErr.NetworkError);

      expect(stubCheckFetch.callCount).toBe(3);

      await gitDDB.destroy();
    });

    it('sets Git remote in .git/config', async () => {
      const remoteURL = remoteURLBase + serialId();

      const dbNameA = serialId();

      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameA,
        localDir: localDir,
      });
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection,
      };
      await gitDDB.open();
      await gitDDB.sync(options);

      const remoteName = encodeToGitRemoteName(remoteURL);

      const url = await git.getConfig({
        fs,
        dir: gitDDB.workingDir,
        path: `remote.${remoteName}.url`,
      });
      expect(url).toBe(remoteURL);

      const fetch = await git.getConfig({
        fs,
        dir: gitDDB.workingDir,
        path: `remote.${encodeToGitRemoteName(remoteURL)}.fetch`,
      });
      expect(fetch).toBe(`+refs/heads/*:refs/remotes/${remoteName}/*`);

      const originUrl = await git.getConfig({
        fs,
        dir: gitDDB.workingDir,
        path: `remote.origin.url`,
      });
      expect(originUrl).toBe(remoteURL);

      const originFetch = await git.getConfig({
        fs,
        dir: gitDDB.workingDir,
        path: `remote.origin.fetch`,
      });
      expect(originFetch).toBe(`+refs/heads/*:refs/remotes/origin/*`);

      await gitDDB.destroy();
    });

    it('skip setting origin when it already exists.', async () => {
      const remoteURL = remoteURLBase + serialId();

      const dbNameA = serialId();

      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameA,
        localDir: localDir,
      });
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection,
      };
      await gitDDB.open();
      await gitDDB.sync(options);

      const remoteName = encodeToGitRemoteName(remoteURL);

      // Set origin
      await git.setConfig({
        fs,
        dir: gitDDB.workingDir,
        path: `remote.origin.url`,
        value: 'http://example.com/originurl',
      });

      const url = await git.getConfig({
        fs,
        dir: gitDDB.workingDir,
        path: `remote.${remoteName}.url`,
      });
      expect(url).toBe(remoteURL);

      const fetch = await git.getConfig({
        fs,
        dir: gitDDB.workingDir,
        path: `remote.${encodeToGitRemoteName(remoteURL)}.fetch`,
      });
      expect(fetch).toBe(`+refs/heads/*:refs/remotes/${remoteName}/*`);

      const originUrl = await git.getConfig({
        fs,
        dir: gitDDB.workingDir,
        path: `remote.origin.url`,
      });
      expect(originUrl).toBe('http://example.com/originurl');

      await gitDDB.destroy();
    });

    it.skip('calls tryPush() after create remote repository');

    it.skip('calls tryPush() when remote repository exists');

    it.skip('calls trySync() when remote repository exists');

    it.skip('throws error in tryPush()');

    it.skip('throws error in trySync()');

    it('throws PushNotAllowedError.', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbName = serialId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection,
        syncDirection: 'pull',
      };
      const sync = new Sync(gitDDB, options);
      await expect(sync.init()).rejects.toThrowError(Err.PushNotAllowedError);

      await gitDDB.destroy();
    });
  });

  describe('<remote/sync> syncImpl()', () => {
    it('throws RepositoryNotOpenError.', async () => {
      const dbName = serialId();
      const remoteURL = remoteURLBase + serialId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await expect(
        syncImpl.call(gitDDB, {
          remoteUrl: remoteURL,
          connection,
        })
      ).rejects.toThrowError(Err.RepositoryNotOpenError);
      await gitDDB.destroy();
    });
  });
};
