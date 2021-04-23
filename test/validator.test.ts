/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import fs from 'fs-extra';
import { GitDocumentDB } from '../src';
import {
  InvalidCollectionPathCharacterError,
  InvalidCollectionPathLengthError,
  InvalidDbNameCharacterError,
  InvalidIdCharacterError,
  InvalidIdLengthError,
  InvalidLocalDirCharacterError,
  InvalidPropertyNameInDocumentError,
  UndefinedDocumentIdError,
  Validator,
} from '../src/main';

const localDir = './test/database_validate';

beforeEach(function () {
  // @ts-ignore
  console.log(`... ${this.currentTest.title}`);
});

beforeAll(() => {
  fs.removeSync(path.resolve(localDir));
});

afterAll(() => {
  fs.removeSync(path.resolve(localDir));
});

describe('<validator>', () => {
  const dbName = 'test_repos_1';
  const gitDDB: GitDocumentDB = new GitDocumentDB({
    db_name: dbName,
    local_dir: localDir,
  });
  const validator = new Validator(gitDDB.workingDir());

  it('normalizeCollectionPath', () => {
    expect(Validator.normalizeCollectionPath(undefined)).toBe('');
    expect(Validator.normalizeCollectionPath('')).toBe('');
    expect(Validator.normalizeCollectionPath('/')).toBe('');
    expect(Validator.normalizeCollectionPath('¥')).toBe('');
    expect(Validator.normalizeCollectionPath('\\')).toBe('');
    expect(Validator.normalizeCollectionPath('//')).toEqual('');
    expect(Validator.normalizeCollectionPath('¥¥')).toEqual('');
    expect(Validator.normalizeCollectionPath('users\\')).toEqual('users/');
    expect(Validator.normalizeCollectionPath('users¥')).toEqual('users/');
    expect(Validator.normalizeCollectionPath('users')).toBe('users/');
    expect(Validator.normalizeCollectionPath('users/')).toBe('users/');
    expect(Validator.normalizeCollectionPath('/users/')).toBe('users/');
    expect(Validator.normalizeCollectionPath('/users')).toBe('users/');
    expect(Validator.normalizeCollectionPath('users/pages')).toEqual('users/pages/');
    expect(Validator.normalizeCollectionPath('users//pages')).toEqual('users/pages/');
    expect(Validator.normalizeCollectionPath('/users///pages')).toEqual('users/pages/');
    expect(Validator.normalizeCollectionPath('///users///pages')).toEqual('users/pages/');
  });

  it('validateId()', () => {
    /**
     * '_id' only allows **a to z, A to Z, 0 to 9, and these 8 punctuation marks _ - . ( ) [ ]**.
     * '_id' cannot start with an underscore _. (For compatibility with PouchDB and CouchDB)
     * '_id' cannot end with a period . (For compatibility with the file system of Windows)
     */
    // Punctuations
    const disallowedPunctuations = [
      '<',
      '>',
      ':',
      '"',
      '|',
      '?',
      '*',
      '\0',
      '¥',
      '/',
      '\\',
    ];
    disallowedPunctuations.forEach(p =>
      expect(() => validator.validateId(p)).toThrowError(InvalidIdCharacterError)
    );

    const allowedPunctuations = [
      '-',
      '.abc',
      '(',
      ')',
      '[',
      ']',
      'abc_',
      '!',
      '#',
      '$',
      '%',
      '&',
      "'",
      '=',
      '~',
      '@',
      '`',
      '{',
      '}',
      '+',
      ';',
      ',',
    ];
    allowedPunctuations.forEach(p => expect(validator.validateId(p)).toBeUndefined());
    expect(() => validator.validateId('abc.')).toThrowError(InvalidIdCharacterError);
    expect(() => validator.validateId('abc ')).toThrowError(InvalidIdCharacterError);

    expect(() => validator.validateId('_abc')).toThrowError(InvalidIdCharacterError);
    expect(() => validator.validateId('/abc')).toThrowError(
      InvalidCollectionPathCharacterError
    );
    expect(() => validator.validateId('abc./def')).toThrowError(
      InvalidCollectionPathCharacterError
    );
    expect(() => validator.validateId('abc /def')).toThrowError(
      InvalidCollectionPathCharacterError
    );
    expect(() => validator.validateId('./def')).toThrowError(
      InvalidCollectionPathCharacterError
    );
    expect(() => validator.validateId('../def')).toThrowError(
      InvalidCollectionPathCharacterError
    );
    expect(() => validator.validateId('abc/./def')).toThrowError(
      InvalidCollectionPathCharacterError
    );
    expect(() => validator.validateId('abc/../def')).toThrowError(
      InvalidCollectionPathCharacterError
    );

    const maxLen = validator.maxIdLength();
    let _id = '';
    for (let i = 0; i < maxLen; i++) {
      _id += '0';
    }
    expect(() => validator.validateId(_id)).not.toThrowError();
    _id += '0';
    expect(() => validator.validateId(_id)).toThrowError(InvalidIdLengthError);

    expect(() => validator.validateId('春はあけぼの')).not.toThrowError();
  });

  it('validateCollectionPath', () => {
    expect(() => validator.validateCollectionPath('')).not.toThrowError();
    expect(() => validator.validateCollectionPath('foo/bar')).not.toThrowError();
    expect(() => validator.validateCollectionPath('foo\\bar')).not.toThrowError();
    expect(() => validator.validateCollectionPath('foo¥bar')).not.toThrowError();
    expect(() => validator.validateCollectionPath('春はあけぼの')).not.toThrowError();

    expect(() => validator.validateCollectionPath('_')).toThrowError(
      InvalidCollectionPathCharacterError
    );
    expect(() => validator.validateCollectionPath('/')).toThrowError(
      InvalidCollectionPathCharacterError
    );
    expect(() => validator.validateCollectionPath('COM3')).toThrowError(
      InvalidCollectionPathCharacterError
    );
    expect(() => validator.validateCollectionPath('foo./bar')).toThrowError(
      InvalidCollectionPathCharacterError
    );
    expect(() => validator.validateCollectionPath('/foo /bar')).toThrowError(
      InvalidCollectionPathCharacterError
    );
    expect(() => validator.validateCollectionPath('/./bar')).toThrowError(
      InvalidCollectionPathCharacterError
    );
    expect(() => validator.validateCollectionPath('/../bar')).toThrowError(
      InvalidCollectionPathCharacterError
    );
    const maxColLen = validator.maxCollectionPathLength();
    let longPath = '';
    for (let i = 0; i < maxColLen - 1; i++) {
      longPath += '0';
    }
    longPath += '/';
    expect(() => validator.validateCollectionPath(longPath)).not.toThrowError();
    longPath = '0' + longPath;
    expect(() => validator.validateCollectionPath(longPath)).toThrowError(
      InvalidCollectionPathLengthError
    );
  });

  it('validateDocument', () => {
    expect(() =>
      validator.validateDocument({ _id: 'id', _deleted: true })
    ).not.toThrowError();

    expect(() => validator.validateDocument({ _id: undefined })).toThrowError(
      UndefinedDocumentIdError
    );
    expect(() =>
      validator.validateDocument({ _id: 'prof01', _underscore: 'underscore' })
    ).toThrowError(InvalidPropertyNameInDocumentError);
  });

  it('validateDbName', () => {
    expect(() => validator.validateDbName('foo/bar')).toThrowError(
      InvalidDbNameCharacterError
    );
    expect(() => validator.validateDbName('foo\\bar')).toThrowError(
      InvalidDbNameCharacterError
    );
    expect(() => validator.validateDbName('foo¥bar')).toThrowError(
      InvalidDbNameCharacterError
    );
    expect(() => validator.validateDbName('COM3')).toThrowError(
      InvalidDbNameCharacterError
    );
    expect(() => validator.validateDbName('.')).toThrowError(InvalidDbNameCharacterError);
    expect(() => validator.validateDbName('..')).toThrowError(InvalidDbNameCharacterError);
    expect(() => validator.validateDbName('users.')).toThrowError(
      InvalidDbNameCharacterError
    );
    expect(() => validator.validateDbName('users ')).toThrowError(
      InvalidDbNameCharacterError
    );

    expect(() => validator.validateDbName('春はあけぼの')).not.toThrowError();
  });

  it('validLocalDir', () => {
    expect(() => validator.validateLocalDir('COM3')).toThrowError(
      InvalidLocalDirCharacterError
    );
    expect(() => validator.validateLocalDir('/COM3/foo/bar')).toThrowError(
      InvalidLocalDirCharacterError
    );
    expect(() => validator.validateLocalDir(' ')).toThrowError(
      InvalidLocalDirCharacterError
    );
    expect(() => validator.validateLocalDir('foo.')).toThrowError(
      InvalidLocalDirCharacterError
    );
    expect(() => validator.validateLocalDir('foo./bar')).toThrowError(
      InvalidLocalDirCharacterError
    );

    expect(() => validator.validateLocalDir('dir01/dir02')).not.toThrowError();
    expect(() => validator.validateLocalDir('dir01\\dir02')).not.toThrowError();
    expect(() => validator.validateLocalDir('C:/dir01')).not.toThrowError();
    expect(() => validator.validateLocalDir('C:/dir01/dir02')).not.toThrowError();
    expect(() => validator.validateLocalDir('C:\\dir01\\dir02')).not.toThrowError();
    expect(() => validator.validateLocalDir('C:¥dir01¥dir02')).not.toThrowError();
    expect(() => validator.validateLocalDir('.')).not.toThrowError();
    expect(() => validator.validateLocalDir('./')).not.toThrowError();
    expect(() => validator.validateLocalDir('../')).not.toThrowError();
    expect(() => validator.validateLocalDir('/foo/bar/..')).not.toThrowError();
    expect(() => validator.validateLocalDir('/foo/./bar')).not.toThrowError();
    expect(() => validator.validateLocalDir('春は/あけぼの')).not.toThrowError();
  });

  it('testWindowsInvalidFileNameCharacter', () => {
    expect(validator.testWindowsInvalidFileNameCharacter('dir01/dir02')).toBeFalsy();
    expect(validator.testWindowsInvalidFileNameCharacter('dir01\\dir02')).toBeFalsy();
    expect(validator.testWindowsInvalidFileNameCharacter('dir01:dir02')).toBeFalsy();
    expect(validator.testWindowsInvalidFileNameCharacter('C:¥dir01¥dir02')).toBeFalsy();

    expect(
      validator.testWindowsInvalidFileNameCharacter('dir01/dir02', { allow_slash: true })
    ).toBeTruthy();
    expect(
      validator.testWindowsInvalidFileNameCharacter('dir01\\dir02', { allow_slash: true })
    ).toBeTruthy();
    expect(
      validator.testWindowsInvalidFileNameCharacter('C:/dir01', {
        allow_drive_letter: true,
        allow_slash: true,
      })
    ).toBeTruthy();
    expect(
      validator.testWindowsInvalidFileNameCharacter('C:/dir01/dir02', {
        allow_drive_letter: true,
        allow_slash: true,
      })
    ).toBeTruthy();
    expect(
      validator.testWindowsInvalidFileNameCharacter('C:\\dir01\\dir02', {
        allow_drive_letter: true,
        allow_slash: true,
      })
    ).toBeTruthy();
    expect(
      validator.testWindowsInvalidFileNameCharacter('C:¥dir01¥dir02', {
        allow_drive_letter: true,
        allow_slash: true,
      })
    ).toBeTruthy();

    expect(validator.testWindowsInvalidFileNameCharacter('春はあけぼの')).toBeTruthy();
  });
});
