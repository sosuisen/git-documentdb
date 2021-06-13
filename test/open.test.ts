/* eslint-disable @typescript-eslint/naming-convention */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import expect from 'expect';
import nodegit from '@sosuisen/nodegit';
import { monotonicFactory } from 'ulid';
import fs from 'fs-extra';
import sinon from 'sinon';
import {
  CannotCreateDirectoryError,
  CannotCreateRepositoryError,
  CannotOpenRepositoryError,
  InvalidWorkingDirectoryPathLengthError,
  RepositoryNotFoundError,
  UndefinedDatabaseNameError,
} from '../src/error';
import { generateDatabaseId, GitDocumentDB } from '../src/index';
import { putWorker } from '../src/crud/put';
import { DatabaseInfo, DatabaseOpenResult } from '../src/types';
import {
  DATABASE_CREATOR,
  DATABASE_VERSION,
  GIT_DOCUMENTDB_INFO_ID,
  JSON_EXT,
} from '../src/const';
import { Validator } from '../src/validator';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs_module = require('fs-extra');

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = `./test/database_open`;

// Use sandbox to restore stub and spy in parallel mocha tests
let sandbox: sinon.SinonSandbox;
beforeEach(function () {
  // @ts-ignore
  console.log(`... ${this.currentTest.fullTitle()}`);
  sandbox = sinon.createSandbox();
});

afterEach(function () {
  sandbox.restore();
});

after(() => {
  fs.removeSync(path.resolve(localDir));
});

