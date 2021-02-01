/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import fs from 'fs-extra';
import path from 'path';
import { UndefinedDocumentIdError, InvalidJsonObjectError, InvalidIdCharacterError, InvalidIdLengthError, RepositoryNotOpenError } from '../src/error';
import { GitDocumentDB } from '../src/index';


describe('Create document', () => {
  const localDir = './test/database_put01';

  beforeAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  afterAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  test('put(): Repository is not opened.', async () => {
    const dbName = './test_repos_1';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await expect(gitDDB.put({ _id: 'prof01', name: 'shirase' })).rejects.toThrowError(RepositoryNotOpenError);
    await expect(gitDDB._put_concurrent({ _id: 'prof01', name: 'shirase' })).rejects.toThrowError(RepositoryNotOpenError);
    await gitDDB.destroy();
  });


  test('put(): Put an undefined value', async () => {
    const dbName = './test_repos_2';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();
    // @ts-ignore
    await expect(gitDDB.put(undefined)).rejects.toThrowError(InvalidJsonObjectError);
    await gitDDB.destroy();
  });


  test('put(): An _id is not found.', async () => {
    const dbName = './test_repos_3';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();
    await expect(gitDDB.put({ name: 'shirase' })).rejects.toThrowError(UndefinedDocumentIdError);
    await gitDDB.destroy();
  });


  test('put(): key includes invalid character.', async () => {
    const dbName = './test_repos_4';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();
    await expect(gitDDB.put({ _id: '<test>', name: 'shirase' })).rejects.toThrowError(InvalidIdCharacterError);
    await expect(gitDDB.put({ _id: '_test', name: 'shirase' })).rejects.toThrowError(InvalidIdCharacterError);
    await expect(gitDDB.put({ _id: 'test.', name: 'shirase' })).rejects.toThrowError(InvalidIdCharacterError);
    await gitDDB.destroy();
  });


  test('put(): key length is invalid.', async () => {
    const dbName = './test_repos_5';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();
    await expect(gitDDB.put({ _id: '0123456789012345678901234567890123456789012345678901234567890123456789', name: 'shirase' })).rejects.toThrowError(InvalidIdLengthError);
    await expect(gitDDB.put({ _id: '', name: 'shirase' })).rejects.toThrowError(InvalidIdLengthError);
    await gitDDB.destroy();
  });


  test('put(): Put a JSON Object.', async () => {
    const dbName = './test_repos_6';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();
    const _id = 'prof01';
    await expect(gitDDB.put({ _id: _id, name: 'shirase' })).resolves.toMatchObject(
      {
        _id: expect.stringContaining(_id),
        file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
        commit_sha: expect.stringMatching(/^[a-z0-9]{40}$/)
      }
    );
    await gitDDB.destroy();
  });


  test('put(): Put a JSON Object into subdirectory.', async () => {
    const dbName = './test_repos_7';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();
    const _id = 'dir01/prof01';
    await expect(gitDDB.put({ _id: _id, name: 'shirase' })).resolves.toMatchObject(
      {
        _id: expect.stringContaining(_id),
        file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
        commit_sha: expect.stringMatching(/^[a-z0-9]{40}$/)
      }
    );
    await gitDDB.destroy();
  });

  test('put(): Put a invalid JSON Object (not pure)', async () => {
    const dbName = './test_repos_8';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();
    const _id = 'prof01';
    // JSON.stringify() throws error if an object is recursive.
    const obj1 = { obj: {} };
    const obj2 = { obj: obj1 };
    obj1.obj = obj2;
    await expect(gitDDB.put({ _id: 'prof01', obj: obj1 })).rejects.toThrowError(InvalidJsonObjectError);
    await gitDDB.destroy();
  });

  test('put(): Check order of results', async () => {
    const dbName = './test_repos_8';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();

    const results: number[] = [];
    const validResults: number[] = [];
    for (let i = 0; i < 100; i++) {
      validResults.push(i);
      gitDDB.put({ _id: i.toString(), name: i.toString() }).then(res => results.push(Number.parseInt(res._id, 10)));
    }
    // close() can wait results of all Promises if timeout is set to large number.
    await gitDDB.close({ timeout: 100 * 1000 });

    expect(JSON.stringify(results)).toEqual(JSON.stringify(validResults));
    await gitDDB.destroy();
  });

  test.todo('Check whether _id property is excluded from the repository document')

  test.todo('Test CannotWriteDataError. Create readonly file and try to rewrite it. Prepare it by hand if OS is Windows.');

});


