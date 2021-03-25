/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import nodegit from '@sosuisen/nodegit';
import { monotonicFactory } from 'ulid';
import fs from 'fs-extra';
import {
  CannotCreateDirectoryError,
  CannotOpenRepositoryError,
  DatabaseExistsError,
  InvalidWorkingDirectoryPathLengthError,
  RepositoryNotFoundError,
  UndefinedDatabaseNameError,
  WorkingDirectoryExistsError,
} from '../src/error';
import { GitDocumentDB } from '../src/index';
import { Validator } from '../src/validator';
import { put_worker } from '../src/crud/put';
import { DatabaseInfo, DatabaseInfoError } from '../src/types';

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

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
  // eslint-disable-next-line unicorn/no-unused-properties
  GIT_REPOSITORY_INIT_BARE: 1,
  // eslint-disable-next-line unicorn/no-unused-properties
  GIT_REPOSITORY_INIT_NO_REINIT: 2,
  // eslint-disable-next-line unicorn/no-unused-properties
  GIT_REPOSITORY_INIT_NO_DOTGIT_DIR: 4,
  GIT_REPOSITORY_INIT_MKDIR: 8,
  // eslint-disable-next-line unicorn/no-unused-properties
  GIT_REPOSITORY_INIT_MKPATH: 16,
  // eslint-disable-next-line unicorn/no-unused-properties
  GIT_REPOSITORY_INIT_EXTERNAL_TEMPLATE: 32,
  // eslint-disable-next-line unicorn/no-unused-properties
  GIT_REPOSITORY_INIT_RELATIVE_GITLINK: 64,
};

describe('GitDocumentDB constructor: ', () => {
  const localDir = `./test/database_open_${monoId()}`;

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

  test('new', () => {
    expect(() => {
      // eslint-disable-next-line no-new
      new GitDocumentDB({ db_name: 'db', local_dir: 'C:\\dir01\\dir02' });
    }).not.toThrowError();
  });

  test('dbName is undefined.', () => {
    // Code must be wrapped by () => {} to test exception
    // https://jestjs.io/docs/en/expect#tothrowerror
    expect(() => {
      /* eslint-disable-next-line no-new */ // @ts-ignore
      new GitDocumentDB({});
    }).toThrowError(UndefinedDatabaseNameError);
  });

  test('Try to create a long name repository.', async () => {
    const maxWorkingDirLen = Validator.maxWorkingDirectoryLength();
    let dbName = 'tmp';
    const workingDirectory = path.resolve(localDir, dbName);
    for (let i = 0; i < maxWorkingDirLen - workingDirectory.length; i++) {
      dbName += '0';
    }

    // Code must be wrapped by () => {} to test exception
    // https://jestjs.io/docs/en/expect#tothrowerror
    let gitddb: GitDocumentDB;
    expect(() => {
      gitddb = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
    }).not.toThrowError();
    // @ts-ignore
    if (gitddb !== undefined) {
      await gitddb.destroy();
    }

    dbName += '0';
    expect(() => {
      // eslint-disable-next-line no-new
      new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
    }).toThrowError(InvalidWorkingDirectoryPathLengthError);
  });

  test('Working directory path is too long.', () => {
    expect(() => {
      /* eslint-disable-next-line no-new */ // @ts-ignore
      new GitDocumentDB({
        db_name:
          '0123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789',
        local_dir:
          '0123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789',
      });
    }).toThrowError(InvalidWorkingDirectoryPathLengthError);
  });
});

