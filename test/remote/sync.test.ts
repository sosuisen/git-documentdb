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
import path from 'path';
import fs from 'fs-extra';
import { Octokit } from '@octokit/rest';
import expect from 'expect';
import { MINIMUM_SYNC_INTERVAL } from '../../src/const';
import { GitDocumentDB } from '../../src/git_documentdb';
import { RemoteOptions } from '../../src/types';
import { Err } from '../../src/error';
import { Sync, syncImpl } from '../../src/remote/sync';
import { destroyDBs, removeRemoteRepositories } from '../remote_utils';

const reposPrefix = 'test_sync_constructor___';
const localDir = `./test_intg/database_sync`;

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

maybe('<remote/sync> Sync#constructor()', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  before(async () => {
    // Remove remote
    await removeRemoteRepositories(reposPrefix);
  });

  // it.only('Run this test with .only to just remove remote repositories.', async () => { await removeRemoteRepositories('test_'); });

  /**
   * Tests for constructor
   */
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
      connection: {
        type: 'github',
        personalAccessToken: token,
      },
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
      connection: {
        type: 'github',
        personalAccessToken: token,
      },
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
      connection: {
        type: 'github',
        personalAccessToken: token,
      },
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
      connection: {
        type: 'github',
        personalAccessToken: token,
      },
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
      connection: {
        type: 'github',
        personalAccessToken: token,
      },
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
      connection: {
        type: 'github',
        personalAccessToken: token,
      },
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

  it('throws HttpProtocolRequiredError when remoteURL starts with ssh://', async () => {
    const dbName = serialId();
    const remoteURL = 'ssh://github.com/';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const options: RemoteOptions = {
      remoteUrl: remoteURL,
      connection: {
        type: 'github',
        personalAccessToken: 'foobar',
      },
    };
    expect(() => new Sync(gitDDB, options)).toThrowError(Err.HttpProtocolRequiredError);
    await gitDDB.destroy();
  });

  it('throws UndefinedPersonalAccessTokenError', async () => {
    const dbName = serialId();
    const remoteURL = remoteURLBase + serialId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const options: RemoteOptions = {
      remoteUrl: remoteURL,
      connection: {
        type: 'github',
        personalAccessToken: '',
      },
    };
    expect(() => new Sync(gitDDB, options)).toThrowError(
      Err.UndefinedPersonalAccessTokenError
    );
    await gitDDB.destroy();
  });

  it('does not throw UndefinedPersonalAccessTokenError when syncDirections is "pull" ', async () => {
    const dbName = serialId();
    const remoteURL = remoteURLBase + serialId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const options: RemoteOptions = {
      remoteUrl: remoteURL,
      syncDirection: 'pull',
      connection: {
        type: 'github',
        personalAccessToken: '',
      },
    };
    expect(() => new Sync(gitDDB, options)).not.toThrowError(
      Err.UndefinedPersonalAccessTokenError
    );
    await gitDDB.destroy();
  });

  it('throws InvalidRepositoryURLError when url does not show a repository.', async () => {
    const dbName = serialId();
    const remoteURL = 'https://github.com/';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const options: RemoteOptions = {
      remoteUrl: remoteURL,
      connection: {
        type: 'github',
        personalAccessToken: 'foobar',
      },
    };
    expect(() => new Sync(gitDDB, options)).toThrowError(Err.InvalidRepositoryURLError);
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
    expect(() => new Sync(gitDDB, invalid_options)).toThrowError(Err.IntervalTooSmallError);
    await gitDDB.destroy();

    await gitDDB.open();
    const valid_options: RemoteOptions = {
      remoteUrl: remoteURL,
      interval: MINIMUM_SYNC_INTERVAL,
      connection: {
        type: 'github',
        personalAccessToken: token,
      },
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
      connection: {
        type: 'github',
        personalAccessToken: token,
      },
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

maybe('<remote/sync> init()', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  before(async () => {
    // Remove remote
    await removeRemoteRepositories(reposPrefix);
  });

  it('throws RemoteCheckFetchError.', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    GitDocumentDB.plugin(require('git-documentdb-plugin-remote-nodegit'));

    const dbName = serialId();
    const remoteURL =
      'https://github.com/sosuisen/foobar_test_for_remote_repository_connect_error';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const options: RemoteOptions = {
      remoteUrl: remoteURL,
      connection: {
        type: 'github',
        personalAccessToken: 'foo',
      },
    };
    const sync = new Sync(gitDDB, options);
    //
    await expect(sync.init()).rejects.toThrowError(Err.RemoteCheckFetchError);
    await gitDDB.destroy();
  });
});

maybe('<remote/sync> syncImpl()', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  before(async () => {
    // Remove remote
    await removeRemoteRepositories(reposPrefix);
  });

  it('throws RemoteCheckFetchError.', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    GitDocumentDB.plugin(require('git-documentdb-plugin-remote-nodegit'));

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
    ).rejects.toThrowError(Err.RemoteCheckFetchError);
    await gitDDB.destroy();
  });

  it('creates a remote repository on GitHub by using personal access token', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    GitDocumentDB.plugin(require('git-documentdb-plugin-remote-nodegit'));

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

maybe('<remote/sync> tryPush()', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  before(async () => {
    // Remove remote
    await removeRemoteRepositories(reposPrefix);
  });

  it('throws PushNotAllowedError.', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    GitDocumentDB.plugin(require('git-documentdb-plugin-remote-nodegit'));

    const remoteURL = remoteURLBase + serialId();
    const dbName = serialId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const options: RemoteOptions = {
      remoteUrl: remoteURL,
      connection: {
        type: 'github',
        personalAccessToken: token,
      },
      syncDirection: 'pull',
    };
    const sync = new Sync(gitDDB, options);
    await await expect(sync.init()).rejects.toThrowError(Err.PushNotAllowedError);

    destroyDBs([gitDDB]);
  });
});
