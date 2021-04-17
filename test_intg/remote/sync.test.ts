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
  AuthNeededForPushOrSyncError,
  HttpProtocolRequiredError,
  IntervalTooSmallError,
  InvalidRepositoryURLError,
  RepositoryNotOpenError,
  UndefinedPersonalAccessTokenError,
  UndefinedRemoteURLError,
} from '../../src/error';
import { Sync } from '../../src/remote/sync';
import { removeRemoteRepositories } from '../../test/remote_utils';

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

maybe('remote: sync: constructor: ', () => {
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
  test('Undefined remoteURL', async () => {
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
    await expect(gitDDB.sync(options)).rejects.toThrowError(UndefinedRemoteURLError);
    await gitDDB.destroy();
  });

  test('HTTP protocol is required', async () => {
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
    await expect(gitDDB.sync(options)).rejects.toThrowError(HttpProtocolRequiredError);
    await gitDDB.destroy();
  });

  test('Undefined personal access token', async () => {
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
    await expect(gitDDB.sync(options)).rejects.toThrowError(
      UndefinedPersonalAccessTokenError
    );
    await gitDDB.destroy();
  });

  test('Invalid Remote Repository URL', async () => {
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
    await expect(gitDDB.sync(options)).rejects.toThrowError(InvalidRepositoryURLError);
    await gitDDB.destroy();
  });

  test('Undefined connection options', async () => {
    const remoteURL = remoteURLBase + serialId();
    const dbName = serialId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    const options: RemoteOptions = {
      remote_url: remoteURL,
    };
    await expect(gitDDB.sync(options)).rejects.toThrowError(AuthNeededForPushOrSyncError);
    await gitDDB.destroy();
  });

  test('Interval is too small', async () => {
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
    await expect(gitDDB.sync(invalid_options)).rejects.toThrowError(IntervalTooSmallError);
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
    await expect(gitDDB.sync(valid_options)).resolves.not.toThrowError();

    await gitDDB.destroy();
  });

  test('Repository not open', async () => {
    const dbName = serialId();
    const remoteURL = remoteURLBase + serialId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await expect(
      gitDDB.sync({
        remote_url: remoteURL,
        connection: { type: 'github', personal_access_token: token },
      })
    ).rejects.toThrowError(RepositoryNotOpenError);
    await gitDDB.destroy();
  });
});
