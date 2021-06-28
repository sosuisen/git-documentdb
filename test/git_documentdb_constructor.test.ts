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
import { Err } from '../src/error';
import { GitDocumentDB } from '../src/git_documentdb';
import { Validator } from '../src/validator';

const localDir = `./test/database_gitddb_constructor`;

beforeEach(function () {
  // @ts-ignore
  console.log(`... ${this.currentTest.fullTitle()}`);
});

describe('<index>', () => {
  describe('GitDocumentDB#constructor', () => {
    it('new', () => {
      expect(() => {
        // eslint-disable-next-line no-new
        new GitDocumentDB({ dbName: 'db', localDir });
      }).not.toThrowError();
    });

    it('throws UndefinedDatabaseNameError.', () => {
      // Code must be wrapped by () => {} to test exception
      // https://jestjs.io/docs/en/expect#tothrowerror
      expect(() => {
        /* eslint-disable-next-line no-new */ // @ts-ignore
        new GitDocumentDB({});
      }).toThrowError(Err.UndefinedDatabaseNameError);
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
      }).toThrowError(Err.InvalidWorkingDirectoryPathLengthError);
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
      }).toThrowError(Err.InvalidWorkingDirectoryPathLengthError);
    });
  });
});