describe('<index>', () => {
  describe('GitDocumentDB#constructor', () => {
    it('new', () => {
      expect(() => {
        // eslint-disable-next-line no-new
        new GitDocumentDB({ dbName: 'db', localDir: 'C:\\dir01\\dir02' });
      }).not.toThrowError();
    });

    it('throws UndefinedDatabaseNameError.', () => {
      // Code must be wrapped by () => {} to test exception
      // https://jestjs.io/docs/en/expect#tothrowerror
      expect(() => {
        /* eslint-disable-next-line no-new */ // @ts-ignore
        new GitDocumentDB({});
      }).toBeInstanceOf(UndefinedDatabaseNameError);
    });

    it('throws InvalidWorkingDirectoryPathLengthError when tries to create a long name repository.', async () => {
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
          dbName,
          localDir,
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
          dbName,
          localDir,
        });
      }).toBeInstanceOf(InvalidWorkingDirectoryPathLengthError);
    });

    it('throws InvalidWorkingDirectoryPathLengthError when working directory path is too long.', () => {
      expect(() => {
        /* eslint-disable-next-line no-new */ // @ts-ignore
        new GitDocumentDB({
          dbName:
            '0123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789',
          localDir:
            '0123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789',
        });
      }).toBeInstanceOf(InvalidWorkingDirectoryPathLengthError);
    });
  });

  describe('create', () => {
    const readonlyDir = './test/_readonly/';

    it('throws CannotCreateDirectoryError when tries to create a new repository on a readonly filesystem.', async () => {
      const dbName = monoId();
      // Windows does not support permission option of fs.ensureDir(). Use stub.
      if (process.platform === 'win32') {
        const stubEnsureDir = sandbox.stub(fs_module, 'ensureDir');
        stubEnsureDir.rejects();
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
        dbName,
        localDir: readonlyDir + 'database',
      });
      // You don't have permission
      await expect(gitDDB.open()).rejects.toBeInstanceOf(CannotCreateDirectoryError);
      if (process.platform !== 'win32') {
        fs.chmodSync(readonlyDir, 0o644);
      }
    });

    it('throws CannotCreateRepositoryError when tries to create a new repository on a readonly filesystem.', async () => {
      const dbName = monoId();
      const stubEnsureDir = sandbox.stub(fs_module, 'ensureDir');
      stubEnsureDir.onFirstCall().resolves().onSecondCall().rejects();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir: readonlyDir + 'database',
      });
      // You don't have permission
      await expect(gitDDB.open()).rejects.toBeInstanceOf(CannotCreateRepositoryError);
    });

    it('creates a new repository.', async () => {
      const dbName = monoId();

      const gitDDB = new GitDocumentDB({
        dbName,
        localDir,
      });

      // Create db
      const dbOpenResult = (await gitDDB.open()) as DatabaseOpenResult;
      expect(dbOpenResult).toEqual({
        dbId: dbOpenResult.dbId,
        creator: DATABASE_CREATOR,
        version: DATABASE_VERSION,
        isNew: true,
        isCreatedByGitddb: true,
        isValidVersion: true,
      });

      expect((dbOpenResult as DatabaseInfo).dbId).toMatch(/^[\dA-HJKMNP-TV-Z]{26}$/);

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

    it('creates a new repository by default localDir.', async () => {
      const dbName = monoId();

      const gitDDB = new GitDocumentDB({
        dbName,
      });
      const defaultLocalDir = './git-documentdb/';
      // Create db
      await gitDDB.open();

      expect(gitDDB.workingDir()).toBe(path.resolve(defaultLocalDir, dbName));
      // Destroy db
      await gitDDB.destroy().catch(e => console.error(e));
      fs.removeSync(path.resolve(defaultLocalDir));
    });
  });

  it('throws RepositoryNotFoundError.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await expect(gitDDB.open({ createIfNotExists: false })).rejects.toBeInstanceOf(
      RepositoryNotFoundError
    );
  });

  it('throws CannotOpenRepositoryError.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    // Create empty .git directory
    await fs.ensureDir(gitDDB.workingDir() + '/.git/');
    await expect(gitDDB.open()).rejects.toBeInstanceOf(CannotOpenRepositoryError);
  });

  it('opens an existing repository.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    // Create db
    const oldResult = (await gitDDB.open()) as DatabaseInfo;

    // Close created db
    await expect(gitDDB.close()).resolves.toBeUndefined();

    // Open existing db
    const dbOpenResult = await gitDDB.open();
    expect(dbOpenResult).toEqual({
      dbId: oldResult.dbId,
      creator: DATABASE_CREATOR,
      version: DATABASE_VERSION,
      isNew: false,
      isCreatedByGitddb: true,
      isValidVersion: true,
    });
    expect(gitDDB.isOpened()).toBeTruthy();

    // Destroy() closes db automatically
    await expect(gitDDB.destroy()).resolves.toEqual({ ok: true });
    expect(gitDDB.isOpened()).toBeFalsy();
  });

  it('opens a repository created by another app.', async () => {
    const dbName = monoId();
    const gitDDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await fs.ensureDir(gitDDB.workingDir());

    // Create empty repository
    await nodegit.Repository.init(gitDDB.workingDir(), 0).catch(err => {
      return Promise.reject(err);
    });
    await gitDDB.open();
    // put another app
    const creator = 'Another App';
    await putWorker(
      gitDDB,
      GIT_DOCUMENTDB_INFO_ID + JSON_EXT,
      JSON.stringify({
        creator,
      }),
      'first commit'
    );
    await gitDDB.close();

    const dbOpenResult = await gitDDB.open();
    expect(dbOpenResult).toEqual({
      dbId: (dbOpenResult as DatabaseInfo).dbId,
      creator,
      version: '',
      isNew: false,
      isCreatedByGitddb: false,
      isValidVersion: false,
    });
    await gitDDB.destroy();
  });

  it('opens a repository created by another version.', async () => {
    const dbName = monoId();
    const gitDDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    // Create empty repository
    await nodegit.Repository.init(gitDDB.workingDir(), 0).catch(err => {
      return Promise.reject(err);
    });
    await gitDDB.open();
    // First commit with another db version
    await putWorker(
      gitDDB,
      GIT_DOCUMENTDB_INFO_ID + JSON_EXT,
      JSON.stringify({
        dbId: generateDatabaseId(),
        creator: DATABASE_CREATOR,
        version: '0.01',
      }),
      'first commit'
    );
    await gitDDB.close();

    const dbOpenResult = await gitDDB.open();
    expect(dbOpenResult).toEqual({
      dbId: (dbOpenResult as DatabaseInfo).dbId,
      creator: DATABASE_CREATOR,
      version: '0.01',
      isNew: false,
      isCreatedByGitddb: true,
      isValidVersion: false,
    });
    await gitDDB.destroy();
  });

  it('returns new dbId when opens db without dbId.', async () => {
    const dbName = monoId();
    const gitDDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    // Create empty repository
    await nodegit.Repository.init(gitDDB.workingDir(), 0).catch(err => {
      return Promise.reject(err);
    });

    await gitDDB.open();

    const prevDbId = gitDDB.dbId();
    // First commit with another db version
    await putWorker(
      gitDDB,
      GIT_DOCUMENTDB_INFO_ID + JSON_EXT,
      JSON.stringify({
        dbId: '',
        creator: DATABASE_CREATOR,
        version: DATABASE_VERSION,
      }),
      'first commit'
    );
    await gitDDB.close();

    const dbOpenResult = await gitDDB.open();
    const newDbId = (dbOpenResult as DatabaseInfo).dbId;

    expect(newDbId).not.toBe(prevDbId);
    expect(dbOpenResult).toEqual({
      dbId: newDbId,
      creator: DATABASE_CREATOR,
      version: DATABASE_VERSION,
      isNew: false,
      isCreatedByGitddb: true,
      isValidVersion: true,
    });
  });

  it('opens db twice.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    // Create db
    await gitDDB.open();

    const dbOpenResult = await gitDDB.open();
    const newDbId = (dbOpenResult as DatabaseInfo).dbId;
    await expect(gitDDB.open()).resolves.toMatchObject({
      dbId: newDbId,
      creator: DATABASE_CREATOR,
      version: DATABASE_VERSION,
      isNew: false,
      isCreatedByGitddb: true,
      isValidVersion: true,
    });
    await gitDDB.destroy();
  });
});