describe('Create repository: ', () => {
  const readonlyDir = './test/readonly/';
  const localDir = `./test/database_open_${monoId()}`;

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

  test('Try to create a new repository on a readonly filesystem.', async () => {
    const dbName = monoId();
    // Windows does not support permission option of fs.mkdir().
    if (process.platform === 'win32') {
      console.warn(`  You must create an empty ${readonlyDir} directory by hand, 
right-click the file or folder, click Properties, click the Security tab, 
click on the Advanced button, and then click [disable inheritance] button.
  After that, remove write permission of Authenticated Users.`);
    }
    else {
      if (!fs.existsSync('test')) {
        await fs.mkdir('test');
      }
      await fs.ensureDir(readonlyDir, { mode: 0o400 }).catch((err: Error) => {
        console.error(err);
      });
    }
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: readonlyDir + 'database',
    });
    // You don't have permission
    await expect(gitDDB.create()).rejects.toThrowError(CannotCreateDirectoryError);
    if (process.platform !== 'win32') {
      fs.chmodSync(readonlyDir, 0o644);
    }
  });

  test('Database exists.', async () => {
    const dbName = monoId();

    const gitDDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    // Create db
    await gitDDB.create();
    await gitDDB.open();

    await expect(gitDDB.create()).rejects.toThrowError(DatabaseExistsError);

    await gitDDB.destroy();
  });

  test('Working directory exists.', async () => {
    const dbName = monoId();

    const gitDDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    // Create working directory
    await fs.ensureDir(gitDDB.workingDir());

    // Create db
    await expect(gitDDB.create()).rejects.toThrowError(WorkingDirectoryExistsError);

    // Remove working directory
    await gitDDB.destroy();
  });

  test('Create a new repository.', async () => {
    const dbName = monoId();

    const gitDDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    // Create db
    await expect(gitDDB.create())
      .resolves.toMatchObject({
        ok: true,
        is_new: true,
        is_clone: false,
        is_created_by_gitddb: true,
        is_valid_version: true,
      })
      .catch(e => console.error(e));

    // Check if working directory exists
    expect(fs.existsSync(path.resolve(localDir, dbName))).toBeTruthy();

    // Check path of working directory
    expect(gitDDB.workingDir()).toBe(path.resolve(`${localDir}/${dbName}`));
    // Destroy db
    await gitDDB.destroy().catch(e => console.error(e));
    // fs.access() throw error when a file cannot be accessed.
    await expect(fs.access(path.resolve(localDir, dbName))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  test('Create a new repository by default localDir.', async () => {
    const dbName = monoId();

    const gitDDB = new GitDocumentDB({
      db_name: dbName,
    });
    const defaultLocalDir = './git-documentdb/';
    // Create db
    await gitDDB.create();

    expect(gitDDB.workingDir()).toBe(path.resolve(defaultLocalDir, dbName));
    // Destroy db
    await gitDDB.destroy().catch(e => console.error(e));
    fs.removeSync(path.resolve(defaultLocalDir));
  });

  test.skip('clone remote repository', () => {});
});

describe('Open, close and destroy repository: ', () => {
  const localDir = './test/database_open02_1';

  beforeAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  afterAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  test('Repository does not exist.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    const dbInfo: DatabaseInfo = await gitDDB.open();
    expect((dbInfo as DatabaseInfoError).error).toBeInstanceOf(RepositoryNotFoundError);
  });

  test('Repository is corrupted.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    // Create empty .git directory
    await fs.ensureDir(gitDDB.workingDir() + '/.git/');
    const dbInfo: DatabaseInfo = await gitDDB.open();
    expect((dbInfo as DatabaseInfoError).error).toBeInstanceOf(CannotOpenRepositoryError);
  });

  test('Open an existing repository.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    // Create db
    await gitDDB.create();

    // Close created db
    await expect(gitDDB.close()).resolves.toBeUndefined();

    // Open existing db
    await expect(gitDDB.open()).resolves.toMatchObject({
      ok: true,
      is_new: false,
      is_clone: false,
      is_created_by_gitddb: true,
      is_valid_version: true,
    });
    expect(gitDDB.isOpened()).toBeTruthy();

    // Destroy() closes db automatically
    await expect(gitDDB.destroy()).resolves.toMatchObject({ ok: true });
    expect(gitDDB.isOpened()).toBeFalsy();
  });

  test('Open a repository created by another app.', async () => {
    const dbName = monoId();
    const gitDDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    // Create empty repository
    await nodegit.Repository.init(gitDDB.workingDir(), 0).catch(err => {
      return Promise.reject(err);
    });
    await gitDDB.open();
    // First commit with another db version
    await put_worker(gitDDB, '.gitddb/version', '', 'Another App: 0.1', 'first commit');
    await gitDDB.close();

    await expect(gitDDB.open()).resolves.toMatchObject({
      ok: true,
      is_new: false,
      is_clone: false,
      is_created_by_gitddb: false,
      is_valid_version: false,
    });
    await gitDDB.destroy();
  });

  test('Open a repository created by another version.', async () => {
    const dbName = monoId();
    const gitDDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    // Create empty repository
    await nodegit.Repository.init(gitDDB.workingDir(), 0).catch(err => {
      return Promise.reject(err);
    });
    await gitDDB.open();
    // First commit with another db version
    await put_worker(
      gitDDB,
      '.gitddb/lib_version',
      '',
      'GitDocumentDB: 0.1',
      'first commit'
    );
    await gitDDB.close();

    await expect(gitDDB.open()).resolves.toMatchObject({
      ok: true,
      is_new: false,
      is_clone: false,
      is_created_by_gitddb: true,
      is_valid_version: false,
    });
    await gitDDB.destroy();
  });

  test('Open a repository with no version file.', async () => {
    const dbName = monoId();
    const gitDDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    // Create empty repository
    await nodegit.Repository.init(gitDDB.workingDir(), 0).catch(err => {
      return Promise.reject(err);
    });

    await expect(gitDDB.open()).resolves.toMatchObject({
      ok: true,
      is_new: false,
      is_clone: false,
      is_created_by_gitddb: false,
      is_valid_version: false,
    });
  });

  test('Open db twice.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    // Create db
    await gitDDB.create();
    await expect(gitDDB.open()).resolves.toMatchObject({
      ok: true,
      is_new: false,
      is_clone: false,
      is_created_by_gitddb: true,
      is_valid_version: true,
    });
    await gitDDB.destroy();
  });

  test('Destroy db before open', async () => {
    const dbName = monoId();

    const gitDDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    // Create db
    await gitDDB.create();

    // Destroy db
    await gitDDB.destroy().catch(e => console.error(e));

    // fs.access() throw error when a file cannot be accessed.
    await expect(fs.access(path.resolve(localDir, dbName))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
