/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

/**
 * Test Operational Transformation in 3-way merge
 * by using GitHub Personal Access Token
 * These tests create a new repository on GitHub if not exists.
 */
import path from 'path';
import fs from 'fs-extra';
import { GitDocumentDB } from '../src';
import { SyncResultMergeAndPush, SyncResultResolveConflictsAndPush } from '../src/types';
import {
  compareWorkingDirAndBlobs,
  createClonedDatabases,
  createDatabase,
  destroyDBs,
  getChangedFile,
  getChangedFileBySHA,
  getCommitInfo,
  getWorkingDirFiles,
  removeRemoteRepositories,
} from '../test/remote_utils';

const reposPrefix = 'test_3way_merge_ot___';
const localDir = `./test_intg/database_3way_merge_ot`;

let idCounter = 0;
const serialId = () => {
  return `${reposPrefix}${idCounter++}`;
};

beforeEach(function () {
  // @ts-ignore
  console.log(`... ${this.currentTest.fullTitle()}`);
});

beforeAll(() => {
  fs.removeSync(path.resolve(localDir));
});

afterAll(() => {
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

maybe('<remote/sync_worker> threeWayMerge() with OT', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  beforeAll(async () => {
    await removeRemoteRepositories(reposPrefix);
  });

  // it.only('Run this test with .only to just remove remote repositories.', async () => {});

  /**
   * before:
   * dbA   :  jsonA1  jsonA2
   * dbB   :  jsonB1          jsonB3
   * after :  mergedJson  jsonA2  jsonB3
   *
   * 3-way merge:
   *   mergedJson: 4 - Conflict. Accept ours (create-merge)
   *   jsonA2: 1 - Accept theirs (create)
   *   jsonB3: 2 - Accept ours (create)
   */
  it('resolves case 1 - Accept theirs (create), case 2 - Accept ours (create), case 4 - Conflict. Accept ours (create-merge)', async () => {
    const [dbA, dbB, remoteA, remoteB] = await createClonedDatabases(
      remoteURLBase,
      localDir,
      serialId,
      {
        conflict_resolve_strategy: 'ours-prop',
      }
    );

    // A puts and pushes
    const jsonA1 = { _id: '1', name: 'fromA', a: 'fromA' };
    const putResultA1 = await dbA.put(jsonA1);
    const jsonA2 = { _id: '2', name: 'fromA' };
    const putResultA2 = await dbA.put(jsonA2);
    await remoteA.tryPush();

    // B puts the same file
    const jsonB1 = { _id: '1', name: 'fromB', b: 'fromB' };
    const putResultB1 = await dbB.put(jsonB1);

    const mergedJson = { _id: '1', name: 'fromB', a: 'fromA', b: 'fromB' };

    // B puts a new file
    const jsonB3 = { _id: '3', name: 'fromB' };
    const putResultB3 = await dbB.put(jsonB3);

    // It will occur conflict on id 1.json.
    const syncResult1 = (await remoteB.trySync()) as SyncResultResolveConflictsAndPush;

    const mergedDoc = await dbB.getDocWithMetaData('1');

    expect(syncResult1.action).toBe('resolve conflicts and push');
    expect(syncResult1.commits).toMatchObject({
      local: getCommitInfo([
        putResultA1,
        putResultA2,
        `resolve: 1${dbA.fileExt}(create-merge,${mergedDoc!.file_sha.substr(
          0,
          7
        )},ours-prop)`,
      ]),
      remote: getCommitInfo([
        putResultB1,
        putResultB3,
        `resolve: 1${dbA.fileExt}(create-merge,${mergedDoc!.file_sha.substr(
          0,
          7
        )},ours-prop)`,
      ]),
    });
    expect(syncResult1.changes.local.length).toBe(2);
    expect(syncResult1.changes.local).toEqual(
      expect.arrayContaining([
        getChangedFileBySHA('update', mergedJson, mergedDoc!.file_sha),
        getChangedFile('create', jsonA2, putResultA2),
      ])
    );

    expect(syncResult1.changes.remote.length).toBe(2);
    expect(syncResult1.changes.remote).toEqual(
      expect.arrayContaining([
        getChangedFileBySHA('update', mergedJson, mergedDoc!.file_sha),
        getChangedFile('create', jsonB3, putResultB3),
      ])
    );

    expect(syncResult1.conflicts.length).toEqual(1);
    expect(syncResult1.conflicts).toEqual(
      expect.arrayContaining([
        {
          target: {
            id: '1',
            file_sha: mergedDoc!.file_sha,
          },
          strategy: 'ours-prop',
          operation: 'create-merge',
        },
      ])
    );
    // Conflict occurs on 1.json

    expect(getWorkingDirFiles(dbB)).toEqual([mergedJson, jsonA2, jsonB3]);
    // Sync dbA
    const syncResult2 = (await remoteA.trySync()) as SyncResultMergeAndPush;
    expect(getWorkingDirFiles(dbA)).toEqual([mergedJson, jsonA2, jsonB3]);

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
   *   jsonA1: 5 - Conflict. Accept theirs (create)
   */
  it('resolves case 5 - Conflict. Accept theirs (create)', async () => {
    const [dbA, dbB, remoteA, remoteB] = await createClonedDatabases(
      remoteURLBase,
      localDir,
      serialId,
      {
        conflict_resolve_strategy: 'theirs-prop',
      }
    );

    // A puts and pushes
    const jsonA1 = { _id: '1', name: 'fromA' };
    const putResultA1 = await dbA.put(jsonA1);
    await remoteA.tryPush();

    // B puts the same file
    const jsonB1 = { _id: '1', name: 'fromB' };
    const putResultB1 = await dbB.put(jsonB1);

    const mergedJson = { _id: '1', name: 'fromA' };

    // It will occur conflict on id 1.json.
    const syncResult1 = (await remoteB.trySync()) as SyncResultResolveConflictsAndPush;

    const mergedDoc = await dbB.getDocWithMetaData('1');

    expect(syncResult1.action).toBe('resolve conflicts and push');
    expect(syncResult1.commits).toMatchObject({
      local: getCommitInfo([
        putResultA1,
        `resolve: 1${dbA.fileExt}(create-merge,${mergedDoc!.file_sha.substr(
          0,
          7
        )},theirs-prop)`,
      ]),
      remote: getCommitInfo([
        putResultB1,
        `resolve: 1${dbA.fileExt}(create-merge,${mergedDoc!.file_sha.substr(
          0,
          7
        )},theirs-prop)`,
      ]),
    });
    expect(syncResult1.changes.local.length).toBe(1);
    expect(syncResult1.changes.local).toEqual(
      expect.arrayContaining([
        getChangedFileBySHA('update', mergedJson, mergedDoc!.file_sha),
      ])
    );

    expect(syncResult1.changes.remote.length).toBe(0);

    expect(syncResult1.conflicts.length).toEqual(1);
    expect(syncResult1.conflicts).toEqual(
      expect.arrayContaining([
        {
          target: {
            id: '1',
            file_sha: mergedDoc!.file_sha,
          },
          strategy: 'theirs-prop',
          operation: 'create-merge',
        },
      ])
    );
    expect(getWorkingDirFiles(dbA)).toEqual([jsonA1]);
    expect(getWorkingDirFiles(dbB)).toEqual([jsonA1]);

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
    const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId, {
      conflict_resolve_strategy: 'ours-prop',
    });
    // A puts and pushes
    const jsonA1 = { _id: '1', name: 'fromA' };
    const putResultA1 = await dbA.put(jsonA1);
    await remoteA.tryPush();

    const dbNameB = serialId();
    const dbB: GitDocumentDB = new GitDocumentDB({
      db_name: dbNameB,
      local_dir: localDir,
    });
    // Clone dbA
    await dbB.create(remoteA.options());
    const remoteB = dbB.getSynchronizer(remoteA.remoteURL());

    // A updates and pushes
    const jsonA1dash = { _id: '1', name: 'updated' };
    const putResultA1dash = await dbA.put(jsonA1dash);
    await remoteA.tryPush();

    // B removes and syncs
    const deleteResultB1 = await dbB.remove(jsonA1);

    const syncResult1 = (await remoteB.trySync()) as SyncResultResolveConflictsAndPush;
    expect(syncResult1.action).toBe('resolve conflicts and push');
    expect(syncResult1.commits).toMatchObject({
      local: getCommitInfo([
        putResultA1dash,
        `resolve: 1${dbA.fileExt}(delete,${deleteResultB1.file_sha.substr(
          0,
          7
        )},ours-prop)`,
      ]),
      remote: getCommitInfo([
        deleteResultB1,
        `resolve: 1${dbA.fileExt}(delete,${deleteResultB1.file_sha.substr(
          0,
          7
        )},ours-prop)`,
      ]),
    });
    expect(syncResult1.changes.local.length).toBe(0);

    expect(syncResult1.changes.remote.length).toBe(1);
    expect(syncResult1.changes.remote).toEqual(
      expect.arrayContaining([getChangedFile('delete', jsonA1dash, putResultA1dash)])
    );

    expect(syncResult1.conflicts.length).toEqual(1);
    expect(syncResult1.conflicts).toEqual(
      expect.arrayContaining([
        {
          target: {
            id: '1',
            file_sha: deleteResultB1.file_sha,
          },
          strategy: 'ours-prop',
          operation: 'delete',
        },
      ])
    );
    // Conflict occurs on 1.json

    expect(getWorkingDirFiles(dbB)).toEqual([]);

    // Sync dbA
    const syncResult2 = (await remoteA.trySync()) as SyncResultMergeAndPush;
    expect(getWorkingDirFiles(dbA)).toEqual([]);

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
   *  jsonA2:  1 - Accept theirs (create)
   */
  it('resolves case 11 - Conflict. Accept ours (update), case 1 - Accept theirs (create), ', async () => {
    const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId, {
      conflict_resolve_strategy: 'ours-prop',
    });
    // A puts and pushes
    const jsonA1 = { _id: '1', name: 'fromA' };
    const putResultA1 = await dbA.put(jsonA1);
    await remoteA.tryPush();

    const dbNameB = serialId();
    const dbB: GitDocumentDB = new GitDocumentDB({
      db_name: dbNameB,
      local_dir: localDir,
    });
    // Clone dbA
    await dbB.create(remoteA.options());

    // A removes the old file and puts a new file
    const deleteResultA1 = await dbA.remove(jsonA1);
    const jsonA2 = { _id: '2', name: 'fromA' };
    const putResultA2 = await dbA.put(jsonA2);
    await remoteA.tryPush();
    const remoteB = dbB.getSynchronizer(remoteA.remoteURL());

    // B updates the old file and syncs
    const jsonB1 = { _id: '1', name: 'fromB' };
    const putResultB1 = await dbB.put(jsonB1);

    const syncResult1 = (await remoteB.trySync()) as SyncResultResolveConflictsAndPush;
    expect(syncResult1.action).toBe('resolve conflicts and push');
    expect(syncResult1.commits).toMatchObject({
      local: getCommitInfo([
        deleteResultA1,
        putResultA2,
        `resolve: 1${dbA.fileExt}(update,${putResultB1.file_sha.substr(0, 7)},ours-prop)`,
      ]),
      remote: getCommitInfo([
        putResultB1,
        `resolve: 1${dbA.fileExt}(update,${putResultB1.file_sha.substr(0, 7)},ours-prop)`,
      ]),
    });
    expect(syncResult1.changes.local.length).toBe(1);
    expect(syncResult1.changes.local).toEqual(
      expect.arrayContaining([getChangedFile('create', jsonA2, putResultA2)])
    );

    expect(syncResult1.changes.remote.length).toBe(1);
    expect(syncResult1.changes.remote).toEqual(
      expect.arrayContaining([getChangedFile('create', jsonB1, putResultB1)])
    );

    expect(syncResult1.conflicts.length).toEqual(1);
    expect(syncResult1.conflicts).toEqual(
      expect.arrayContaining([
        {
          target: {
            id: '1',
            file_sha: putResultB1.file_sha,
          },
          strategy: 'ours-prop',
          operation: 'update',
        },
      ])
    );
    // Conflict occurs on 1.json

    expect(getWorkingDirFiles(dbB)).toEqual([jsonB1, jsonA2]);

    // Sync dbA
    const syncResult2 = (await remoteA.trySync()) as SyncResultMergeAndPush;
    expect(getWorkingDirFiles(dbA)).toEqual([jsonB1, jsonA2]);

    await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
    await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

    await destroyDBs([dbA, dbB]);
  });

  /**
   * before:  jsonA1
   * dbA   : +jsonA1
   * dbB   :  jsonB1
   * after :  mergedJson
   *
   * 3-way merge:
   *   mergedJson:16 - Conflict. Accept ours (update-merge)
   */
  it('resolves case 16 - Conflict. Accept ours (update-merge)', async () => {
    const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId, {
      conflict_resolve_strategy: 'ours-prop',
    });
    // A puts and pushes
    const jsonA1 = { _id: '1', name: 'Hello, world!' };
    const putResultA1 = await dbA.put(jsonA1);
    await remoteA.tryPush();

    const dbNameB = serialId();
    const dbB: GitDocumentDB = new GitDocumentDB({
      db_name: dbNameB,
      local_dir: localDir,
    });
    // Clone dbA
    await dbB.create(remoteA.options());
    const remoteB = dbB.getSynchronizer(remoteA.remoteURL());

    // A puts and pushes
    const jsonA1dash = { _id: '1', name: 'Hello' };
    const putResultA1dash = await dbA.put(jsonA1dash);
    await remoteA.tryPush();

    // B puts
    const jsonB1 = { _id: '1', name: 'Hello, world! Hello, Nara!' };
    const putResultB1 = await dbB.put(jsonB1);

    const mergedJson = { _id: '1', name: 'Hello Hello, Nara!' };

    // It will occur conflict on id 1.json.
    const syncResult1 = (await remoteB.trySync()) as SyncResultResolveConflictsAndPush;

    const mergedDoc = await dbB.getDocWithMetaData('1');

    expect(syncResult1.action).toBe('resolve conflicts and push');
    expect(syncResult1.commits).toMatchObject({
      local: getCommitInfo([
        putResultA1dash,
        `resolve: 1${dbA.fileExt}(update-merge,${mergedDoc!.file_sha.substr(
          0,
          7
        )},ours-prop)`,
      ]),
      remote: getCommitInfo([
        putResultB1,
        `resolve: 1${dbA.fileExt}(update-merge,${mergedDoc!.file_sha.substr(
          0,
          7
        )},ours-prop)`,
      ]),
    });
    expect(syncResult1.changes.local.length).toBe(1);
    expect(syncResult1.changes.local).toEqual(
      expect.arrayContaining([
        getChangedFileBySHA('update', mergedJson, mergedDoc!.file_sha),
      ])
    );

    expect(syncResult1.changes.remote.length).toBe(1);
    expect(syncResult1.changes.remote).toEqual(
      expect.arrayContaining([
        getChangedFileBySHA('update', mergedJson, mergedDoc!.file_sha),
      ])
    );

    expect(syncResult1.conflicts.length).toEqual(1);
    expect(syncResult1.conflicts).toEqual(
      expect.arrayContaining([
        {
          target: {
            id: '1',
            file_sha: mergedDoc!.file_sha,
          },
          strategy: 'ours-prop',
          operation: 'update-merge',
        },
      ])
    );
    // Conflict occurs on 1.json

    expect(getWorkingDirFiles(dbB)).toEqual([mergedJson]);
    // Sync dbA
    const syncResult2 = (await remoteA.trySync()) as SyncResultMergeAndPush;
    expect(getWorkingDirFiles(dbA)).toEqual([mergedJson]);

    await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
    await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

    await destroyDBs([dbA, dbB]);
  });

  /**
   * before:  jsonA1
   * dbA   : +jsonA1
   * dbB   :  jsonB1
   * after :  mergedJson
   *
   * 3-way merge:
   *   mergedJson:17 - Conflict. Accept theirs (update-merge)
   */
  it.only('resolves case 17 - Conflict. Accept theirs (update-merge)', async () => {
    const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId, {
      conflict_resolve_strategy: 'theirs-prop',
    });
    // A puts and pushes
    const jsonA1 = { _id: '1', name: 'Hello, world!' };
    const putResultA1 = await dbA.put(jsonA1);
    await remoteA.tryPush();

    const dbNameB = serialId();
    const dbB: GitDocumentDB = new GitDocumentDB({
      db_name: dbNameB,
      local_dir: localDir,
    });
    // Clone dbA
    await dbB.create({ ...remoteA.options(), conflict_resolve_strategy: 'theirs-prop' });
    const remoteB = dbB.getSynchronizer(remoteA.remoteURL());

    // A puts and pushes
    const jsonA1dash = { _id: '1', name: 'Hello' };
    const putResultA1dash = await dbA.put(jsonA1dash);
    await remoteA.tryPush();

    // B puts
    const jsonB1 = { _id: '1', name: 'Hello, world! Hello, Nara!' };
    const putResultB1 = await dbB.put(jsonB1);

    const mergedJson = { _id: '1', name: 'Hello Hello, Nara!' };

    // It will occur conflict on id 1.json.
    const syncResult1 = (await remoteB.trySync()) as SyncResultResolveConflictsAndPush;

    const mergedDoc = await dbB.getDocWithMetaData('1');

    expect(syncResult1.action).toBe('resolve conflicts and push');
    expect(syncResult1.commits).toMatchObject({
      local: getCommitInfo([
        putResultA1dash,
        `resolve: 1${dbA.fileExt}(update-merge,${mergedDoc!.file_sha.substr(
          0,
          7
        )},theirs-prop)`,
      ]),
      remote: getCommitInfo([
        putResultB1,
        `resolve: 1${dbA.fileExt}(update-merge,${mergedDoc!.file_sha.substr(
          0,
          7
        )},theirs-prop)`,
      ]),
    });
    expect(syncResult1.changes.local.length).toBe(1);
    expect(syncResult1.changes.local).toEqual(
      expect.arrayContaining([
        getChangedFileBySHA('update', mergedJson, mergedDoc!.file_sha),
      ])
    );

    expect(syncResult1.changes.remote.length).toBe(1);
    expect(syncResult1.changes.remote).toEqual(
      expect.arrayContaining([
        getChangedFileBySHA('update', mergedJson, mergedDoc!.file_sha),
      ])
    );

    expect(syncResult1.conflicts.length).toEqual(1);
    expect(syncResult1.conflicts).toEqual(
      expect.arrayContaining([
        {
          target: {
            id: '1',
            file_sha: mergedDoc!.file_sha,
          },
          strategy: 'theirs-prop',
          operation: 'update-merge',
        },
      ])
    );
    // Conflict occurs on 1.json

    expect(getWorkingDirFiles(dbB)).toEqual([mergedJson]);
    // Sync dbA
    const syncResult2 = (await remoteA.trySync()) as SyncResultMergeAndPush;
    expect(getWorkingDirFiles(dbA)).toEqual([mergedJson]);

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
   *  jsonB2: 4 - Conflict. Accept ours (create)
   *  jsonB3:11 - Conflict. Accept ours (update)
   */
  it.skip('resolves many conflicts', async () => {
    const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId, {
      conflict_resolve_strategy: 'ours',
    });
    // A puts and pushes
    const jsonA1 = { _id: '1', name: 'fromA' };
    const putResultA1 = await dbA.put(jsonA1);
    const jsonA2 = { _id: '2', name: 'fromA' };
    const putResultA2 = await dbA.put(jsonA2);
    const jsonA3 = { _id: '3', name: 'fromA' };
    const putResultA3 = await dbA.put(jsonA3);
    await remoteA.tryPush();

    const dbNameB = serialId();
    const dbB: GitDocumentDB = new GitDocumentDB({
      db_name: dbNameB,
      local_dir: localDir,
    });
    // Clone dbA
    await dbB.create(remoteA.options());
    const remoteB = dbB.getSynchronizer(remoteA.remoteURL());

    // A updates, deletes, updates, and pushes

    // change commit order for test
    // 3 -> 1 -> 2
    const jsonA3dash = { _id: '3', name: 'updated' };
    const putResultA3dash = await dbA.put(jsonA3dash);

    const jsonA1dash = { _id: '1', name: 'updated' };
    const putResultA1dash = await dbA.put(jsonA1dash);

    const deleteResultA2 = await dbA.remove(jsonA2);

    await remoteA.tryPush();

    // B deletes, updates, updates, and syncs

    // change commit order for test
    // 3 -> 1 -> 2
    const jsonB3 = { _id: '3', name: 'fromB' };
    const putResultB3 = await dbB.put(jsonB3);

    const deleteResultB1 = await dbB.remove(jsonA1);

    const jsonB2 = { _id: '2', name: 'fromB' };
    const putResultB2 = await dbB.put(jsonB2);

    const syncResult1 = (await remoteB.trySync()) as SyncResultResolveConflictsAndPush;
    expect(syncResult1.action).toBe('resolve conflicts and push');
    expect(syncResult1.commits).toMatchObject({
      local: getCommitInfo([
        putResultA3dash,
        putResultA1dash,
        deleteResultA2,
        `resolve: 1${dbA.fileExt}(delete,${deleteResultB1.file_sha.substr(0, 7)},ours), 2${
          dbA.fileExt
        }(update,${putResultB2.file_sha.substr(0, 7)},ours), 3${
          dbA.fileExt
        }(update,${putResultB3.file_sha.substr(0, 7)},ours)`,
      ]),
      remote: getCommitInfo([
        putResultB3,
        deleteResultB1,
        putResultB2,
        `resolve: 1${dbA.fileExt}(delete,${deleteResultB1.file_sha.substr(0, 7)},ours), 2${
          dbA.fileExt
        }(update,${putResultB2.file_sha.substr(0, 7)},ours), 3${
          dbA.fileExt
        }(update,${putResultB3.file_sha.substr(0, 7)},ours)`,
      ]),
    });
    expect(syncResult1.changes.local.length).toBe(0);

    expect(syncResult1.changes.remote.length).toBe(3);
    expect(syncResult1.changes.remote).toEqual(
      expect.arrayContaining([
        getChangedFile('delete', jsonA1dash, putResultA1dash),
        getChangedFile('create', jsonB2, putResultB2),
        getChangedFile('update', jsonB3, putResultB3),
      ])
    );

    expect(syncResult1.conflicts).toEqual(
      expect.arrayContaining([
        {
          target: {
            id: '1',
            file_sha: deleteResultB1.file_sha,
          },
          strategy: 'ours',
          operation: 'delete',
        },
        {
          target: {
            id: '2',
            file_sha: putResultB2.file_sha,
          },
          strategy: 'ours',
          operation: 'update',
        },
        {
          target: {
            id: '3',
            file_sha: putResultB3.file_sha,
          },
          strategy: 'ours',
          operation: 'update',
        },
      ])
    );
    // Conflict occurs on 1.json

    expect(getWorkingDirFiles(dbB)).toEqual([jsonB2, jsonB3]);

    // Sync dbA
    const syncResult2 = (await remoteA.trySync()) as SyncResultMergeAndPush;
    expect(getWorkingDirFiles(dbA)).toEqual([jsonB2, jsonB3]);

    await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
    await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

    await destroyDBs([dbA, dbB]);
  });
});
