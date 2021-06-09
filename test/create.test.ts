/* eslint-disable @typescript-eslint/naming-convention */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import sinon from 'sinon';
import { monotonicFactory } from 'ulid';
import fs from 'fs-extra';
import { DatabaseInfo, DatabaseOpenResult } from '../src/types';
import {
  CannotCreateDirectoryError,
  DatabaseExistsError,
  InvalidWorkingDirectoryPathLengthError,
  UndefinedDatabaseNameError,
  WorkingDirectoryExistsError,
} from '../src/error';
import { GitDocumentDB } from '../src/index';
import { Validator } from '../src/validator';
import { DATABASE_CREATOR, DATABASE_VERSION } from '../src/const';
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

afterAll(() => {
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
      }).toThrowError(UndefinedDatabaseNameError);
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
      }).toThrowError(InvalidWorkingDirectoryPathLengthError);
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
      }).toThrowError(InvalidWorkingDirectoryPathLengthError);
    });
  });

  describe('createDB()', () => {
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
      await expect(gitDDB.createDB()).rejects.toThrowError(CannotCreateDirectoryError);
      if (process.platform !== 'win32') {
        fs.chmodSync(readonlyDir, 0o644);
      }
    });

    it('throws DatabaseExistsError.', async () => {
      const dbName = monoId();

      const gitDDB = new GitDocumentDB({
        dbName,
        localDir,
      });

      // Create db
      await gitDDB.createDB();
      await gitDDB.open();

      await expect(gitDDB.createDB()).rejects.toThrowError(DatabaseExistsError);

      await gitDDB.destroy();
    });

    it('throws WorkingDirectoryExistsError if a file exists.', async () => {
      const dbName = monoId();

      const gitDDB = new GitDocumentDB({
        dbName,
        localDir,
      });

      // Create working directory
      await fs.ensureDir(gitDDB.workingDir());

      // Create a file
      fs.writeFileSync(path.resolve(gitDDB.workingDir(), 'tmp.txt'), 'foo');

      // Create db
      await expect(gitDDB.createDB()).rejects.toThrowError(WorkingDirectoryExistsError);

      // Remove working directory
      await gitDDB.destroy();
    });

    it('throws WorkingDirectoryExistsError if a directory exists.', async () => {
      const dbName = monoId();

      const gitDDB = new GitDocumentDB({
        dbName,
        localDir,
      });

      // Create working directory
      await fs.ensureDir(gitDDB.workingDir());

      // Create a directory
      await fs.ensureDir(path.resolve(gitDDB.workingDir(), '.git'));

      // Create db
      await expect(gitDDB.createDB()).rejects.toThrowError(WorkingDirectoryExistsError);

      // Remove working directory
      await gitDDB.destroy();
    });

    it('does not throws WorkingDirectoryExistsError if empty.', async () => {
      const dbName = monoId();

      const gitDDB = new GitDocumentDB({
        dbName,
        localDir,
      });

      // Create working directory
      await fs.ensureDir(gitDDB.workingDir());

      // Create db
      const dbOpenResult = (await gitDDB.createDB()) as DatabaseOpenResult;
      expect(dbOpenResult).toMatchObject({
        ok: true,
        creator: DATABASE_CREATOR,
        version: DATABASE_VERSION,
        is_new: true,
        is_clone: false,
        is_created_by_gitddb: true,
        is_valid_version: true,
      });

      expect((dbOpenResult as DatabaseInfo).dbId).toMatch(/^[\dA-HJKMNP-TV-Z]{26}$/);

      // Remove working directory
      await gitDDB.destroy();
    });

    it('creates a new repository.', async () => {
      const dbName = monoId();

      const gitDDB = new GitDocumentDB({
        dbName,
        localDir,
      });

      // Create db
      const dbOpenResult = (await gitDDB.createDB()) as DatabaseOpenResult;
      expect(dbOpenResult).toMatchObject({
        ok: true,
        creator: DATABASE_CREATOR,
        version: DATABASE_VERSION,
        is_new: true,
        is_clone: false,
        is_created_by_gitddb: true,
        is_valid_version: true,
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
      await gitDDB.createDB();

      expect(gitDDB.workingDir()).toBe(path.resolve(defaultLocalDir, dbName));
      // Destroy db
      await gitDDB.destroy().catch(e => console.error(e));
      fs.removeSync(path.resolve(defaultLocalDir));
    });
  });
});
