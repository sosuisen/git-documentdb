/* eslint-disable @typescript-eslint/naming-convention */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import expect from 'expect';
import git from 'isomorphic-git';
import { monotonicFactory } from 'ulid';
import fs from 'fs-extra';
import sinon from 'sinon';
import { Err } from '../src/error';
import { generateDatabaseId, GitDocumentDB } from '../src/git_documentdb';
import { DatabaseInfo, DatabaseOpenResult } from '../src/types';
import {
  DATABASE_CREATOR,
  DATABASE_VERSION,
  FIRST_COMMIT_MESSAGE,
  GIT_DOCUMENTDB_INFO_ID,
  JSON_POSTFIX,
} from '../src/const';
import { sleep } from '../src/utils';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs_module = require('fs-extra');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const put_worker_module = require('../src/crud/put');

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = `./test/database_open`;

async function createDatabaseInfo (workingDir: string, info: string) {
  const infoPath = path.resolve(workingDir, GIT_DOCUMENTDB_INFO_ID + JSON_POSTFIX);
  await fs.ensureDir(path.dirname(infoPath));
  await git.init({ fs, dir: workingDir, defaultBranch: 'main' });
  await fs.writeFile(infoPath, info);
  await git.add({ fs, dir: workingDir, filepath: GIT_DOCUMENTDB_INFO_ID + JSON_POSTFIX });
  await git.commit({
    fs,
    dir: workingDir,
    author: {
      name: 'test',
      email: 'text@example.com',
    },
    message: FIRST_COMMIT_MESSAGE,
  });
}

// Use sandbox to restore stub and spy in parallel mocha tests
let sandbox: sinon.SinonSandbox;
beforeEach(function () {
  // @ts-ignore
  console.log(`... ${this.currentTest.fullTitle()}`);
  sandbox = sinon.createSandbox();
});

afterEach(function () {
  sandbox.restore();
});

after(() => {
  fs.removeSync(path.resolve(localDir));
});

