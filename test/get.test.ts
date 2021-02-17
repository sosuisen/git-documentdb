/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import fs from 'fs-extra';
import {
  DocumentNotFoundError,
  RepositoryNotOpenError,
  UndefinedDocumentIdError,
} from '../src/error';
import { GitDocumentDB } from '../src/index';

describe('Read document', () => {
  const localDir = './test/database_get01';

  beforeAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  afterAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  test('get(): Read an existing document', async () => {
    const dbName = 'test_repos_1';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir,
    });

    await gitDDB.open();
    const _id = 'prof01';
    await gitDDB.put({ _id: _id, name: 'shirase' });
    // Get
    await expect(gitDDB.get(_id)).resolves.toEqual({ _id: _id, name: 'shirase' });
    await gitDDB.destroy();
    // Check error
    await expect(gitDDB.get(_id)).rejects.toThrowError(RepositoryNotOpenError);
  });

  test('get(): Read an existing document in subdirectory', async () => {
    const dbName = 'test_repos_2';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir,
    });

    await gitDDB.open();
    const _id = 'dir01/prof01';
    await gitDDB.put({ _id: _id, name: 'shirase' });
    // Get
    await expect(gitDDB.get(_id)).resolves.toEqual({ _id: _id, name: 'shirase' });
    await gitDDB.destroy();
  });

  test('get(): Read a document that does not exist.', async () => {
    const dbName = 'test_repos_3';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir,
    });
    await gitDDB.open();
    const _id = 'prof01';
    await expect(gitDDB.get('prof01')).rejects.toThrowError(DocumentNotFoundError);
    await gitDDB.put({ _id: _id, name: 'shirase' });
    // @ts-ignore
    await expect(gitDDB.get(undefined)).rejects.toThrowError(UndefinedDocumentIdError);
    await expect(gitDDB.get('prof02')).rejects.toThrowError(DocumentNotFoundError);
    await gitDDB.destroy();
  });
});
