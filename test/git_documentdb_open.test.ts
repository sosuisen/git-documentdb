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
import {
  CannotCreateDirectoryError,
  CannotCreateRepositoryError,
  CannotOpenRepositoryError,
  DatabaseClosingError,
  RepositoryNotFoundError,
} from '../src/error';
import { generateDatabaseId, GitDocumentDB } from '../src/git_documentdb';
import { DatabaseInfo, DatabaseOpenResult } from '../src/types';
import {
  DATABASE_CREATOR,
  DATABASE_VERSION,
  FIRST_COMMIT_MESSAGE,
  GIT_DOCUMENTDB_INFO_ID,
  JSON_EXT,
} from '../src/const';
import { sleep } from '../src/utils';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs_module = require('fs-extra');

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = `./test/database_open`;

async function createDatabaseInfo (workingDir: string, info: string) {
  const infoPath = path.resolve(workingDir, GIT_DOCUMENTDB_INFO_ID + JSON_EXT);
  await fs.ensureDir(path.dirname(infoPath));
  await git.init({ fs, dir: workingDir, defaultBranch: 'main' });
  await fs.writeFile(infoPath, info);
  await git.add({ fs, dir: workingDir, filepath: GIT_DOCUMENTDB_INFO_ID + JSON_EXT });
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
      await expect(gitDDB.open()).rejects.toThrowError(DatabaseClosingError);

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
      await expect(gitDDB.open()).rejects.toThrowError(CannotCreateDirectoryError);
    });

    it('throws CannotCreateRepositoryError when tries to create a new repository on a readonly filesystem.', async () => {
      const dbName = monoId();
      const stubEnsureDir = sandbox.stub(fs_module, 'ensureDir');
      stubEnsureDir.onFirstCall().resolves().onSecondCall().rejects();

      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      // You don't have permission
      await expect(gitDDB.open()).rejects.toThrowError(CannotCreateRepositoryError);
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
  });

  describe('open', () => {
    it('throws RepositoryNotFoundError.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await expect(gitDDB.open({ createIfNotExists: false })).rejects.toThrowError(
        RepositoryNotFoundError
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
      await expect(gitDDB.open()).rejects.toThrowError(CannotOpenRepositoryError);
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
      });
      expect(gitDDB.isOpened()).toBeTruthy();

      // Destroy() closes db automatically
      await expect(gitDDB.destroy()).resolves.toEqual({ ok: true });
      expect(gitDDB.isOpened()).toBeFalsy();
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
      });
    });

    it('opens db twice.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });

      // Create db
      await gitDDB.open();

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
  });
});
