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
import { monotonicFactory } from 'ulid';
import {
  InvalidIdCharacterError,
  InvalidIdLengthError,
  InvalidJsonObjectError,
  InvalidPropertyNameInDocumentError,
  RepositoryNotOpenError,
  UndefinedDBError,
  UndefinedDocumentIdError,
} from '../../src/error';
import { GitDocumentDB } from '../../src/index';
import { Validator } from '../../src/validator';
import { put_worker } from '../../src/crud/put';
import { SHORT_SHA_LENGTH } from '../../src/const';

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = `./test/database_put`;

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

describe('put(): validate: overload 1:', () => {
  test('Repository is not opened.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await expect(gitDDB.put({ _id: 'prof01', name: 'Shirase' })).rejects.toThrowError(
      RepositoryNotOpenError
    );
    await expect(
      put_worker(
        gitDDB,
        'prof01',
        gitDDB.fileExt,
        '{ "_id": "prof01", "name": "Shirase" }',
        'message'
      )
    ).rejects.toThrowError(RepositoryNotOpenError);
    await gitDDB.destroy();
  });

  test('Undefined document', async () => {
    const dbName = monoId();

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    // @ts-ignore
    await expect(gitDDB.put(undefined)).rejects.toThrowError(UndefinedDocumentIdError);
    await gitDDB.destroy();
  });

  test('_id is not found in a document.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    await expect(gitDDB.put({ name: 'Shirase' })).rejects.toThrowError(
      UndefinedDocumentIdError
    );
    await gitDDB.destroy();
  });

  test('Invalid characters in _id', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    await expect(
      gitDDB.put({ _id: '<angleBrackets>', name: 'shirase' })
    ).rejects.toThrowError(InvalidIdCharacterError);
    await expect(
      gitDDB.put({ _id: '_headingUnderscore', name: 'shirase' })
    ).rejects.toThrowError(InvalidIdCharacterError);
    await expect(
      gitDDB.put({ _id: 'trailingPeriod.', name: 'shirase' })
    ).rejects.toThrowError(InvalidIdCharacterError);
    await expect(
      gitDDB.put({ _id: 'trailing/Slash/', name: 'shirase' })
    ).rejects.toThrowError(InvalidIdCharacterError);

    await gitDDB.destroy();
  });

  test('Invalid _id length', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
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

  test('Valid punctuations in _id', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    const _id = '-.()[]_';
    await expect(gitDDB.put({ _id: _id, name: 'shirase' })).resolves.toMatchObject({
      ok: true,
      id: expect.stringMatching(/^-.\(\)\[]_$/),
      file_sha: expect.stringMatching(/^[\da-z]{40}$/),
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });
    await gitDDB.destroy();
  });

  test('Invalid property name in document', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    await expect(
      gitDDB.put({
        _id: 'prof01',
        _underscore: 'Property name cannot start with underscore',
      })
    ).rejects.toThrowError(InvalidPropertyNameInDocumentError);
    await gitDDB.destroy();
  });

  test('Recursive object cannot be parsed as JSON', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    // JSON.stringify() throws error if an object is recursive.
    const obj1 = { obj: {} };
    const obj2 = { obj: obj1 };
    obj1.obj = obj2;
    await expect(gitDDB.put({ _id: 'prof01', obj: obj1 })).rejects.toThrowError(
      InvalidJsonObjectError
    );
    await gitDDB.destroy();
  });

  test('Bigint cannot be parsed as JSON', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    // JSON.stringify() throws error if an object has a bigint value
    const obj1 = { bigint: BigInt(9007199254740991) };
    await expect(gitDDB.put({ _id: 'prof01', obj: obj1 })).rejects.toThrowError(
      InvalidJsonObjectError
    );
    await gitDDB.destroy();
  });

  test('Function, Symbol, undefined are skipped in JSON.stringify', async () => {
    /**
     * See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify#description
     */
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    // JSON.stringify() throws error if an object has a bigint value
    const obj1 = { func: () => {}, symbol: Symbol('foo'), undef: undefined };
    await expect(gitDDB.put({ _id: 'prof01', obj: obj1 })).resolves.toMatchObject({
      ok: true,
      id: 'prof01',
      file_sha: expect.stringMatching(/^[\da-z]{40}$/),
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });
    await gitDDB.destroy();
  });

  test('Non-ASCII characters in _id', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    const _id = '春はあけぼの';
    const putResult = await gitDDB.put({ _id: _id, name: 'shirase' });
    expect(putResult).toMatchObject({
      ok: true,
      id: expect.stringMatching('^' + _id + '$'),
      file_sha: expect.stringMatching(/^[\da-z]{40}$/),
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });
    const short_sha = putResult.file_sha.substr(0, SHORT_SHA_LENGTH);

    const repository = gitDDB.repository();
    if (repository !== undefined) {
      const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
      const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
      // Check commit message
      expect(commit.message()).toEqual(`put: ${_id}${gitDDB.fileExt}(${short_sha})`);
    }

    // Check filename
    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(gitDDB.workingDir(), _id + '.json');
    await expect(fs.access(filePath)).resolves.not.toThrowError();
    // Read JSON and check doc._id
    expect(fs.readJSONSync(filePath)._id).toBe(_id);

    await gitDDB.destroy();
  });

  test('Undefined DB', async () => {
    const dbName = monoId();

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    // @ts-ignore
    await expect(put_worker(undefined)).rejects.toThrowError(UndefinedDBError);
    await gitDDB.destroy();
  });
});

