/* eslint-disable @typescript-eslint/naming-convention */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import { monotonicFactory } from 'ulid';
import expect from 'expect';
import fs from 'fs-extra';
import { Logger } from 'tslog';
import { GitDocumentDB } from '../src/git_documentdb';
import { createDatabase, destroyDBs, removeRemoteRepositories } from './remote_utils';
import { sleep } from '../src/utils';
import { TaskQueue } from '../src/task_queue';
import { TaskMetadata } from '../src/types';

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

before(() => {
  fs.removeSync(path.resolve(localDir));
});

after(() => {
  fs.removeSync(path.resolve(localDir));
});

describe('<task_queue>', () => {
  it('increments statistics: put', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
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
      dbName,
      localDir,
    });
    await gitDDB.open();
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
      dbName,
      localDir,
    });
    await gitDDB.open();
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
      dbName,
      localDir,
    });
    await gitDDB.open();
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
      dbName,
      localDir,
    });
    await gitDDB.open();
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
      dbName,
      localDir,
    });
    await gitDDB.open();
    await gitDDB.insert(
      { _id: '01' },
      {
        enqueueCallback: async () => {
          expect(gitDDB.taskQueue.currentTaskId()).not.toBeUndefined();
          await sleep(3000);
          expect(gitDDB.taskQueue.currentTaskId()).toBeUndefined();
          await gitDDB.destroy();
        },
      }
    );
    await gitDDB.destroy();
  });

  it('returns newTaskId', () => {
    const dbName = monoId();
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
      dbName,
      localDir,
    });
    await gitDDB.open();
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
      cancel: 0,
    });
    gitDDB.taskQueue.clear();
    expect(gitDDB.taskQueue.currentStatistics()).toEqual({
      put: 0,
      insert: 0,
      update: 0,
      delete: 0,
      push: 0,
      sync: 0,
      cancel: 0,
    });

    await gitDDB.destroy();
  });

  it('sets ordered enqueueTime', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const promiseList: Promise<TaskMetadata>[] = [];
    const maxNumber = 30;
    for (let i = 0; i < maxNumber; i++) {
      const id = `${i}`;
      promiseList.push(
        (async () => {
          let taskMetaData: TaskMetadata;
          await gitDDB.put(
            { _id: 'foo', taskId: id },
            {
              taskId: id,
              enqueueCallback: (myTaskMetaData: TaskMetadata) => {
                taskMetaData = myTaskMetaData;
              },
            }
          );
          // @ts-ignore
          return taskMetaData;
        })()
      );
    }

    const taskMetadataList = await Promise.all(promiseList);
    taskMetadataList.sort((a, b) => {
      if (a.enqueueTime! > b.enqueueTime!) return 1;
      if (a.enqueueTime! < b.enqueueTime!) return -1;
      return 0;
    });
    for (let i = 0; i < maxNumber - 1; i++) {
      expect(
        taskMetadataList[i].enqueueTime! < taskMetadataList[i + 1].enqueueTime!
      ).toBeTruthy();
    }

    await gitDDB.destroy();
  });

  it('invokes enqueueCallback with ordered enqueueTime', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const promiseList: Promise<TaskMetadata>[] = [];
    const rand = [0, 3, 2, 1, 4, 5, 8, 7, 9, 6];
    for (let i = 0; i < 10; i++) {
      const id = `${rand[i]}`;
      promiseList.push(
        (async () => {
          let taskMetaData: TaskMetadata;
          await gitDDB.put(
            { _id: 'foo', taskId: id },
            {
              taskId: id,
              enqueueCallback: (myTaskMetaData: TaskMetadata) => {
                taskMetaData = myTaskMetaData;
              },
            }
          );
          // @ts-ignore
          return taskMetaData;
        })()
      );
    }

    const taskMetadataList = await Promise.all(promiseList);
    // Sort new to old
    taskMetadataList.sort((a, b) => {
      if (a.enqueueTime! > b.enqueueTime!) return -1;
      if (a.enqueueTime! < b.enqueueTime!) return 1;
      return 0;
    });

    const revisions = await gitDDB.getFatDocHistory('foo');
    for (let i = 0; i < revisions.length; i++) {
      const revision = revisions[i];
      if (revision?.type === 'json') {
        expect(revision.doc.taskId).toBe(taskMetadataList[i].taskId);
      }
    }

    await gitDDB.destroy();
  });

  it('sets TaskMetaData for put', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();

    // eslint-disable-next-line no-async-promise-executor
    const taskMetadata = (await new Promise(resolve => {
      gitDDB.put(
        { _id: 'foo' },
        {
          taskId: 'testId',
          enqueueCallback: (myTaskMetadata: TaskMetadata) => {
            resolve(myTaskMetadata);
          },
        }
      );
    })) as TaskMetadata;
    expect(taskMetadata).toMatchObject({
      label: 'put',
      taskId: 'testId',
      shortId: 'foo',
      shortName: 'foo.json',
      collectionPath: '',
    });
    expect(taskMetadata.enqueueTime).toMatch(/^[\dA-HJKMNP-TV-Z]{26}$/); // Match ULID

    await gitDDB.destroy();
  });

  it('sets TaskMetaData with collectionPath for put', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = gitDDB.collection('col01');
    // eslint-disable-next-line no-async-promise-executor
    const taskMetadata = (await new Promise(resolve => {
      col.put(
        { _id: 'foo' },
        {
          taskId: 'testId',
          enqueueCallback: (myTaskMetadata: TaskMetadata) => {
            resolve(myTaskMetadata);
          },
        }
      );
    })) as TaskMetadata;
    expect(taskMetadata).toMatchObject({
      label: 'put',
      taskId: 'testId',
      shortId: 'foo',
      shortName: 'foo.json',
      collectionPath: 'col01/',
    });
    expect(taskMetadata.enqueueTime).toMatch(/^[\dA-HJKMNP-TV-Z]{26}$/); // Match ULID

    await gitDDB.destroy();
  });

  it('sets TaskMetaData for delete', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    await gitDDB.put({ _id: 'foo' });

    // eslint-disable-next-line no-async-promise-executor
    const taskMetadata = (await new Promise(resolve => {
      gitDDB.delete(
        { _id: 'foo' },
        {
          taskId: 'testId',
          enqueueCallback: (myTaskMetadata: TaskMetadata) => {
            resolve(myTaskMetadata);
          },
        }
      );
    })) as TaskMetadata;
    expect(taskMetadata).toMatchObject({
      label: 'delete',
      taskId: 'testId',
      shortId: 'foo',
      shortName: 'foo.json',
      collectionPath: '',
    });
    expect(taskMetadata.enqueueTime).toMatch(/^[\dA-HJKMNP-TV-Z]{26}$/); // Match ULID

    await gitDDB.destroy();
  });

  it('sets TaskMetaData with collectionPath for delete', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = gitDDB.collection('col01');
    await col.put({ _id: 'foo' });
    // eslint-disable-next-line no-async-promise-executor
    const taskMetadata = (await new Promise(resolve => {
      col.delete(
        { _id: 'foo' },
        {
          taskId: 'testId',
          enqueueCallback: (myTaskMetadata: TaskMetadata) => {
            resolve(myTaskMetadata);
          },
        }
      );
    })) as TaskMetadata;
    expect(taskMetadata).toMatchObject({
      label: 'delete',
      taskId: 'testId',
      shortId: 'foo',
      shortName: 'foo.json',
      collectionPath: 'col01/',
    });
    expect(taskMetadata.enqueueTime).toMatch(/^[\dA-HJKMNP-TV-Z]{26}$/); // Match ULID

    await gitDDB.destroy();
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

  before(async () => {
    await removeRemoteRepositories(reposPrefix);
  });

  it('increments statistics: push', async () => {
    const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId);

    // The first push in open()
    expect(dbA.taskQueue.currentStatistics().push).toBe(1);

    const jsonA1 = { _id: '1', name: 'fromA' };
    await dbA.put(jsonA1);
    await syncA.tryPush();
    expect(dbA.taskQueue.currentStatistics().push).toBe(2);

    await destroyDBs([dbA]);
  });

  it('increments statistics: sync', async () => {
    const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId);

    expect(dbA.taskQueue.currentStatistics().sync).toBe(0);

    await syncA.trySync();
    expect(dbA.taskQueue.currentStatistics().sync).toBe(1);

    await destroyDBs([dbA]);
  });

  it('clear() statistics', async () => {
    const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId);

    await syncA.trySync();
    expect(dbA.taskQueue.currentStatistics()).toEqual({
      put: 0,
      insert: 0,
      update: 0,
      delete: 0,
      push: 1,
      sync: 1,
      cancel: 0,
    });
    dbA.taskQueue.clear();
    expect(dbA.taskQueue.currentStatistics()).toEqual({
      put: 0,
      insert: 0,
      update: 0,
      delete: 0,
      push: 0,
      sync: 0,
      cancel: 0,
    });
    await destroyDBs([dbA]);
  });
});
