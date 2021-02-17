/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import fs from 'fs-extra';
import path from 'path';
import { RepositoryNotOpenError } from '../src/error';
import { GitDocumentDB } from '../src/index';

describe('Fetch a batch of documents', () => {
  const localDir = './test/database_allDocs01';
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

  test('allDocs()', async () => {
    const dbName = 'test_repos_1';

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });

    await expect(gitDDB.allDocs({ recursive: true })).rejects.toThrowError(RepositoryNotOpenError);

    await gitDDB.open();

    await expect(gitDDB.allDocs()).resolves.toStrictEqual({ total_rows : 0});    

    await gitDDB.put({ _id: _id_b, name: name_b });
    await gitDDB.put({ _id: _id_a, name: name_a });

    await expect(gitDDB.allDocs()).resolves.toMatchObject(
      {
        total_rows: 2,
        commit_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
        rows: [
          {
            id: expect.stringContaining(_id_a),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
          },
          {
            id: expect.stringContaining(_id_b),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
          },
        ]
      });

    await gitDDB.destroy();
  });


  test('allDocs(): options.descendant', async () => {
    const dbName = 'test_repos_2';

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();

    await gitDDB.put({ _id: _id_b, name: name_b });
    await gitDDB.put({ _id: _id_a, name: name_a });

    await expect(gitDDB.allDocs({ descending: true })).resolves.toMatchObject(
      {
        total_rows: 2,
        commit_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
        rows: [
          {
            id: expect.stringContaining(_id_b),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
          },
          {
            id: expect.stringContaining(_id_a),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
          },
        ]
      });

    await gitDDB.destroy();
  });


  test('allDocs(): options.include_docs', async () => {
    const dbName = 'test_repos_3';

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();

    await gitDDB.put({ _id: _id_b, name: name_b });
    await gitDDB.put({ _id: _id_a, name: name_a });

    await expect(gitDDB.allDocs({ include_docs: true })).resolves.toMatchObject(
      {
        total_rows: 2,
        commit_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
        rows: [
          {
            id: expect.stringContaining(_id_a),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
            doc: {
              _id: expect.stringContaining(_id_a),
              name: name_a
            }
          },
          {
            id: expect.stringContaining(_id_b),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
            doc: {
              _id: expect.stringContaining(_id_b),
              name: name_b
            }
          },
        ]
      });

    await gitDDB.destroy();
  });


  test('allDocs(): breadth-first search (recursive)', async () => {
    const dbName = 'test_repos_4';

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();

    await gitDDB.put({ _id: _id_b, name: name_b });
    await gitDDB.put({ _id: _id_a, name: name_a });
    await gitDDB.put({ _id: _id_d, name: name_d });
    await gitDDB.put({ _id: _id_c01, name: name_c01 });
    await gitDDB.put({ _id: _id_c02, name: name_c02 });

    await expect(gitDDB.allDocs({ include_docs: true, recursive: true })).resolves.toMatchObject(
      {
        total_rows: 5,
        commit_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
        rows: [
          {
            id: expect.stringContaining(_id_a),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
            doc: {
              _id: expect.stringContaining(_id_a),
              name: name_a
            }
          },
          {
            id: expect.stringContaining(_id_b),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
            doc: {
              _id: expect.stringContaining(_id_b),
              name: name_b
            }
          },
          {
            id: expect.stringContaining(_id_c01),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
            doc: {
              _id: expect.stringContaining(_id_c01),
              name: name_c01
            }
          },
          {
            id: expect.stringContaining(_id_c02),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
            doc: {
              _id: expect.stringContaining(_id_c02),
              name: name_c02
            }
          },
          {
            id: expect.stringContaining(_id_d),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
            doc: {
              _id: expect.stringContaining(_id_d),
              name: name_d
            }
          },
        ]
      });

    await gitDDB.destroy();
  });


  test('allDocs(): breadth-first search (not recursive)', async () => {
    const dbName = 'test_repos_5';

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();

    await gitDDB.put({ _id: _id_b, name: name_b });
    await gitDDB.put({ _id: _id_a, name: name_a });
    await gitDDB.put({ _id: _id_d, name: name_d });
    await gitDDB.put({ _id: _id_c01, name: name_c01 });
    await gitDDB.put({ _id: _id_c02, name: name_c02 });

    await expect(gitDDB.allDocs({ include_docs: true })).resolves.toMatchObject(
      {
        total_rows: 2,
        commit_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
        rows: [
          {
            id: expect.stringContaining(_id_a),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
            doc: {
              _id: expect.stringContaining(_id_a),
              name: name_a
            }
          },
          {
            id: expect.stringContaining(_id_b),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
            doc: {
              _id: expect.stringContaining(_id_b),
              name: name_b
            }
          }
        ]
      });

    await gitDDB.destroy();
  });


  test('allDocs(): get from directory', async () => {
    const dbName = 'test_repos_6';

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();

    await gitDDB.put({ _id: _id_b, name: name_b });
    await gitDDB.put({ _id: _id_a, name: name_a });
    await gitDDB.put({ _id: _id_d, name: name_d });
    await gitDDB.put({ _id: _id_c01, name: name_c01 });
    await gitDDB.put({ _id: _id_c02, name: name_c02 });

    await expect(gitDDB.allDocs({ directory: 'citrus', include_docs: true })).resolves.toMatchObject(
      {
        total_rows: 2,
        commit_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
        rows: [
          {
            id: expect.stringContaining(_id_c01),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
            doc: {
              _id: expect.stringContaining(_id_c01),
              name: name_c01
            }
          },
          {
            id: expect.stringContaining(_id_c02),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
            doc: {
              _id: expect.stringContaining(_id_c02),
              name: name_c02
            }
          },
        ]
      });

    await expect(gitDDB.allDocs({ recursive: true, directory: 'not_exist' })).resolves.toStrictEqual({ total_rows: 0 });


    await gitDDB.destroy();
  });


  test('allDocs(): get from deep directory', async () => {
    const dbName = 'test_repos_7';

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();

    await gitDDB.put({ _id: _id_p, name: name_p });

    await gitDDB.put({ _id: _id_b, name: name_b });
    await gitDDB.put({ _id: _id_a, name: name_a });
    await gitDDB.put({ _id: _id_d, name: name_d });
    await gitDDB.put({ _id: _id_c01, name: name_c01 });
    await gitDDB.put({ _id: _id_c02, name: name_c02 });

    await expect(gitDDB.allDocs({ directory: 'pear/Japan', include_docs: true })).resolves.toMatchObject(
      {
        total_rows: 1,
        commit_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
        rows: [
          {
            id: expect.stringContaining(_id_p),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
            doc: {
              _id: expect.stringContaining(_id_p),
              name: name_p
            }
          },
        ]
      });

    await gitDDB.destroy();
  });

});
