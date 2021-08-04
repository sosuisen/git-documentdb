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
import {
  createClonedDatabases,
  createRemoteRepository,
  destroyDBs,
  removeRemoteRepositories,
} from '../remote_utils';
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

  describe('<remote/sync> encodeToGitRemoteName', () => {
    it('always generates the same name', async () => {
      const remoteURL = 'ssh://user@github.com:443/foo-bar/baz.git';
      const encoded = encodeToGitRemoteName(remoteURL);
      await sleep(1500);
      const encoded2 = encodeToGitRemoteName(remoteURL);
      expect(encoded).toBe(encoded2);
    });

    it('encodes ssh://user@github.com:443/foo-bar/baz.git', () => {
      const remoteURL = 'ssh://user@github.com:443/foo-bar/baz.git';
      const encoded = encodeToGitRemoteName(remoteURL);
      const shortHash = crypto
        .createHash('sha1')
        .update(remoteURL)
        .digest('hex')
        .substr(0, 7);
      expect(encoded).toBe('github_com_' + shortHash);
    });

    it('encodes ssh://user@127.0.0.1:443/foo-bar/baz.git', () => {
      const remoteURL = 'ssh://user@127.0.0.1:443/foo-bar/baz.git';
      const encoded = encodeToGitRemoteName(remoteURL);
      const shortHash = crypto
        .createHash('sha1')
        .update(remoteURL)
        .digest('hex')
        .substr(0, 7);
      expect(encoded).toBe('127_0_0_1_' + shortHash);
    });

    it('encodes https://github.com:80/foo-bar/baz.git', () => {
      const remoteURL = 'https://github.com:80/foo-bar/baz.git';
      const encoded = encodeToGitRemoteName(remoteURL);
      const shortHash = crypto
        .createHash('sha1')
        .update(remoteURL)
        .digest('hex')
        .substr(0, 7);
      expect(encoded).toBe('github_com_' + shortHash);
    });

    it('encodes ssh://user@github.com/foo-bar/baz.git', () => {
      const remoteURL = 'ssh://user@github.com/foo-bar/baz.git';
      const encoded = encodeToGitRemoteName(remoteURL);
      const shortHash = crypto
        .createHash('sha1')
        .update(remoteURL)
        .digest('hex')
        .substr(0, 7);
      expect(encoded).toBe('github_com_' + shortHash);
    });

    it('encodes https://github.com/foo-bar/baz.git', () => {
      const remoteURL = 'https://github.com/foo-bar/baz.git';
      const encoded = encodeToGitRemoteName(remoteURL);
      const shortHash = crypto
        .createHash('sha1')
        .update(remoteURL)
        .digest('hex')
        .substr(0, 7);
      expect(encoded).toBe('github_com_' + shortHash);
    });

    it('encodes git@github.com:foo-bar/baz.git', () => {
      const remoteURL = 'git@github.com:foo-bar/baz.git';
      const encoded = encodeToGitRemoteName(remoteURL);
      const shortHash = crypto
        .createHash('sha1')
        .update(remoteURL)
        .digest('hex')
        .substr(0, 7);
      expect(encoded).toBe('github_com_' + shortHash);
    });

    it('throws InvalidURLFormatError', () => {
      const remoteURL = 'foo.bar';
      expect(() => {
        encodeToGitRemoteName(remoteURL);
      }).toThrowError(RemoteErr.InvalidURLFormatError);
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

      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection,
      };
      const stubFetch = sandbox.stub(RemoteEngine[connection.engine!], 'fetch');
      stubFetch.onFirstCall().rejects(new RemoteEngineErr.InvalidURLFormatError(''));

      const sync = new Sync(gitDDB, options);
      await expect(sync.init()).rejects.toThrowError(RemoteErr.InvalidURLFormatError);
      await gitDDB.destroy();
    });

    it('throws RemoteErr.InvalidRepositoryURLError.', async () => {
      const dbName = serialId();
      const remoteURL = remoteURLBase + serialId();

      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection,
      };
      const stubFetch = sandbox.stub(RemoteEngine[connection.engine!], 'fetch');
      stubFetch.onFirstCall().rejects(new RemoteEngineErr.InvalidRepositoryURLError(''));

      const sync = new Sync(gitDDB, options);
      await expect(sync.init()).rejects.toThrowError(RemoteErr.InvalidRepositoryURLError);
      await gitDDB.destroy();
    });

    it('throws RemoteErr.InvalidSSHKeyPathError.', async () => {
      const dbName = serialId();
      const remoteURL = remoteURLBase + serialId();

      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection,
      };
      const stubFetch = sandbox.stub(RemoteEngine[connection.engine!], 'fetch');
      stubFetch.onFirstCall().rejects(new RemoteEngineErr.InvalidSSHKeyPathError());

      const sync = new Sync(gitDDB, options);
      await expect(sync.init()).rejects.toThrowError(RemoteErr.InvalidSSHKeyPathError);
      await gitDDB.destroy();
    });

    it('throws RemoteErr.InvalidAuthenticationTypeError.', async () => {
      const dbName = serialId();
      const remoteURL = remoteURLBase + serialId();

      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection,
      };
      const stubFetch = sandbox.stub(RemoteEngine[connection.engine!], 'fetch');
      stubFetch
        .onFirstCall()
        .rejects(new RemoteEngineErr.InvalidAuthenticationTypeError(''));

      const sync = new Sync(gitDDB, options);
      await expect(sync.init()).rejects.toThrowError(
        RemoteErr.InvalidAuthenticationTypeError
      );
      await gitDDB.destroy();
    });

    it('throws RemoteErr.HTTPError401AuthorizationRequired.', async () => {
      const dbName = serialId();
      const remoteURL = remoteURLBase + serialId();

      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection,
      };
      const stubFetch = sandbox.stub(RemoteEngine[connection.engine!], 'fetch');
      stubFetch
        .onFirstCall()
        .rejects(new RemoteEngineErr.HTTPError401AuthorizationRequired(''));

      const sync = new Sync(gitDDB, options);
      await expect(sync.init()).rejects.toThrowError(
        RemoteErr.HTTPError401AuthorizationRequired
      );
      await gitDDB.destroy();
    });

    it('throws NetworkError', async () => {
      const dbName = serialId();
      const remoteURL = remoteURLBase + serialId();

      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection,
      };
      const stubFetch = sandbox.stub(RemoteEngine[connection.engine!], 'fetch');
      stubFetch.rejects(new RemoteEngineErr.NetworkError(''));

      const sync = new Sync(gitDDB, options);

      await expect(sync.init()).rejects.toThrowError(RemoteErr.NetworkError);

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

    it('calls tryPush() after create remote repository', async () => {
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
      const [sync, syncResult] = await gitDDB.sync(options, true);

      expect(syncResult).toMatchObject({
        action: 'push',
        changes: {
          remote: [
            {
              new: {
                _id: '.gitddb/info',
                doc: {
                  creator: 'GitDocumentDB',
                  //  dbId: '01FBTPJSX4AE871NA0QN3ZEQVF',
                  version: '1.0',
                },
                // fileOid: 'e6d3f788687080d0fd1aa23cbc4f270f5a3f98d0',
                name: '.gitddb/info.json',
                type: 'json',
              },
              operation: 'insert',
            },
          ],
        },
      });

      await expect(
        git.getConfig({
          fs,
          dir: gitDDB.workingDir,
          path: `branch.${gitDDB.defaultBranch}.remote`,
        })
      ).resolves.toBe(sync.remoteName);

      await expect(
        git.getConfig({
          fs,
          dir: gitDDB.workingDir,
          path: `branch.${gitDDB.defaultBranch}.merge`,
        })
      ).resolves.toBe(`refs/heads/${gitDDB.defaultBranch}`);

      await gitDDB.destroy();
    });

    it('retries tryPush() for 404 not found after create remote repository', async () => {
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

      const stubTryPush = sandbox.stub(sync, 'tryPush');
      stubTryPush.onCall(0).rejects(new RemoteErr.HTTPError404NotFound(''));
      stubTryPush.onCall(1).rejects(new RemoteErr.HTTPError404NotFound(''));
      stubTryPush.onCall(2).rejects(new RemoteErr.HTTPError404NotFound(''));
      // @ts-ignore
      stubTryPush.onCall(3).resolves({ action: 'push' });

      const stubConfig = sandbox.stub(git, 'setConfig');
      stubConfig.returns(Promise.resolve());

      const syncResult = await sync.init();

      expect(syncResult).toMatchObject({
        action: 'push',
      });

      expect(stubTryPush.callCount).toBe(4);

      await gitDDB.destroy();
    });

    it('retries tryPush() for 404 not found and throws after create remote repository', async () => {
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

      const stubTryPush = sandbox.stub(sync, 'tryPush');
      stubTryPush.onCall(0).rejects(new RemoteErr.HTTPError404NotFound(''));
      stubTryPush.onCall(1).rejects(new RemoteErr.HTTPError404NotFound(''));
      stubTryPush.onCall(2).rejects(new RemoteErr.HTTPError404NotFound(''));
      // @ts-ignore
      stubTryPush.onCall(3).rejects(new RemoteErr.HTTPError404NotFound(''));

      const stubConfig = sandbox.stub(git, 'setConfig');
      stubConfig.returns(Promise.resolve());

      await expect(sync.init()).rejects.toThrowError(RemoteErr.HTTPError404NotFound);

      expect(stubTryPush.callCount).toBe(4);

      await gitDDB.destroy();
    });

    it('throws UnfetchedCommitExistsError when tryPush to updated repository', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbNameA = serialId();
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameA,
        localDir,
      });
      await dbA.open();
      const optionA: RemoteOptions = {
        remoteUrl: remoteURL,
        syncDirection: 'push',
        connection,
      };
      await dbA.sync(optionA);

      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameB,
        localDir,
      });
      // Clone dbA
      await dbB.open();
      const syncB = await dbB.sync({
        remoteUrl: remoteURL,
        connection,
      });
      await dbB.put({ name: 'fromB' });
      await syncB.tryPush();

      await dbA.close();
      await dbA.open();
      await expect(dbA.sync(optionA, true)).rejects.toThrowError(
        RemoteErr.UnfetchedCommitExistsError
      );

      await destroyDBs([dbA, dbB]);
    });

    it('succeeds when trySync to updated repository', async () => {
      const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
        remoteURLBase,
        localDir,
        serialId,
        {
          syncDirection: 'both',
          connection,
        }
      );
      await dbB.put({ name: 'fromB' });
      await syncB.tryPush();

      await dbA.close();
      await dbA.open();
      const [sync, syncResult] = await dbA.sync(syncB.options, true);

      expect(syncResult).toMatchObject({
        action: 'fast-forward merge',
      });

      await destroyDBs([dbA, dbB]);
    });

    it('throws PushNotAllowedError when syncDirection is pull', async () => {
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
      await expect(sync.init()).resolves.toEqual({ action: 'nop' });

      await gitDDB.destroy();
    });

    it('After dbA created remote repository, dbB clones it.', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbNameA = serialId();

      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameA,
        localDir: localDir,
      });

      await dbA.open();
      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection,
      };
      await dbA.sync(options);

      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameB,
        localDir: localDir,
      });
      await dbB.open();
      await dbB.sync(options);

      await expect(dbB.get(jsonA1._id)).resolves.toMatchObject(jsonA1);

      await destroyDBs([dbA, dbB]);
    });

    it('succeeds when a local repository does not exist and a remote repository does not exist.', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbNameA = serialId();

      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameA,
        localDir: localDir,
      });
      await dbA.open();
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection,
      };
      const sync = await dbA.sync(options);
      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);

      await expect(sync.trySync()).resolves.toMatchObject({ action: 'push' });

      await destroyDBs([dbA]);
    });

    it('succeeds when a local repository does not exist and a remote empty repository exists.', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbNameA = serialId();

      await createRemoteRepository(remoteURL);

      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameA,
        localDir: localDir,
      });
      await dbA.open();
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection,
      };
      const [sync, result] = await dbA.sync(options, true);

      expect(result).toMatchObject({ action: 'push' });

      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);

      await expect(sync.trySync()).resolves.toMatchObject({ action: 'push' });

      await destroyDBs([dbA]);
    });

    it('succeeds when a local repository does not exist and a remote fulfilled repository exists.', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbNameA = serialId();

      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameA,
        localDir: localDir,
      });
      await dbA.open();
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection,
      };
      const sync = await dbA.sync(options);
      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);
      await sync.trySync();

      // Destroy local DB
      await dbA.destroy();

      // Create it again
      await dbA.open();
      const [sync_again, result] = await dbA.sync(options, true);
      expect(result).toMatchObject({ action: 'combine database' });

      await dbA.put(jsonA1);
      await expect(sync_again.trySync()).resolves.toMatchObject({ action: 'push' });

      await dbA.destroy();
    });

    it('succeeds when a local repository exists and a remote repository does not exist.', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbNameA = serialId();

      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameA,
        localDir: localDir,
      });
      await dbA.open();
      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);

      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection,
      };
      const [sync, result] = await dbA.sync(options, true);
      expect(result).toMatchObject({ action: 'push' });

      const jsonA2 = { _id: '2', name: 'fromA' };
      await dbA.put(jsonA2);
      await expect(sync.trySync()).resolves.toMatchObject({ action: 'push' });

      await dbA.destroy();
    });

    it('succeeds when a local repository exists and a remote empty repository exists.', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbNameA = serialId();

      await createRemoteRepository(remoteURL);

      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameA,
        localDir: localDir,
      });
      await dbA.open();
      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);

      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection,
      };
      const [sync, result] = await dbA.sync(options, true);
      expect(result).toMatchObject({ action: 'push' });

      const jsonA2 = { _id: '2', name: 'fromA' };
      await dbA.put(jsonA2);
      await expect(sync.trySync()).resolves.toMatchObject({ action: 'push' });

      await dbA.destroy();
    });

    it('succeeds when a local repository exists and a remote consistent repository exists.', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbNameA = serialId();

      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameA,
        localDir: localDir,
      });
      await dbA.open();
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection,
      };
      const sync = await dbA.sync(options);
      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);
      await sync.trySync();

      // Close local DB
      await dbA.close();

      // Open it again
      await dbA.open();

      const [sync_again, result] = await dbA.sync(options, true);
      expect(result).toMatchObject({ action: 'nop' });

      await dbA.put(jsonA1);
      await expect(sync_again.trySync()).resolves.toMatchObject({ action: 'push' });

      await dbA.destroy();
    });

    it('succeeds when a local repository exists and a remote inconsistent repository exists.', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbNameA = serialId();

      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameA,
        localDir: localDir,
      });
      await dbA.open();
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection,
      };
      const sync = await dbA.sync(options);
      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);
      await sync.trySync();

      // Destroy local DB
      await dbA.destroy();

      // Create another db
      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameB,
        localDir: localDir,
      });
      await dbB.open();
      const jsonB1 = { _id: '1', name: 'fromB' };
      await dbB.put(jsonB1);

      const [sync_again, result] = await dbB.sync(options, true);
      expect(result).toMatchObject({ action: 'combine database' });

      const jsonB2 = { _id: '2', name: 'fromB' };
      await dbB.put(jsonB2);
      await expect(sync_again.trySync()).resolves.toMatchObject({ action: 'push' });

      await dbB.destroy();
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

  it('Multiple Sync objects', async () => {
    const gitDDB = new GitDocumentDB({
      dbName: serialId(),
      localDir,
    });
    await gitDDB.open();
    await gitDDB.put({ name: 'foo' });

    const remoteOptions01: RemoteOptions = {
      live: true,
      remoteUrl: remoteURLBase + serialId(),
      interval: 3000,
      connection: {
        type: 'github',
        personalAccessToken: token,
      },
    };

    await gitDDB.sync(remoteOptions01);

    const remoteOptions02: RemoteOptions = {
      live: true,
      remoteUrl: remoteURLBase + serialId(),
      interval: 3000,
      connection: {
        type: 'github',
        personalAccessToken: token,
      },
    };
    // Add extra synchronizer to DB
    const sync02 = await gitDDB.sync(remoteOptions02);
    expect(sync02).toBeInstanceOf(Sync);

    // Update remote from other DBs
    const dbA = new GitDocumentDB({
      dbName: serialId(),
      localDir,
    });
    await dbA.open();
    const syncA = await dbA.sync(remoteOptions01);
    const jsonA1 = { _id: '1', name: 'fromA' };
    await dbA.put(jsonA1);
    await syncA.trySync();

    const dbB = new GitDocumentDB({
      dbName: serialId(),
      localDir,
    });
    await dbB.open();
    const syncB = await dbB.sync(remoteOptions02);
    const jsonB2 = { _id: '2', name: 'fromB' };
    await dbB.put(jsonB2);
    await syncB.trySync();

    await sleep(remoteOptions01.interval! * 2);

    await expect(gitDDB.get('1')).resolves.toEqual(jsonA1);
    await expect(gitDDB.get('2')).resolves.toEqual(jsonB2);

    await destroyDBs([gitDDB, dbA, dbB]);
  });
};
