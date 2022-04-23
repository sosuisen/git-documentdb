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
import git from '@sosuisen/isomorphic-git';
import fs from 'fs-extra';
import expect from 'expect';
import sinon from 'sinon';
import { GitDocumentDB } from '../../src/git_documentdb';
import { RemoteEngine, RemoteErr } from '../../src/remote/remote_engine';
import {
  ConnectionSettings,
  RemoteOptions,
  SyncResult,
  SyncResultFastForwardMerge,
  SyncResultMergeAndPush,
  SyncResultPush,
} from '../../src/types';

import {
  compareWorkingDirAndBlobs,
  createClonedDatabases,
  createDatabase,
  destroyDBs,
  getChangedFileDelete,
  getChangedFileInsert,
  getChangedFileUpdate,
  getCommitInfo,
  getWorkingDirDocs,
  removeRemoteRepositories,
} from '../remote_utils';
import { sleep, toSortedJSONString } from '../../src/utils';
import { JSON_POSTFIX } from '../../src/const';
import { Err } from '../../src/error';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pushWorker_module = require('../../src/remote/push_worker');

export const syncTrySyncBase = (
  connection: ConnectionSettings,
  remoteURLBase: string,
  reposPrefix: string,
  localDir: string
) => () => {
  let idCounter = 0;
  const serialId = () => {
    return `${reposPrefix}${idCounter++}`;
  };

  // Use sandbox to restore stub and spy in parallel mocha tests
  let sandbox: sinon.SinonSandbox;
  beforeEach(async function () {
    // To avoid secondary rate limit of GitHub
    await new Promise(resolve => setTimeout(resolve, 3000));

    sandbox = sinon.createSandbox();
  });

  afterEach(function () {
    sandbox.restore();
  });

  before(async () => {
    await removeRemoteRepositories(reposPrefix);
  });

  describe('<remote/sync_trysync>: Sync#trySync()', () => {
    /**
     * before:
     * dbA   :
     * after :
     */
    it('returns SyncResultNop when no commit', async () => {
      const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
        connection,
      });

      const syncResult1 = (await syncA.trySync()) as SyncResultPush;

      expect(syncResult1.action).toBe('nop');

      await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();

      await destroyDBs([dbA]);
    });

    describe('returns SyncResultPush', () => {
      /**
       * before:
       * dbA   :  jsonA1
       * after :  jsonA1
       */
      it('which includes one remote creation when a local db creates a document', async () => {
        const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
          connection,
        });

        // A puts and pushes
        const jsonA1 = { _id: '1', name: 'fromA' };
        const putResultA1 = await dbA.put(jsonA1);
        const syncResult1 = (await syncA.trySync()) as SyncResultPush;

        expect(syncResult1.action).toBe('push');
        expect(syncResult1.commits!.remote.length).toBe(1);
        expect(syncResult1.commits!.remote[0].oid).toBe(putResultA1.commit.oid);
        expect(syncResult1.changes.remote.length).toBe(1);
        expect(syncResult1.changes.remote).toEqual([
          getChangedFileInsert(jsonA1, putResultA1),
        ]);

        expect(getWorkingDirDocs(dbA)).toEqual([jsonA1]);

        await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();

        await destroyDBs([dbA]);
      });

      /**
       * before:  jsonA1
       * dbA   : -jsonA1
       * after :
       */
      it('which includes one remote delete when a local db deletes a document', async () => {
        const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
          connection,
        });

        // A puts and pushes
        const jsonA1 = { _id: '1', name: 'fromA' };
        const putResultA1 = await dbA.put(jsonA1);
        await syncA.tryPush();

        const deleteResultA1 = await dbA.delete(jsonA1);
        const syncResult1 = (await syncA.trySync()) as SyncResultPush;

        expect(syncResult1.action).toBe('push');
        expect(syncResult1.commits!.remote.length).toBe(1);
        expect(syncResult1.commits!.remote[0].oid).toBe(deleteResultA1.commit.oid);
        expect(syncResult1.changes.remote.length).toBe(1);
        expect(syncResult1.changes.remote).toEqual([
          getChangedFileDelete(jsonA1, deleteResultA1),
        ]);

        expect(getWorkingDirDocs(dbA)).toEqual([]);

        await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();

        await destroyDBs([dbA]);
      });

      /**
       * before:  jsonA1
       * dbA   : +jsonA1
       * after :  jsonA1
       */
      it('which includes one remote update when a local db a document', async () => {
        const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
          connection,
        });
        // A puts and pushes
        const jsonA1 = { _id: '1', name: 'fromA' };
        const putResultA1 = await dbA.put(jsonA1);
        await syncA.tryPush();

        const jsonA1dash = { _id: '1', name: 'updated' };
        const putResultA1dash = await dbA.put(jsonA1dash);
        const syncResult1 = (await syncA.trySync()) as SyncResultPush;

        expect(syncResult1.action).toBe('push');
        expect(syncResult1.commits!.remote.length).toBe(1);
        expect(syncResult1.commits!.remote[0].oid).toBe(putResultA1dash.commit.oid);
        expect(syncResult1.changes.remote.length).toBe(1);
        expect(syncResult1.changes.remote).toEqual([
          getChangedFileUpdate(jsonA1, putResultA1, jsonA1dash, putResultA1dash),
        ]);

        expect(getWorkingDirDocs(dbA)).toEqual([jsonA1dash]);

        await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();

        await destroyDBs([dbA]);
      });
    });

    describe('returns SyncResultFastForwardMerge', () => {
      /**
       * before:
       * dbA   :  jsonA1
       * dbB   :
       * after :  jsonA1
       */
      it('which includes one local creation when a remote db creates a document', async () => {
        const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
          remoteURLBase,
          localDir,
          serialId,
          { connection }
        );
        // A puts and pushes
        const jsonA1 = { _id: '1', name: 'fromA' };
        const putResult1 = await dbA.put(jsonA1);

        await syncA.tryPush();

        // B syncs
        const syncResult1 = (await syncB.trySync()) as SyncResultFastForwardMerge;
        expect(syncResult1.action).toBe('fast-forward merge');
        expect(syncResult1.commits!.local.length).toBe(1);
        expect(syncResult1.commits!.local[0].oid).toBe(putResult1.commit.oid);
        expect(syncResult1.changes.local.length).toBe(1);
        expect(syncResult1.changes.local).toEqual([
          getChangedFileInsert(jsonA1, putResult1),
        ]);

        expect(getWorkingDirDocs(dbB)).toEqual([jsonA1]);

        // Sync dbA
        const syncResult2 = (await syncA.trySync()) as SyncResultMergeAndPush;
        expect(getWorkingDirDocs(dbA)).toEqual([jsonA1]);

        await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
        await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

        await destroyDBs([dbA, dbB]);
      });

      /**
       * before:
       * dbA   :  jsonA1  jsonA2
       * dbB   :
       * after :  jsonA1  jsonA2
       */
      it('which includes two local creations when a remote db creates two documents', async () => {
        const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
          remoteURLBase,
          localDir,
          serialId,
          {
            connection,
          }
        );

        // A puts and pushes
        const jsonA1 = { _id: '1', name: 'fromA' };
        const jsonA2 = { _id: '2', name: 'fromA' };
        const putResult1 = await dbA.put(jsonA1);
        const putResult2 = await dbA.put(jsonA2);
        await syncA.tryPush();

        // B syncs
        const syncResult1 = (await syncB.trySync()) as SyncResultFastForwardMerge;
        expect(syncResult1.action).toBe('fast-forward merge');
        expect(syncResult1.commits!.local.length).toBe(2);
        expect(syncResult1.commits!.local[0].oid).toBe(putResult1.commit.oid);
        expect(syncResult1.commits!.local[1].oid).toBe(putResult2.commit.oid);
        expect(syncResult1.changes.local.length).toBe(2);
        expect(syncResult1.changes.local).toEqual(
          expect.arrayContaining([
            getChangedFileInsert(jsonA1, putResult1),
            getChangedFileInsert(jsonA2, putResult2),
          ])
        );

        expect(getWorkingDirDocs(dbB)).toEqual([jsonA1, jsonA2]);

        // Sync dbA
        const syncResult2 = (await syncA.trySync()) as SyncResultMergeAndPush;
        expect(getWorkingDirDocs(dbA)).toEqual([jsonA1, jsonA2]);

        await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
        await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

        // Check HEAD
        const headCommitA = await git.resolveRef({
          fs,
          dir: dbA.workingDir,
          ref: 'HEAD',
        });
        expect(headCommitA).toBe(putResult2.commit.oid);

        const headCommitB = await git.resolveRef({
          fs,
          dir: dbB.workingDir,
          ref: 'HEAD',
        });
        expect(headCommitB).toBe(putResult2.commit.oid);

        // Check defaultBranch
        const mainBranchA = await git.resolveRef({
          fs,
          dir: dbA.workingDir,
          ref: 'refs/heads/main',
        });
        expect(mainBranchA).toBe(putResult2.commit.oid);

        const mainBranchB = await git.resolveRef({
          fs,
          dir: dbB.workingDir,
          ref: 'refs/heads/main',
        });
        expect(mainBranchB).toBe(putResult2.commit.oid);

        await destroyDBs([dbA, dbB]);
      });
    });

    describe('returns SyncResultMergeAndPush', () => {
      /**
       * before:
       * dbA   :  jsonA1
       * dbB   :          jsonB2
       * after :  jsonA1  jsonB2
       */
      it('which includes local and remote creations when a remote db creates a document and a local db creates another document', async () => {
        const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
          remoteURLBase,
          localDir,
          serialId,
          { connection }
        );
        // A puts and pushes
        const jsonA1 = { _id: '1', name: 'fromA' };
        const putResultA1 = await dbA.put(jsonA1);
        await syncA.tryPush();

        // B syncs
        const jsonB2 = { _id: '2', name: 'fromB' };
        const putResultB2 = await dbB.put(jsonB2);

        // Sync dbB
        const syncResult1 = (await syncB.trySync()) as SyncResultMergeAndPush;
        expect(syncResult1.action).toBe('merge and push');

        expect(syncResult1.commits!.local.length).toBe(2); // put commit and merge commit
        expect(syncResult1.commits!.remote.length).toBe(2); // put commit and merge commit
        expect(syncResult1.commits!.local[0].oid).toBe(putResultA1.commit.oid);
        expect(syncResult1.commits!.local[1].message).toBe('merge');
        expect(syncResult1.commits!.remote[0].oid).toBe(putResultB2.commit.oid);
        expect(syncResult1.commits!.remote[1].message).toBe('merge');

        expect(syncResult1.changes.local).toEqual([
          getChangedFileInsert(jsonA1, putResultA1),
        ]);

        expect(syncResult1.changes.remote).toEqual([
          getChangedFileInsert(jsonB2, putResultB2),
        ]);

        expect(getWorkingDirDocs(dbB)).toEqual([jsonA1, jsonB2]);

        // Sync dbA
        const syncResult2 = (await syncA.trySync()) as SyncResultMergeAndPush;
        expect(getWorkingDirDocs(dbA)).toEqual([jsonA1, jsonB2]);

        await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
        await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

        await destroyDBs([dbA, dbB]);
      });

      /**
       * before:
       * dbA   :  jsonA1  jsonA2
       * dbB   :                  jsonB3  jsonB4
       * after :  jsonA1  jsonA2  jsonB3  jsonB4
       */
      it('which includes two local creations and two remote creations when a remote db creates two documents and a local db creates two different documents', async () => {
        const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
          remoteURLBase,
          localDir,
          serialId,
          { connection }
        );

        // A puts and pushes
        const jsonA1 = { _id: '1', name: 'fromA' };
        const putResultA1 = await dbA.put(jsonA1);
        const jsonA2 = { _id: '2', name: 'fromA' };
        const putResultA2 = await dbA.put(jsonA2);
        await syncA.tryPush();

        // B syncs
        const jsonB3 = { _id: '3', name: 'fromB' };
        const putResultB3 = await dbB.put(jsonB3);
        const jsonB4 = { _id: '4', name: 'fromB' };
        const putResultB4 = await dbB.put(jsonB4);

        const syncResult1 = (await syncB.trySync()) as SyncResultMergeAndPush;
        expect(syncResult1.action).toBe('merge and push');
        expect(syncResult1.commits).toMatchObject({
          local: getCommitInfo([putResultA1, putResultA2, 'merge']),
          remote: getCommitInfo([putResultB3, putResultB4, 'merge']),
        });

        expect(syncResult1.changes.local.length).toBe(2);
        expect(syncResult1.changes.local).toEqual(
          expect.arrayContaining([
            getChangedFileInsert(jsonA1, putResultA1),
            getChangedFileInsert(jsonA2, putResultA2),
          ])
        );

        expect(syncResult1.changes.remote.length).toBe(2);
        expect(syncResult1.changes.remote).toEqual(
          expect.arrayContaining([
            getChangedFileInsert(jsonB3, putResultB3),
            getChangedFileInsert(jsonB4, putResultB4),
          ])
        );

        expect(getWorkingDirDocs(dbB)).toEqual([jsonA1, jsonA2, jsonB3, jsonB4]);

        // Sync dbA
        const syncResult2 = (await syncA.trySync()) as SyncResultMergeAndPush;
        expect(getWorkingDirDocs(dbA)).toEqual([jsonA1, jsonA2, jsonB3, jsonB4]);

        await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
        await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

        await destroyDBs([dbA, dbB]);
      });

      /**
       * before:
       * dbA   :  jsonA1
       * dbB   :  jsonA1
       * after :  jsonA1
       */
      it('which does not include changes after a remote db creates a document and a local db creates exactly the same document', async () => {
        const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
          remoteURLBase,
          localDir,
          serialId,
          { connection }
        );

        // A puts and pushes
        const jsonA1 = { _id: '1', name: 'fromA' };
        const putResultA1 = await dbA.put(jsonA1);
        await syncA.tryPush();

        // B puts the same file with exactly the same contents
        const putResultB1 = await dbB.put(jsonA1);

        const syncResult1 = (await syncB.trySync()) as SyncResultMergeAndPush;
        expect(syncResult1.action).toBe('merge and push');

        expect(syncResult1.commits).toMatchObject({
          local: getCommitInfo([putResultA1, 'merge']),
          remote: getCommitInfo([putResultB1, 'merge']),
        });

        expect(syncResult1.changes.local.length).toBe(0);
        expect(syncResult1.changes.remote.length).toBe(0);

        expect(getWorkingDirDocs(dbA)).toEqual([jsonA1]);
        expect(getWorkingDirDocs(dbB)).toEqual([jsonA1]);

        await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
        await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

        await destroyDBs([dbA, dbB]);
      });

      /**
       * before:  jsonA1
       * dbA   : +jsonA1
       * dbB   : +jsonA1
       * after :  jsonA1
       */
      it('which does not include changes after a remote db updates a document and a local db updates exactly the same update', async () => {
        const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
          connection,
        });

        // A puts and pushes
        const jsonA1 = { _id: '1', name: 'fromA' };
        const putResultA1 = await dbA.put(jsonA1);
        await syncA.tryPush();

        // Clone
        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameB,
          localDir,
        });
        // Clone dbA
        await dbB.open();
        const syncB = await dbB.sync(syncA.options);

        // A updates and pushes
        const jsonA1dash = { _id: '1', name: 'updated' };
        const putResultA1dash = await dbA.put(jsonA1dash);
        await syncA.tryPush();

        // B updates the same file with exactly the same contents
        const putResultB1dash = await dbB.put(jsonA1dash);

        const syncResult1 = (await syncB.trySync()) as SyncResultMergeAndPush;
        expect(syncResult1.action).toBe('merge and push');

        expect(syncResult1.commits).toMatchObject({
          local: getCommitInfo([putResultA1dash, 'merge']),
          remote: getCommitInfo([putResultB1dash, 'merge']),
        });

        expect(syncResult1.changes.local.length).toBe(0);
        expect(syncResult1.changes.remote.length).toBe(0);

        expect(getWorkingDirDocs(dbA)).toEqual([jsonA1dash]);
        expect(getWorkingDirDocs(dbB)).toEqual([jsonA1dash]);

        await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
        await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

        await destroyDBs([dbA, dbB]);
      });

      /**
       * before:  jsonA1
       * dbA   :          jsonA2
       * dbB   : -jsonA1
       * after :          jsonA2
       */
      it('which include a local create and a remote delete when a remote db creates a document and a local db deletes another document', async () => {
        const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
          connection,
        });
        // A puts and pushes
        const jsonA1 = { _id: '1', name: 'fromA' };
        await dbA.put(jsonA1);
        await syncA.tryPush();

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameB,
          localDir,
        });
        // Clone dbA
        await dbB.open();
        const syncB = await dbB.sync(syncA.options);

        // A puts and pushes
        const jsonA2 = { _id: '2', name: 'fromA' };
        const putResultA2 = await dbA.put(jsonA2);
        await syncA.tryPush();

        // B deletes and syncs
        const deleteResultB1 = await dbB.delete(jsonA1);

        const syncResult1 = (await syncB.trySync()) as SyncResultMergeAndPush;
        expect(syncResult1.action).toBe('merge and push');

        expect(syncResult1.commits).toMatchObject({
          local: getCommitInfo([putResultA2, 'merge']),
          remote: getCommitInfo([deleteResultB1, 'merge']),
        });

        expect(syncResult1.changes.local.length).toBe(1);
        expect(syncResult1.changes.local).toEqual([
          getChangedFileInsert(jsonA2, putResultA2),
        ]);

        expect(syncResult1.changes.remote.length).toBe(1);
        expect(syncResult1.changes.remote).toEqual([
          getChangedFileDelete(jsonA1, deleteResultB1),
        ]);

        expect(getWorkingDirDocs(dbB)).toEqual([jsonA2]);

        // Sync dbA
        const syncResult2 = (await syncA.trySync()) as SyncResultMergeAndPush;
        expect(getWorkingDirDocs(dbA)).toEqual([jsonA2]);

        await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
        await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

        await destroyDBs([dbA, dbB]);
      });

      /**
       * before:  jsonA1
       * dbA   : -jsonA1
       * dbB   :          jsonB2
       * after :          jsonB2
       */
      it('which include a remote create and a local delete when a remote db deletes a document and a local db creates another document', async () => {
        const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
          connection,
        });

        // A puts and pushes
        const jsonA1 = { _id: '1', name: 'fromA' };
        await dbA.put(jsonA1);
        await syncA.tryPush();

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameB,
          localDir,
        });

        // Clone dbA
        await dbB.open();
        const syncB = await dbB.sync(syncA.options);

        // A deletes and pushes
        const deleteResultA1 = await dbA.delete(jsonA1);
        await syncA.tryPush();

        // B put another file and syncs
        const jsonB2 = { _id: '2', name: 'fromB' };
        const putResultB2 = await dbB.put(jsonB2);

        const syncResult1 = (await syncB.trySync()) as SyncResultMergeAndPush;
        expect(syncResult1.action).toBe('merge and push');

        expect(syncResult1.commits).toMatchObject({
          local: getCommitInfo([deleteResultA1, 'merge']),
          remote: getCommitInfo([putResultB2, 'merge']),
        });

        expect(syncResult1.changes.local.length).toBe(1);
        expect(syncResult1.changes.local).toEqual([
          getChangedFileDelete(jsonA1, deleteResultA1),
        ]);

        expect(syncResult1.changes.remote.length).toBe(1);
        expect(syncResult1.changes.remote).toEqual([
          getChangedFileInsert(jsonB2, putResultB2),
        ]);

        expect(getWorkingDirDocs(dbB)).toEqual([jsonB2]);

        // Sync dbA
        const syncResult2 = (await syncA.trySync()) as SyncResultMergeAndPush;
        expect(getWorkingDirDocs(dbA)).toEqual([jsonB2]);

        await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
        await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

        await destroyDBs([dbA, dbB]);
      });

      /**
       * before:  jsonA1
       * dbA   : -jsonA1
       * dbB   : -jsonA1
       * after :
       */
      it('which does not include changes when a remote db deletes a document and a local db deletes the same document', async () => {
        const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
          connection,
        });
        // A puts and pushes
        const jsonA1 = { _id: '1', name: 'fromA' };
        await dbA.put(jsonA1);
        await syncA.tryPush();

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameB,
          localDir,
        });
        // Clone dbA
        await dbB.open();
        const syncB = await dbB.sync(syncA.options);

        // A deletes and pushes
        const deleteResultA1 = await dbA.delete(jsonA1);
        await syncA.tryPush();

        // B deletes the same file and syncs
        const deleteResultB1 = await dbB.delete(jsonA1);

        const syncResult1 = (await syncB.trySync()) as SyncResultMergeAndPush;
        expect(syncResult1.action).toBe('merge and push');

        expect(syncResult1.commits).toMatchObject({
          local: getCommitInfo([deleteResultA1, 'merge']),
          remote: getCommitInfo([deleteResultB1, 'merge']),
        });

        expect(syncResult1.changes.local.length).toBe(0); // Must no be 1 but 0, because diff is empty.
        expect(syncResult1.changes.remote.length).toBe(0); // Must no be 1 but 0, because diff is empty.

        expect(getWorkingDirDocs(dbB)).toEqual([]);

        // Sync dbA
        const syncResult2 = (await syncA.trySync()) as SyncResultMergeAndPush;
        expect(getWorkingDirDocs(dbA)).toEqual([]);

        await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
        await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

        await destroyDBs([dbA, dbB]);
      });
    });

    describe('returns SyncResolveConflictAndPush', () => {
      it('when two databases put the same _id document', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();
        const dbA: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameA,
          localDir: localDir,
        });
        const options: RemoteOptions = {
          remoteUrl: remoteURL,
          connection,
        };
        await dbA.open();
        const syncA = await dbA.sync(options);

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameB,
          localDir: localDir,
        });
        await dbB.open();
        const syncB = await dbB.sync(options);

        const jsonA1 = { _id: '1', name: 'fromA' };
        const putResultA1 = await dbA.put(jsonA1);
        await syncA.tryPush();

        // The same id
        const jsonB1 = { _id: '1', name: 'fromB' };
        const putResultB1 = await dbB.put(jsonB1);

        await expect(syncB.trySync()).resolves.toMatchObject({
          action: 'resolve conflicts and push',
          changes: {
            local: [],
            remote: [getChangedFileUpdate(jsonA1, putResultA1, jsonB1, putResultB1)],
          },
          conflicts: [
            {
              fatDoc: {
                _id: jsonB1._id,
                name: jsonB1._id + JSON_POSTFIX,
                fileOid: putResultB1.fileOid,
                type: 'json',
                doc: jsonB1,
              },
              operation: 'insert-merge',
              strategy: 'ours-diff',
            },
          ],
        });

        await destroyDBs([dbA, dbB]);
      });
    });

    it('skips consecutive sync tasks', async () => {
      const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
        connection,
      });
      const results: SyncResult[] = [];

      for (let i = 0; i < 3; i++) {
        // eslint-disable-next-line promise/catch-or-return
        syncA.trySync().then(result => results.push(result));
      }
      await sleep(5000);

      // results will be include 9 cancels
      let cancelCount = 0;
      results.forEach(res => {
        if (res.action === 'canceled') cancelCount++;
      });
      // Check results
      expect(cancelCount).toBeGreaterThanOrEqual(1);

      // Check statistics
      expect(dbA.taskQueue.currentStatistics().cancel).toBeGreaterThanOrEqual(1);

      // Only one trySync() will be executed
      expect(dbA.taskQueue.currentStatistics().sync).toBeGreaterThanOrEqual(1);

      await destroyDBs([dbA]);
    });

    it('skips consecutive sync tasks after crud tasks', async () => {
      const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
        connection,
      });

      const jsonA1 = { _id: '1', name: 'fromA' };
      for (let i = 0; i < 10; i++) {
        dbA.put(jsonA1);
      }
      const results: SyncResult[] = [];
      for (let i = 0; i < 3; i++) {
        // eslint-disable-next-line promise/catch-or-return
        syncA.trySync().then(result => results.push(result));
      }
      await sleep(10000);

      // results will be include cancels
      let cancelCount = 0;
      results.forEach(res => {
        if (res.action === 'canceled') cancelCount++;
      });
      // Check results
      expect(cancelCount).toBeGreaterThanOrEqual(1);

      // Check statistics
      expect(dbA.taskQueue.currentStatistics().cancel).toBeGreaterThanOrEqual(1);

      // Only one trySync() will be executed
      expect(dbA.taskQueue.currentStatistics().sync).toBeGreaterThanOrEqual(1);

      await destroyDBs([dbA]);
    });

    it('skips consecutive put tasks mixed with sync tasks', async () => {
      const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
        connection,
      });

      const putter: Promise<any>[] = [];
      const validResult: (boolean | Record<string, any>)[] = [];
      for (let i = 1; i < 10; i++) {
        putter.push(
          dbA
            .put({ _id: 'a', name: `${i}` }, { taskId: `${i}`, debounceTime: 3000 })
            .catch(err => {
              if (err instanceof Err.TaskCancelError) return true;
            })
        );
        validResult.push(true);
      }

      const syncResults: SyncResult[] = [];
      for (let i = 0; i < 3; i++) {
        // eslint-disable-next-line promise/catch-or-return
        syncA.trySync().then(result => syncResults.push(result));
      }

      for (let i = 10; i < 20; i++) {
        putter.push(
          dbA
            .put({ _id: 'a', name: `${i}` }, { taskId: `${i}`, debounceTime: 3000 })
            .catch(err => {
              if (err instanceof Err.TaskCancelError) return true;
            })
        );
        validResult.push(true);
      }
      putter.push(
        dbA
          .put({ _id: 'a', name: '20' }, { taskId: '20', debounceTime: 3000 })
          .catch(err => {
            if (err instanceof Err.TaskCancelError) return true;
          })
      );
      validResult.push({ _id: 'a' });
      const results = await Promise.all(putter);

      await sleep(10000);

      // Check skipped put()
      expect(results).toMatchObject(validResult);
      const json = await dbA.get('a');
      expect(json!.name).toEqual('20');

      // Check sync
      let cancelCount = 0;
      syncResults.forEach(res => {
        if (res.action === 'canceled') cancelCount++;
      });
      expect(cancelCount).toBeGreaterThanOrEqual(1);
      expect(dbA.taskQueue.currentStatistics().sync).toBeGreaterThanOrEqual(1);

      dbA.taskQueue.stop();

      await destroyDBs([dbA]);
    });

    it('syncs files under .gitddb', async () => {
      const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
        connection,
      });
      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameB,
        localDir,
      });
      // Clone dbA
      await dbB.open();
      const syncB = await dbB.sync(syncA.options);

      const info = {
        dbId: 'foo',
        creator: 'bar',
        version: 'baz',
      };
      const putResult = await dbA.putFatDoc('.gitddb/info.json', toSortedJSONString(info));

      await syncA.tryPush();

      await syncB.trySync();

      const fatDoc = {
        _id: '.gitddb/info',
        name: '.gitddb/info.json',
        fileOid: putResult.fileOid,
        type: 'json',
        doc: info,
      };
      const mergedFatDoc = await dbB.getFatDoc('.gitddb/info.json');

      expect(mergedFatDoc).toEqual(fatDoc);

      await destroyDBs([dbA, dbB]);
    });

    it('pauses live sync after error', async () => {
      const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
        connection,
        live: true,
        interval: 3000,
      });
      expect(syncA.options.live).toBeTruthy();

      dbA.put({ name: 'fromA' });

      let error: Error | undefined;
      syncA.on('error', (err: Error) => {
        error = err;
      });
      const stubPush = sandbox.stub(RemoteEngine[syncA.engine], 'push');
      stubPush.onFirstCall().throwsException(new RemoteErr.NetworkError('foo'));

      for (let i = 0; i < 10; i++) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(1000);
        if (error instanceof Error) {
          break;
        }
      }

      expect(error).toBeInstanceOf(RemoteErr.NetworkError);
      // expect(syncA.options.live).toBeFalsy();

      await destroyDBs([dbA]);
    });

    /**
     * Retry sync
     */
    describe('Retry trySync', () => {
      it('does not retry when retry option is 0 after UnfetchedCommitExistsError', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();
        const dbA: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameA,
          localDir: localDir,
        });
        await dbA.open();

        const options: RemoteOptions = {
          remoteUrl: remoteURL,
          syncDirection: 'push',
          retryInterval: 0,
          retry: 0,
          connection,
        };

        const sync = await dbA.sync(options);
        await dbA.put({ name: 'fromA' });

        const stubPush = sandbox.stub(pushWorker_module, 'pushWorker');
        stubPush.rejects(new RemoteErr.UnfetchedCommitExistsError(''));

        await expect(sync.trySync()).rejects.toThrowError(
          RemoteErr.UnfetchedCommitExistsError
        );

        expect(stubPush.callCount).toBe(1);

        await destroyDBs([dbA]);
      });

      it('retries every retry interval and fails after UnfetchedCommitExistsError', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();
        const dbA: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameA,
          localDir: localDir,
        });
        await dbA.open();

        const interval = 100000;
        const retryInterval = 5000;

        const options: RemoteOptions = {
          remoteUrl: remoteURL,
          syncDirection: 'push',
          interval,
          retryInterval,
          retry: 2,
          connection,
        };

        const sync = await dbA.sync(options);
        await dbA.put({ name: 'fromA' });

        const stubPush = sandbox.stub(pushWorker_module, 'pushWorker');
        stubPush.rejects(new RemoteErr.UnfetchedCommitExistsError(''));

        await expect(sync.trySync()).rejects.toThrowError(
          RemoteErr.UnfetchedCommitExistsError
        );

        expect(stubPush.callCount).toBe(3);

        await destroyDBs([dbA]);
      });

      it('retries every retry interval and succeeds after UnfetchedCommitExistsError', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();
        const dbA: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameA,
          localDir: localDir,
        });
        await dbA.open();

        const interval = 100000;
        const retryInterval = 5000;

        const options: RemoteOptions = {
          remoteUrl: remoteURL,
          syncDirection: 'push',
          interval,
          retryInterval,
          retry: 2,
          connection,
        };

        const sync = await dbA.sync(options);
        await dbA.put({ name: 'fromA' });

        const stubPush = sandbox.stub(pushWorker_module, 'pushWorker');
        stubPush
          .onFirstCall()
          .throwsException(new RemoteErr.UnfetchedCommitExistsError(''));
        stubPush
          .onSecondCall()
          .throwsException(new RemoteErr.UnfetchedCommitExistsError(''));
        stubPush
          .onThirdCall()
          .returns(Promise.resolve({ action: 'push', changes: { remote: [] } }));

        await expect(sync.trySync()).resolves.not.toThrowError();

        expect(stubPush.callCount).toBe(3);

        await destroyDBs([dbA]);
      });

      it('Race condition of two trySync() calls does not throw UnfetchedCommitExistsError.', async () => {
        const remoteURL = remoteURLBase + serialId();
        const dbNameA = serialId();

        const dbA: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameA,
          localDir: localDir,
        });
        const options: RemoteOptions = {
          remoteUrl: remoteURL,
          connection,
        };
        await dbA.open();
        const syncA = await dbA.sync(options);
        const jsonA1 = { _id: '1', name: 'fromA' };
        await dbA.put(jsonA1);

        const dbNameB = serialId();
        const dbB: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameB,
          localDir: localDir,
        });
        await dbB.open();
        const syncB = await dbB.sync(options);
        const jsonB1 = { _id: '1', name: 'fromB' };
        await dbB.put(jsonB1);

        // It will retry due to RemoteErr.UnfetchedCommitExistsError
        await expect(
          Promise.all([syncA.trySync(), syncB.trySync()])
        ).resolves.not.toThrowError();

        await destroyDBs([dbA, dbB]);
      });
    });
  });
};
