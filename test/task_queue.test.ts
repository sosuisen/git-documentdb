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
import { sleep } from '../src/utils';
import { TaskQueue } from '../src/task_queue';
import { ColoredLogger, TaskMetadata } from '../src/types';
import { Err } from '../src/error';

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = './test/database_task_queue';

const tsLogger = new Logger({
  name: monoId(),
  minLevel: 'info',
  displayDateTime: false,
  displayFunctionName: false,
  displayFilePath: 'hidden',
});

const logger: ColoredLogger = {
  silly: (
    mes: string,
    colorTag?: () => (literals: TemplateStringsArray, ...placeholders: any[]) => string
  ) => {
    if (colorTag !== undefined) {
      tsLogger.silly(colorTag()`${mes}`);
    }
    else {
      tsLogger.silly(mes);
    }
  },
  debug: (
    mes: string,
    colorTag?: () => (literals: TemplateStringsArray, ...placeholders: any[]) => string
  ) => {
    if (colorTag !== undefined) {
      tsLogger.debug(colorTag()`${mes}`);
    }
    else {
      tsLogger.debug(mes);
    }
  },
  trace: (
    mes: string,
    colorTag?: () => (literals: TemplateStringsArray, ...placeholders: any[]) => string
  ) => {
    if (colorTag !== undefined) {
      tsLogger.trace(colorTag()`${mes}`);
    }
    else {
      tsLogger.trace(mes);
    }
  },
  info: (
    mes: string,
    colorTag?: () => (literals: TemplateStringsArray, ...placeholders: any[]) => string
  ) => {
    if (colorTag !== undefined) {
      tsLogger.info(colorTag()`${mes}`);
    }
    else {
      tsLogger.info(mes);
    }
  },
  warn: (
    mes: string,
    colorTag?: () => (literals: TemplateStringsArray, ...placeholders: any[]) => string
  ) => {
    if (colorTag !== undefined) {
      tsLogger.warn(colorTag()`${mes}`);
    }
    else {
      tsLogger.warn(mes);
    }
  },
  error: (
    mes: string,
    colorTag?: () => (literals: TemplateStringsArray, ...placeholders: any[]) => string
  ) => {
    if (colorTag !== undefined) {
      tsLogger.error(colorTag()`${mes}`);
    }
    else {
      tsLogger.error(mes);
    }
  },
  fatal: (
    mes: string,
    colorTag?: () => (literals: TemplateStringsArray, ...placeholders: any[]) => string
  ) => {
    if (colorTag !== undefined) {
      tsLogger.fatal(colorTag()`${mes}`);
    }
    else {
      tsLogger.fatal(mes);
    }
  },
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
  describe('debounce', () => {
    it('debounces consecutive puts to the same _id', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
        debounceTime: 3000,
        logLevel: 'trace',
      });
      await gitDDB.open();
      let skippedTask00 = false;
      gitDDB.put({ _id: 'a', name: '0' }, { taskId: '0' }).catch(err => {
        if (err instanceof Err.TaskCancelError) skippedTask00 = true;
      });
      let skippedTask01 = false;
      gitDDB.put({ _id: 'a', name: '1' }, { taskId: '1' }).catch(err => {
        if (err instanceof Err.TaskCancelError) skippedTask01 = true;
      });
      let skippedTask02 = false;
      gitDDB.put({ _id: 'a', name: '2' }, { taskId: '2' }).catch(err => {
        if (err instanceof Err.TaskCancelError) skippedTask02 = true;
      });
      let skippedTask03 = false;
      gitDDB.put({ _id: 'a', name: '3' }, { taskId: '3' }).catch(err => {
        if (err instanceof Err.TaskCancelError) skippedTask03 = true;
      });
      await sleep(4000);
      expect(skippedTask00).toBeTruthy();
      expect(skippedTask01).toBeTruthy();
      expect(skippedTask02).toBeTruthy();
      expect(skippedTask03).toBeFalsy();

      const json = await gitDDB.get('a');
      expect(json!.name).toEqual('3');

      await gitDDB.destroy();
    });

    it('debounces a lot of consecutive puts to the same _id', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
        debounceTime: 3000,
        logLevel: 'trace',
      });
      await gitDDB.open();
      let skippedTask00 = false;
      gitDDB.put({ _id: 'a', name: '0' }, { taskId: '0' }).catch(err => {
        if (err instanceof Err.TaskCancelError) skippedTask00 = true;
      });
      await sleep(4000);

      const putter: Promise<any>[] = [];
      const validResult: (boolean | Record<string, any>)[] = [];
      for (let i = 1; i < 25; i++) {
        putter.push(
          gitDDB.put({ _id: 'a', name: `${i}` }, { taskId: `${i}` }).catch(err => {
            if (err instanceof Err.TaskCancelError) return true;
          })
        );
        validResult.push(true);
      }
      putter.push(
        gitDDB.put({ _id: 'a', name: '25' }, { taskId: '25' }).catch(err => {
          if (err instanceof Err.TaskCancelError) return true;
        })
      );
      validResult.push({ _id: 'a' });

      const results = await Promise.all(putter);

      expect(skippedTask00).toBeFalsy();

      expect(results).toMatchObject(validResult);

      const json = await gitDDB.get('a');
      expect(json!.name).toEqual('25');

      await gitDDB.destroy();
    });

    it('debounces a lot of consecutive puts to the mixed _ids', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
        debounceTime: 3000,
        logLevel: 'trace',
      });
      await gitDDB.open();
      let skippedTaskA00 = false;
      gitDDB.put({ _id: 'a', name: '0' }, { taskId: 'a0' }).catch(err => {
        if (err instanceof Err.TaskCancelError) skippedTaskA00 = true;
      });
      let skippedTaskB00 = false;
      gitDDB.put({ _id: 'b', name: '0' }, { taskId: 'b0' }).catch(err => {
        if (err instanceof Err.TaskCancelError) skippedTaskB00 = true;
      });
      let skippedTaskC00 = false;
      gitDDB.put({ _id: 'c', name: '0' }, { taskId: 'c0' }).catch(err => {
        if (err instanceof Err.TaskCancelError) skippedTaskC00 = true;
      });
      await sleep(4000);

      const putter: Promise<any>[] = [];
      const validResult: (boolean | Record<string, any>)[] = [];
      for (let i = 1; i < 50; i++) {
        putter.push(
          gitDDB.put({ _id: 'a', name: `${i}` }, { taskId: `a${i}` }).catch(err => {
            if (err instanceof Err.TaskCancelError) return true;
          })
        );
        validResult.push(true);
        putter.push(
          gitDDB.put({ _id: 'b', name: `${i}` }, { taskId: `b${i}` }).catch(err => {
            if (err instanceof Err.TaskCancelError) return true;
          })
        );
        validResult.push(true);
        putter.push(
          gitDDB.put({ _id: 'c', name: `${i}` }, { taskId: `c${i}` }).catch(err => {
            if (err instanceof Err.TaskCancelError) return true;
          })
        );
        validResult.push(true);
      }
      putter.push(
        gitDDB.put({ _id: 'a', name: '50' }, { taskId: 'a50' }).catch(err => {
          if (err instanceof Err.TaskCancelError) return true;
        })
      );
      validResult.push({ _id: 'a' });
      putter.push(
        gitDDB.put({ _id: 'b', name: '50' }, { taskId: 'b50' }).catch(err => {
          if (err instanceof Err.TaskCancelError) return true;
        })
      );
      validResult.push({ _id: 'b' });
      putter.push(
        gitDDB.put({ _id: 'c', name: '50' }, { taskId: 'c50' }).catch(err => {
          if (err instanceof Err.TaskCancelError) return true;
        })
      );
      validResult.push({ _id: 'c' });

      const results = await Promise.all(putter);

      expect(skippedTaskA00).toBeFalsy();
      expect(skippedTaskB00).toBeFalsy();
      expect(skippedTaskC00).toBeFalsy();

      expect(results).toMatchObject(validResult);

      const jsonA = await gitDDB.get('a');
      expect(jsonA!.name).toEqual('50');
      const jsonB = await gitDDB.get('b');
      expect(jsonB!.name).toEqual('50');
      const jsonC = await gitDDB.get('c');
      expect(jsonC!.name).toEqual('50');

      await gitDDB.destroy();
    });

    it('debounces a lot of consecutive puts mixed with a delete command', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
        debounceTime: 3000,
        logLevel: 'trace',
      });
      await gitDDB.open();

      const putter: Promise<any>[] = [];
      const validResult: (boolean | Record<string, any>)[] = [];
      for (let i = 0; i < 9; i++) {
        putter.push(
          gitDDB.put({ _id: 'a', name: `${i}` }, { taskId: `${i}` }).catch(err => {
            if (err instanceof Err.TaskCancelError) return true;
          })
        );
        validResult.push(true);
      }

      // put task just before delete task will be executed.
      putter.push(
        gitDDB.put({ _id: 'a', name: `9` }, { taskId: `9` }).catch(err => {
          if (err instanceof Err.TaskCancelError) return false;
        })
      );
      validResult.push({ _id: 'a' });

      // Delete
      putter.push(gitDDB.delete('a'));
      validResult.push({
        _id: 'a',
      });

      for (let i = 10; i < 20; i++) {
        putter.push(
          gitDDB.put({ _id: 'a', name: `${i}` }, { taskId: `${i}` }).catch(err => {
            if (err instanceof Err.TaskCancelError) return true;
          })
        );
        validResult.push(true);
      }
      putter.push(
        gitDDB.put({ _id: 'a', name: '20' }, { taskId: '20' }).catch(err => {
          if (err instanceof Err.TaskCancelError) return true;
        })
      );
      validResult.push({ _id: 'a' });

      const results = await Promise.all(putter);

      expect(results).toMatchObject(validResult);

      const json = await gitDDB.get('a');
      expect(json!.name).toEqual('20');

      await gitDDB.destroy();
    });

    it('debounces a lot of consecutive puts mixed with an insert command', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
        debounceTime: 3000,
        logLevel: 'trace',
      });
      await gitDDB.open();

      const putter: Promise<any>[] = [];
      const validResult: (boolean | undefined | Record<string, any>)[] = [];
      for (let i = 0; i < 9; i++) {
        putter.push(
          gitDDB.put({ _id: 'a', name: `${i}` }, { taskId: `${i}` }).catch(err => {
            if (err instanceof Err.TaskCancelError) return true;
          })
        );
        validResult.push(true);
      }

      // put task just before insert task will be executed.
      putter.push(
        gitDDB.put({ _id: 'a', name: `9` }, { taskId: `9` }).catch(err => {
          if (err instanceof Err.TaskCancelError) return false;
        })
      );
      validResult.push({ _id: 'a' });

      // Insert throws error
      putter.push(gitDDB.insert({ _id: 'a', name: '10' }).catch(() => undefined));
      validResult.push(undefined);

      const results = await Promise.all(putter);

      expect(results).toMatchObject(validResult);

      const json = await gitDDB.get('a');
      expect(json!.name).toEqual('9');

      await gitDDB.destroy();
    });

    it('Set different debounceTime in each collection', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
        debounceTime: 3000,
        logLevel: 'trace',
      });
      await gitDDB.open();
      const colA = gitDDB.collection('a', { debounceTime: 7000 });
      const colB = gitDDB.collection('b', { debounceTime: 5000 });
      const colC = gitDDB.collection('c', { debounceTime: 1000 });

      const result: string[] = [];
      colA
        .put({ _id: 'a1' })
        .then(() => result.push('a1'))
        .catch(() => {});
      colB
        .put({ _id: 'b1' })
        .then(() => result.push('b1'))
        .catch(() => {});
      colC
        .put({ _id: 'c1' })
        .then(() => result.push('c1'))
        .catch(() => {});
      colC
        .put({ _id: 'c1' })
        .then(() => result.push('c2'))
        .catch(() => {});
      await sleep(10000);

      expect(result).toEqual(['c2', 'b1', 'a1']);
      await gitDDB.destroy();
    });

    it('Collection debounceTime will be overwritten by method debounceTime', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
        debounceTime: 3000,
        logLevel: 'trace',
      });
      await gitDDB.open();
      let skippedTask00 = false;
      gitDDB.put({ _id: 'a', name: '0' }, { taskId: '0' }).catch(err => {
        if (err instanceof Err.TaskCancelError) skippedTask00 = true;
      });
      let skippedTask01 = false;
      gitDDB.put({ _id: 'a', name: '1' }, { taskId: '1' }).catch(err => {
        if (err instanceof Err.TaskCancelError) skippedTask01 = true;
      });
      let skippedTask02 = false;
      gitDDB.put({ _id: 'a', name: '2' }, { taskId: '2' }).catch(err => {
        if (err instanceof Err.TaskCancelError) skippedTask02 = true;
      });

      let skippedTask03 = false;
      gitDDB.put({ _id: 'a', name: '3' }, { taskId: '3', debounceTime: 0 }).catch(err => {
        if (err instanceof Err.TaskCancelError) skippedTask03 = true;
      });
      await sleep(1000);

      expect(skippedTask00).toBeTruthy();
      expect(skippedTask01).toBeTruthy();
      expect(skippedTask02).toBeTruthy();
      expect(skippedTask03).toBeFalsy();

      const json = await gitDDB.get('a');
      expect(json!.name).toEqual('3');

      await gitDDB.destroy();
    });
  });

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
    const taskQueue = new TaskQueue(logger);
    taskQueue.start();
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

    // clear() must be called to clear setInterval
    taskQueue.stop();
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
    gitDDB.taskQueue.stop();
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
