/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import fs from 'fs-extra';
import path from 'path';
import { GitDocumentDB } from '../src';
import { InvalidIdCharacterError } from '../src/main';
import { Validator } from '../src/validator';

describe('Close database', () => {
  const localDir = './test/database_validate01';
  const dbName = 'test_repos_1';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });  
  const validator = new Validator(gitDDB.workingDir());
  
  beforeAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  afterAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  test('validateId()', async () => {
    /**
     * '_id' only allows **a to z, A to Z, 0 to 9, and these 8 punctuation marks _ - . ( ) [ ]**.
     * '_id' cannot start with an underscore _. (For compatibility with PouchDB and CouchDB)
     * '_id' cannot end with a period . (For compatibility with the file system of Windows)
     */
    // Punctuations
    // Good
    expect(validator.validateId('-.()[]_')).toBeUndefined();
    // Bad
    const punctuations = ['!', '"', '#', '$', '%', '&', '\'', '=', '~', '|', '@', '`', '{', '}', '*', '+', ';', ',', ':', '<', '>', '?', '\\'];
    punctuations.forEach(p => expect(() => validator.validateId(p)).toThrowError(InvalidIdCharacterError));
    // Cannot start with an underscore
    expect(() => validator.validateId('_abc')).toThrowError(InvalidIdCharacterError);
    // Cannot end with a period
    expect(() => validator.validateId('abc.')).toThrowError(InvalidIdCharacterError);

  });

  test.todo('validateDirpath()');

  test.todo('validateKey()');

  test.todo('validateDocument');
    
  test.todo('validateDbName');

  test.todo('validLocalDir')
});