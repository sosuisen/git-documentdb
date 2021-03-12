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
import { monotonicFactory } from 'ulid';
import { GitDocumentDB } from '../src';
import { RemoteOptions } from '../src/types';
import {
  HttpProtocolRequiredError,
  InvalidRepositoryURLError,
  RepositoryNotOpenError,
  UndefinedPersonalAccessTokenError,
  UndefinedRemoteURLError,
} from '../src/error';
import { RemoteAccess } from '../src/crud/remote_access';

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const idPool: string[] = [];
const allIds: string[] = [];
const MAX_ID = 30;
for (let i = 0; i < MAX_ID; i++) {
  idPool.push(`test_repos_${i}`);
  allIds.push(`test_repos_${i}`);
}
const serialId = () => {
  const id = idPool.shift();
  if (id === undefined) {
    throw new Error('Id pool is empty. Increase MAX_ID.');
  }
  return id;
};

// GITDDB_GITHUB_USER_URL: URL of your GitHub account
// e.g.) https://github.com/foo/
const maybe =
  process.env.GITDDB_GITHUB_USER_URL && process.env.GITDDB_PERSONAL_ACCESS_TOKEN
    ? describe
    : describe.skip;

maybe('remote: use personal access token: ', () => {
  const localDir = `./test/database_remote_by_pat_${monoId()}`;
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  const createRemoteRepository = async (gitDDB: GitDocumentDB, remoteURL: string) => {
    await new RemoteAccess(gitDDB, remoteURL, {
      live: false,
      auth: { type: 'github', personal_access_token: token },
    })
      .createRepositoryOnRemote(remoteURL)
      .catch(() => {});
  };

  const destroyRemoteRepository = async (gitDDB: GitDocumentDB, remoteURL: string) => {
    await new RemoteAccess(gitDDB, remoteURL, {
      live: false,
      auth: { type: 'github', personal_access_token: token },
    })
      .destroyRepositoryOnRemote(remoteURL)
      .catch(() => {});
  };

  beforeAll(async () => {
    // Remote local repositories
    fs.removeSync(path.resolve(localDir));

    console.log('deleting remote test repositories...');
    // Remove test repositories on remote
    const octokit = new Octokit({
      auth: token,
    });
    const urlArray = remoteURLBase!.split('/');
    const owner = urlArray[urlArray.length - 2];
    const promises: Promise<any>[] = [];
    allIds.forEach(id => {
      // console.log('delete: ' + owner + '/' + id);
      promises.push(
        octokit.repos.delete({ owner, repo: id }).catch(err => {
          if (err.status !== 404) {
            console.log(err);
          }
        })
      );
    });
    await Promise.all(promises);
    console.log('done.');
  });

  describe('constructor: ', () => {
    afterAll(() => {
      fs.removeSync(path.resolve(localDir));
    });

    test('Create and remove remote repository by personal access token', async () => {
      const dbName = serialId();
      const remoteURL = remoteURLBase + dbName;
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      // Check if the repository is deleted.
      const octokit = new Octokit({
        auth: token,
      });

      const urlArray = remoteURL.split('/');
      const owner = urlArray[urlArray.length - 2];
      const repo = urlArray[urlArray.length - 1];

      await createRemoteRepository(gitDDB, remoteURL);

      await expect(octokit.repos.listBranches({ owner, repo })).resolves.not.toThrowError();

      await destroyRemoteRepository(gitDDB, remoteURL);

      await expect(octokit.repos.listBranches({ owner, repo })).rejects.toThrowError();
    });

    test('Undefined remoteURL', async () => {
      const dbName = serialId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.open();
      const options: RemoteOptions = {
        live: false,
        auth: {
          type: 'github',
          personal_access_token: '',
        },
      };
      await expect(gitDDB.sync('', options)).rejects.toThrowError(UndefinedRemoteURLError);
      await gitDDB.destroy();
    });

    test('HTTP protocol is required', async () => {
      const dbName = serialId();
      const remoteURL = 'ssh://github.com/';
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.open();
      const options: RemoteOptions = {
        live: false,
        auth: {
          type: 'github',
          personal_access_token: 'foobar',
        },
      };
      await expect(gitDDB.sync(remoteURL, options)).rejects.toThrowError(
        HttpProtocolRequiredError
      );
      await gitDDB.destroy();
    });

    test('Undefined personal access token', async () => {
      const dbName = serialId();
      const remoteURL = remoteURLBase + dbName;
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.open();
      const options: RemoteOptions = {
        live: false,
        auth: {
          type: 'github',
          personal_access_token: '',
        },
      };
      await expect(gitDDB.sync(remoteURL, options)).rejects.toThrowError(
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
      await gitDDB.open();
      const options: RemoteOptions = {
        live: false,
        auth: {
          type: 'github',
          personal_access_token: 'foobar',
        },
      };
      await expect(gitDDB.sync(remoteURL, options)).rejects.toThrowError(
        InvalidRepositoryURLError
      );
      await gitDDB.destroy();
    });
  });

  test.skip('Test _addRemoteRepository');

  describe('connectToRemote: ', () => {
    afterAll(() => {
      //  fs.removeSync(path.resolve(localDir));
    });

    test('Repository not open', async () => {
      const dbName = serialId();
      const remoteURL = remoteURLBase + dbName;
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await expect(
        gitDDB.sync(remoteURL, {
          live: false,
          auth: { type: 'github', personal_access_token: token },
        })
      ).rejects.toThrowError(RepositoryNotOpenError);
      await gitDDB.destroy();
    });

    test('Create RemoteAccess with a new remote repository', async () => {
      const dbName = serialId();
      const remoteURL = remoteURLBase + dbName;
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.open();

      await destroyRemoteRepository(gitDDB, remoteURL);

      await expect(
        gitDDB.sync(remoteURL, {
          live: false,
          auth: { type: 'github', personal_access_token: token },
        })
      ).resolves.not.toThrowError();

      //   await gitDDB.destroy();
    });
  });
});
