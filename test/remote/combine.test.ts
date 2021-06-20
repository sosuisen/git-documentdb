/* eslint-disable @typescript-eslint/naming-convention */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

/**
 * Test sync
 * by using GitHub Personal Access Token
 * These tests create a new repository on GitHub if not exists.
 */
import path from 'path';
import fs from 'fs-extra';
import git from 'isomorphic-git';
import expect from 'expect';
import { DuplicatedFile } from '../../src/types';
import { GitDocumentDB } from '../../src';
import { NoMergeBaseFoundError } from '../../src/error';
import {
  compareWorkingDirAndBlobs,
  createDatabase,
  destroyDBs,
  destroyRemoteRepository,
  getWorkingDirDocs,
  removeRemoteRepositories,
} from '../remote_utils';
import { sleep } from '../../src/utils';

const reposPrefix = 'test_combine___';
const localDir = `./test/database_combine`;

let idCounter = 0;
const serialId = () => {
  return `${reposPrefix}${idCounter++}`;
};

beforeEach(function () {
  // @ts-ignore
  console.log(`... ${this.currentTest.fullTitle()}`);
});

before(() => {
  fs.removeSync(path.resolve(localDir));
});

after(() => {
  // It may throw error due to memory leak of getCommitLogs()
  // fs.removeSync(path.resolve(localDir));
});

// This test needs environment variables:
//  - GITDDB_GITHUB_USER_URL: URL of your GitHub account
// e.g.) https://github.com/foo/
//  - GITDDB_PERSONAL_ACCESS_TOKEN: A personal access token of your GitHub account
const maybe =
  process.env.GITDDB_GITHUB_USER_URL && process.env.GITDDB_PERSONAL_ACCESS_TOKEN
    ? describe
    : describe.skip;