describe('put(): validate: overload 2:', () => {
  test('Undefined id', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    await expect(
      // @ts-ignore
      gitDDB.put(undefined, {
        name: 'Kimari',
      })
    ).rejects.toThrowError(UndefinedDocumentIdError);
    await gitDDB.destroy();
  });

  test('Invalid document', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    // @ts-ignore
    await expect(gitDDB.put('prof01', 'document')).rejects.toThrowError(
      InvalidJsonObjectError
    );
    await gitDDB.destroy();
  });
});

describe('put(): create document: overload 1:', () => {
  test('Put a JSON Object.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    const _id = 'prof01';
    // Check put operation
    const putResult = await gitDDB.put({ _id: _id, name: 'Shirase' });
    expect(putResult).toMatchObject({
      ok: true,
      id: expect.stringMatching('^' + _id + '$'),
      file_sha: expect.stringMatching(/^[\da-z]{40}$/),
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });
    const short_sha = putResult.file_sha.substr(0, SHORT_SHA_LENGTH);

    const repository = gitDDB.repository();
    if (repository !== undefined) {
      const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
      const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
      // Check commit message
      expect(commit.message()).toEqual(`put: ${_id}${gitDDB.fileExt}(${short_sha})`);
    }

    // Check filename
    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(gitDDB.workingDir(), _id + '.json');
    await expect(fs.access(filePath)).resolves.not.toThrowError();
    // Read JSON and check doc._id
    expect(fs.readJSONSync(filePath)._id).toBe(_id);

    await gitDDB.destroy();
  });

  test('Put a JSON Object into subdirectory.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    const _id = 'dir01/prof01';
    // Check put operation
    const putResult = await gitDDB.put({ _id: _id, name: 'Shirase' });
    expect(putResult).toMatchObject({
      ok: true,
      id: expect.stringMatching('^' + _id + '$'),
      file_sha: expect.stringMatching(/^[\da-z]{40}$/),
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });
    const short_sha = putResult.file_sha.substr(0, SHORT_SHA_LENGTH);

    const repository = gitDDB.repository();
    if (repository !== undefined) {
      const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
      const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
      // Check commit message
      expect(commit.message()).toEqual(`put: ${_id}${gitDDB.fileExt}(${short_sha})`);
    }

    // Check filename
    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(gitDDB.workingDir(), _id + '.json');
    await expect(fs.access(filePath)).resolves.not.toThrowError();
    // Read JSON and check doc._id
    expect(fs.readJSONSync(filePath)._id).toBe('prof01'); // not 'dir01/prof01'

    await gitDDB.destroy();
  });

  test('Check order of results.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();

    const results: number[] = [];
    const validResults: number[] = [];
    for (let i = 0; i < 100; i++) {
      validResults.push(i);
      gitDDB
        .put({ _id: i.toString(), name: i.toString() })
        .then(res => results.push(Number.parseInt(res.id, 10)))
        .catch(() => {});
    }
    // close() can wait results of all Promises if timeout is set to large number.
    await gitDDB.close({ timeout: 100 * 1000 });

    // put() methods are called asynchronously, but the results must be arranged in order.
    expect(JSON.stringify(results)).toEqual(JSON.stringify(validResults));
    await gitDDB.destroy();
  });

  test('Set a commit message.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    const _id = 'dir01/prof01';
    await gitDDB.put(
      { _id: _id, name: 'Shirase' },
      { commit_message: 'my commit message' }
    );
    const repository = gitDDB.repository();
    if (repository !== undefined) {
      const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
      const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
      expect(commit.message()).toEqual(`my commit message`);
    }
    await gitDDB.destroy();
  });

  test('Check order and indent of JSON properties.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    await gitDDB.put({
      'b': 'b',
      'c': 'c',
      '_id': 'id',
      '_deleted': true,
      'array': ['item2', 'item1'],
      'z': { ZZ: 'ZZ', ZA: 'ZA' },
      'a': 'a',
      '1': 1,
      'A': 'A',
    });

    const filePath = path.resolve(gitDDB.workingDir(), 'id.json');
    const jsonStr = fs.readFileSync(filePath, 'utf8');
    expect(jsonStr).toBe(`{
  "1": 1,
  "A": "A",
  "a": "a",
  "array": [
    "item2",
    "item1"
  ],
  "b": "b",
  "c": "c",
  "z": {
    "ZA": "ZA",
    "ZZ": "ZZ"
  },
  "_deleted": true,
  "_id": "id"
}`);

    await gitDDB.destroy();
  });

  it(
    'Test CannotWriteDataError. Create readonly file and try to rewrite it. Prepare it by hand if OS is Windows.'
  );
});

