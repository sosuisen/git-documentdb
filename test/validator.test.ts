/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import nodegit from '@sosuisen/nodegit';
import fs from 'fs-extra';
import { GitDocumentDB } from '../src';
import {
  InvalidCollectionPathCharacterError,
  InvalidCollectionPathLengthError,
  InvalidDbNameCharacterError,
  InvalidIdCharacterError,
  InvalidIdLengthError,
  InvalidJsonObjectError,
  InvalidLocalDirCharacterError,
  InvalidPropertyNameInDocumentError,
  InvalidWorkingDirectoryPathLengthError,
  UndefinedDocumentIdError,
} from '../src/main';
import { Validator } from '../src/validator';

describe('Validations', () => {
  const localDir = './test/database_validate01';
  const dbName = 'test_repos_1';
  const gitDDB: GitDocumentDB = new GitDocumentDB({
    db_name: dbName,
    local_dir: localDir,
  });
  const validator = new Validator(gitDDB.workingDir());

  beforeAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  afterAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  test('normalizeCollectionPath', () => {
    expect(Validator.normalizeCollectionPath(undefined)).toBe('');
    expect(Validator.normalizeCollectionPath('')).toBe('');
    expect(Validator.normalizeCollectionPath('/')).toBe('');
    expect(Validator.normalizeCollectionPath('\\')).toBe('');
    expect(Validator.normalizeCollectionPath('//')).toEqual('');
    expect(Validator.normalizeCollectionPath('users')).toBe('users/');
    expect(Validator.normalizeCollectionPath('users/')).toBe('users/');
    expect(Validator.normalizeCollectionPath('/users/')).toBe('users/');
    expect(Validator.normalizeCollectionPath('/users')).toBe('users/');
    expect(Validator.normalizeCollectionPath('users/pages')).toEqual('users/pages/');
    expect(Validator.normalizeCollectionPath('users//pages')).toEqual('users/pages/');
    expect(Validator.normalizeCollectionPath('/users///pages')).toEqual('users/pages/');
    expect(Validator.normalizeCollectionPath('///users///pages')).toEqual('users/pages/');
  });

  test('validateId()', () => {
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
      '¥',
      '/',
      '\\',
      '|',
      '?',
      '*',
      '\0',
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
    // Cannot start with an underscore
    expect(() => validator.validateId('_abc')).toThrowError(InvalidIdCharacterError);
    // Cannot end with a period
    expect(() => validator.validateId('abc.')).toThrowError(InvalidIdCharacterError);

    const maxLen = validator.maxIdLength();
    let _id = '';
    for (let i = 0; i < maxLen; i++) {
      _id += '0';
    }
    expect(() => validator.validateId(_id)).not.toThrowError();
    _id += '0';
    expect(() => validator.validateId(_id)).toThrowError(InvalidIdLengthError);
  });

  test('validateCollectionPath', () => {
    expect(() => validator.validateCollectionPath('')).not.toThrowError();
    expect(() => validator.validateCollectionPath('_')).toThrowError(
      InvalidCollectionPathCharacterError
    );
    expect(() => validator.validateCollectionPath('/')).toThrowError(
      InvalidCollectionPathCharacterError
    );
    expect(() => validator.validateCollectionPath('COM3')).toThrowError(
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

  test('validateDocument', () => {
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

  test('validateDbName', () => {
    expect(() => validator.validateDbName('COM3')).toThrowError(
      InvalidDbNameCharacterError
    );
  });

  test('validLocalDir', () => {
    expect(() => validator.validateLocalDir('COM3')).toThrowError(
      InvalidLocalDirCharacterError
    );
    expect(() => validator.validateLocalDir('dir01/dir02')).not.toThrowError();
    expect(() => validator.validateLocalDir('dir01\\dir02')).not.toThrowError();
    expect(() => validator.validateLocalDir('C:/dir01')).not.toThrowError();
    expect(() => validator.validateLocalDir('C:/dir01/dir02')).not.toThrowError();
    expect(() => validator.validateLocalDir('C:\\dir01\\dir02')).not.toThrowError();
  });

  test('testWindowsInvalidFileNameCharacter', () => {
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
  });
});

describe('Using validation in other functions', () => {
  const localDir = './test/database_validate02';

  beforeAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  afterAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  test('GitDocumentDB constructor', () => {
    expect(() => {
      // eslint-disable-next-line no-new
      new GitDocumentDB({ db_name: 'db', local_dir: 'C:\\dir01\\dir02' });
    }).not.toThrowError();
  });

  test('open(): Try to create a long name repository.', async () => {
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

  test('put(): key includes invalid character.', async () => {
    const dbName = 'test_repos_put01';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.open();
    await expect(gitDDB.put({ _id: '<test>', name: 'shirase' })).rejects.toThrowError(
      InvalidIdCharacterError
    );
    await expect(gitDDB.put({ _id: '_test', name: 'shirase' })).rejects.toThrowError(
      InvalidIdCharacterError
    );
    await expect(gitDDB.put({ _id: 'test.', name: 'shirase' })).rejects.toThrowError(
      InvalidIdCharacterError
    );
    await gitDDB.destroy();
  });

  test('put(): key length is invalid.', async () => {
    const dbName = 'test_repos_put02';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.open();
    const validator = new Validator(gitDDB.workingDir());
    const maxIdLen = validator.maxIdLength();
    let id = '';
    for (let i = 0; i < maxIdLen; i++) {
      id += '0';
    }

    await expect(gitDDB.put({ _id: id, name: 'shirase' })).resolves.toMatchObject({
      ok: true,
      id: expect.stringMatching(id),
      file_sha: expect.stringMatching(/^[\da-z]{40}$/),
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });
    id += '0';

    await expect(gitDDB.put({ _id: id, name: 'shirase' })).rejects.toThrowError(
      InvalidIdLengthError
    );
    await expect(gitDDB.put({ _id: '', name: 'shirase' })).rejects.toThrowError(
      InvalidIdCharacterError
    );
    await expect(gitDDB.put({ _id: '/', name: 'shirase' })).rejects.toThrowError(
      InvalidIdCharacterError
    );

    await gitDDB.destroy();
  });

  test('put(): key includes punctuations.', async () => {
    const dbName = 'test_repos_put03';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.open();
    const _id = '-.()[]_';
    await expect(gitDDB.put({ _id: _id, name: 'shirase' })).resolves.toMatchObject({
      ok: true,
      id: expect.stringMatching(/^-.\(\)\[]_$/),
      file_sha: expect.stringMatching(/^[\da-z]{40}$/),
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });
    await gitDDB.destroy();
  });

  test('put(): Put a invalid JSON Object (not pure)', async () => {
    const dbName = 'test_repos_put04';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.open();
    // JSON.stringify() throws error if an object is recursive.
    const obj1 = { obj: {} };
    const obj2 = { obj: obj1 };
    obj1.obj = obj2;
    await expect(gitDDB.put({ _id: 'prof01', obj: obj1 })).rejects.toThrowError(
      InvalidJsonObjectError
    );
    await gitDDB.destroy();
  });

  test('get(): Get invalid JSON', async () => {
    const dbName = 'test_repos_get01';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.open();

    const _id = 'invalidJSON';
    let file_sha: string;
    const data = 'invalid data'; // JSON.parse() will throw error
    const _currentRepository = gitDDB.getRepository();
    if (_currentRepository) {
      try {
        const fileExt = '.json';
        const filename = _id + fileExt;
        const filePath = path.resolve(gitDDB.workingDir(), filename);
        const dir = path.dirname(filePath);
        await fs.ensureDir(dir).catch((err: Error) => console.error(err));
        await fs.writeFile(filePath, data);

        const index = await _currentRepository.refreshIndex(); // read latest index

        await index.addByPath(filename); // stage
        await index.write(); // flush changes to index
        const changes = await index.writeTree(); // get reference to a set of changes

        const entry = index.getByPath(filename, 0); // https://www.nodegit.org/api/index/#STAGE
        file_sha = entry.id.tostrS();

        const gitAuthor = {
          name: 'GitDocumentDB',
          email: 'system@gdd.localhost',
        };

        const author = nodegit.Signature.now(gitAuthor.name, gitAuthor.email);
        const committer = nodegit.Signature.now(gitAuthor.name, gitAuthor.email);

        // Calling nameToId() for HEAD throws error when this is first commit.
        const head = await nodegit.Reference.nameToId(_currentRepository, 'HEAD').catch(
          e => false
        ); // get HEAD
        let commit;
        if (!head) {
          // First commit
          commit = await _currentRepository.createCommit(
            'HEAD',
            author,
            committer,
            'message',
            changes,
            []
          );
        }
        else {
          const parent = await _currentRepository.getCommit(head as nodegit.Oid); // get the commit of HEAD
          commit = await _currentRepository.createCommit(
            'HEAD',
            author,
            committer,
            'message',
            changes,
            [parent]
          );
        }
      } catch (e) {
        console.error(e);
      }

      await expect(gitDDB.get(_id)).rejects.toThrowError(InvalidJsonObjectError);
    }
    await gitDDB.destroy();
  });

  test('allDocs(): Get invalid JSON', async () => {
    const dbName = 'test_repos_allDocs01';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.open();

    const _id = 'invalidJSON';
    let file_sha, commit_sha: string;
    const data = 'invalid data'; // JSON.parse() will throw error
    const _currentRepository = gitDDB.getRepository();
    if (_currentRepository) {
      try {
        const filePath = path.resolve(gitDDB.workingDir(), _id);
        const dir = path.dirname(filePath);
        await fs.ensureDir(dir).catch((err: Error) => console.error(err));
        await fs.writeFile(filePath, data);

        const index = await _currentRepository.refreshIndex(); // read latest index

        await index.addByPath(_id); // stage
        await index.write(); // flush changes to index
        const changes = await index.writeTree(); // get reference to a set of changes

        const entry = index.getByPath(_id, 0); // https://www.nodegit.org/api/index/#STAGE
        file_sha = entry.id.tostrS();

        const gitAuthor = {
          name: 'GitDocumentDB',
          email: 'system@gdd.localhost',
        };

        const author = nodegit.Signature.now(gitAuthor.name, gitAuthor.email);
        const committer = nodegit.Signature.now(gitAuthor.name, gitAuthor.email);

        // Calling nameToId() for HEAD throws error when this is first commit.
        const head = await nodegit.Reference.nameToId(_currentRepository, 'HEAD').catch(
          e => false
        ); // get HEAD
        let commit;
        if (!head) {
          // First commit
          commit = await _currentRepository.createCommit(
            'HEAD',
            author,
            committer,
            'message',
            changes,
            []
          );
        }
        else {
          const parent = await _currentRepository.getCommit(head as nodegit.Oid); // get the commit of HEAD
          commit = await _currentRepository.createCommit(
            'HEAD',
            author,
            committer,
            'message',
            changes,
            [parent]
          );
        }
      } catch (e) {
        console.error(e);
      }

      await expect(gitDDB.allDocs({ include_docs: true })).rejects.toThrowError(
        InvalidJsonObjectError
      );
    }
    await gitDDB.destroy();
  });

  it('Check JSON property name');
});
