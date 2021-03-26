/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

/**
 * Test synchronization (pull & push)
 * by using GitHub Personal Access Token
 * These tests create a new repository on GitHub if not exists.
 */
import path from 'path';
import { Octokit } from '@octokit/rest';
import fs from 'fs-extra';
import { GitDocumentDB } from '../src';
import { RemoteOptions } from '../src/types';
import {
  HttpProtocolRequiredError,
  IntervalTooSmallError,
  InvalidRepositoryURLError,
  RepositoryNotOpenError,
  UndefinedPersonalAccessTokenError,
  UndefinedRemoteURLError,
} from '../src/error';
import { minimumSyncInterval, Sync } from '../src/remote/sync';
import { RemoteRepository } from '../src/remote/remote_repository';
import { removeRemoteRepositories } from './remote_utils';

const reposPrefix = 'test_pat___';
const localDir = `./test/database_remote_github_pat`;

let idCounter = 0;
const serialId = () => {
  return `${reposPrefix}${idCounter++}`;
};

beforeEach(function () {
  // @ts-ignore
  console.log(`=== ${this.currentTest.fullTitle()}`);
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

maybe('remote: use personal access token: constructor and basic network access: ', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  const createRemoteRepository = async (remoteURL: string) => {
    await new RemoteRepository(remoteURL, {
      type: 'github',
      personal_access_token: token,
    })
      .create()
      .catch(err => {
        console.debug('Cannot create: ' + remoteURL);
        console.debug(err);
      });
  };

  const destroyRemoteRepository = async (remoteURL: string) => {
    await new RemoteRepository(remoteURL, {
      type: 'github',
      personal_access_token: token,
    })
      .destroy()
      .catch(err => {
        console.debug('Cannot delete: ' + remoteURL);
        console.debug(err);
      });
  };

  beforeAll(async () => {
    // Remove remote
    await removeRemoteRepositories(reposPrefix);
  });

  /**
   * Tests for constructor
   */
  describe('constructor: ', () => {
    test('Create and remove remote repository by personal access token', async () => {
      const remoteURL = remoteURLBase + serialId();

      // Check if the repository is deleted.
      const octokit = new Octokit({
        auth: token,
      });

      const urlArray = remoteURL.split('/');
      const owner = urlArray[urlArray.length - 2];
      const repo = urlArray[urlArray.length - 1];

      await createRemoteRepository(remoteURL);

      await expect(octokit.repos.listBranches({ owner, repo })).resolves.not.toThrowError();

      await destroyRemoteRepository(remoteURL);

      await expect(octokit.repos.listBranches({ owner, repo })).rejects.toThrowError();
    });

    test('Undefined remoteURL', async () => {
      const dbName = serialId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.create();
      const options: RemoteOptions = {
        auth: {
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
        auth: {
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
        auth: {
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
        auth: {
          type: 'github',
          personal_access_token: 'foobar',
        },
      };
      await expect(gitDDB.sync(options)).rejects.toThrowError(InvalidRepositoryURLError);
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
        interval: minimumSyncInterval - 1,
        auth: {
          type: 'github',
          personal_access_token: '',
        },
      };
      await expect(gitDDB.sync(invalid_options)).rejects.toThrowError(
        IntervalTooSmallError
      );
      await gitDDB.destroy();

      await gitDDB.create();
      const valid_options: RemoteOptions = {
        remote_url: remoteURL,
        interval: minimumSyncInterval,
        auth: {
          type: 'github',
          personal_access_token: token,
        },
      };
      await expect(gitDDB.sync(valid_options)).resolves.not.toThrowError();

      await gitDDB.destroy();
    });
  });

  /**
   * connectToRemote
   */
  describe('connect(): ', () => {
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
          auth: { type: 'github', personal_access_token: token },
        })
      ).rejects.toThrowError(RepositoryNotOpenError);
      await gitDDB.destroy();
    });

    test('Create Sync with a new remote repository', async () => {
      const dbName = serialId();
      const remoteURL = remoteURLBase + serialId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.create();

      const options: RemoteOptions = {
        remote_url: remoteURL,
        auth: { type: 'github', personal_access_token: token },
      };
      const repos = gitDDB.repository();
      const remote = new Sync(gitDDB, options);
      await expect(remote.init(repos!)).resolves.toMatchObject({ operation: 'push' });
      expect(remote.upstream_branch).toBe(`origin/${gitDDB.defaultBranch}`);

      await gitDDB.destroy();
    });

    test('Create Sync with an existed remote repository', async () => {
      const dbName = serialId();
      const remoteURL = remoteURLBase + serialId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.create();

      const options: RemoteOptions = {
        remote_url: remoteURL,
        auth: { type: 'github', personal_access_token: token },
      };
      await gitDDB.sync(options);
      // A remote repository has been created by the first sync().

      gitDDB.removeRemote(remoteURL);

      // Sync with an existed remote repository
      const repos = gitDDB.repository();
      const remote = new Sync(gitDDB, options);
      await expect(remote.init(repos!)).resolves.toMatchObject({ operation: 'nop' });

      await gitDDB.destroy();
    });

    test('Get remote', async () => {
      const dbName = serialId();
      const remoteURL = remoteURLBase + serialId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.create();

      const remote = await gitDDB.sync({
        remote_url: remoteURL,
        auth: { type: 'github', personal_access_token: token },
      });
      expect(gitDDB.getRemote(remoteURL)).toBe(remote);

      await gitDDB.destroy();
    });
  });

  /**
   * Operate remote repository
   */
  describe('Operate remote repository: ', () => {
    test('Create remote repository', async () => {
      const remoteURL = remoteURLBase + serialId();

      const dbNameA = serialId();

      const dbA: GitDocumentDB = new GitDocumentDB({
        db_name: dbNameA,
        local_dir: localDir,
      });
      const options: RemoteOptions = {
        remote_url: remoteURL,
        auth: { type: 'github', personal_access_token: token },
      };
      // Check dbInfo
      await expect(dbA.create(options)).resolves.toMatchObject({
        is_new: true,
        is_clone: false,
        is_created_by_gitddb: true,
        is_valid_version: true,
      });

      // Check remote
      const octokit = new Octokit({
        auth: token,
      });
      const urlArray = remoteURL.split('/');
      const owner = urlArray[urlArray.length - 2];
      const repo = urlArray[urlArray.length - 1];
      await expect(octokit.repos.listBranches({ owner, repo })).resolves.not.toThrowError();

      await dbA.destroy();
    });

    test.skip('Test _addRemoteRepository');
    test.skip('Remove remote repository');
  });

  test.skip('Test network errors');
});
