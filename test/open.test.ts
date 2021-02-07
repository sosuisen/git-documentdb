  
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import fs from 'fs-extra';
import path from 'path';
import { CannotCreateDirectoryError, InvalidWorkingDirectoryPathLengthError } from '../src/error';
import { GitDocumentDB } from '../src/index';
import nodegit from 'nodegit';


interface RepositoryInitOptions {
  description?: string;
  initialHead?: string;
  flags?: number; // https://libgit2.org/libgit2/#HEAD/type/git_repository_init_flag_t
  mode?: number; // https://libgit2.org/libgit2/#HEAD/type/git_repository_init_mode_t
  originUrl?: string;
  templatePath?: string;
  version?: number;
  workdirPath?: string;
}

const repositoryInitOptionFlags = {
  GIT_REPOSITORY_INIT_BARE: 1,
  GIT_REPOSITORY_INIT_NO_REINIT: 2,
  GIT_REPOSITORY_INIT_NO_DOTGIT_DIR: 4,
  GIT_REPOSITORY_INIT_MKDIR: 8,
  GIT_REPOSITORY_INIT_MKPATH: 16,
  GIT_REPOSITORY_INIT_EXTERNAL_TEMPLATE: 32,
  GIT_REPOSITORY_INIT_RELATIVE_GITLINK: 64,
};

describe('Create repository', () => {
  const readonlyDir = './test/readonly/';
  const localDir = './test/database_open01_1';

  beforeAll(() => {
    if (process.platform !== 'win32') {
      fs.removeSync(path.resolve(localDir));
    }
  });

  afterAll(() => {
    if (process.platform !== 'win32') {
      fs.removeSync(path.resolve(localDir));
    }
  });

  test('open(): Try to create a new repository on a readonly filesystem.', async () => {
    const dbName = './test_repos_1';
    // Windows does not support permission option of fs.mkdir().
    if (process.platform === 'win32') {
      console.warn(`  You must create an empty ${readonlyDir} directory by hand, 
right-click the file or folder, click Properties, click the Security tab, 
click on the Advanced button, and then click [disable inheritance] button.
  After that, remove write permission of Authenticated Users.`);
    }
    else {
      if (!fs.existsSync('test')){
        await fs.mkdir('test');
      }
      await fs.ensureDir(readonlyDir, { mode: 0o400 }).catch((err: Error) => { console.error(err) });
    }
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: readonlyDir + 'database'
    });
    // You don't have permission
    await expect(gitDDB.open()).rejects.toThrowError(CannotCreateDirectoryError);
    if (process.platform !== 'win32') {
      fs.chmodSync(readonlyDir, 0o644);
    }
  });


  test('open(): Create and destroy a new repository.', async () => {
    const dbName = './test_repos_2';

    const gitDDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });

    // Create db
    await expect(gitDDB.open()).resolves.toMatchObject({ isNew: true }).catch(e => console.error(e));
    // Check path of working directory
    expect(gitDDB.workingDir()).toBe(path.resolve('./test/database_open01_1/test_repos_2'));
    // Destroy db
    await expect(gitDDB.destroy()).resolves.toBeTruthy().catch(e => console.error(e));
    // fs.access() throw error when a file cannot be accessed.    
    await expect(fs.access(path.resolve(localDir, dbName))).rejects.toMatchObject({ name: 'Error', code: 'ENOENT' });
  });


  test('open(): Try to create a long name repository.', async () => {
    const dbName = './0123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789';
    // Code must be wrapped by () => {} to test exception
    // https://jestjs.io/docs/en/expect#tothrowerror
    expect(() => {
      new GitDocumentDB({
        dbName: dbName,
        localDir: localDir
      });
    }).toThrowError(InvalidWorkingDirectoryPathLengthError);
  });
});


describe('Open, close and destroy repository', () => {
  const localDir = './test/database_open02_1';

  beforeAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  afterAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  test('open(), close() and destroy(): Open an existing repository.', async () => {
    const dbName = './test_repos_1';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });

    // Create db
    await gitDDB.open();

    // Close created db
    await expect(gitDDB.close()).resolves.toBeTruthy();

    // Open existing db
    await expect(gitDDB.open()).resolves.toMatchObject({ isNew: false, isCreatedByGitDDB: true, isValidVersion: true });
    expect(gitDDB.isOpened()).toBeTruthy();

    // Destroy() closes db automatically
    await expect(gitDDB.destroy()).resolves.toBeTruthy();
    expect(gitDDB.isOpened()).toBeFalsy();
  });


  test('open(): Open a repository created by another app.', async () => {
    const dbName = 'test_repos_2';
    const gitDDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    const options: RepositoryInitOptions = {
      description: 'another app',
      flags: repositoryInitOptionFlags.GIT_REPOSITORY_INIT_MKDIR,
      initialHead: 'main'
    };
    // Create git repository with invalid description
    await fs.ensureDir(localDir);
    // @ts-ignore
    await nodegit.Repository.initExt(path.resolve(localDir, dbName), options).catch(err => { throw new Error(err) });
    await gitDDB.close();

    await expect(gitDDB.open()).resolves.toMatchObject({ isNew: false, isCreatedByGitDDB: false, isValidVersion: false });
    await gitDDB.destroy();
  });


  test('open(): Open a repository created by another version.', async () => {
    const dbName = 'test_repos_3';
    const gitDDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    const options: RepositoryInitOptions = {
      description: 'GitDocumentDB: 0.1',
      flags: repositoryInitOptionFlags.GIT_REPOSITORY_INIT_MKDIR,
      initialHead: 'main'
    };
    // Create git repository with invalid description
    await fs.ensureDir(localDir);
    // @ts-ignore
    await nodegit.Repository.initExt(path.resolve(localDir, dbName), options).catch(err => { throw new Error(err) });
    await gitDDB.close();

    await expect(gitDDB.open()).resolves.toMatchObject({ isNew: false, isCreatedByGitDDB: true, isValidVersion: false });
    await gitDDB.destroy();
  });

  test('open(): Open a repository with no description file.', async () => {
    const dbName = 'test_repos_4';
    const gitDDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();
    const workingDirectory = gitDDB.workingDir();
    await gitDDB.close();
    fs.removeSync(path.resolve(workingDirectory, '.git', 'description'));
    await expect(gitDDB.open()).resolves.toMatchObject({ isNew: false, isCreatedByGitDDB: false, isValidVersion: false });
  });

  test('Open db twice.', async () => {
    const dbName = './test_repos_5';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });

    // Create db
    const info = await gitDDB.open();
    await expect(gitDDB.open()).resolves.toMatchObject(info);
    await gitDDB.destroy();
  });

});
