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
import { relative } from 'path';
import { Octokit } from '@octokit/rest';
import expect from 'expect';
import sinon from 'sinon';
import * as RemoteEngineErr from 'git-documentdb-remote-errors';
import { MINIMUM_SYNC_INTERVAL } from '../../src/const';
import { GitDocumentDB } from '../../src/git_documentdb';
import { ConnectionSettings, RemoteOptions } from '../../src/types';
import { Err } from '../../src/error';
import { Sync, syncImpl } from '../../src/remote/sync';
import { destroyDBs, removeRemoteRepositories } from '../remote_utils';
import { RemoteErr } from '../../src/remote/remote_engine';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const remote_nodegit_module = require('git-documentdb-plugin-remote-nodegit');

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

      destroyDBs([gitDDB]);
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

      destroyDBs([gitDDB]);
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

      destroyDBs([gitDDB]);
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

      destroyDBs([gitDDB]);
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

      destroyDBs([gitDDB]);
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

      destroyDBs([gitDDB]);
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

  describe.only('<remote/sync> init()', () => {
    it('throws RemoteErr.InvalidURLFormatError.', async () => {
      const dbName = serialId();
      const remoteURL = remoteURLBase + serialId;

      const stubCheckFetch = sandbox.stub(remote_nodegit_module, 'checkFetch');
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
      const remoteURL = remoteURLBase + serialId;

      const stubCheckFetch = sandbox.stub(remote_nodegit_module, 'checkFetch');
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
      const remoteURL = remoteURLBase + serialId;

      const stubCheckFetch = sandbox.stub(remote_nodegit_module, 'checkFetch');
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
      const remoteURL = remoteURLBase + serialId;

      const stubCheckFetch = sandbox.stub(remote_nodegit_module, 'checkFetch');
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
      const remoteURL = remoteURLBase + serialId;

      const stubCheckFetch = sandbox.stub(remote_nodegit_module, 'checkFetch');
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
  });

  describe('<remote/sync> syncImpl()', () => {
    it('throws RemoteCheckFetchError.', async () => {
      const dbName = serialId();
      const remoteURL = remoteURLBase + serialId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await expect(
        syncImpl.call(gitDDB, {
          remoteUrl: remoteURL,
          connection: { type: 'github', personalAccessToken: token },
        })
      ).rejects.toThrowError(RemoteErr.InvalidURLFormatError);
      await gitDDB.destroy();
    });

    it('creates a remote repository on GitHub by using personal access token', async () => {
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
      // Check dbInfo
      await dbA.sync(options);

      // Check remote
      const octokit = new Octokit({
        auth: token,
      });
      const urlArray = remoteURL.split('/');
      const owner = urlArray[urlArray.length - 2];
      const repo = urlArray[urlArray.length - 1];
      await expect(octokit.repos.listBranches({ owner, repo })).resolves.not.toThrowError();

      destroyDBs([dbA]);
    });
  });

  describe('<remote/sync> tryPush()', () => {
    before(async () => {
      // Remove remote
      await removeRemoteRepositories(reposPrefix);
    });

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
      // await await expect(sync.init()).rejects.toThrowError(Err.PushNotAllowedError);

      destroyDBs([gitDDB]);
    });
  });
};
