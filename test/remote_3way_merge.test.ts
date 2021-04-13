/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

/**
 * Test synchronization (pull & push)
 * by using GitHub Personal Access Token
 * These tests create a new repository on GitHub if not exists.
 */
import path from 'path';
import fs from 'fs-extra';
import { GitDocumentDB } from '../src';
import { SyncResultMergeAndPush, SyncResultResolveConflictsAndPush } from '../src/types';
import {
  ChangeResult,
  CommitResult,
  compareWorkingDirAndBlobs,
  createClonedDatabases,
  createDatabase,
  destroyDBs,
  getWorkingDirFiles,
  removeRemoteRepositories,
} from './remote_utils';

const reposPrefix = 'test_3way_merge___';
const localDir = `./test/database_3way_merge`;

let idCounter = 0;
const serialId = () => {
  return `${reposPrefix}${idCounter++}`;
};

beforeEach(function () {
  // @ts-ignore
  console.log(`=== ${this.currentTest.fullTitle()}`);
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

maybe('remote: sync: resolve conflicts and push (3-way merge): ', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  beforeAll(async () => {
    await removeRemoteRepositories(reposPrefix);
  });

  /**
   * before:
   * dbA   : +jsonA1 +jsonA2
   * dbB   : +jsonB1         +jsonB3
   * after :  jsonB1  jsonA2  jsonB3
   *
   * 3-way merge:
   *   jsonB1: 4 - Conflict. Accept ours (update)
   *   jsonA2: 1 - Accept theirs (create)
   *   jsonB3: 2 - Accept ours (create)
   */
  test('case 1 - accept theirs (create), case 2 - accept ours (create), case 4 - Conflict. Accept ours (update): put with the same id', async () => {
    const [dbA, dbB, remoteA, remoteB] = await createClonedDatabases(
      remoteURLBase,
      localDir,
      serialId
    );

    // A puts and pushes
    const jsonA1 = { _id: '1', name: 'fromA' };
    const putResultA1 = await dbA.put(jsonA1);
    const jsonA2 = { _id: '2', name: 'fromA' };
    const putResultA2 = await dbA.put(jsonA2);
    await remoteA.tryPush();

    // B puts the same file
    const jsonB1 = { _id: '1', name: 'fromB' };
    const putResultB1 = await dbB.put(jsonB1);

    // B puts a new file
    const jsonB3 = { _id: '3', name: 'fromB' };
    const putResultB3 = await dbB.put(jsonB3);

    // It will occur conflict on id 1.json.
    const syncResult1 = (await remoteB.trySync()) as SyncResultResolveConflictsAndPush;
    expect(syncResult1.action).toBe('resolve conflicts and push');
    expect(syncResult1.commits).toMatchObject({
      // two put commits and a merge commit
      local: [
        CommitResult(putResultA1),
        CommitResult(putResultA2),
        CommitResult('[resolve conflicts] update-ours: 1'),
      ],
      remote: [
        // two put commits and a merge commit
        CommitResult(putResultB1),
        CommitResult(putResultB3),
        CommitResult('[resolve conflicts] update-ours: 1'),
      ],
    });
    expect(syncResult1.changes.local.length).toBe(1);
    expect(syncResult1.changes.local).toEqual(
      expect.arrayContaining([ChangeResult('create', jsonA2, putResultA2)])
    );

    expect(syncResult1.changes.remote.length).toBe(2);
    expect(syncResult1.changes.remote).toEqual(
      expect.arrayContaining([
        ChangeResult('create', jsonB3, putResultB3),
        ChangeResult('update', jsonB1, putResultB1),
      ])
    );

    expect(syncResult1.conflicts.length).toEqual(1);
    expect(syncResult1.conflicts).toEqual(
      expect.arrayContaining([
        {
          id: '1',
          strategy: 'ours',
          operation: 'update',
        },
      ])
    );
    // Conflict occurs on 1.json

    expect(getWorkingDirFiles(dbB)).toEqual([jsonB1, jsonA2, jsonB3]);
    // Sync dbA
    const syncResult2 = (await remoteA.trySync()) as SyncResultMergeAndPush;
    expect(getWorkingDirFiles(dbA)).toEqual([jsonB1, jsonA2, jsonB3]);

    await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
    await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

    await destroyDBs([dbA, dbB]);
  });

  /**
   * before:
   * dbA   : +jsonA1 +jsonA2
   * dbB   : +jsonB1 +jsonA2
   * after :  jsonB1  jsonA2
   *
   * 3-way merge:
   *   jsonB1: 4 - Conflict. Accept ours (update)
   *   jsonA2: 3 - Accept both (create)
   */
  test('case 3 - accept both (create), case 4 - Conflict. Accept ours (update): put with the same id', async () => {
    const [dbA, dbB, remoteA, remoteB] = await createClonedDatabases(
      remoteURLBase,
      localDir,
      serialId
    );

    // A puts and pushes
    const jsonA1 = { _id: '1', name: 'fromA' };
    const putResultA1 = await dbA.put(jsonA1);
    const jsonA2 = { _id: '2', name: 'fromA' };
    const putResultA2 = await dbA.put(jsonA2);
    await remoteA.tryPush();

    // B puts the same file
    const jsonB1 = { _id: '1', name: 'fromB' };
    const putResultB1 = await dbB.put(jsonB1);

    // B puts the same file with the same contents
    const putResultB2 = await dbB.put(jsonA2);

    // It will occur conflict on id 1.json.
    const syncResult1 = (await remoteB.trySync()) as SyncResultResolveConflictsAndPush;
    expect(syncResult1.action).toBe('resolve conflicts and push');
    expect(syncResult1.commits).toMatchObject({
      local: [
        CommitResult(putResultA1),
        CommitResult(putResultA2),
        CommitResult('[resolve conflicts] update-ours: 1'),
      ],
      remote: [
        CommitResult(putResultB1),
        CommitResult(putResultB2),
        CommitResult('[resolve conflicts] update-ours: 1'),
      ],
    });
    expect(syncResult1.changes.local.length).toBe(0);

    expect(syncResult1.changes.remote.length).toBe(1);
    expect(syncResult1.changes.remote).toEqual(
      expect.arrayContaining([ChangeResult('update', jsonB1, putResultB1)])
    );

    expect(syncResult1.conflicts.length).toEqual(1);
    expect(syncResult1.conflicts).toEqual(
      expect.arrayContaining([
        {
          id: '1',
          strategy: 'ours',
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
   * before:
   * dbA   : +jsonA1
   * dbB   : +jsonB1
   * after :  jsonA1
   *
   * 3-way merge:
   *   jsonA1: 5 - Conflict. Accept theirs (update)
   */
  test('case 5 - Conflict. Accept theirs (update)', async () => {
    const [dbA, dbB, remoteA, remoteB] = await createClonedDatabases(
      remoteURLBase,
      localDir,
      serialId,
      {
        conflict_resolve_strategy: 'theirs',
      }
    );

    // A puts and pushes
    const jsonA1 = { _id: '1', name: 'fromA' };
    const putResultA1 = await dbA.put(jsonA1);
    await remoteA.tryPush();

    // B puts the same file
    const jsonB1 = { _id: '1', name: 'fromB' };
    const putResultB1 = await dbB.put(jsonB1);

    // It will occur conflict on id 1.json.
    const syncResult1 = (await remoteB.trySync()) as SyncResultResolveConflictsAndPush;
    expect(syncResult1.action).toBe('resolve conflicts and push');
    expect(syncResult1.commits).toMatchObject({
      local: [
        CommitResult(putResultA1),
        CommitResult('[resolve conflicts] update-theirs: 1'),
      ],
      remote: [
        CommitResult(putResultB1),
        CommitResult('[resolve conflicts] update-theirs: 1'),
      ],
    });
    expect(syncResult1.changes.local.length).toBe(1);
    expect(syncResult1.changes.local).toEqual(
      expect.arrayContaining([ChangeResult('update', jsonA1, putResultA1)])
    );

    expect(syncResult1.changes.remote.length).toBe(0);

    expect(syncResult1.conflicts.length).toEqual(1);
    expect(syncResult1.conflicts).toEqual(
      expect.arrayContaining([
        {
          id: '1',
          strategy: 'theirs',
          operation: 'update',
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
   * before:          jsonA2
   * dbA   : +jsonA1 -jsonA2
   * dbB   : +jsonB1 -jsonA2
   * after :  jsonB1
   *
   * 3-way merge:
   *   jsonB1: 4 - Conflict. Accept ours (update)
   *   jsonA2: 6 - Accept both (delete)
   */
  test('case 6 - accept both (delete), case 4 - Conflict. Accept ours (update): put with the same id', async () => {
    const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId);
    // A puts and pushes
    const jsonA2 = { _id: '2', name: 'fromA' };
    await dbA.put(jsonA2);
    await remoteA.tryPush();

    const dbNameB = serialId();
    const dbB: GitDocumentDB = new GitDocumentDB({
      db_name: dbNameB,
      local_dir: localDir,
    });
    // Clone dbA
    await dbB.create(remoteA.options());
    const remoteB = dbB.getRemote(remoteA.remoteURL());

    // A puts, removes, and pushes
    const jsonA1 = { _id: '1', name: 'fromA' };
    const putResultA1 = await dbA.put(jsonA1);

    const removeResultA2 = await dbA.remove(jsonA2);
    await remoteA.tryPush();

    // B puts the same file
    const jsonB1 = { _id: '1', name: 'fromB' };
    const putResultB1 = await dbB.put(jsonB1);

    // B remove the same file
    const removeResultB2 = await dbB.remove(jsonA2);

    // It will occur conflict on id 1.json.
    const syncResult1 = (await remoteB.trySync()) as SyncResultResolveConflictsAndPush;
    expect(syncResult1.action).toBe('resolve conflicts and push');
    expect(syncResult1.commits).toMatchObject({
      local: [
        CommitResult(putResultA1),
        CommitResult(removeResultA2),
        CommitResult('[resolve conflicts] update-ours: 1'),
      ],
      remote: [
        CommitResult(putResultB1),
        CommitResult(removeResultB2),
        CommitResult('[resolve conflicts] update-ours: 1'),
      ],
    });
    expect(syncResult1.changes.local.length).toBe(0);

    expect(syncResult1.changes.remote.length).toBe(1);
    expect(syncResult1.changes.remote).toEqual(
      expect.arrayContaining([ChangeResult('update', jsonB1, putResultB1)])
    );

    expect(syncResult1.conflicts.length).toEqual(1);
    expect(syncResult1.conflicts).toEqual(
      expect.arrayContaining([
        {
          id: '1',
          strategy: 'ours',
          operation: 'update',
        },
      ])
    );
    // Conflict occurs on 1.json

    expect(getWorkingDirFiles(dbB)).toEqual([jsonB1]);
    // Sync dbA
    const syncResult2 = (await remoteA.trySync()) as SyncResultMergeAndPush;
    expect(getWorkingDirFiles(dbA)).toEqual([jsonB1]);

    await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
    await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

    await destroyDBs([dbA, dbB]);
  });

  /**
   * before:          jsonA2
   * dbA   : +jsonA1
   * dbB   : +jsonB1 -jsonA2
   * after :  jsonB1
   *
   * 3-way merge:
   *   jsonB1: 4 - Conflict. Accept ours (update)
   *   jsonA2: 7 - Accept ours (delete)
   */
  test('case 7 - accept ours (delete), case 4 - Conflict. Accept ours (update): put with the same id', async () => {
    const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId);
    // A puts and pushes
    const jsonA2 = { _id: '2', name: 'fromA' };
    await dbA.put(jsonA2);
    await remoteA.tryPush();

    const dbNameB = serialId();
    const dbB: GitDocumentDB = new GitDocumentDB({
      db_name: dbNameB,
      local_dir: localDir,
    });
    // Clone dbA
    await dbB.create(remoteA.options());
    const remoteB = dbB.getRemote(remoteA.remoteURL());

    // A puts and pushes
    const jsonA1 = { _id: '1', name: 'fromA' };
    const putResultA1 = await dbA.put(jsonA1);
    await remoteA.tryPush();

    // B puts the same file
    const jsonB1 = { _id: '1', name: 'fromB' };
    const putResultB1 = await dbB.put(jsonB1);

    // B remove the same file
    const removeResultB2 = await dbB.remove(jsonA2);

    // It will occur conflict on id 1.json.
    const syncResult1 = (await remoteB.trySync()) as SyncResultResolveConflictsAndPush;
    expect(syncResult1.action).toBe('resolve conflicts and push');
    expect(syncResult1.commits).toMatchObject({
      local: [
        CommitResult(putResultA1),
        CommitResult('[resolve conflicts] update-ours: 1'),
      ],
      remote: [
        CommitResult(putResultB1),
        CommitResult(removeResultB2),
        CommitResult('[resolve conflicts] update-ours: 1'),
      ],
    });
    expect(syncResult1.changes.local.length).toBe(0);

    expect(syncResult1.changes.remote.length).toBe(2);
    expect(syncResult1.changes.remote).toEqual(
      expect.arrayContaining([
        ChangeResult('update', jsonB1, putResultB1),
        ChangeResult('delete', jsonA2, removeResultB2),
      ])
    );

    expect(syncResult1.conflicts.length).toEqual(1);
    expect(syncResult1.conflicts).toEqual(
      expect.arrayContaining([
        {
          id: '1',
          strategy: 'ours',
          operation: 'update',
        },
      ])
    );
    // Conflict occurs on 1.json

    expect(getWorkingDirFiles(dbB)).toEqual([jsonB1]);
    // Sync dbA
    const syncResult2 = (await remoteA.trySync()) as SyncResultMergeAndPush;
    expect(getWorkingDirFiles(dbA)).toEqual([jsonB1]);

    await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
    await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

    await destroyDBs([dbA, dbB]);
  });

  // case 8
  // case 9
  // case 10

  // case 12
  // case 13
  // case 14
  // case 15
  // case 16
  // case 17

  /**
   * before:  jsonA1
   * dbA   : -jsonA1 +jsonA2
   * dbB   : +jsonB1
   * result:  jsonB1  jsonA2
   *
   * 3-way merge:
   *  jsonB1: 11 - Conflict. Accept ours (update)
   *  jsonA2:  1 - Accept theirs (create)
   */
  test('case 1 - Accept theirs (create), case 11 - accept ours', async () => {
    const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId);
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
    const removeResultA1 = await dbA.remove(jsonA1);
    const jsonA2 = { _id: '2', name: 'fromA' };
    const putResultA2 = await dbA.put(jsonA2);
    await remoteA.tryPush();
    const remoteB = dbB.getRemote(remoteA.remoteURL());

    // B updates the old file and syncs
    const jsonB1 = { _id: '1', name: 'fromB' };
    const putResultB1 = await dbB.put(jsonB1);

    const syncResult1 = (await remoteB.trySync()) as SyncResultResolveConflictsAndPush;
    expect(syncResult1.action).toBe('resolve conflicts and push');
    expect(syncResult1.commits).toMatchObject({
      local: [
        CommitResult(removeResultA1),
        CommitResult(putResultA2),
        CommitResult('[resolve conflicts] update-ours: 1'),
      ],
      remote: [
        CommitResult(putResultB1),
        CommitResult('[resolve conflicts] update-ours: 1'),
      ],
    });
    expect(syncResult1.changes.local.length).toBe(1);
    expect(syncResult1.changes.local).toEqual(
      expect.arrayContaining([ChangeResult('create', jsonA2, putResultA2)])
    );

    expect(syncResult1.changes.remote.length).toBe(1);
    expect(syncResult1.changes.remote).toEqual(
      expect.arrayContaining([ChangeResult('create', jsonB1, putResultB1)])
    );

    expect(syncResult1.conflicts.length).toEqual(1);
    expect(syncResult1.conflicts).toEqual(
      expect.arrayContaining([
        {
          id: '1',
          strategy: 'ours',
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
});