describe('<git_documentdb>', () => {
  describe('create', () => {
    it('throws DatabaseClosingError.', async () => {
      const dbName = monoId();
      const gitDDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();

      for (let i = 0; i < 50; i++) {
        gitDDB.put({ _id: i.toString(), name: i.toString() }).catch(() => {});
      }
      // Call close() without await
      gitDDB.close().catch(() => {});
      await expect(gitDDB.open()).rejects.toThrowError(Err.DatabaseClosingError);

      // wait close
      while (gitDDB.isClosing) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(1000);
      }
      await gitDDB.destroy();
    });

    it('throws CannotCreateDirectoryError when tries to create a new repository on a readonly filesystem.', async () => {
      const dbName = monoId();
      // Windows does not support permission option of fs.ensureDir(). Use stub.
      const stubEnsureDir = sandbox.stub(fs_module, 'ensureDir');
      stubEnsureDir.rejects();

      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      // You don't have permission
      await expect(gitDDB.open()).rejects.toThrowError(Err.CannotCreateDirectoryError);
      expect(stubEnsureDir.callCount).toBe(4); // try 1 + retry 3
    });

    it('succeeds after retry ensureDir in createRepository.', async () => {
      const dbName = monoId();

      const stubEnsureDir = sandbox.stub(fs_module, 'ensureDir');
      stubEnsureDir.onCall(0).rejects();
      stubEnsureDir.onCall(1).rejects();
      stubEnsureDir.onCall(2).rejects();
      stubEnsureDir.onCall(3).callsFake(function (dir: string) {
        return stubEnsureDir.wrappedMethod(dir);
      });
      // for push_worker
      stubEnsureDir.onCall(4).callsFake(function (dir: string) {
        return stubEnsureDir.wrappedMethod(dir);
      });

      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      gitDDB.logLevel = 'trace';
      // You don't have permission
      await expect(gitDDB.open()).resolves.toMatchObject({
        // dbId: dbOpenResult.dbId,
        creator: DATABASE_CREATOR,
        version: DATABASE_VERSION,
        isNew: true,
        isCreatedByGitDDB: true,
        isValidVersion: true,
      });

      expect(stubEnsureDir.callCount).toBe(5); // try 1 + retry 3 + push_worker 1
      await gitDDB.destroy();
    });

    it('creates a new repository.', async () => {
      const dbName = monoId();

      const gitDDB = new GitDocumentDB({
        dbName,
        localDir,
      });

      // Create db
      const dbOpenResult = (await gitDDB.open()) as DatabaseOpenResult;
      expect(dbOpenResult).toEqual({
        dbId: dbOpenResult.dbId,
        creator: DATABASE_CREATOR,
        version: DATABASE_VERSION,
        isNew: true,
        isCreatedByGitDDB: true,
        isValidVersion: true,
        serialize: 'json',
      });

      expect((dbOpenResult as DatabaseInfo).dbId).toMatch(/^[\dA-HJKMNP-TV-Z]{26}$/);

      // Check if working directory exists
      expect(fs.existsSync(path.resolve(localDir, dbName))).toBeTruthy();

      // Check path of working directory
      expect(gitDDB.workingDir).toBe(path.resolve(`${localDir}/${dbName}`));
      // Destroy db
      await gitDDB.destroy().catch(e => console.error(e));
      // fs.access() throw error when a file cannot be accessed.
      await expect(fs.access(path.resolve(localDir, dbName))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    });

    it('creates a new repository by default localDir.', async () => {
      const dbName = monoId();

      const gitDDB = new GitDocumentDB({
        dbName,
      });
      const defaultLocalDir = './git-documentdb/';
      // Create db
      await gitDDB.open();

      expect(gitDDB.workingDir).toBe(path.resolve(defaultLocalDir, dbName));
      // Destroy db
      await gitDDB.destroy().catch(e => console.error(e));
      fs.removeSync(path.resolve(defaultLocalDir));
    });

    it('succeeds after retry git.init in createRepository.', async () => {
      const dbName = monoId();

      const stubInit = sandbox.stub(git, 'init');
      stubInit.onCall(0).rejects();
      stubInit.onCall(1).rejects();
      stubInit.onCall(2).rejects();
      stubInit.onCall(3).callsFake(function (options: any) {
        return stubInit.wrappedMethod(options);
      });

      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      gitDDB.logLevel = 'trace';
      // You don't have permission
      await expect(gitDDB.open()).resolves.toMatchObject({
        // dbId: dbOpenResult.dbId,
        creator: DATABASE_CREATOR,
        version: DATABASE_VERSION,
        isNew: true,
        isCreatedByGitDDB: true,
        isValidVersion: true,
      });

      expect(stubInit.callCount).toBe(4); // try 1 + retry 3
      await gitDDB.destroy();
    });

    it('succeeds after retry putWorker in createRepository.', async () => {
      const dbName = monoId();

      const stubPut = sandbox.stub(put_worker_module, 'putWorker');
      stubPut.onCall(0).rejects();
      stubPut.onCall(1).rejects();
      stubPut.onCall(2).rejects();
      stubPut.onCall(3).callsFake(function (...options: any) {
        return stubPut.wrappedMethod(...options);
      });

      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      gitDDB.logLevel = 'trace';
      // You don't have permission
      await expect(gitDDB.open()).resolves.toMatchObject({
        // dbId: dbOpenResult.dbId,
        creator: DATABASE_CREATOR,
        version: DATABASE_VERSION,
        isNew: true,
        isCreatedByGitDDB: true,
        isValidVersion: true,
      });

      expect(stubPut.callCount).toBe(4); // try 1 + retry 3

      gitDDB.destroy();
    });
  });

  describe('open', () => {
    it('throws RepositoryNotFoundError.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await expect(gitDDB.open({ createIfNotExists: false })).rejects.toThrowError(
        Err.RepositoryNotFoundError
      );
    });

    it('throws CannotOpenRepositoryError.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      // Create empty .git directory
      await fs.ensureDir(gitDDB.workingDir + '/.git/');
      await expect(gitDDB.open()).rejects.toThrowError(Err.CannotWriteDataError);
    });

    it('opens an existing repository.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });

      // Create db
      const oldResult = (await gitDDB.open()) as DatabaseInfo;

      // Close created db
      await expect(gitDDB.close()).resolves.toBeUndefined();

      // Open existing db
      const dbOpenResult = await gitDDB.open();
      expect(dbOpenResult).toEqual({
        dbId: oldResult.dbId,
        creator: DATABASE_CREATOR,
        version: DATABASE_VERSION,
        isNew: false,
        isCreatedByGitDDB: true,
        isValidVersion: true,
        serialize: 'json',
      });
      expect(gitDDB.isOpened).toBeTruthy();

      // Destroy() closes db automatically
      await expect(gitDDB.destroy()).resolves.toEqual({ ok: true });
      expect(gitDDB.isOpened).toBeFalsy();
    });

    it('opens a repository created by another app.', async () => {
      const dbName = monoId();
      const gitDDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await fs.ensureDir(gitDDB.workingDir);

      // put another app
      const creator = 'Another App';
      await createDatabaseInfo(
        gitDDB.workingDir,
        JSON.stringify({
          creator,
        })
      );

      const dbOpenResult = await gitDDB.open();
      const newDbId = (dbOpenResult as DatabaseInfo).dbId;
      expect(newDbId).toMatch(/^[\dA-HJKMNP-TV-Z]{26}$/);

      expect(dbOpenResult).toEqual({
        dbId: newDbId,
        creator,
        version: '',
        isNew: false,
        isCreatedByGitDDB: false,
        isValidVersion: false,
        serialize: 'json',
      });
      await gitDDB.destroy();
    });

    it('opens a repository created by another version.', async () => {
      const dbName = monoId();
      const gitDDB = new GitDocumentDB({
        dbName,
        localDir,
      });

      const dbId = generateDatabaseId();
      await createDatabaseInfo(
        gitDDB.workingDir,
        JSON.stringify({
          dbId,
          creator: DATABASE_CREATOR,
          version: '0.01',
        })
      );

      const dbOpenResult = await gitDDB.open();

      expect(dbOpenResult).toEqual({
        dbId,
        creator: DATABASE_CREATOR,
        version: '0.01',
        isNew: false,
        isCreatedByGitDDB: true,
        isValidVersion: false,
        serialize: 'json',
      });
      await gitDDB.destroy();
    });

    it('returns new dbId when opens db which does not have dbId.', async () => {
      const dbName = monoId();
      const gitDDB = new GitDocumentDB({
        dbName,
        localDir,
      });

      await createDatabaseInfo(
        gitDDB.workingDir,
        JSON.stringify({
          dbId: '',
          creator: DATABASE_CREATOR,
          version: DATABASE_VERSION,
        })
      );

      const dbOpenResult = await gitDDB.open();
      const newDbId = (dbOpenResult as DatabaseInfo).dbId;
      expect(newDbId).toMatch(/^[\dA-HJKMNP-TV-Z]{26}$/);

      expect(dbOpenResult).toEqual({
        dbId: newDbId,
        creator: DATABASE_CREATOR,
        version: DATABASE_VERSION,
        isNew: false,
        isCreatedByGitDDB: true,
        isValidVersion: true,
        serialize: 'json',
      });

      await gitDDB.destroy();
    });

    it('opens db twice.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });

      // Create db
      const dbOpenResult = await gitDDB.open();
      const newDbId = (dbOpenResult as DatabaseInfo).dbId;
      await expect(gitDDB.open()).resolves.toMatchObject({
        dbId: newDbId,
        creator: DATABASE_CREATOR,
        version: DATABASE_VERSION,
        isNew: false,
        isCreatedByGitDDB: true,
        isValidVersion: true,
      });
      await gitDDB.destroy();
    });

    it('loads serializeFormat.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
        serialize: 'front-matter',
      });

      const dbOpenResult = await gitDDB.open();
      const newDbId = (dbOpenResult as DatabaseInfo).dbId;
      await expect(gitDDB.open()).resolves.toMatchObject({
        dbId: newDbId,
        creator: DATABASE_CREATOR,
        version: DATABASE_VERSION,
        isNew: false,
        isCreatedByGitDDB: true,
        isValidVersion: true,
        serialize: 'front-matter',
      });
      await gitDDB.destroy();
    });
  });
});