describe('put(): create document: overload 2:', () => {
  test('Put a JSON Object.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    const _id = 'prof01';
    const putResult = await gitDDB.put(_id, { name: 'Shirase' });
    expect(putResult).toMatchObject({
      ok: true,
      id: expect.stringMatching('^' + _id + '$'),
      file_sha: expect.stringMatching(/^[\da-z]{40}$/),
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });
    const short_sha = putResult.file_sha.substr(0, SHORT_SHA_LENGTH);

    const repository = gitDDB.repository();
    if (repository !== undefined) {
      const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
      const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
      expect(commit.message()).toEqual(`put: ${_id}${gitDDB.fileExt}(${short_sha})`);
    }

    // Check filename
    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(gitDDB.workingDir(), _id + '.json');
    await expect(fs.access(filePath)).resolves.not.toThrowError();
    // Read JSON and check doc._id
    expect(fs.readJSONSync(filePath)._id).toBe(_id);

    await gitDDB.destroy();
  });

  test('Overwrite _id in a document by _id in the first argument.', async () => {
    const dbName = monoId();

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    const _id = 'id-in-the-first-argument';
    const doc = { _id: 'id-in-doc', name: 'Shirase' };
    const putResult = await gitDDB.put(_id, doc);
    expect(putResult).toMatchObject({
      ok: true,
      id: expect.stringMatching('^' + _id + '$'),
      file_sha: expect.stringMatching(/^[\da-z]{40}$/),
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });
    const short_sha = putResult.file_sha.substr(0, SHORT_SHA_LENGTH);

    expect(doc._id).toBe('id-in-doc');

    const repository = gitDDB.repository();
    if (repository !== undefined) {
      const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
      const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
      expect(commit.message()).toEqual(`put: ${_id}${gitDDB.fileExt}(${short_sha})`);
    }

    // Check filename
    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(gitDDB.workingDir(), _id + '.json');
    await expect(fs.access(filePath)).resolves.not.toThrowError();
    // Read JSON and check doc._id
    expect(fs.readJSONSync(filePath)._id).toBe(_id);

    await gitDDB.destroy();
  });

  test('Set commit message.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    const _id = 'dir01/prof01';
    await gitDDB.put(_id, { name: 'Shirase' }, { commit_message: 'my commit message' });
    const repository = gitDDB.repository();
    if (repository !== undefined) {
      const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
      const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
      expect(commit.message()).toEqual(`my commit message`);
    }
    await gitDDB.destroy();
  });

  test('Set empty commit message.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    const _id = 'dir01/prof01';
    await gitDDB.put(_id, { name: 'Shirase' }, { commit_message: '' });
    const repository = gitDDB.repository();
    if (repository !== undefined) {
      const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
      const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
      expect(commit.message()).toEqual('');
    }
    await gitDDB.destroy();
  });
});

describe('put(): update document:', () => {
  const dbName = monoId();

  const gitDDB: GitDocumentDB = new GitDocumentDB({
    db_name: dbName,
    local_dir: localDir,
  });

  test('Update a existing document', async () => {
    await gitDDB.create();
    const _id = 'prof01';
    await gitDDB.put({ _id: _id, name: 'Shirase' });
    // Update
    await expect(gitDDB.put({ _id: _id, name: 'mari' })).resolves.toMatchObject({
      ok: true,
      id: expect.stringMatching('^' + _id + '$'),
      file_sha: expect.stringMatching(/^[\da-z]{40}$/),
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });

    // Get
    await expect(gitDDB.get('prof01')).resolves.toEqual({ _id: 'prof01', name: 'mari' });

    await gitDDB.destroy();
  });
});

