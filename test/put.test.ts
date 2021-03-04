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
  InvalidCollectionPathCharacterError,
  InvalidIdCharacterError,
  InvalidIdLengthError,
  InvalidJsonObjectError,
  InvalidPropertyNameInDocumentError,
  RepositoryNotOpenError,
  UndefinedDocumentIdError,
} from '../src/error';
import { GitDocumentDB } from '../src/index';
import { Validator } from '../src/validator';

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

describe('Validate', () => {
  const localDir = './test/database_put01';

  beforeAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  afterAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  test('put(): Repository is not opened.', async () => {
    const dbName = `test_repos_${monoId()}`;
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await expect(gitDDB.put({ _id: 'prof01', name: 'Shirase' })).rejects.toThrowError(
      RepositoryNotOpenError
    );
    await expect(
      gitDDB._put_concurrent('prof01', '{ "_id": "prof01", "name": "Shirase" }', 'message')
    ).rejects.toThrowError(RepositoryNotOpenError);
    await gitDDB.destroy();
  });

  test('put(): Put an undefined value', async () => {
    const dbName = `test_repos_${monoId()}`;

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.open();
    // @ts-ignore
    await expect(gitDDB.put(undefined)).rejects.toThrowError(UndefinedDocumentIdError);
    await gitDDB.destroy();
  });

  test('put(): An _id is not found.', async () => {
    const dbName = `test_repos_${monoId()}`;
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.open();
    await expect(gitDDB.put({ name: 'Shirase' })).rejects.toThrowError(
      UndefinedDocumentIdError
    );
    await gitDDB.destroy();
  });

  test('put(): Invalid _id', async () => {
    const dbName = `test_repos_${monoId()}`;
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.open();
    await expect(gitDDB.put({ _id: '_underscore', name: 'Shirase' })).rejects.toThrowError(
      InvalidIdCharacterError
    );
    await gitDDB.destroy();
  });

  test('put(): Invalid document', async () => {
    const dbName = `test_repos_${monoId()}`;
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.open();
    await expect(
      gitDDB.put({
        _id: 'prof01',
        _underscore: 'Property name cannot start with underscore',
      })
    ).rejects.toThrowError(InvalidPropertyNameInDocumentError);
    await gitDDB.destroy();
  });

  test('put() overload: undefined id', async () => {
    const dbName = `test_repos_${monoId()}`;
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.open();
    await expect(
      // @ts-ignore
      gitDDB.put(undefined, {
        name: 'Kimari',
      })
    ).rejects.toThrowError(UndefinedDocumentIdError);
    await gitDDB.destroy();
  });

  test('put() overload: invalid document', async () => {
    const dbName = `test_repos_${monoId()}`;
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.open();
    // @ts-ignore
    await expect(gitDDB.put('prof01', 'document')).rejects.toThrowError(
      InvalidJsonObjectError
    );
    await gitDDB.destroy();
  });

  test('put(): _id includes invalid character.', async () => {
    const dbName = 'test_repos_9';
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

  test('put(): _id length is invalid.', async () => {
    const dbName = `test_repos_${monoId()}`;
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

  test('put(): _id includes punctuations.', async () => {
    const dbName = `test_repos_${monoId()}`;
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
    const dbName = `test_repos_${monoId()}`;
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

  test('put(): _id ends with slash', async () => {
    const dbName = `test_repos_${monoId()}`;
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.open();
    await expect(gitDDB.put({ _id: 'users/pages/' })).rejects.toThrowError(
      InvalidIdCharacterError
    );
    await gitDDB.destroy();
  });
});

describe('Create document', () => {
  const localDir = './test/database_put02';

  beforeAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  afterAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  test('put(): Put a JSON Object.', async () => {
    const dbName = `test_repos_${monoId()}`;
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.open();
    const _id = 'prof01';
    await expect(gitDDB.put({ _id: _id, name: 'Shirase' })).resolves.toMatchObject({
      ok: true,
      id: expect.stringMatching('^' + _id + '$'),
      file_sha: expect.stringMatching(/^[\da-z]{40}$/),
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });

    const repository = gitDDB.getRepository();
    if (repository !== undefined) {
      const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
      const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
      expect(commit.message()).toEqual(`put: ${_id}`);
    }

    // Check filename
    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(gitDDB.workingDir(), _id + '.json');
    await expect(fs.access(filePath)).resolves.not.toThrowError();
    // Read JSON and check doc._id
    expect(fs.readJSONSync(filePath)._id).toBe(_id);

    await gitDDB.destroy();
  });

  test('put(): Put a JSON Object into subdirectory.', async () => {
    const dbName = `test_repos_${monoId()}`;
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.open();
    const _id = 'dir01/prof01';
    await expect(gitDDB.put({ _id: _id, name: 'Shirase' })).resolves.toMatchObject({
      ok: true,
      id: expect.stringMatching('^' + _id + '$'),
      file_sha: expect.stringMatching(/^[\da-z]{40}$/),
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });

    const repository = gitDDB.getRepository();
    if (repository !== undefined) {
      const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
      const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
      expect(commit.message()).toEqual(`put: ${_id}`);
    }

    // Check filename
    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(gitDDB.workingDir(), _id + '.json');
    await expect(fs.access(filePath)).resolves.not.toThrowError();
    // Read JSON and check doc._id
    expect(fs.readJSONSync(filePath)._id).toBe('prof01'); // not 'dir01/prof01'

    await gitDDB.destroy();
  });

  test('put(): Check order of results', async () => {
    const dbName = `test_repos_${monoId()}`;
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.open();

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

    expect(JSON.stringify(results)).toEqual(JSON.stringify(validResults));
    await gitDDB.destroy();
  });

  test('put(): Set commit message.', async () => {
    const dbName = `test_repos_${monoId()}`;
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.open();
    const _id = 'dir01/prof01';
    await gitDDB.put(
      { _id: _id, name: 'Shirase' },
      { commit_message: 'my commit message' }
    );
    const repository = gitDDB.getRepository();
    if (repository !== undefined) {
      const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
      const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
      expect(commit.message()).toEqual(`my commit message`);
    }
    await gitDDB.destroy();
  });

  test('put(): Check order and indent of JSON properties.', async () => {
    const dbName = `test_repos_${monoId()}`;
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.open();
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

  test('put() overload: Put a JSON Object.', async () => {
    const dbName = `test_repos_${monoId()}`;
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.open();
    const _id = 'prof01';
    await expect(gitDDB.put(_id, { name: 'Shirase' })).resolves.toMatchObject({
      ok: true,
      id: expect.stringMatching('^' + _id + '$'),
      file_sha: expect.stringMatching(/^[\da-z]{40}$/),
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });

    const repository = gitDDB.getRepository();
    if (repository !== undefined) {
      const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
      const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
      expect(commit.message()).toEqual(`put: ${_id}`);
    }

    // Check filename
    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(gitDDB.workingDir(), _id + '.json');
    await expect(fs.access(filePath)).resolves.not.toThrowError();
    // Read JSON and check doc._id
    expect(fs.readJSONSync(filePath)._id).toBe(_id);

    await gitDDB.destroy();
  });

  test('put() overload: overwrite document._id.', async () => {
    const dbName = `test_repos_${monoId()}`;

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.open();
    const _id = 'prof01';
    const doc = { _id: 'id-in-doc', name: 'Shirase' };
    await expect(gitDDB.put(_id, doc)).resolves.toMatchObject({
      ok: true,
      id: expect.stringMatching('^' + _id + '$'),
      file_sha: expect.stringMatching(/^[\da-z]{40}$/),
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });
    expect(doc._id).toBe('id-in-doc');

    const repository = gitDDB.getRepository();
    if (repository !== undefined) {
      const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
      const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
      expect(commit.message()).toEqual(`put: ${_id}`);
    }

    // Check filename
    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(gitDDB.workingDir(), _id + '.json');
    await expect(fs.access(filePath)).resolves.not.toThrowError();
    // Read JSON and check doc._id
    expect(fs.readJSONSync(filePath)._id).toBe(_id);

    await gitDDB.destroy();
  });

  test('put() overload: Set commit message.', async () => {
    const dbName = `test_repos_${monoId()}`;
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.open();
    const _id = 'dir01/prof01';
    await gitDDB.put(_id, { name: 'Shirase' }, { commit_message: 'my commit message' });
    const repository = gitDDB.getRepository();
    if (repository !== undefined) {
      const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
      const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
      expect(commit.message()).toEqual(`my commit message`);
    }
    await gitDDB.destroy();
  });

  it(
    'Test CannotWriteDataError. Create readonly file and try to rewrite it. Prepare it by hand if OS is Windows.'
  );
});

describe('Update document', () => {
  const localDir = './test/database_put03';
  const dbName = `test_repos_${monoId()}`;

  const gitDDB: GitDocumentDB = new GitDocumentDB({
    db_name: dbName,
    local_dir: localDir,
  });

  beforeAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  afterAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  test('put(): Update a existing document', async () => {
    await gitDDB.open();
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

describe('Concurrent', () => {
  const localDir = './test/database_put04';
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

  beforeAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  afterAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  test('put(): all at once', async () => {
    const dbName = `test_repos_${monoId()}`;
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.open();

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

  test('put(): A lot of put()', async () => {
    const dbName = `test_repos_${monoId()}`;
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.open();

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

  test('put(): put() with await keyword is resolved after all preceding put() Promises', async () => {
    const dbName = `test_repos_${monoId()}`;
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.open();

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
  // Check this only when you would like to check behavior of _put_concurrent()
  test.skip('put(): Concurrent calls of _put_concurrent() cause an error.', async () => {
    const dbName = `test_repos_${monoId()}`;
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.open();

    await expect(
      Promise.all([
        gitDDB._put_concurrent(
          _id_a,
          `{ "_id": "${_id_a}", "name": "${name_a}" }`,
          'message'
        ),
        gitDDB._put_concurrent(
          _id_b,
          `{ "_id": "${_id_b}", "name": "${name_b}" }`,
          'message'
        ),
        gitDDB._put_concurrent(
          _id_c01,
          `{ "_id": "${_id_c01}", "name": "${name_c01}" }`,
          'message'
        ),
        gitDDB._put_concurrent(
          _id_c02,
          `{ "_id": "${_id_c02}", "name": "${name_c02}" }`,
          'message'
        ),
        gitDDB._put_concurrent(
          _id_d,
          `{ "_id": "${_id_d}", "name": "${name_d}" }`,
          'message'
        ),
        gitDDB._put_concurrent(
          _id_p,
          `{ "_id": "${_id_p}", "name": "${name_p}" }`,
          'message'
        ),
      ])
    ).rejects.toThrowError();

    await gitDDB.destroy();
  });
});
