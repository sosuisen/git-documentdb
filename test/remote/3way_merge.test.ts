/* eslint-disable @typescript-eslint/naming-convention */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

/**
 * Test 3-way merge
 * by using GitHub Personal Access Token
 * These tests create a new repository on GitHub if not exists.
 */
import path from 'path';
import fs from 'fs-extra';
import expect from 'expect';
import { Err } from '../../src/error';
import { threeWayMerge } from '../../src/remote/3way_merge';
import { GitDocumentDB } from '../../src/git_documentdb';
import {
  FatDoc,
  JsonDoc,
  SyncResultMergeAndPush,
  SyncResultResolveConflictsAndPush,
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
import { JSON_EXT } from '../../src/const';

const reposPrefix = 'test_3way_merge___';
const localDir = `./test/database_3way_merge`;

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

maybe('<remote/3way_merge>', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  before(async () => {
    await removeRemoteRepositories(reposPrefix);
  });

  it('throws InvalidConflictsStateError', async () => {
    const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
      remoteURLBase,
      localDir,
      serialId,
      {
        conflictResolutionStrategy: 'ours',
      }
    );

    await expect(
      // @ts-ignore
      threeWayMerge(dbA, syncA, 'ours-diff', 'foo', undefined, undefined, undefined)
    ).rejects.toThrowError(Err.InvalidConflictStateError);
  });

  /**
   * before:
   * dbA   :  jsonA1  jsonA2
   * dbB   :  jsonB1          jsonB3
   * after :  jsonB1  jsonA2  jsonB3
   *
   * 3-way merge:
   *   jsonB1: 4 - Conflict. Accept ours (insert)
   *   jsonA2: 1 - Accept theirs (insert)
   *   jsonB3: 2 - Accept ours (insert)
   */
  it('resolves case 1 - Accept theirs (insert), case 2 - Accept ours (insert), case 4 - Conflict. Accept ours (insert)', async () => {
    const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
      remoteURLBase,
      localDir,
      serialId,
      {
        conflictResolutionStrategy: 'ours',
      }
    );

    // A puts and pushes
    const jsonA1 = { _id: '1', name: 'fromA' };
    const putResultA1 = await dbA.put(jsonA1);
    const jsonA2 = { _id: '2', name: 'fromA' };
    const putResultA2 = await dbA.put(jsonA2);
    await syncA.tryPush();

    // B puts the same file
    const jsonB1 = { _id: '1', name: 'fromB' };
    const putResultB1 = await dbB.put(jsonB1);

    // B puts a new file
    const jsonB3 = { _id: '3', name: 'fromB' };
    const putResultB3 = await dbB.put(jsonB3);

    // It will occur conflict on id 1.json.
    const syncResult1 = (await syncB.trySync()) as SyncResultResolveConflictsAndPush;
    expect(syncResult1.action).toBe('resolve conflicts and push');
    expect(syncResult1.commits).toMatchObject({
      local: getCommitInfo([
        putResultA1,
        putResultA2,
        `resolve: 1${JSON_EXT}(insert,${putResultB1.fileOid.substr(0, 7)},ours)`,
      ]),
      remote: getCommitInfo([
        putResultB1,
        putResultB3,
        `resolve: 1${JSON_EXT}(insert,${putResultB1.fileOid.substr(0, 7)},ours)`,
      ]),
    });
    expect(syncResult1.changes.local.length).toBe(1);
    expect(syncResult1.changes.local).toEqual([getChangedFileInsert(jsonA2, putResultA2)]);

    expect(syncResult1.changes.remote.length).toBe(2);
    expect(syncResult1.changes.remote).toEqual(
      expect.arrayContaining([
        getChangedFileInsert(jsonB3, putResultB3),
        getChangedFileUpdate(jsonA1, putResultA1, jsonB1, putResultB1),
      ])
    );

    expect(syncResult1.conflicts.length).toEqual(1);
    expect(syncResult1.conflicts).toEqual([
      {
        fatDoc: {
          _id: '1',
          name: '1.json',
          fileOid: putResultB1.fileOid,
          type: 'json',
          doc: jsonB1,
        },
        strategy: 'ours',
        operation: 'insert',
      },
    ]);
    // Conflict occurs on 1.json

    expect(getWorkingDirDocs(dbB)).toEqual([jsonB1, jsonA2, jsonB3]);
    // Sync dbA
    await syncA.trySync();
    expect(getWorkingDirDocs(dbA)).toEqual([jsonB1, jsonA2, jsonB3]);

    await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
    await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

    await destroyDBs([dbA, dbB]);
  });

  /**
   * before:
   * dbA   :  jsonA1  jsonA2
   * dbB   :  jsonB1  jsonA2
   * after :  jsonB1  jsonA2
   *
   * 3-way merge:
   *   jsonB1: 4 - Conflict. Accept ours (insert)
   *   jsonA2: 3 - Accept both (insert)
   */
  it('resolves case 3 - Accept both (insert), case 4 - Conflict. Accept ours (insert)', async () => {
    const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
      remoteURLBase,
      localDir,
      serialId,
      {
        conflictResolutionStrategy: 'ours',
      }
    );

    // A puts and pushes
    const jsonA1 = { _id: '1', name: 'fromA' };
    const putResultA1 = await dbA.put(jsonA1);
    const jsonA2 = { _id: '2', name: 'fromA' };
    const putResultA2 = await dbA.put(jsonA2);
    await syncA.tryPush();

    // B puts the same file
    const jsonB1 = { _id: '1', name: 'fromB' };
    const putResultB1 = await dbB.put(jsonB1);

    // B puts the same file with the same contents
    const putResultB2 = await dbB.put(jsonA2);

    // It will occur conflict on id 1.json.
    const syncResult1 = (await syncB.trySync()) as SyncResultResolveConflictsAndPush;
    expect(syncResult1.action).toBe('resolve conflicts and push');
    expect(syncResult1.commits).toMatchObject({
      local: getCommitInfo([
        putResultA1,
        putResultA2,
        `resolve: 1${JSON_EXT}(insert,${putResultB1.fileOid.substr(0, 7)},ours)`,
      ]),
      remote: getCommitInfo([
        putResultB1,
        putResultB2,
        `resolve: 1${JSON_EXT}(insert,${putResultB1.fileOid.substr(0, 7)},ours)`,
      ]),
    });
    expect(syncResult1.changes.local.length).toBe(0);

    expect(syncResult1.changes.remote.length).toBe(1);
    expect(syncResult1.changes.remote).toEqual([
      getChangedFileUpdate(jsonA1, putResultA1, jsonB1, putResultB1),
    ]);

    expect(syncResult1.conflicts.length).toEqual(1);
    expect(syncResult1.conflicts).toEqual([
      {
        fatDoc: {
          _id: '1',
          name: '1.json',
          fileOid: putResultB1.fileOid,
          type: 'json',
          doc: jsonB1,
        },
        strategy: 'ours',
        operation: 'insert',
      },
    ]);
    // Conflict occurs on 1.json

    expect(getWorkingDirDocs(dbB)).toEqual([jsonB1, jsonA2]);
    // Sync dbA
    const syncResult2 = (await syncA.trySync()) as SyncResultMergeAndPush;
    expect(getWorkingDirDocs(dbA)).toEqual([jsonB1, jsonA2]);

    await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
    await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

    await destroyDBs([dbA, dbB]);
  });

  /**
   * before:
   * dbA   :  jsonA1
   * dbB   :  jsonB1
   * after :  jsonA1
   *
   * 3-way merge:
   *   jsonA1: 5 - Conflict. Accept theirs (insert)
   */
  it('resolves case 5 - Conflict. Accept theirs (insert)', async () => {
    const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
      remoteURLBase,
      localDir,
      serialId,
      {
        conflictResolutionStrategy: 'theirs',
      }
    );

    // A puts and pushes
    const jsonA1 = { _id: '1', name: 'fromA' };
    const putResultA1 = await dbA.put(jsonA1);
    await syncA.tryPush();

    // B puts the same file
    const jsonB1 = { _id: '1', name: 'fromB' };
    const putResultB1 = await dbB.put(jsonB1);

    // It will occur conflict on id 1.json.
    const syncResult1 = (await syncB.trySync()) as SyncResultResolveConflictsAndPush;
    expect(syncResult1.action).toBe('resolve conflicts and push');
    expect(syncResult1.commits).toMatchObject({
      local: getCommitInfo([
        putResultA1,
        `resolve: 1${JSON_EXT}(insert,${putResultA1.fileOid.substr(0, 7)},theirs)`,
      ]),
      remote: getCommitInfo([
        putResultB1,
        `resolve: 1${JSON_EXT}(insert,${putResultA1.fileOid.substr(0, 7)},theirs)`,
      ]),
    });
    expect(syncResult1.changes.local.length).toBe(1);
    expect(syncResult1.changes.local).toEqual([
      getChangedFileUpdate(jsonB1, putResultB1, jsonA1, putResultA1),
    ]);

    expect(syncResult1.changes.remote.length).toBe(0);

    expect(syncResult1.conflicts.length).toEqual(1);
    expect(syncResult1.conflicts).toEqual([
      {
        fatDoc: {
          _id: '1',
          name: '1.json',
          fileOid: putResultA1.fileOid,
          type: 'json',
          doc: jsonA1,
        },
        strategy: 'theirs',
        operation: 'insert',
      },
    ]);
    expect(getWorkingDirDocs(dbA)).toEqual([jsonA1]);
    expect(getWorkingDirDocs(dbB)).toEqual([jsonA1]);

    await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
    await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

    await destroyDBs([dbA, dbB]);
  });

  /**
   * before:          jsonA2
   * dbA   :  jsonA1 -jsonA2
   * dbB   :  jsonB1 -jsonA2
   * after :  jsonB1
   *
   * '-' means delete
   *
   * 3-way merge:
   *   jsonB1: 4 - Conflict. Accept ours (insert)
   *   jsonA2: 6 - Accept both (delete)
   */
  it('resolves case 6 - Accept both (delete), case 4 - Conflict. Accept ours (insert)', async () => {
    const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
      conflictResolutionStrategy: 'ours',
    });
    // A puts and pushes
    const jsonA2 = { _id: '2', name: 'fromA' };
    await dbA.put(jsonA2);
    await syncA.tryPush();

    const dbNameB = serialId();
    const dbB: GitDocumentDB = new GitDocumentDB({
      dbName: dbNameB,
      localDir,
    });
    // Clone dbA
    await dbB.open();
    const syncB = await dbB.sync(syncA.options);

    // A puts, deletes, and pushes
    const jsonA1 = { _id: '1', name: 'fromA' };
    const putResultA1 = await dbA.put(jsonA1);

    const deleteResultA2 = await dbA.delete(jsonA2);
    await syncA.tryPush();

    // B puts the same file
    const jsonB1 = { _id: '1', name: 'fromB' };
    const putResultB1 = await dbB.put(jsonB1);

    // B deletes the same file
    const deleteResultB2 = await dbB.delete(jsonA2);

    // It will occur conflict on id 1.json.
    const syncResult1 = (await syncB.trySync()) as SyncResultResolveConflictsAndPush;
    expect(syncResult1.action).toBe('resolve conflicts and push');
    expect(syncResult1.commits).toMatchObject({
      local: getCommitInfo([
        putResultA1,
        deleteResultA2,
        `resolve: 1${JSON_EXT}(insert,${putResultB1.fileOid.substr(0, 7)},ours)`,
      ]),
      remote: getCommitInfo([
        putResultB1,
        deleteResultB2,
        `resolve: 1${JSON_EXT}(insert,${putResultB1.fileOid.substr(0, 7)},ours)`,
      ]),
    });
    expect(syncResult1.changes.local.length).toBe(0);

    expect(syncResult1.changes.remote.length).toBe(1);
    expect(syncResult1.changes.remote).toEqual([
      getChangedFileUpdate(jsonA1, putResultA1, jsonB1, putResultB1),
    ]);

    expect(syncResult1.conflicts.length).toEqual(1);
    expect(syncResult1.conflicts).toEqual([
      {
        fatDoc: {
          _id: '1',
          name: '1.json',
          fileOid: putResultB1.fileOid,
          type: 'json',
          doc: jsonB1,
        },
        strategy: 'ours',
        operation: 'insert',
      },
    ]);
    // Conflict occurs on 1.json

    expect(getWorkingDirDocs(dbB)).toEqual([jsonB1]);
    // Sync dbA
    const syncResult2 = (await syncA.trySync()) as SyncResultMergeAndPush;
    expect(getWorkingDirDocs(dbA)).toEqual([jsonB1]);

    await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
    await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

    await destroyDBs([dbA, dbB]);
  });

  /**
   * before:          jsonA2
   * dbA   :  jsonA1
   * dbB   :  jsonB1 -jsonA2
   * after :  jsonB1
   *
   * 3-way merge:
   *   jsonB1: 4 - Conflict. Accept ours (insert)
   *   jsonA2: 7 - Accept ours (delete)
   */
  it('resolves case 7 - Accept ours (delete), case 4 - Conflict. Accept ours (insert)', async () => {
    const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
      conflictResolutionStrategy: 'ours',
    });
    // A puts and pushes
    const jsonA2 = { _id: '2', name: 'fromA' };
    await dbA.put(jsonA2);
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
    const jsonA1 = { _id: '1', name: 'fromA' };
    const putResultA1 = await dbA.put(jsonA1);
    await syncA.tryPush();

    // B puts the same file
    const jsonB1 = { _id: '1', name: 'fromB' };
    const putResultB1 = await dbB.put(jsonB1);

    // B deletes the same file
    const deleteResultB2 = await dbB.delete(jsonA2);

    // It will occur conflict on id 1.json.
    const syncResult1 = (await syncB.trySync()) as SyncResultResolveConflictsAndPush;
    expect(syncResult1.action).toBe('resolve conflicts and push');
    expect(syncResult1.commits).toMatchObject({
      local: getCommitInfo([
        putResultA1,
        `resolve: 1${JSON_EXT}(insert,${putResultB1.fileOid.substr(0, 7)},ours)`,
      ]),
      remote: getCommitInfo([
        putResultB1,
        deleteResultB2,
        `resolve: 1${JSON_EXT}(insert,${putResultB1.fileOid.substr(0, 7)},ours)`,
      ]),
    });
    expect(syncResult1.changes.local.length).toBe(0);

    expect(syncResult1.changes.remote.length).toBe(2);
    expect(syncResult1.changes.remote).toEqual(
      expect.arrayContaining([
        getChangedFileUpdate(jsonA1, putResultA1, jsonB1, putResultB1),
        getChangedFileDelete(jsonA2, deleteResultB2),
      ])
    );

    expect(syncResult1.conflicts.length).toEqual(1);
    expect(syncResult1.conflicts).toEqual([
      {
        fatDoc: {
          _id: '1',
          name: '1.json',
          fileOid: putResultB1.fileOid,
          type: 'json',
          doc: jsonB1,
        },
        strategy: 'ours',
        operation: 'insert',
      },
    ]);
    // Conflict occurs on 1.json

    expect(getWorkingDirDocs(dbB)).toEqual([jsonB1]);
    // Sync dbA
    const syncResult2 = (await syncA.trySync()) as SyncResultMergeAndPush;
    expect(getWorkingDirDocs(dbA)).toEqual([jsonB1]);

    await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
    await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

    await destroyDBs([dbA, dbB]);
  });

  /**
   * before:  jsonA1
   * dbA   : +jsonA1
   * dbB   : -jsonA1
   * result:
   *
   * '+' means update
   *
   * 3-way merge:
   *  jsonA1: 8 - Conflict. Accept ours (delete)
   */
  it('resolves case 8 - Conflict. Accept ours (delete)', async () => {
    const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
      conflictResolutionStrategy: 'ours',
    });
    // A puts and pushes
    const jsonA1 = { _id: '1', name: 'fromA' };
    const putResultA1 = await dbA.put(jsonA1);
    await syncA.tryPush();

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

    // B deletes and syncs
    const deleteResultB1 = await dbB.delete(jsonA1);

    const syncResult1 = (await syncB.trySync()) as SyncResultResolveConflictsAndPush;
    expect(syncResult1.action).toBe('resolve conflicts and push');
    expect(syncResult1.commits).toMatchObject({
      local: getCommitInfo([
        putResultA1dash,
        `resolve: 1${JSON_EXT}(delete,${deleteResultB1.fileOid.substr(0, 7)},ours)`,
      ]),
      remote: getCommitInfo([
        deleteResultB1,
        `resolve: 1${JSON_EXT}(delete,${deleteResultB1.fileOid.substr(0, 7)},ours)`,
      ]),
    });
    expect(syncResult1.changes.local.length).toBe(0);

    expect(syncResult1.changes.remote.length).toBe(1);
    expect(syncResult1.changes.remote).toEqual([
      getChangedFileDelete(jsonA1dash, putResultA1dash),
    ]);

    expect(syncResult1.conflicts.length).toEqual(1);
    expect(syncResult1.conflicts).toEqual([
      {
        fatDoc: {
          _id: '1',
          name: '1.json',
          fileOid: deleteResultB1.fileOid,
          type: 'json',
          doc: jsonA1,
        },
        strategy: 'ours',
        operation: 'delete',
      },
    ]);
    // Conflict occurs on 1.json

    expect(getWorkingDirDocs(dbB)).toEqual([]);

    // Sync dbA
    const syncResult2 = (await syncA.trySync()) as SyncResultMergeAndPush;
    expect(getWorkingDirDocs(dbA)).toEqual([]);

    await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
    await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

    await destroyDBs([dbA, dbB]);
  });

  /**
   * before:  jsonA1
   * dbA   : +jsonA1
   * dbB   : -jsonA1
   * result:  jsonA1
   *
   * '+' means update
   *
   * 3-way merge:
   *  jsonA1: 9 - Conflict. Accept theirs (update)
   */
  it('resolves case 9 - Conflict. Accept ours (delete)', async () => {
    const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
      conflictResolutionStrategy: 'theirs',
    });
    // A puts and pushes
    const jsonA1 = { _id: '1', name: 'fromA' };
    const putResultA1 = await dbA.put(jsonA1);
    await syncA.tryPush();

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

    // B deletes and syncs
    const deleteResultB1 = await dbB.delete(jsonA1);

    const syncResult1 = (await syncB.trySync()) as SyncResultResolveConflictsAndPush;
    expect(syncResult1.action).toBe('resolve conflicts and push');
    expect(syncResult1.commits).toMatchObject({
      local: getCommitInfo([
        putResultA1dash,
        `resolve: 1${JSON_EXT}(update,${putResultA1dash.fileOid.substr(0, 7)},theirs)`,
      ]),
      remote: getCommitInfo([
        deleteResultB1,
        `resolve: 1${JSON_EXT}(update,${putResultA1dash.fileOid.substr(0, 7)},theirs)`,
      ]),
    });

    expect(syncResult1.changes.local.length).toBe(1);
    expect(syncResult1.changes.local).toEqual([
      getChangedFileInsert(jsonA1dash, putResultA1dash),
    ]);

    expect(syncResult1.changes.remote.length).toBe(0);

    expect(syncResult1.conflicts.length).toEqual(1);
    expect(syncResult1.conflicts).toEqual([
      {
        fatDoc: {
          _id: '1',
          name: '1.json',
          fileOid: putResultA1dash.fileOid,
          type: 'json',
          doc: jsonA1dash,
        },
        strategy: 'theirs',
        operation: 'update',
      },
    ]);
    // Conflict occurs on 1.json

    expect(getWorkingDirDocs(dbA)).toEqual([jsonA1dash]);
    expect(getWorkingDirDocs(dbB)).toEqual([jsonA1dash]);

    await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
    await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

    await destroyDBs([dbA, dbB]);
  });

  /**
   * before:          jsonA2
   * dbA   :  jsonA1 -jsonA2
   * dbB   :  jsonB1
   * after :  jsonB1
   *
   * 3-way merge:
   *   jsonB1: 4 - Conflict. Accept ours (insert)
   *   jsonA2:10 - Accept theirs (delete)
   */
  it('resolves case 10 - Accept theirs (delete), case 4 - Conflict. Accept ours (insert)', async () => {
    const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
      conflictResolutionStrategy: 'ours',
    });
    // A puts and pushes
    const jsonA2 = { _id: '2', name: 'fromA' };
    await dbA.put(jsonA2);
    await syncA.tryPush();

    const dbNameB = serialId();
    const dbB: GitDocumentDB = new GitDocumentDB({
      dbName: dbNameB,
      localDir,
    });
    // Clone dbA
    await dbB.open();
    const syncB = await dbB.sync(syncA.options);

    // A puts, deletes, and pushes
    const jsonA1 = { _id: '1', name: 'fromA' };
    const putResultA1 = await dbA.put(jsonA1);
    const deleteResultA2 = await dbA.delete(jsonA2);
    await syncA.tryPush();

    // B puts the same file
    const jsonB1 = { _id: '1', name: 'fromB' };
    const putResultB1 = await dbB.put(jsonB1);

    // It will occur conflict on id 1.json.
    const syncResult1 = (await syncB.trySync()) as SyncResultResolveConflictsAndPush;
    expect(syncResult1.action).toBe('resolve conflicts and push');
    expect(syncResult1.commits).toMatchObject({
      local: getCommitInfo([
        putResultA1,
        deleteResultA2,
        `resolve: 1${JSON_EXT}(insert,${putResultB1.fileOid.substr(0, 7)},ours)`,
      ]),
      remote: getCommitInfo([
        putResultB1,
        `resolve: 1${JSON_EXT}(insert,${putResultB1.fileOid.substr(0, 7)},ours)`,
      ]),
    });
    expect(syncResult1.changes.local.length).toBe(1);
    expect(syncResult1.changes.local).toEqual([
      getChangedFileDelete(jsonA2, deleteResultA2),
    ]);

    expect(syncResult1.changes.remote.length).toBe(1);
    expect(syncResult1.changes.remote).toEqual([
      getChangedFileUpdate(jsonA1, putResultA1, jsonB1, putResultB1),
    ]);

    expect(syncResult1.conflicts.length).toEqual(1);
    expect(syncResult1.conflicts).toEqual([
      {
        fatDoc: {
          _id: '1',
          name: '1.json',
          fileOid: putResultB1.fileOid,
          type: 'json',
          doc: jsonB1,
        },
        strategy: 'ours',
        operation: 'insert',
      },
    ]);
    // Conflict occurs on 1.json

    expect(getWorkingDirDocs(dbB)).toEqual([jsonB1]);
    // Sync dbA
    const syncResult2 = (await syncA.trySync()) as SyncResultMergeAndPush;
    expect(getWorkingDirDocs(dbA)).toEqual([jsonB1]);

    await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
    await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

    await destroyDBs([dbA, dbB]);
  });

  /**
   * before:  jsonA1
   * dbA   : -jsonA1  jsonA2
   * dbB   :  jsonB1
   * result:  jsonB1  jsonA2
   *
   * 3-way merge:
   *  jsonB1: 11 - Conflict. Accept ours (update)
   *  jsonA2:  1 - Accept theirs (insert)
   */
  it('resolves case 11 - Conflict. Accept ours (update), case 1 - Accept theirs (insert), ', async () => {
    const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
      conflictResolutionStrategy: 'ours',
    });
    // A puts and pushes
    const jsonA1 = { _id: '1', name: 'fromA' };
    const putResultA1 = await dbA.put(jsonA1);
    await syncA.tryPush();

    const dbNameB = serialId();
    const dbB: GitDocumentDB = new GitDocumentDB({
      dbName: dbNameB,
      localDir,
    });
    // Clone dbA
    await dbB.open();
    const syncB = await dbB.sync(syncA.options);

    // A deletes the old file and puts a new file
    const deleteResultA1 = await dbA.delete(jsonA1);
    const jsonA2 = { _id: '2', name: 'fromA' };
    const putResultA2 = await dbA.put(jsonA2);
    await syncA.tryPush();

    // B updates the old file and syncs
    const jsonB1 = { _id: '1', name: 'fromB' };
    const putResultB1 = await dbB.put(jsonB1);

    const syncResult1 = (await syncB.trySync()) as SyncResultResolveConflictsAndPush;
    expect(syncResult1.action).toBe('resolve conflicts and push');
    expect(syncResult1.commits).toMatchObject({
      local: getCommitInfo([
        deleteResultA1,
        putResultA2,
        `resolve: 1${JSON_EXT}(update,${putResultB1.fileOid.substr(0, 7)},ours)`,
      ]),
      remote: getCommitInfo([
        putResultB1,
        `resolve: 1${JSON_EXT}(update,${putResultB1.fileOid.substr(0, 7)},ours)`,
      ]),
    });
    expect(syncResult1.changes.local.length).toBe(1);
    expect(syncResult1.changes.local).toEqual([getChangedFileInsert(jsonA2, putResultA2)]);

    expect(syncResult1.changes.remote.length).toBe(1);
    expect(syncResult1.changes.remote).toEqual([getChangedFileInsert(jsonB1, putResultB1)]);

    expect(syncResult1.conflicts.length).toEqual(1);
    expect(syncResult1.conflicts).toEqual([
      {
        fatDoc: {
          _id: '1',
          name: '1.json',
          fileOid: putResultB1.fileOid,
          type: 'json',
          doc: jsonB1,
        },
        strategy: 'ours',
        operation: 'update',
      },
    ]);
    // Conflict occurs on 1.json

    expect(getWorkingDirDocs(dbB)).toEqual([jsonB1, jsonA2]);

    // Sync dbA
    const syncResult2 = (await syncA.trySync()) as SyncResultMergeAndPush;
    expect(getWorkingDirDocs(dbA)).toEqual([jsonB1, jsonA2]);

    await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
    await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

    await destroyDBs([dbA, dbB]);
  });

  /**
   * before:  jsonA1
   * dbA   : -jsonA1  jsonA2
   * dbB   :  jsonB1
   * result:          jsonA2
   *
   * 3-way merge:
   *  jsonA1: 11 - Conflict. Accept theirs (delete)
   *  jsonA2:  1 - Accept theirs (insert)
   */
  it('resolves case 12 - accept theirs (delete), case 1 - Accept theirs (insert)', async () => {
    const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
      conflictResolutionStrategy: 'ours',
    });
    // A puts and pushes
    const jsonA1 = { _id: '1', name: 'fromA' };
    const putResultA1 = await dbA.put(jsonA1);
    await syncA.tryPush();

    const dbNameB = serialId();
    const dbB: GitDocumentDB = new GitDocumentDB({
      dbName: dbNameB,
      localDir,
    });
    // Clone dbA
    await dbB.open();
    const syncB = await dbB.sync({
      ...syncA.options,
      conflictResolutionStrategy: 'theirs',
    });

    // A deletes the old file and puts a new file
    const deleteResultA1 = await dbA.delete(jsonA1);
    const jsonA2 = { _id: '2', name: 'fromA' };
    const putResultA2 = await dbA.put(jsonA2);
    await syncA.tryPush();

    // B updates the old file and syncs
    const jsonB1 = { _id: '1', name: 'fromB' };
    const putResultB1 = await dbB.put(jsonB1);

    const syncResult1 = (await syncB.trySync()) as SyncResultResolveConflictsAndPush;
    expect(syncResult1.action).toBe('resolve conflicts and push');
    expect(syncResult1.commits).toMatchObject({
      local: getCommitInfo([
        deleteResultA1,
        putResultA2,
        `resolve: 1${JSON_EXT}(delete,${deleteResultA1.fileOid.substr(0, 7)},theirs)`,
      ]),
      remote: getCommitInfo([
        putResultB1,
        `resolve: 1${JSON_EXT}(delete,${deleteResultA1.fileOid.substr(0, 7)},theirs)`,
      ]),
    });
    expect(syncResult1.changes.local.length).toBe(2);
    expect(syncResult1.changes.local).toEqual(
      expect.arrayContaining([
        getChangedFileDelete(jsonB1, putResultB1),
        getChangedFileInsert(jsonA2, putResultA2),
      ])
    );

    expect(syncResult1.changes.remote.length).toBe(0);

    expect(syncResult1.conflicts.length).toEqual(1);
    expect(syncResult1.conflicts).toEqual([
      {
        fatDoc: {
          _id: '1',
          name: '1.json',
          fileOid: deleteResultA1.fileOid,
          type: 'json',
          doc: jsonA1,
        },
        strategy: 'theirs',
        operation: 'delete',
      },
    ]);
    // Conflict occurs on 1.json
    expect(getWorkingDirDocs(dbA)).toEqual([jsonA2]);
    expect(getWorkingDirDocs(dbB)).toEqual([jsonA2]);

    await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
    await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

    await destroyDBs([dbA, dbB]);
  });

  /**
   * before:          jsonA2
   * dbA   :  jsonA1 +jsonA2
   * dbB   :  jsonB1 +jsonA2
   * after :  jsonB1 +jsonA2
   *
   * 3-way merge:
   *   jsonB1: 4 - Conflict. Accept ours (insert)
   *   jsonA2:13 - Accept both (update)
   */
  it('resolves case 13 - Accept both (update), case 4 - Conflict. Accept ours (insert)', async () => {
    const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
      conflictResolutionStrategy: 'ours',
    });
    // A puts and pushes
    const jsonA2 = { _id: '2', name: 'fromA' };
    const putResultA2 = await dbA.put(jsonA2);
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
    const jsonA1 = { _id: '1', name: 'fromA' };
    const putResultA1 = await dbA.put(jsonA1);
    const jsonA2dash = { _id: '2', name: 'updated' };
    const putResultA2dash = await dbA.put(jsonA2dash);
    await syncA.tryPush();

    // B puts the same file
    const jsonB1 = { _id: '1', name: 'fromB' };
    const putResultB1 = await dbB.put(jsonB1);

    // B puts the same file with the same contents
    const putResultB2 = await dbB.put(jsonA2dash);

    // It will occur conflict on id 1.json.
    const syncResult1 = (await syncB.trySync()) as SyncResultResolveConflictsAndPush;
    expect(syncResult1.action).toBe('resolve conflicts and push');
    expect(syncResult1.commits).toMatchObject({
      local: getCommitInfo([
        putResultA1,
        putResultA2dash,
        `resolve: 1${JSON_EXT}(insert,${putResultB1.fileOid.substr(0, 7)},ours)`,
      ]),
      remote: getCommitInfo([
        putResultB1,
        putResultB2,
        `resolve: 1${JSON_EXT}(insert,${putResultB1.fileOid.substr(0, 7)},ours)`,
      ]),
    });
    expect(syncResult1.changes.local.length).toBe(0);

    expect(syncResult1.changes.remote.length).toBe(1);
    expect(syncResult1.changes.remote).toEqual([
      getChangedFileUpdate(jsonA1, putResultA1, jsonB1, putResultB1),
    ]);

    expect(syncResult1.conflicts.length).toEqual(1);
    expect(syncResult1.conflicts).toEqual([
      {
        fatDoc: {
          _id: '1',
          name: '1.json',
          fileOid: putResultB1.fileOid,
          type: 'json',
          doc: jsonB1,
        },
        strategy: 'ours',
        operation: 'insert',
      },
    ]);
    // Conflict occurs on 1.json

    expect(getWorkingDirDocs(dbB)).toEqual([jsonB1, jsonA2dash]);
    // Sync dbA
    const syncResult2 = (await syncA.trySync()) as SyncResultMergeAndPush;
    expect(getWorkingDirDocs(dbA)).toEqual([jsonB1, jsonA2dash]);

    await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
    await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

    await destroyDBs([dbA, dbB]);
  });

  // case 14
  /**
   * before:          jsonA2
   * dbA   :  jsonA1 +jsonA2
   * dbB   :  jsonB1  jsonA2
   * after :  jsonB1 +jsonA2
   *
   * 3-way merge:
   *   jsonB1: 4 - Conflict. Accept ours (insert)
   *   jsonA2:14 - Accept theirs (update)
   */
  it('resolves case 14 - Accept theirs (update), case 4 - Conflict. Accept ours (insert)', async () => {
    const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
      conflictResolutionStrategy: 'ours',
    });
    // A puts and pushes
    const jsonA2 = { _id: '2', name: 'fromA' };
    const putResultA2 = await dbA.put(jsonA2);
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
    const jsonA1 = { _id: '1', name: 'fromA' };
    const putResultA1 = await dbA.put(jsonA1);
    const jsonA2dash = { _id: '2', name: 'updated' };
    const putResultA2dash = await dbA.put(jsonA2dash);
    await syncA.tryPush();

    // B puts the same file
    const jsonB1 = { _id: '1', name: 'fromB' };
    const putResultB1 = await dbB.put(jsonB1);

    // B puts the same file with the previous contents
    const putResultB2 = await dbB.put(jsonA2);

    // It will occur conflict on id 1.json.
    const syncResult1 = (await syncB.trySync()) as SyncResultResolveConflictsAndPush;
    expect(syncResult1.action).toBe('resolve conflicts and push');
    expect(syncResult1.commits).toMatchObject({
      local: getCommitInfo([
        putResultA1,
        putResultA2dash,
        `resolve: 1${JSON_EXT}(insert,${putResultB1.fileOid.substr(0, 7)},ours)`,
      ]),
      remote: getCommitInfo([
        putResultB1,
        putResultB2,
        `resolve: 1${JSON_EXT}(insert,${putResultB1.fileOid.substr(0, 7)},ours)`,
      ]),
    });
    expect(syncResult1.changes.local.length).toBe(1);
    expect(syncResult1.changes.local).toEqual([
      getChangedFileUpdate(jsonA2, putResultB2, jsonA2dash, putResultA2dash),
    ]);

    expect(syncResult1.changes.remote.length).toBe(1);
    expect(syncResult1.changes.remote).toEqual([
      getChangedFileUpdate(jsonA1, putResultA1, jsonB1, putResultB1),
    ]);

    expect(syncResult1.conflicts.length).toEqual(1);
    expect(syncResult1.conflicts).toEqual([
      {
        fatDoc: {
          _id: '1',
          name: '1.json',
          fileOid: putResultB1.fileOid,
          type: 'json',
          doc: jsonB1,
        },
        strategy: 'ours',
        operation: 'insert',
      },
    ]);
    // Conflict occurs on 1.json

    expect(getWorkingDirDocs(dbB)).toEqual([jsonB1, jsonA2dash]);
    // Sync dbA
    const syncResult2 = (await syncA.trySync()) as SyncResultMergeAndPush;
    expect(getWorkingDirDocs(dbA)).toEqual([jsonB1, jsonA2dash]);

    await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
    await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

    await destroyDBs([dbA, dbB]);
  });

  /**
   * before:          jsonA2
   * dbA   :  jsonA1  jsonA2
   * dbB   :  jsonB1  jsonB2
   * after :  jsonB1  jsonB2
   *
   * 3-way merge:
   *   jsonB1: 4 - Conflict. Accept ours (insert)
   *   jsonA2:15 - Accept ours (update)
   */
  it('resolves case 15 - Accept ours (update), case 4 - Conflict. Accept ours (insert)', async () => {
    const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
      conflictResolutionStrategy: 'ours',
    });
    // A puts and pushes
    const jsonA2 = { _id: '2', name: 'fromA' };
    const putResultA2 = await dbA.put(jsonA2);
    await syncA.tryPush();

    const dbNameB = serialId();
    const dbB: GitDocumentDB = new GitDocumentDB({
      dbName: dbNameB,
      localDir,
    });
    // Clone dbA
    await dbB.open();
    const syncB = await dbB.sync(syncA.options);

    // A puts
    const jsonA1 = { _id: '1', name: 'fromA' };
    const putResultA1 = await dbA.put(jsonA1);
    // A puts the previous file and pushes
    const putResultA2dash = await dbA.put(jsonA2);
    await syncA.tryPush();

    // B puts the same file
    const jsonB1 = { _id: '1', name: 'fromB' };
    const putResultB1 = await dbB.put(jsonB1);

    // B puts
    const jsonB2 = { _id: '2', name: 'fromB' };
    const putResultB2 = await dbB.put(jsonB2);

    // It will occur conflict on id 1.json.
    const syncResult1 = (await syncB.trySync()) as SyncResultResolveConflictsAndPush;
    expect(syncResult1.action).toBe('resolve conflicts and push');
    expect(syncResult1.commits).toMatchObject({
      local: getCommitInfo([
        putResultA1,
        putResultA2dash,
        `resolve: 1${JSON_EXT}(insert,${putResultB1.fileOid.substr(0, 7)},ours)`,
      ]),
      remote: getCommitInfo([
        putResultB1,
        putResultB2,
        `resolve: 1${JSON_EXT}(insert,${putResultB1.fileOid.substr(0, 7)},ours)`,
      ]),
    });
    expect(syncResult1.changes.local.length).toBe(0);

    expect(syncResult1.changes.remote.length).toBe(2);
    expect(syncResult1.changes.remote).toEqual([
      getChangedFileUpdate(jsonA1, putResultA1, jsonB1, putResultB1),
      getChangedFileUpdate(jsonA2, putResultA2dash, jsonB2, putResultB2),
    ]);

    expect(syncResult1.conflicts.length).toEqual(1);
    expect(syncResult1.conflicts).toEqual([
      {
        fatDoc: {
          _id: '1',
          name: '1.json',
          fileOid: putResultB1.fileOid,
          type: 'json',
          doc: jsonB1,
        },
        strategy: 'ours',
        operation: 'insert',
      },
    ]);
    // Conflict occurs on 1.json

    expect(getWorkingDirDocs(dbB)).toEqual([jsonB1, jsonB2]);
    // Sync dbA
    const syncResult2 = (await syncA.trySync()) as SyncResultMergeAndPush;
    expect(getWorkingDirDocs(dbA)).toEqual([jsonB1, jsonB2]);

    await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
    await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

    await destroyDBs([dbA, dbB]);
  });

  /**
   * before:  jsonA1
   * dbA   : +jsonA1
   * dbB   :  jsonB1
   * after :  jsonB1
   *
   * 3-way merge:
   *   jsonB1:16 - Conflict. Accept ours (update)
   */
  it('resolves case 16 - Conflict. Accept ours (update)', async () => {
    const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
      conflictResolutionStrategy: 'ours',
    });
    // A puts and pushes
    const jsonA1 = { _id: '1', name: 'fromA' };
    const putResultA1 = await dbA.put(jsonA1);
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
    const jsonA1dash = { _id: '1', name: 'updated' };
    const putResultA1dash = await dbA.put(jsonA1dash);
    await syncA.tryPush();

    // B puts
    const jsonB1 = { _id: '1', name: 'fromB' };
    const putResultB1 = await dbB.put(jsonB1);

    // It will occur conflict on id 1.json.
    const syncResult1 = (await syncB.trySync()) as SyncResultResolveConflictsAndPush;
    expect(syncResult1.action).toBe('resolve conflicts and push');
    expect(syncResult1.commits).toMatchObject({
      local: getCommitInfo([
        putResultA1dash,
        `resolve: 1${JSON_EXT}(update,${putResultB1.fileOid.substr(0, 7)},ours)`,
      ]),
      remote: getCommitInfo([
        putResultB1,
        `resolve: 1${JSON_EXT}(update,${putResultB1.fileOid.substr(0, 7)},ours)`,
      ]),
    });
    expect(syncResult1.changes.local.length).toBe(0);

    expect(syncResult1.changes.remote.length).toBe(1);
    expect(syncResult1.changes.remote).toEqual([
      getChangedFileUpdate(jsonA1dash, putResultA1dash, jsonB1, putResultB1),
    ]);

    expect(syncResult1.conflicts.length).toEqual(1);
    expect(syncResult1.conflicts).toEqual([
      {
        fatDoc: {
          _id: '1',
          name: '1.json',
          fileOid: putResultB1.fileOid,
          type: 'json',
          doc: jsonB1,
        },
        strategy: 'ours',
        operation: 'update',
      },
    ]);
    // Conflict occurs on 1.json

    expect(getWorkingDirDocs(dbB)).toEqual([jsonB1]);
    // Sync dbA
    const syncResult2 = (await syncA.trySync()) as SyncResultMergeAndPush;
    expect(getWorkingDirDocs(dbA)).toEqual([jsonB1]);

    await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
    await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

    await destroyDBs([dbA, dbB]);
  });

  /**
   * before:  jsonA1
   * dbA   : +jsonA1
   * dbB   :  jsonB1
   * after : +jsonA1
   *
   * 3-way merge:
   *   jsonA1:17 - Conflict. Accept theirs (update)
   */
  it('resolves case 17 - Conflict. Accept theirs (update)', async () => {
    const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
      conflictResolutionStrategy: 'theirs',
    });
    // A puts and pushes
    const jsonA1 = { _id: '1', name: 'fromA' };
    const putResultA1 = await dbA.put(jsonA1);
    await syncA.tryPush();

    const dbNameB = serialId();
    const dbB: GitDocumentDB = new GitDocumentDB({
      dbName: dbNameB,
      localDir,
    });
    // Clone dbA
    await dbB.open();
    const syncB = await dbB.sync({
      ...syncA.options,
      conflictResolutionStrategy: 'theirs',
    });

    // A puts and pushes
    const jsonA1dash = { _id: '1', name: 'updated' };
    const putResultA1dash = await dbA.put(jsonA1dash);
    await syncA.tryPush();

    // B puts
    const jsonB1 = { _id: '1', name: 'fromB' };
    const putResultB1 = await dbB.put(jsonB1);

    // It will occur conflict on id 1.json.
    const syncResult1 = (await syncB.trySync()) as SyncResultResolveConflictsAndPush;
    expect(syncResult1.action).toBe('resolve conflicts and push');
    expect(syncResult1.commits).toMatchObject({
      local: getCommitInfo([
        putResultA1dash,
        `resolve: 1${JSON_EXT}(update,${putResultA1dash.fileOid.substr(0, 7)},theirs)`,
      ]),
      remote: getCommitInfo([
        putResultB1,
        `resolve: 1${JSON_EXT}(update,${putResultA1dash.fileOid.substr(0, 7)},theirs)`,
      ]),
    });
    expect(syncResult1.changes.local.length).toBe(1);
    expect(syncResult1.changes.local).toEqual([
      getChangedFileUpdate(jsonB1, putResultB1, jsonA1dash, putResultA1dash),
    ]);

    expect(syncResult1.changes.remote.length).toBe(0);

    expect(syncResult1.conflicts.length).toEqual(1);
    expect(syncResult1.conflicts).toEqual([
      {
        fatDoc: {
          _id: '1',
          name: '1.json',
          fileOid: putResultA1dash.fileOid,
          type: 'json',
          doc: jsonA1dash,
        },
        strategy: 'theirs',
        operation: 'update',
      },
    ]);
    // Conflict occurs on 1.json

    expect(getWorkingDirDocs(dbA)).toEqual([jsonA1dash]);
    expect(getWorkingDirDocs(dbB)).toEqual([jsonA1dash]);

    await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
    await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

    await destroyDBs([dbA, dbB]);
  });

  /**
   * before:  jsonA1  jsonA2  jsonA3
   * dbA   : +jsonA1 -jsonA2 +jsonA3
   * dbB   : -jsonA1 +jsonB2 +jsonB3
   * result:          jsonB2  jsonB3
   *
   * 3-way merge:
   *  jsonA1: 8 - Conflict. Accept ours (delete)
   *  jsonB2: 4 - Conflict. Accept ours (insert)
   *  jsonB3:11 - Conflict. Accept ours (update)
   */
  it('resolves many conflicts', async () => {
    const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
      conflictResolutionStrategy: 'ours',
    });
    // A puts and pushes
    const jsonA1 = { _id: '1', name: 'fromA' };
    const putResultA1 = await dbA.put(jsonA1);
    const jsonA2 = { _id: '2', name: 'fromA' };
    const putResultA2 = await dbA.put(jsonA2);
    const jsonA3 = { _id: '3', name: 'fromA' };
    const putResultA3 = await dbA.put(jsonA3);
    await syncA.tryPush();

    const dbNameB = serialId();
    const dbB: GitDocumentDB = new GitDocumentDB({
      dbName: dbNameB,
      localDir,
    });
    // Clone dbA
    await dbB.open();
    const syncB = await dbB.sync(syncA.options);

    // A updates, deletes, updates, and pushes

    // change commit order for test
    // 3 -> 1 -> 2
    const jsonA3dash = { _id: '3', name: 'updated' };
    const putResultA3dash = await dbA.put(jsonA3dash);

    const jsonA1dash = { _id: '1', name: 'updated' };
    const putResultA1dash = await dbA.put(jsonA1dash);

    const deleteResultA2 = await dbA.delete(jsonA2);

    await syncA.tryPush();

    // B deletes, updates, updates, and syncs

    // change commit order for test
    // 3 -> 1 -> 2
    const jsonB3 = { _id: '3', name: 'fromB' };
    const putResultB3 = await dbB.put(jsonB3);

    const deleteResultB1 = await dbB.delete(jsonA1);

    const jsonB2 = { _id: '2', name: 'fromB' };
    const putResultB2 = await dbB.put(jsonB2);

    const syncResult1 = (await syncB.trySync()) as SyncResultResolveConflictsAndPush;
    expect(syncResult1.action).toBe('resolve conflicts and push');
    expect(syncResult1.commits).toMatchObject({
      local: getCommitInfo([
        putResultA3dash,
        putResultA1dash,
        deleteResultA2,
        `resolve: 1${JSON_EXT}(delete,${deleteResultB1.fileOid.substr(
          0,
          7
        )},ours), 2${JSON_EXT}(update,${putResultB2.fileOid.substr(
          0,
          7
        )},ours), 3${JSON_EXT}(update,${putResultB3.fileOid.substr(0, 7)},ours)`,
      ]),
      remote: getCommitInfo([
        putResultB3,
        deleteResultB1,
        putResultB2,
        `resolve: 1${JSON_EXT}(delete,${deleteResultB1.fileOid.substr(
          0,
          7
        )},ours), 2${JSON_EXT}(update,${putResultB2.fileOid.substr(
          0,
          7
        )},ours), 3${JSON_EXT}(update,${putResultB3.fileOid.substr(0, 7)},ours)`,
      ]),
    });
    expect(syncResult1.changes.local.length).toBe(0);

    expect(syncResult1.changes.remote.length).toBe(3);
    expect(syncResult1.changes.remote).toEqual(
      expect.arrayContaining([
        getChangedFileDelete(jsonA1dash, putResultA1dash),
        getChangedFileInsert(jsonB2, putResultB2),
        getChangedFileUpdate(jsonA3dash, putResultA3dash, jsonB3, putResultB3),
      ])
    );

    expect(syncResult1.conflicts).toEqual(
      expect.arrayContaining([
        {
          fatDoc: {
            _id: '1',
            name: '1.json',
            fileOid: deleteResultB1.fileOid,
            type: 'json',
            doc: jsonA1,
          },
          strategy: 'ours',
          operation: 'delete',
        },
        {
          fatDoc: {
            _id: '2',
            name: '2.json',
            fileOid: putResultB2.fileOid,
            type: 'json',
            doc: jsonB2,
          },
          strategy: 'ours',
          operation: 'update',
        },
        {
          fatDoc: {
            _id: '3',
            name: '3.json',
            fileOid: putResultB3.fileOid,
            type: 'json',
            doc: jsonB3,
          },
          strategy: 'ours',
          operation: 'update',
        },
      ])
    );
    // Conflict occurs on 1.json

    expect(getWorkingDirDocs(dbB)).toEqual([jsonB2, jsonB3]);

    // Sync dbA
    const syncResult2 = (await syncA.trySync()) as SyncResultMergeAndPush;
    expect(getWorkingDirDocs(dbA)).toEqual([jsonB2, jsonB3]);

    await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
    await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

    await destroyDBs([dbA, dbB]);
  });

  /**
   * before:  jsonA1
   * dbA   : +jsonA1
   * dbB   :  jsonB1
   * after :  jsonB1
   *
   * 3-way merge:
   *   jsonB1:16 - Conflict. Accept ours (update)
   */
  it('resolves case 16 by user strategy function.', async () => {
    const userStrategyByDate = (ours?: FatDoc, theirs?: FatDoc) => {
      if (ours === undefined || theirs === undefined) {
        throw new Error('Undefined document');
      }
      if ((ours.doc as JsonDoc).date > (theirs.doc as JsonDoc).date) {
        return 'ours';
      }
      return 'theirs';
    };

    const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
      conflictResolutionStrategy: userStrategyByDate,
    });
    // A puts and pushes
    const jsonA1 = { _id: '1', name: 'fromA' };
    const putResultA1 = await dbA.put(jsonA1);
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
    const jsonA1dash = { _id: '1', name: 'updated', date: '2021/05/16' };
    const putResultA1dash = await dbA.put(jsonA1dash);
    await syncA.tryPush();

    // B puts
    const jsonB1 = { _id: '1', name: 'fromB', date: '2021/06/16' };
    const putResultB1 = await dbB.put(jsonB1);

    // It will occur conflict on id 1.json.
    const syncResult1 = (await syncB.trySync()) as SyncResultResolveConflictsAndPush;
    expect(syncResult1.action).toBe('resolve conflicts and push');
    expect(syncResult1.commits).toMatchObject({
      local: getCommitInfo([
        putResultA1dash,
        `resolve: 1${JSON_EXT}(update,${putResultB1.fileOid.substr(0, 7)},ours)`,
      ]),
      remote: getCommitInfo([
        putResultB1,
        `resolve: 1${JSON_EXT}(update,${putResultB1.fileOid.substr(0, 7)},ours)`,
      ]),
    });
    expect(syncResult1.changes.local.length).toBe(0);

    expect(syncResult1.changes.remote.length).toBe(1);
    expect(syncResult1.changes.remote).toEqual([
      getChangedFileUpdate(jsonA1dash, putResultA1dash, jsonB1, putResultB1),
    ]);

    expect(syncResult1.conflicts.length).toEqual(1);
    expect(syncResult1.conflicts).toEqual([
      {
        fatDoc: {
          _id: '1',
          name: '1.json',
          fileOid: putResultB1.fileOid,
          type: 'json',
          doc: jsonB1,
        },
        strategy: 'ours',
        operation: 'update',
      },
    ]);
    // Conflict occurs on 1.json

    expect(getWorkingDirDocs(dbB)).toEqual([jsonB1]);
    // Sync dbA
    const syncResult2 = (await syncA.trySync()) as SyncResultMergeAndPush;
    expect(getWorkingDirDocs(dbA)).toEqual([jsonB1]);

    await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
    await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

    await destroyDBs([dbA, dbB]);
  });

  /**
   * before:  jsonA1
   * dbA   : +jsonA1
   * dbB   :  jsonB1
   * after : +jsonA1
   *
   * 3-way merge:
   *   jsonA1:17 - Conflict. Accept theirs (update)
   */
  it('resolves case 17 by user strategy function.', async () => {
    const userStrategyByDate = (ours?: FatDoc, theirs?: FatDoc) => {
      if (ours === undefined || theirs === undefined) {
        throw new Error('Undefined document');
      }
      if ((ours.doc as JsonDoc).date > (theirs.doc as JsonDoc).date) {
        return 'ours';
      }
      return 'theirs';
    };
    const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
      conflictResolutionStrategy: userStrategyByDate,
    });
    // A puts and pushes
    const jsonA1 = { _id: '1', name: 'fromA' };
    const putResultA1 = await dbA.put(jsonA1);
    await syncA.tryPush();

    const dbNameB = serialId();
    const dbB: GitDocumentDB = new GitDocumentDB({
      dbName: dbNameB,
      localDir,
    });
    // Clone dbA
    await dbB.open();
    const syncB = await dbB.sync({
      ...syncA.options,
      conflictResolutionStrategy: 'theirs',
    });

    // A puts and pushes
    const jsonA1dash = { _id: '1', name: 'updated', date: '2021/06/16' };
    const putResultA1dash = await dbA.put(jsonA1dash);
    await syncA.tryPush();

    // B puts
    const jsonB1 = { _id: '1', name: 'fromB', date: '2021/05/16' };
    const putResultB1 = await dbB.put(jsonB1);

    // It will occur conflict on id 1.json.
    const syncResult1 = (await syncB.trySync()) as SyncResultResolveConflictsAndPush;
    expect(syncResult1.action).toBe('resolve conflicts and push');
    expect(syncResult1.commits).toMatchObject({
      local: getCommitInfo([
        putResultA1dash,
        `resolve: 1${JSON_EXT}(update,${putResultA1dash.fileOid.substr(0, 7)},theirs)`,
      ]),
      remote: getCommitInfo([
        putResultB1,
        `resolve: 1${JSON_EXT}(update,${putResultA1dash.fileOid.substr(0, 7)},theirs)`,
      ]),
    });
    expect(syncResult1.changes.local.length).toBe(1);
    expect(syncResult1.changes.local).toEqual([
      getChangedFileUpdate(jsonB1, putResultB1, jsonA1dash, putResultA1dash),
    ]);

    expect(syncResult1.changes.remote.length).toBe(0);

    expect(syncResult1.conflicts.length).toEqual(1);
    expect(syncResult1.conflicts).toEqual([
      {
        fatDoc: {
          _id: '1',
          name: '1.json',
          fileOid: putResultA1dash.fileOid,
          type: 'json',
          doc: jsonA1dash,
        },
        strategy: 'theirs',
        operation: 'update',
      },
    ]);
    // Conflict occurs on 1.json

    expect(getWorkingDirDocs(dbA)).toEqual([jsonA1dash]);
    expect(getWorkingDirDocs(dbB)).toEqual([jsonA1dash]);

    await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
    await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

    await destroyDBs([dbA, dbB]);
  });
});
