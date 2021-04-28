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
import { GitDocumentDB } from '../../src';
import { RemoteOptions } from '../../src/types';
import {
  HttpProtocolRequiredError,
  IntervalTooSmallError,
  InvalidRepositoryURLError,
  RepositoryNotOpenError,
  SyncIntervalLessThanOrEqualToRetryIntervalError,
  UndefinedPersonalAccessTokenError,
  UndefinedRemoteURLError,
} from '../../src/error';
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

beforeAll(() => {
  fs.removeSync(path.resolve(localDir));
});

afterAll(() => {
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

  beforeAll(async () => {
    // Remove remote
    await removeRemoteRepositories(reposPrefix);
  });

  /**
   * Tests for constructor
   */
  it('set live to false by default', async () => {
    const remoteURL = remoteURLBase + serialId();
    const dbName = serialId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    const options: RemoteOptions = {
      remote_url: remoteURL,
      connection: {
        type: 'github',
        personal_access_token: token,
      },
    };
    const sync = new Sync(gitDDB, options);
    expect(sync.options().live).toBe(false);

    destroyDBs([gitDDB]);
  });

  it('set sync_direction to both by default', async () => {
    const remoteURL = remoteURLBase + serialId();
    const dbName = serialId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    const options: RemoteOptions = {
      remote_url: remoteURL,
      connection: {
        type: 'github',
        personal_access_token: token,
      },
    };
    const sync = new Sync(gitDDB, options);
    expect(sync.options().sync_direction).toBe('both');

    destroyDBs([gitDDB]);
  });

  it('set combine_db_strategy to nop by default', async () => {
    const remoteURL = remoteURLBase + serialId();
    const dbName = serialId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    const options: RemoteOptions = {
      remote_url: remoteURL,
      connection: {
        type: 'github',
        personal_access_token: token,
      },
    };
    const sync = new Sync(gitDDB, options);
    expect(sync.options().combine_db_strategy).toBe('throw-error');

    destroyDBs([gitDDB]);
  });

  it('set include_commits to false by default', async () => {
    const remoteURL = remoteURLBase + serialId();
    const dbName = serialId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    const options: RemoteOptions = {
      remote_url: remoteURL,
      connection: {
        type: 'github',
        personal_access_token: token,
      },
    };
    const sync = new Sync(gitDDB, options);
    expect(sync.options().include_commits).toBe(false);

    destroyDBs([gitDDB]);
  });

  it('set conflict_resolve_strategy to ours by default', async () => {
    const remoteURL = remoteURLBase + serialId();
    const dbName = serialId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    const options: RemoteOptions = {
      remote_url: remoteURL,
      connection: {
        type: 'github',
        personal_access_token: token,
      },
    };
    const sync = new Sync(gitDDB, options);
    expect(sync.options().conflict_resolve_strategy).toBe('ours');

    destroyDBs([gitDDB]);
  });

  it('accepts remoteURL which ends with .git', async () => {
    const remoteURL = remoteURLBase + serialId() + '.git';
    const dbName = serialId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    const options: RemoteOptions = {
      remote_url: remoteURL,
      connection: {
        type: 'github',
        personal_access_token: token,
      },
    };
    expect(() => new Sync(gitDDB, options)).not.toThrowError();

    destroyDBs([gitDDB]);
  });

  it('throws UndefinedRemoteURLError when remoteURL is undefined.', async () => {
    const dbName = serialId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    const options: RemoteOptions = {
      connection: {
        type: 'github',
        personal_access_token: '',
      },
    };
    expect(() => new Sync(gitDDB, options)).toThrowError(UndefinedRemoteURLError);
    await gitDDB.destroy();
  });

  it('throws HttpProtocolRequiredError when remoteURL starts with ssh://', async () => {
    const dbName = serialId();
    const remoteURL = 'ssh://github.com/';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    const options: RemoteOptions = {
      remote_url: remoteURL,
      connection: {
        type: 'github',
        personal_access_token: 'foobar',
      },
    };
    expect(() => new Sync(gitDDB, options)).toThrowError(HttpProtocolRequiredError);
    await gitDDB.destroy();
  });

  it('throws UndefinedPersonalAccessTokenError', async () => {
    const dbName = serialId();
    const remoteURL = remoteURLBase + serialId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    const options: RemoteOptions = {
      remote_url: remoteURL,
      connection: {
        type: 'github',
        personal_access_token: '',
      },
    };
    expect(() => new Sync(gitDDB, options)).toThrowError(UndefinedPersonalAccessTokenError);
    await gitDDB.destroy();
  });

  it('does not throw UndefinedPersonalAccessTokenError when sync_directions is "pull" ', async () => {
    const dbName = serialId();
    const remoteURL = remoteURLBase + serialId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    const options: RemoteOptions = {
      remote_url: remoteURL,
      sync_direction: 'pull',
      connection: {
        type: 'github',
        personal_access_token: '',
      },
    };
    expect(() => new Sync(gitDDB, options)).not.toThrowError(
      UndefinedPersonalAccessTokenError
    );
    await gitDDB.destroy();
  });

  it('throws InvalidRepositoryURLError when url does not show a repository.', async () => {
    const dbName = serialId();
    const remoteURL = 'https://github.com/';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    const options: RemoteOptions = {
      remote_url: remoteURL,
      connection: {
        type: 'github',
        personal_access_token: 'foobar',
      },
    };
    expect(() => new Sync(gitDDB, options)).toThrowError(InvalidRepositoryURLError);
    await gitDDB.destroy();
  });

  it('throws IntervalTooSmallError when interval is less than minimumSyncInterval.', async () => {
    const remoteURL = remoteURLBase + serialId();
    const dbName = serialId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    const invalid_options: RemoteOptions = {
      remote_url: remoteURL,
      interval: Sync.minimumSyncInterval - 1,
      connection: {
        type: 'github',
        personal_access_token: '',
      },
    };
    expect(() => new Sync(gitDDB, invalid_options)).toThrowError(IntervalTooSmallError);
    await gitDDB.destroy();

    await gitDDB.create();
    const valid_options: RemoteOptions = {
      remote_url: remoteURL,
      interval: Sync.minimumSyncInterval,
      connection: {
        type: 'github',
        personal_access_token: token,
      },
    };
    expect(() => new Sync(gitDDB, valid_options)).not.toThrowError();

    await gitDDB.destroy();
  });

  it('throws SyncIntervalLessThanOrEqualToRetryIntervalError', async () => {
    const remoteURL = remoteURLBase + serialId();
    const dbName = serialId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    const retry_interval = 5000;
    const options: RemoteOptions = {
      remote_url: remoteURL,
      interval: retry_interval - 1,
      retry_interval,
      connection: {
        type: 'github',
        personal_access_token: token,
      },
    };
    // less than
    expect(() => new Sync(gitDDB, options)).toThrowError(
      SyncIntervalLessThanOrEqualToRetryIntervalError
    );
    await gitDDB.destroy();

    // equal to
    await gitDDB.create();
    options.interval = retry_interval;
    expect(() => new Sync(gitDDB, options)).toThrowError(
      SyncIntervalLessThanOrEqualToRetryIntervalError
    );
    await gitDDB.destroy();

    // more than
    await gitDDB.create();
    // eslint-disable-next-line require-atomic-updates
    options.interval = retry_interval + 1;
    expect(() => new Sync(gitDDB, options)).not.toThrowError();

    await gitDDB.destroy();
  });
});

maybe('<remote/sync> syncImpl()', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  beforeAll(async () => {
    // Remove remote
    await removeRemoteRepositories(reposPrefix);
  });

  it('throws RepositoryNotOpenError.', async () => {
    const dbName = serialId();
    const remoteURL = remoteURLBase + serialId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await expect(
      syncImpl.call(gitDDB, {
        remote_url: remoteURL,
        connection: { type: 'github', personal_access_token: token },
      })
    ).rejects.toThrowError(RepositoryNotOpenError);
    await gitDDB.destroy();
  });
});
