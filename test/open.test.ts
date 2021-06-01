/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import nodegit from '@sosuisen/nodegit';
import { monotonicFactory } from 'ulid';
import fs from 'fs-extra';
import { CannotOpenRepositoryError, RepositoryNotFoundError } from '../src/error';
import {
  DATABASE_CREATOR,
  DATABASE_VERSION,
  generateDatabaseId,
  GIT_DOCUMENTDB_INFO_ID,
  GitDocumentDB,
} from '../src/index';
import { put_worker } from '../src/crud/put';
import { DatabaseInfo, DatabaseInfoError, DatabaseOpenResult } from '../src/types';

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = `./test/database_open`;

beforeEach(function () {
  // @ts-ignore
  console.log(`... ${this.currentTest.fullTitle()}`);
});

beforeAll(() => {
  fs.removeSync(path.resolve(localDir));
});

afterAll(() => {
  fs.removeSync(path.resolve(localDir));
});

describe('<index> open()', () => {
  it('throws RepositoryNotFoundError.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    const dbOpenResult: DatabaseOpenResult = await gitDDB.open();
    expect((dbOpenResult as DatabaseInfoError).error).toBeInstanceOf(
      RepositoryNotFoundError
    );
  });

  it('throws CannotOpenRepositoryError.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    // Create empty .git directory
    await fs.ensureDir(gitDDB.workingDir() + '/.git/');
    const dbOpenResult: DatabaseOpenResult = await gitDDB.open();
    expect((dbOpenResult as DatabaseInfoError).error).toBeInstanceOf(
      CannotOpenRepositoryError
    );
  });

  it('opens an existing repository.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    // Create db
    const oldResult = (await gitDDB.createDB()) as DatabaseInfo;

    // Close created db
    await expect(gitDDB.close()).resolves.toBeUndefined();

    // Open existing db
    const dbOpenResult = await gitDDB.open();
    expect(dbOpenResult).toEqual({
      ok: true,
      db_id: oldResult.db_id,
      creator: DATABASE_CREATOR,
      version: DATABASE_VERSION,
      is_new: false,
      is_clone: false,
      is_created_by_gitddb: true,
      is_valid_version: true,
    });
    expect(gitDDB.isOpened()).toBeTruthy();

    // Destroy() closes db automatically
    await expect(gitDDB.destroy()).resolves.toEqual({ ok: true });
    expect(gitDDB.isOpened()).toBeFalsy();
  });

  it('opens a repository created by another app.', async () => {
    const dbName = monoId();
    const gitDDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await fs.ensureDir(gitDDB.workingDir());

    // Create empty repository
    await nodegit.Repository.init(gitDDB.workingDir(), 0).catch(err => {
      return Promise.reject(err);
    });
    await gitDDB.open();
    // put another app
    const creator = 'Another App';
    await put_worker(
      gitDDB,
      GIT_DOCUMENTDB_INFO_ID,
      gitDDB.fileExt,
      JSON.stringify({
        creator,
      }),
      'first commit'
    );
    await gitDDB.close();

    const dbOpenResult = await gitDDB.open();
    expect(dbOpenResult).toEqual({
      ok: true,
      db_id: (dbOpenResult as DatabaseInfo).db_id,
      creator,
      version: '',
      is_new: false,
      is_clone: false,
      is_created_by_gitddb: false,
      is_valid_version: false,
    });
    await gitDDB.destroy();
  });

  it('opens a repository created by another version.', async () => {
    const dbName = monoId();
    const gitDDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    // Create empty repository
    await nodegit.Repository.init(gitDDB.workingDir(), 0).catch(err => {
      return Promise.reject(err);
    });
    await gitDDB.open();
    // First commit with another db version
    await put_worker(
      gitDDB,
      GIT_DOCUMENTDB_INFO_ID,
      gitDDB.fileExt,
      JSON.stringify({
        db_id: generateDatabaseId(),
        creator: DATABASE_CREATOR,
        version: '0.01',
      }),
      'first commit'
    );
    await gitDDB.close();

    const dbOpenResult = await gitDDB.open();
    expect(dbOpenResult).toMatchObject({
      ok: true,
      db_id: (dbOpenResult as DatabaseInfo).db_id,
      creator: DATABASE_CREATOR,
      version: '0.01',
      is_new: false,
      is_clone: false,
      is_created_by_gitddb: true,
      is_valid_version: false,
    });
    await gitDDB.destroy();
  });

  it('returns new db_id when opens db without db_id.', async () => {
    const dbName = monoId();
    const gitDDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    // Create empty repository
    await nodegit.Repository.init(gitDDB.workingDir(), 0).catch(err => {
      return Promise.reject(err);
    });

    await gitDDB.open();

    const prevDbId = gitDDB.dbId();
    // First commit with another db version
    await put_worker(
      gitDDB,
      GIT_DOCUMENTDB_INFO_ID,
      gitDDB.fileExt,
      JSON.stringify({
        db_id: '',
        creator: DATABASE_CREATOR,
        version: DATABASE_VERSION,
      }),
      'first commit'
    );
    await gitDDB.close();

    const dbOpenResult = await gitDDB.open();
    const newDbId = (dbOpenResult as DatabaseInfo).db_id;

    expect(newDbId).not.toBe(prevDbId);
    expect(dbOpenResult).toMatchObject({
      ok: true,
      db_id: newDbId,
      creator: DATABASE_CREATOR,
      version: DATABASE_VERSION,
      is_new: false,
      is_clone: false,
      is_created_by_gitddb: true,
      is_valid_version: true,
    });
  });

  it('opens db twice.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    // Create db
    await gitDDB.createDB();
    await expect(gitDDB.open()).resolves.toMatchObject({
      ok: true,
      is_new: false,
      is_clone: false,
      is_created_by_gitddb: true,
      is_valid_version: true,
    });
    await gitDDB.destroy();
  });
});