describe('put(): worker:', () => {
  const _id_a = 'apple';
  const name_a = 'Apple woman';
  const _id_b = 'banana';
  const name_b = 'Banana man';

  const _id_c01 = 'citrus/amanatsu';
  const name_c01 = 'Amanatsu boy';
  const _id_c02 = 'citrus/yuzu';
  const name_c02 = 'Yuzu girl';
  const _id_d = 'durio/durian';
  const name_d = 'Durian girls';
  const _id_p = 'pear/Japan/21st';
  const name_p = '21st century pear';

  test('Put all at once.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();

    await Promise.all([
      gitDDB.put({ _id: _id_a, name: name_a }),
      gitDDB.put({ _id: _id_b, name: name_b }),
      gitDDB.put({ _id: _id_c01, name: name_c01 }),
      gitDDB.put({ _id: _id_c02, name: name_c02 }),
      gitDDB.put({ _id: _id_d, name: name_d }),
      gitDDB.put({ _id: _id_p, name: name_p }),
    ]);

    await expect(gitDDB.allDocs({ recursive: true })).resolves.toMatchObject({
      total_rows: 6,
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
      rows: [
        {
          id: expect.stringMatching('^' + _id_a + '$'),
          file_sha: expect.stringMatching(/^[\da-z]{40}$/),
        },
        {
          id: expect.stringMatching('^' + _id_b + '$'),
          file_sha: expect.stringMatching(/^[\da-z]{40}$/),
        },
        {
          id: expect.stringMatching('^' + _id_c01 + '$'),
          file_sha: expect.stringMatching(/^[\da-z]{40}$/),
        },
        {
          id: expect.stringMatching('^' + _id_c02 + '$'),
          file_sha: expect.stringMatching(/^[\da-z]{40}$/),
        },
        {
          id: expect.stringMatching('^' + _id_d + '$'),
          file_sha: expect.stringMatching(/^[\da-z]{40}$/),
        },
        {
          id: expect.stringMatching('^' + _id_p + '$'),
          file_sha: expect.stringMatching(/^[\da-z]{40}$/),
        },
      ],
    });

    await gitDDB.destroy();
  });

  test('A lot of put()', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();

    const workers = [];
    for (let i = 0; i < 100; i++) {
      workers.push(gitDDB.put({ _id: i.toString(), name: i.toString() }));
    }
    await expect(Promise.all(workers)).resolves.toHaveLength(100);

    await expect(gitDDB.allDocs({ recursive: true })).resolves.toMatchObject({
      total_rows: 100,
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });

    await gitDDB.destroy();
  });

  test('put() with await keyword is resolved after all preceding put() Promises', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();

    const workers = [];
    for (let i = 0; i < 99; i++) {
      // put() Promises are queued
      // They have not await keyword
      gitDDB.put({ _id: i.toString(), name: i.toString() });
    }
    // The last put() with await keyword is resolved after all preceding (queued) Promises
    await gitDDB.put({ _id: '99', name: '99' });
    await expect(gitDDB.allDocs()).resolves.toMatchObject({ total_rows: 100 });

    await gitDDB.destroy();
  });

  // Skip this test because segmentation fault often occurs in libgit2.
  // Check this only when you would like to check behavior of _put_worker()
  test.skip('Concurrent calls of _put_worker() cause an error.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();

    await expect(
      Promise.all([
        put_worker(
          gitDDB,
          _id_a,
          gitDDB.fileExt,
          `{ "_id": "${_id_a}", "name": "${name_a}" }`,
          'message'
        ),
        put_worker(
          gitDDB,
          _id_b,
          gitDDB.fileExt,
          `{ "_id": "${_id_b}", "name": "${name_b}" }`,
          'message'
        ),
        put_worker(
          gitDDB,
          _id_c01,
          gitDDB.fileExt,
          `{ "_id": "${_id_c01}", "name": "${name_c01}" }`,
          'message'
        ),
        put_worker(
          gitDDB,
          _id_c02,
          gitDDB.fileExt,
          `{ "_id": "${_id_c02}", "name": "${name_c02}" }`,
          'message'
        ),
        put_worker(
          gitDDB,
          _id_d,
          gitDDB.fileExt,
          `{ "_id": "${_id_d}", "name": "${name_d}" }`,
          'message'
        ),
        put_worker(
          gitDDB,
          _id_p,
          gitDDB.fileExt,
          `{ "_id": "${_id_p}", "name": "${name_p}" }`,
          'message'
        ),
      ])
    ).rejects.toThrowError();

    await gitDDB.destroy();
  });
});