maybe('<remote/combine>', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  before(async () => {
    await removeRemoteRepositories(reposPrefix);
  });

  /**
   * Combine database
   */
  describe('Combining database', () => {
    it('throws NoMergeBaseFoundError when combineDbStrategy is throw-error in [both] direction', async () => {
      const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
        combineDbStrategy: 'throw-error',
        syncDirection: 'both',
      });

      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameB,
        localDir,
      });
      await dbB.open();

      // trySync throws NoMergeBaseFoundError
      await expect(dbB.sync(syncA.options())).rejects.toThrowError(NoMergeBaseFoundError);

      //      await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
      //      await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

      await destroyDBs([dbA, dbB]);
    });

    it('commits with valid commit message for combine-head-with-theirs', async () => {
      const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
        combineDbStrategy: 'combine-head-with-theirs',
        syncDirection: 'both',
      });

      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameB,
        localDir,
      });
      await dbB.open();

      // Need local commit to combine dbs with commit message.
      const jsonB1 = { _id: '1', name: 'fromB' };
      await dbB.put(jsonB1);

      // Combine with remote db
      await expect(dbB.sync(syncA.options())).resolves.not.toThrowError(
        NoMergeBaseFoundError
      );

      const headCommitOid = await git.resolveRef({
        fs,
        dir: dbB.workingDir(),
        ref: 'HEAD',
      });
      const headCommit = await git.readCommit({
        fs,
        dir: dbB.workingDir(),
        oid: headCommitOid,
      });
      expect(headCommit.commit.message).toEqual(`combine database head with theirs\n`);

      await destroyDBs([dbA, dbB]);
    });

    it('succeeds when combine-head-with-theirs with empty local and empty remote', async () => {
      const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
        combineDbStrategy: 'combine-head-with-theirs',
        syncDirection: 'both',
      });

      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameB,
        localDir,
      });
      await dbB.open();

      // Combine with remote db
      await expect(dbB.sync(syncA.options())).resolves.not.toThrowError(
        NoMergeBaseFoundError
      );

      // Put new doc to combined db.
      const jsonB2 = { _id: '2', name: 'fromB' };
      await dbB.put(jsonB2);

      expect(getWorkingDirDocs(dbA)).toEqual([]);
      expect(getWorkingDirDocs(dbB)).toEqual([jsonB2]);

      await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
      await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

      await destroyDBs([dbA, dbB]);
    });

    it('succeeds combine-head-with-theirs with empty local and not empty remote', async () => {
      const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
        combineDbStrategy: 'combine-head-with-theirs',
        syncDirection: 'both',
      });

      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);
      await syncA.trySync();

      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameB,
        localDir,
      });
      await dbB.open();

      // Combine with remote db
      await expect(dbB.sync(syncA.options())).resolves.not.toThrowError(
        NoMergeBaseFoundError
      );

      // Put new doc to combined db.
      const jsonB2 = { _id: '2', name: 'fromB' };
      await dbB.put(jsonB2);

      expect(getWorkingDirDocs(dbA)).toEqual([jsonA1]);
      expect(getWorkingDirDocs(dbB)).toEqual([jsonA1, jsonB2]);

      await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
      await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

      await destroyDBs([dbA, dbB]);
    });

    it('succeeds when combine-head-with-theirs with not empty local and empty remote', async () => {
      const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
        combineDbStrategy: 'combine-head-with-theirs',
        syncDirection: 'both',
      });

      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameB,
        localDir,
      });
      await dbB.open();

      const jsonB1 = { _id: '1', name: 'fromB' };
      await dbB.put(jsonB1);

      // Combine with remote db
      await expect(dbB.sync(syncA.options())).resolves.not.toThrowError(
        NoMergeBaseFoundError
      );

      // Put new doc to combined db.
      const jsonB2 = { _id: '2', name: 'fromB' };
      await dbB.put(jsonB2);

      expect(getWorkingDirDocs(dbA)).toEqual([]);
      expect(getWorkingDirDocs(dbB)).toEqual([jsonB1, jsonB2]);

      await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
      await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

      await destroyDBs([dbA, dbB]);
    });

    it('succeeds when combine-head-with-theirs with deep local and deep remote', async () => {
      const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
        combineDbStrategy: 'combine-head-with-theirs',
        syncDirection: 'both',
      });
      const jsonA1 = { _id: 'deep/one', name: 'fromA' };
      await dbA.put(jsonA1);
      await syncA.trySync();

      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameB,
        localDir,
      });
      await dbB.open();

      const jsonB2 = {
        _id: 'item/box01F76SNGYBWA5PBAYR0GNNT3Y4/item01F76SP8HNANY5QAXZ53DEHXBJ',
        name: 'fromB',
      };
      await dbB.put(jsonB2);

      // Combine with remote db
      await dbB.sync(syncA.options());

      expect(getWorkingDirDocs(dbA)).toEqual([jsonA1]);
      expect(getWorkingDirDocs(dbB)).toEqual([jsonA1, jsonB2]);

      await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
      await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

      await destroyDBs([dbA, dbB]);
    });

    it('returns SyncResult with duplicates when combine-head-with-theirs with not empty local and not empty remote', async () => {
      const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
        combineDbStrategy: 'combine-head-with-theirs',
        syncDirection: 'both',
      });
      const dbIdA = dbA.dbId();

      const jsonA1 = { _id: '1', name: 'fromA' };
      const putResultA1 = await dbA.put(jsonA1);
      await syncA.trySync();

      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameB,
        localDir,
      });
      await dbB.open();

      const dbIdB = dbB.dbId();
      expect(dbIdB).not.toBe(dbIdA);

      const jsonB1 = { _id: '1', name: 'fromB' };
      await dbB.put(jsonB1);

      const jsonB2 = { _id: '2', name: 'fromB' };
      await dbB.put(jsonB2);

      // Combine with remote db
      const [sync, syncResult] = await dbB.sync(syncA.options(), true);

      expect(dbB.dbId()).toBe(dbIdA);

      // Put new doc to combined db.
      const jsonB3 = { _id: '3', name: 'fromB' };
      await dbB.put(jsonB3);

      expect(getWorkingDirDocs(dbA)).toEqual([jsonA1]);
      // jsonB1 is duplicated with postfix due to combine-head-with-theirs strategy
      jsonB1._id = jsonB1._id + '-from-' + dbIdB;
      const duplicatedB1 = await dbB.getFatDoc(jsonB1._id);

      expect(syncResult).toEqual({
        action: 'combine database',
        duplicates: [
          {
            original: {
              _id: jsonA1._id,
              fileOid: putResultA1.fileOid,
              type: 'json',
            },
            duplicate: {
              _id: jsonB1._id,
              fileOid: duplicatedB1?.fileOid,
              type: 'json',
            },
          },
        ],
      });
      expect(getWorkingDirDocs(dbB)).toEqual([jsonB1, jsonA1, jsonB2, jsonB3]);

      await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
      await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

      await destroyDBs([dbA, dbB]);
    });

    it('returns SyncResult with duplicates when combine-head-with-theirs with deep local and deep remote', async () => {
      const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
        combineDbStrategy: 'combine-head-with-theirs',
        syncDirection: 'both',
      });
      const dbIdA = dbA.dbId();

      const jsonA1 = { _id: 'deep/one', name: 'fromA' };
      const putResultA1 = await dbA.put(jsonA1);
      await syncA.trySync();

      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameB,
        localDir,
      });
      await dbB.open();

      const dbIdB = dbB.dbId();
      expect(dbIdB).not.toBe(dbIdA);

      const jsonB1 = { _id: 'deep/one', name: 'fromB' };
      await dbB.put(jsonB1);

      const jsonB2 = { _id: '2', name: 'fromB' };
      await dbB.put(jsonB2);

      // Combine with remote db
      const [sync, syncResult] = await dbB.sync(syncA.options(), true);

      expect(dbB.dbId()).toBe(dbIdA);

      // Put new doc to combined db.
      const jsonB3 = { _id: '3', name: 'fromB' };
      await dbB.put(jsonB3);

      expect(getWorkingDirDocs(dbA)).toEqual([jsonA1]);
      // jsonB1 is duplicated with postfix due to combine-head-with-theirs strategy
      jsonB1._id = jsonB1._id + '-from-' + dbIdB;
      const duplicatedB1 = await dbB.getFatDoc(jsonB1._id);

      expect(syncResult).toEqual({
        action: 'combine database',
        duplicates: [
          {
            original: {
              _id: jsonA1._id,
              fileOid: putResultA1.fileOid,
              type: 'json',
            },
            duplicate: {
              _id: jsonB1._id,
              fileOid: duplicatedB1?.fileOid,
              type: 'json',
            },
          },
        ],
      });
      expect(getWorkingDirDocs(dbB)).toEqual([jsonB2, jsonB3, jsonB1, jsonA1]);

      const rawJSON = fs.readJSONSync(dbB.workingDir() + '/deep/one.json');
      rawJSON._id = 'one'; // not 'deep/one'

      await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
      await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

      await destroyDBs([dbA, dbB]);
    });

    it('invokes combine event with duplicates when combine-head-with-theirs with not empty local and not empty remote', async () => {
      const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
        combineDbStrategy: 'combine-head-with-theirs',
        syncDirection: 'both',
      });
      let duplicatedFiles: DuplicatedFile[] = [];
      syncA.on('combine', (duplicates: DuplicatedFile[]) => {
        duplicatedFiles = [...duplicates];
      });

      const dbIdA = dbA.dbId();

      const jsonA1 = { _id: '1', name: 'fromA' };
      const putResultA1 = await dbA.put(jsonA1);

      // Delete remote repository
      await destroyRemoteRepository(syncA.remoteURL());

      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameB,
        localDir,
      });
      await dbB.open();

      const dbIdB = dbB.dbId();

      const jsonB1 = { _id: '1', name: 'fromB' };
      const putResultB1 = await dbB.put(jsonB1);

      const jsonB2 = { _id: '2', name: 'fromB' };
      await dbB.put(jsonB2);

      // Create and push to new remote repository
      const syncB = await dbB.sync(syncA.options());
      // Combine database on A
      await syncA.trySync().catch(async () => {
        await dbA.destroy();
      });

      jsonA1._id = jsonA1._id + '-from-' + dbIdA;
      const duplicatedA1 = await dbA.getFatDoc(jsonA1._id);

      expect(getWorkingDirDocs(dbA)).toEqual([jsonA1, jsonB1, jsonB2]);
      // jsonA1 is duplicated with postfix due to combine-head-with-theirs strategy

      while (duplicatedFiles.length === 0) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(3000);
      }
      expect(duplicatedFiles).toEqual([
        {
          original: {
            _id: jsonB1._id,
            fileOid: putResultB1.fileOid,
            type: 'json',
          },
          duplicate: {
            _id: jsonA1._id,
            fileOid: duplicatedA1?.fileOid,
            type: 'json',
          },
        },
      ]);

      // Push combined db
      await syncA.trySync();
      // Pull combined db
      await syncB.trySync();
      expect(getWorkingDirDocs(dbB)).toEqual([jsonA1, jsonB1, jsonB2]);

      await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
      await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

      await destroyDBs([dbA, dbB]);
    });
  });
});
