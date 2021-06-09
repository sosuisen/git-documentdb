/* eslint-disable @typescript-eslint/naming-convention */
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
import {
  Schema,
  SyncResultMergeAndPush,
  SyncResultResolveConflictsAndPush,
} from '../src/types';
import {
  compareWorkingDirAndBlobs,
  createClonedDatabases,
  createDatabase,
  destroyDBs,
  getChangedFileDelete,
  getChangedFileInsert,
  getChangedFileUpdateBySHA,
  getCommitInfo,
  getWorkingDirDocs,
  removeRemoteRepositories,
} from '../test/remote_utils';
import { JSON_EXT } from '../src/const';

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
//  - GITDDB_personalAccessToken: A personal access token of your GitHub account
const maybe =
  process.env.GITDDB_GITHUB_USER_URL && process.env.GITDDB_personalAccessToken
    ? describe
    : describe.skip;

maybe('intg: <3way_merge_ot>', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_personalAccessToken!;

  beforeAll(async () => {
    await removeRemoteRepositories(reposPrefix);
  });

  /**
   * before:
   * dbA   :  jsonA1  jsonA2
   * dbB   :  jsonB1          jsonB3
   * after :  mergedJson  jsonA2  jsonB3
   *
   * 3-way merge:
   *   mergedJson: 4 - Conflict. Accept ours (insert-merge)
   *   jsonA2: 1 - Accept theirs (insert)
   *   jsonB3: 2 - Accept ours (insert)
   */
  it('resolves case 1 - Accept theirs (insert), case 2 - Accept ours (insert), case 4 - Conflict. Accept ours (insert-merge)', async () => {
    const [dbA, dbB, remoteA, remoteB] = await createClonedDatabases(
      remoteURLBase,
      localDir,
      serialId,
      {
        conflictResolutionStrategy: 'ours-diff',
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
        `resolve: 1${JSON_EXT}(insert-merge,${mergedDoc!.fileSha.substr(0, 7)},ours-diff)`,
      ]),
      remote: getCommitInfo([
        putResultB1,
        putResultB3,
        `resolve: 1${JSON_EXT}(insert-merge,${mergedDoc!.fileSha.substr(0, 7)},ours-diff)`,
      ]),
    });
    expect(syncResult1.changes.local.length).toBe(2);
    expect(syncResult1.changes.local).toEqual(
      expect.arrayContaining([
        getChangedFileUpdateBySHA(
          jsonB1,
          putResultB1.fileSha,
          mergedJson,
          mergedDoc!.fileSha
        ),
        getChangedFileInsert(jsonA2, putResultA2),
      ])
    );

    expect(syncResult1.changes.remote.length).toBe(2);
    expect(syncResult1.changes.remote).toEqual(
      expect.arrayContaining([
        getChangedFileUpdateBySHA(
          jsonA1,
          putResultA1.fileSha,
          mergedJson,
          mergedDoc!.fileSha
        ),
        getChangedFileInsert(jsonB3, putResultB3),
      ])
    );

    expect(syncResult1.conflicts.length).toEqual(1);
    expect(syncResult1.conflicts).toEqual([
      {
        target: {
          id: '1',
          fileSha: mergedDoc!.fileSha,
        },
        strategy: 'ours-diff',
        operation: 'insert-merge',
      },
    ]);
    // Conflict occurs on 1.json

    expect(getWorkingDirDocs(dbB)).toEqual([mergedJson, jsonA2, jsonB3]);
    // Sync dbA
    const syncResult2 = (await remoteA.trySync()) as SyncResultMergeAndPush;
    expect(getWorkingDirDocs(dbA)).toEqual([mergedJson, jsonA2, jsonB3]);

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
    const [dbA, dbB, remoteA, remoteB] = await createClonedDatabases(
      remoteURLBase,
      localDir,
      serialId,
      {
        conflictResolutionStrategy: 'theirs-diff',
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
        `resolve: 1${JSON_EXT}(insert-merge,${mergedDoc!.fileSha.substr(
          0,
          7
        )},theirs-diff)`,
      ]),
      remote: getCommitInfo([
        putResultB1,
        `resolve: 1${JSON_EXT}(insert-merge,${mergedDoc!.fileSha.substr(
          0,
          7
        )},theirs-diff)`,
      ]),
    });
    expect(syncResult1.changes.local.length).toBe(1);
    expect(syncResult1.changes.local).toEqual([
      getChangedFileUpdateBySHA(
        jsonB1,
        putResultB1!.fileSha,
        mergedJson,
        mergedDoc!.fileSha
      ),
    ]);

    expect(syncResult1.changes.remote.length).toBe(0);

    expect(syncResult1.conflicts.length).toEqual(1);
    expect(syncResult1.conflicts).toEqual([
      {
        target: {
          id: '1',
          fileSha: mergedDoc!.fileSha,
        },
        strategy: 'theirs-diff',
        operation: 'insert-merge',
      },
    ]);
    expect(getWorkingDirDocs(dbA)).toEqual([jsonA1]);
    expect(getWorkingDirDocs(dbB)).toEqual([jsonA1]);

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
      conflictResolutionStrategy: 'ours-diff',
    });
    // A puts and pushes
    const jsonA1 = { _id: '1', name: 'fromA' };
    const putResultA1 = await dbA.put(jsonA1);
    await remoteA.tryPush();

    const dbNameB = serialId();
    const dbB: GitDocumentDB = new GitDocumentDB({
      dbName: dbNameB,
      localDir: localDir,
    });
    // Clone dbA
    await dbB.open(remoteA.options());
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
        `resolve: 1${JSON_EXT}(delete,${deleteResultB1.fileSha.substr(0, 7)},ours-diff)`,
      ]),
      remote: getCommitInfo([
        deleteResultB1,
        `resolve: 1${JSON_EXT}(delete,${deleteResultB1.fileSha.substr(0, 7)},ours-diff)`,
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
        target: {
          id: '1',
          fileSha: deleteResultB1.fileSha,
        },
        strategy: 'ours-diff',
        operation: 'delete',
      },
    ]);
    // Conflict occurs on 1.json

    expect(getWorkingDirDocs(dbB)).toEqual([]);

    // Sync dbA
    const syncResult2 = (await remoteA.trySync()) as SyncResultMergeAndPush;
    expect(getWorkingDirDocs(dbA)).toEqual([]);

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
    const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId, {
      conflictResolutionStrategy: 'ours-diff',
    });
    // A puts and pushes
    const jsonA1 = { _id: '1', name: 'fromA' };
    const putResultA1 = await dbA.put(jsonA1);
    await remoteA.tryPush();

    const dbNameB = serialId();
    const dbB: GitDocumentDB = new GitDocumentDB({
      dbName: dbNameB,
      localDir: localDir,
    });
    // Clone dbA
    await dbB.open(remoteA.options());

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
        `resolve: 1${JSON_EXT}(update,${putResultB1.fileSha.substr(0, 7)},ours-diff)`,
      ]),
      remote: getCommitInfo([
        putResultB1,
        `resolve: 1${JSON_EXT}(update,${putResultB1.fileSha.substr(0, 7)},ours-diff)`,
      ]),
    });
    expect(syncResult1.changes.local.length).toBe(1);
    expect(syncResult1.changes.local).toEqual([getChangedFileInsert(jsonA2, putResultA2)]);

    expect(syncResult1.changes.remote.length).toBe(1);
    expect(syncResult1.changes.remote).toEqual([getChangedFileInsert(jsonB1, putResultB1)]);

    expect(syncResult1.conflicts.length).toEqual(1);
    expect(syncResult1.conflicts).toEqual([
      {
        target: {
          id: '1',
          fileSha: putResultB1.fileSha,
        },
        strategy: 'ours-diff',
        operation: 'update',
      },
    ]);
    // Conflict occurs on 1.json

    expect(getWorkingDirDocs(dbB)).toEqual([jsonB1, jsonA2]);

    // Sync dbA
    const syncResult2 = (await remoteA.trySync()) as SyncResultMergeAndPush;
    expect(getWorkingDirDocs(dbA)).toEqual([jsonB1, jsonA2]);

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
  it('resolves case 17 - Conflict. Accept theirs (update-merge)', async () => {
    const schema: Schema = {
      json: { plainTextProperties: { name: true } },
    };
    const [dbA, remoteA] = await createDatabase(
      remoteURLBase,
      localDir,
      serialId,
      {
        conflictResolutionStrategy: 'theirs-diff',
      },
      schema
    );
    // A puts and pushes
    const jsonA1 = { _id: '1', name: 'Hello, world!' };
    const putResultA1 = await dbA.put(jsonA1);
    await remoteA.tryPush();

    const dbNameB = serialId();
    const dbB: GitDocumentDB = new GitDocumentDB({
      dbName: dbNameB,
      localDir: localDir,
      schema,
    });
    // Clone dbA
    await dbB.open({
      ...remoteA.options(),
      conflictResolutionStrategy: 'theirs-diff',
    });
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
        `resolve: 1${JSON_EXT}(update-merge,${mergedDoc!.fileSha.substr(
          0,
          7
        )},theirs-diff)`,
      ]),
      remote: getCommitInfo([
        putResultB1,
        `resolve: 1${JSON_EXT}(update-merge,${mergedDoc!.fileSha.substr(
          0,
          7
        )},theirs-diff)`,
      ]),
    });
    expect(syncResult1.changes.local.length).toBe(1);
    expect(syncResult1.changes.local).toEqual([
      getChangedFileUpdateBySHA(
        jsonB1,
        putResultB1.fileSha,
        mergedJson,
        mergedDoc!.fileSha
      ),
    ]);

    expect(syncResult1.changes.remote.length).toBe(1);
    expect(syncResult1.changes.remote).toEqual([
      getChangedFileUpdateBySHA(
        jsonA1dash,
        putResultA1dash.fileSha,
        mergedJson,
        mergedDoc!.fileSha
      ),
    ]);

    expect(syncResult1.conflicts.length).toEqual(1);
    expect(syncResult1.conflicts).toEqual([
      {
        target: {
          id: '1',
          fileSha: mergedDoc!.fileSha,
        },
        strategy: 'theirs-diff',
        operation: 'update-merge',
      },
    ]);
    // Conflict occurs on 1.json

    expect(getWorkingDirDocs(dbB)).toEqual([mergedJson]);
    // Sync dbA
    const syncResult2 = (await remoteA.trySync()) as SyncResultMergeAndPush;
    expect(getWorkingDirDocs(dbA)).toEqual([mergedJson]);

    await expect(compareWorkingDirAndBlobs(dbA)).resolves.toBeTruthy();
    await expect(compareWorkingDirAndBlobs(dbB)).resolves.toBeTruthy();

    await destroyDBs([dbA, dbB]);
  });

  describe('plaintext-OT Type', () => {
    /**
     * before:  jsonA1
     * dbA   : +jsonA1
     * dbB   :  jsonB1
     * after :  mergedJson
     *
     * 3-way merge:
     *   mergedJson:17 - Conflict. Accept theirs (update-merge)
     */
    it('add text', async () => {
      const schema: Schema = {
        json: { plainTextProperties: { name: true } },
      };
      const [dbA, remoteA] = await createDatabase(
        remoteURLBase,
        localDir,
        serialId,
        {
          conflictResolutionStrategy: 'ours-diff',
        },
        schema
      );

      // A puts and pushes
      const jsonA1 = { _id: '1', name: 'Nara and Kyoto' };
      const putResultA1 = await dbA.put(jsonA1);
      await remoteA.tryPush();

      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameB,
        localDir: localDir,
        schema,
      });
      // Clone dbA
      await dbB.open({
        ...remoteA.options(),
        conflictResolutionStrategy: 'ours-diff',
      });
      const remoteB = dbB.getSynchronizer(remoteA.remoteURL());

      // A puts and pushes
      const jsonA1dash = { _id: '1', name: 'Hello, Nara and Kyoto' };
      const putResultA1dash = await dbA.put(jsonA1dash);
      await remoteA.tryPush();

      // B puts
      const jsonB1 = { _id: '1', name: 'Nara and Kyoto and Osaka' };
      const putResultB1 = await dbB.put(jsonB1);

      const mergedJson = { _id: '1', name: 'Hello, Nara and Kyoto and Osaka' };

      // It will occur conflict on id 1.json.
      const syncResult1 = (await remoteB.trySync()) as SyncResultResolveConflictsAndPush;

      const mergedDoc = await dbB.getDocWithMetaData('1');

      expect(syncResult1.changes.local).toEqual([
        getChangedFileUpdateBySHA(
          jsonB1,
          putResultB1.fileSha,
          mergedJson,
          mergedDoc!.fileSha
        ),
      ]);
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
    it('move text', async () => {
      const schema: Schema = {
        json: { plainTextProperties: { name: true } },
      };
      const [dbA, remoteA] = await createDatabase(
        remoteURLBase,
        localDir,
        serialId,
        {
          conflictResolutionStrategy: 'ours-diff',
        },
        schema
      );

      // A puts and pushes
      const jsonA1 = { _id: '1', name: 'Nara Osaka Kyoto Nagoya' };
      const putResultA1 = await dbA.put(jsonA1);
      await remoteA.tryPush();

      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameB,
        localDir: localDir,
        schema,
      });
      // Clone dbA
      await dbB.open({
        ...remoteA.options(),
        conflictResolutionStrategy: 'ours-diff',
      });
      const remoteB = dbB.getSynchronizer(remoteA.remoteURL());

      // A puts and pushes
      const jsonA1dash = { _id: '1', name: 'Osaka Kyoto Nara Nagoya' };
      const putResultA1dash = await dbA.put(jsonA1dash);
      await remoteA.tryPush();

      // B puts
      const jsonB1 = { _id: '1', name: 'Kyoto Nara Osaka Nagoya' };
      const putResultB1 = await dbB.put(jsonB1);

      const mergedJson = { _id: '1', name: 'Kyoto Osaka Nara Nagoya' };

      // It will occur conflict on id 1.json.
      const syncResult1 = (await remoteB.trySync()) as SyncResultResolveConflictsAndPush;

      const mergedDoc = await dbB.getDocWithMetaData('1');

      expect(syncResult1.changes.local).toEqual([
        getChangedFileUpdateBySHA(
          jsonB1,
          putResultB1.fileSha,
          mergedJson,
          mergedDoc!.fileSha
        ),
      ]);
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
    it('bad result', async () => {
      const schema: Schema = {
        json: { plainTextProperties: { name: true } },
      };
      const [dbA, remoteA] = await createDatabase(
        remoteURLBase,
        localDir,
        serialId,
        {
          conflictResolutionStrategy: 'ours-diff',
        },
        schema
      );

      // A puts and pushes
      const jsonA1 = { _id: '1', name: 'Nara Kyoto' };
      const putResultA1 = await dbA.put(jsonA1);
      await remoteA.tryPush();

      const dbNameB = serialId();
      const dbB: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameB,
        localDir: localDir,
        schema,
      });
      // Clone dbA
      await dbB.open({
        ...remoteA.options(),
        conflictResolutionStrategy: 'ours-diff',
      });
      const remoteB = dbB.getSynchronizer(remoteA.remoteURL());

      // A puts and pushes
      const jsonA1dash = { _id: '1', name: 'Nara Kamo' };
      const putResultA1dash = await dbA.put(jsonA1dash);
      await remoteA.tryPush();

      // B puts
      const jsonB1 = { _id: '1', name: 'Kyoto Nara' };
      const putResultB1 = await dbB.put(jsonB1);

      // ! Bad result. Best result is 'Kyoto Nara Kamo'
      const mergedJson = { _id: '1', name: 'Kyoto ama' };

      // It will occur conflict on id 1.json.
      const syncResult1 = (await remoteB.trySync()) as SyncResultResolveConflictsAndPush;

      const mergedDoc = await dbB.getDocWithMetaData('1');

      expect(syncResult1.changes.local).toEqual([
        getChangedFileUpdateBySHA(
          jsonB1,
          putResultB1.fileSha,
          mergedJson,
          mergedDoc!.fileSha
        ),
      ]);
      await destroyDBs([dbA, dbB]);
    });
  });
});