describe('Update document', () => {
  const localDir = './test/database_put02';
  const dbName = './test_repos';

  const gitDDB: GitDocumentDB = new GitDocumentDB({
    dbName: dbName,
    localDir: localDir
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
    await gitDDB.put({ _id: _id, name: 'shirase' });
    // Update
    await expect(gitDDB.put({ _id: _id, name: 'mari' })).resolves.toMatchObject(
      {
        _id: expect.stringContaining(_id),
        file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
        commit_sha: expect.stringMatching(/^[a-z0-9]{40}$/)
      }
    );
    // Get
    await expect(gitDDB.get('prof01')).resolves.toEqual({ _id: 'prof01', name: 'mari' });

    await gitDDB.destroy();
  });
});


describe('Serial', () => {
  const localDir = './test/database_put03';
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

  test('put(): serial', async () => {
    const dbName = './test_repos_1';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();

    await Promise.all([gitDDB.put({ _id: _id_a, name: name_a }),
    gitDDB.put({ _id: _id_b, name: name_b }),
    gitDDB.put({ _id: _id_c01, name: name_c01 }),
    gitDDB.put({ _id: _id_c02, name: name_c02 }),
    gitDDB.put({ _id: _id_d, name: name_d }),
    gitDDB.put({ _id: _id_p, name: name_p })]);


    await expect(gitDDB.allDocs({ recursive: true })).resolves.toMatchObject(
      {
        total_rows: 6,
        commit_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
        rows: [
          {
            _id: expect.stringContaining(_id_a),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
          },
          {
            _id: expect.stringContaining(_id_b),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
          },
          {
            _id: expect.stringContaining(_id_c01),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
          },
          {
            _id: expect.stringContaining(_id_c02),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
          },
          {
            _id: expect.stringContaining(_id_d),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
          },
          {
            _id: expect.stringContaining(_id_p),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
          },
        ]
      });

    await gitDDB.destroy();
  });


  test('put(): serial put() a lot', async () => {
    const dbName = './test_repos_2';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();

    const workers = [];
    for (let i = 0; i < 100; i++) {
      workers.push(gitDDB.put({ _id: i.toString(), name: i.toString() }));
    }
    await expect(Promise.all(workers)).resolves.toHaveLength(100);


    await expect(gitDDB.allDocs({ recursive: true })).resolves.toMatchObject(
      {
        total_rows: 100,
        commit_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
      });

    await gitDDB.destroy();
  });


  // Skip this test because segmentation fault often occurs in libgit2.
  // Check this only when you would like to check behavior of _put_concurrent()
  test.skip('put(): Concurrent calls of _put_concurrent() cause an error.', async () => {
    const dbName = './test_repos_3';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();

    await expect(Promise.all([gitDDB._put_concurrent({ _id: _id_a, name: name_a }),
    gitDDB._put_concurrent({ _id: _id_b, name: name_b }),
    gitDDB._put_concurrent({ _id: _id_c01, name: name_c01 }),
    gitDDB._put_concurrent({ _id: _id_c02, name: name_c02 }),
    gitDDB._put_concurrent({ _id: _id_d, name: name_d }),
    gitDDB._put_concurrent({ _id: _id_p, name: name_p })])).rejects.toThrowError();

    await gitDDB.destroy();
  });


  test('delete(): serial', async () => {
    const dbName = './test_repos_4';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();

    await Promise.all([gitDDB.put({ _id: _id_a, name: name_a }),
    gitDDB.put({ _id: _id_b, name: name_b }),
    gitDDB.put({ _id: _id_c01, name: name_c01 }),
    gitDDB.put({ _id: _id_c02, name: name_c02 }),
    gitDDB.put({ _id: _id_d, name: name_d }),
    gitDDB.put({ _id: _id_p, name: name_p })]);

    await Promise.all([gitDDB.delete(_id_a),
    gitDDB.delete(_id_b),
    gitDDB.delete(_id_c01),
    gitDDB.delete(_id_c02),
    gitDDB.delete(_id_d)]);


    await expect(gitDDB.allDocs({ recursive: true })).resolves.toMatchObject(
      {
        total_rows: 1,
        commit_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
        rows: [
          {
            _id: expect.stringContaining(_id_p),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
          },
        ]
      });

    await gitDDB.destroy();
  });
});