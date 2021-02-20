/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import fs from 'fs-extra';
import { GitDocumentDB } from '../src/index';
import { Collection } from '../src/collection';

describe('Collection', () => {
  const localDir = './test/database_collection01';

  beforeAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  afterAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  test('normalizeCollectionPath()', () => {
    expect(Collection.normalizeCollectionPath(undefined)).toEqual('');
    expect(Collection.normalizeCollectionPath('')).toEqual('');
    expect(Collection.normalizeCollectionPath('/')).toEqual('');
    expect(Collection.normalizeCollectionPath('//')).toEqual('');
    expect(Collection.normalizeCollectionPath('/users/')).toEqual('users/');
    expect(Collection.normalizeCollectionPath('users/')).toEqual('users/');
    expect(Collection.normalizeCollectionPath('users')).toEqual('users/');
    expect(Collection.normalizeCollectionPath('users/pages')).toEqual('users/pages/');
    expect(Collection.normalizeCollectionPath('users/pages')).toEqual('users/pages/');
    expect(Collection.normalizeCollectionPath('users//pages')).toEqual('users/pages/');
    expect(Collection.normalizeCollectionPath('/users///pages')).toEqual('users/pages/');
    expect(Collection.normalizeCollectionPath('///users///pages')).toEqual('users/pages/');
  });

  test('getFullPath()', () => {
    const dbName = 'test_repos_1';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    gitDDB.open();
    const users = new Collection(gitDDB, 'users');
    expect(users.getFullPath('pages')).toEqual('users/pages/');
    gitDDB.destroy();
  });

  test('put()', async () => {
    const dbName = 'test_repos_2';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.open();
    const users = new Collection(gitDDB, 'users');
    const doc = { _id: 'prof01', name: 'Kimari' };
    await expect(users.put(doc)).resolves.toMatchObject({
      ok: true,
      id: expect.stringMatching(doc._id),
      file_sha: expect.stringMatching(/^[\da-z]{40}$/),
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });

    // Check filename
    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(
      gitDDB.workingDir(),
      users.collectionPath() + doc._id + '.json'
    );
    await expect(fs.access(filePath)).resolves.not.toThrowError();
    // Read JSON and check doc._id
    expect(fs.readJSONSync(filePath)._id).toBe(doc._id);

    gitDDB.destroy();
  });

  test('put(): Put a sub-directory ID into sub-directory collection.', async () => {
    const dbName = 'test_repos_3';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.open();
    const users = new Collection(gitDDB, 'users/Gunma');
    const doc = { _id: 'prof01/page01', name: 'Kimari' };
    await expect(users.put(doc)).resolves.toMatchObject({
      ok: true,
      id: expect.stringMatching(doc._id),
      file_sha: expect.stringMatching(/^[\da-z]{40}$/),
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });
    // Check filename
    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(
      gitDDB.workingDir(),
      users.collectionPath() + doc._id + '.json'
    );
    await expect(fs.access(filePath)).resolves.not.toThrowError();
    // Read JSON and check doc._id
    expect(fs.readJSONSync(filePath)._id).toBe('page01'); // not 'prof01/page01'

    gitDDB.destroy();
  });
});
