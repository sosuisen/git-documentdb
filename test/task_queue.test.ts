/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import { monotonicFactory } from 'ulid';
import fs from 'fs-extra';
import { Logger } from 'tslog';
import { GitDocumentDB } from '../src/index';
import { createDatabase, destroyDBs, removeRemoteRepositories } from './remote_utils';
import { sleep } from '../src/utils';
import { TaskQueue } from '../src/task_queue';

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const reposPrefix = 'test_task_queue___';
const localDir = './test/database_task_queue';

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
  fs.removeSync(path.resolve(localDir));
});

describe('<task_queue>', () => {
  it('increments statistics: put', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    await gitDDB.put({ _id: '01' });
    expect(gitDDB.taskQueue.currentStatistics().put).toBe(1);
    await gitDDB.put({ _id: '02' });
    expect(gitDDB.taskQueue.currentStatistics().put).toBe(2);
    await gitDDB.put({ _id: '03' });
    expect(gitDDB.taskQueue.currentStatistics().put).toBe(3);
    await gitDDB.destroy();
  });

  it('increments statistics: insert', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    await gitDDB.insert({ _id: '01' });
    expect(gitDDB.taskQueue.currentStatistics().insert).toBe(1);
    await gitDDB.insert({ _id: '02' });
    expect(gitDDB.taskQueue.currentStatistics().insert).toBe(2);
    await gitDDB.insert({ _id: '03' });
    expect(gitDDB.taskQueue.currentStatistics().insert).toBe(3);
    await gitDDB.destroy();
  });

  it('increments statistics: update', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    await gitDDB.insert({ _id: '01' });
    await gitDDB.update({ _id: '01' });
    expect(gitDDB.taskQueue.currentStatistics().update).toBe(1);
    await gitDDB.update({ _id: '01' });
    expect(gitDDB.taskQueue.currentStatistics().update).toBe(2);
    await gitDDB.destroy();
  });

  it('increments statistics: delete', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    await gitDDB.insert({ _id: '01' });
    await gitDDB.insert({ _id: '02' });
    await gitDDB.insert({ _id: '03' });

    await gitDDB.delete({ _id: '01' });
    expect(gitDDB.taskQueue.currentStatistics().delete).toBe(1);
    await gitDDB.delete({ _id: '02' });
    expect(gitDDB.taskQueue.currentStatistics().delete).toBe(2);
    await gitDDB.delete({ _id: '03' });
    expect(gitDDB.taskQueue.currentStatistics().delete).toBe(3);
    await gitDDB.destroy();
  });

  it('returns length', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    gitDDB.insert({ _id: '01' });
    gitDDB.insert({ _id: '02' });
    expect(gitDDB.taskQueue.length()).toBe(1);
    await sleep(5000);
    expect(gitDDB.taskQueue.length()).toBe(0);
    await gitDDB.destroy();
  });

  it('returns currentTaskId', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    gitDDB.insert({ _id: '01' });
    expect(gitDDB.taskQueue.currentTaskId()).not.toBeUndefined();
    await sleep(3000);
    expect(gitDDB.taskQueue.currentTaskId()).toBeUndefined();
    await gitDDB.destroy();
  });

  it('returns newTaskId', () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    const taskQueue = new TaskQueue(
      new Logger({
        name: dbName,
        minLevel: 'info',
        displayDateTime: false,
        displayFunctionName: false,
        displayFilePath: 'hidden',
      })
    );
    // e.g.) 01BX5ZZKBKACTAV9WEVGEMMVRZ
    let prevId = '';
    for (let i = 0; i < 30; i++) {
      const id = taskQueue.newTaskId();
      expect(id.length).toBe(26);
      if (prevId !== '') {
        // Id is monotonic
        expect(id > prevId).toBeTruthy();
      }
      prevId = id;
    }
  });

  it('clear() statistics', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    await gitDDB.insert({ _id: '01' });
    await gitDDB.put({ _id: '01' });
    await gitDDB.update({ _id: '01' });
    await gitDDB.delete({ _id: '01' });

    expect(gitDDB.taskQueue.currentStatistics()).toEqual({
      put: 1,
      insert: 1,
      update: 1,
      delete: 1,
      push: 0,
      sync: 0,
    });
    gitDDB.taskQueue.clear();
    expect(gitDDB.taskQueue.currentStatistics()).toEqual({
      put: 0,
      insert: 0,
      update: 0,
      delete: 0,
      push: 0,
      sync: 0,
    });

    gitDDB.destroy();
  });
});

const maybe =
  process.env.GITDDB_GITHUB_USER_URL && process.env.GITDDB_PERSONAL_ACCESS_TOKEN
    ? describe
    : describe.skip;

maybe('<task_queue> remote', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  beforeAll(async () => {
    await removeRemoteRepositories(reposPrefix);
  });

  test('increments statistics: push', async () => {
    const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId);

    // The first push in createDB()
    expect(dbA.taskQueue.currentStatistics().push).toBe(1);

    const jsonA1 = { _id: '1', name: 'fromA' };
    await dbA.put(jsonA1);
    await remoteA.tryPush();
    expect(dbA.taskQueue.currentStatistics().push).toBe(2);

    await destroyDBs([dbA]);
  });

  test('increments statistics: sync', async () => {
    const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId);

    expect(dbA.taskQueue.currentStatistics().sync).toBe(0);

    await remoteA.trySync();
    expect(dbA.taskQueue.currentStatistics().sync).toBe(1);

    await destroyDBs([dbA]);
  });

  test('clear() statistics', async () => {
    const [dbA, remoteA] = await createDatabase(remoteURLBase, localDir, serialId);

    await remoteA.trySync();
    expect(dbA.taskQueue.currentStatistics()).toEqual({
      put: 0,
      insert: 0,
      update: 0,
      delete: 0,
      push: 1,
      sync: 1,
    });
    dbA.taskQueue.clear();
    expect(dbA.taskQueue.currentStatistics()).toEqual({
      put: 0,
      insert: 0,
      update: 0,
      delete: 0,
      push: 0,
      sync: 0,
    });
    await destroyDBs([dbA]);
  });
});