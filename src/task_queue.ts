/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import { decodeTime, monotonicFactory } from 'ulid';
import { Logger } from 'tslog';
import AsyncLock from 'async-lock';
import { Task, TaskMetadata, TaskStatistics } from './types';
import { CONSOLE_STYLE, sleep } from './utils';
import { Err } from './error';

/**
 * TaskQueue
 *
 * @public
 */
export class TaskQueue {
  // Monotonic counter
  private _ulid = monotonicFactory();
  private _lock = new AsyncLock();

  private _logger: Logger;

  private _taskQueue: Task[] = [];
  private _isTaskQueueWorking = false;

  /**
   * Task Statistics
   *
   * (Just for test purposes)
   */
  private _statistics: TaskStatistics = {
    put: 0,
    insert: 0,
    update: 0,
    delete: 0,
    push: 0,
    sync: 0,
    cancel: 0,
  };

  private _currentTask: Task | undefined = undefined;

  private _checkTimer: NodeJS.Timeout;
  /**
   * Constructor
   *
   * @public
   */
  constructor (logger: Logger) {
    this._logger = logger;
    this._checkTimer = setInterval(() => {
      this._checkTaskQueue();
    }, 100);
  }

  /**
   * Set logger
   *
   * @internal
   */
  setLogger (logger: Logger) {
    this._logger = logger;
  }

  /**
   * Get current task ID
   *
   * @public
   */
  currentTaskId () {
    return this._currentTask?.taskId;
  }

  /**
   * Get default task ID
   *
   * @remarks ID monotonically increases. It does not ensures the task order in _taskQueue.
   *
   * @internal
   */
  newTaskId () {
    return this._ulid(Date.now());
  }

  /**
   * Get enqueue time
   *
   * @remarks It ensures the task order in _taskQueue.
   *
   * @public
   */
  getEnqueueTime () {
    return this._ulid(Date.now());
  }

  /**
   * Push task to TaskQueue
   *
   * @internal
   */
  // eslint-disable-next-line complexity
  pushToTaskQueue (task: Task) {
    // Critical section
    this._lock
      // eslint-disable-next-line complexity
      .acquire('TaskQueue', () => {
        // Skip consecutive sync/push events
        if (
          (this._taskQueue.length === 0 &&
            this._currentTask?.syncRemoteName === task.syncRemoteName &&
            ((this._currentTask?.label === 'sync' && task.label === 'sync') ||
              (this._currentTask?.label === 'push' && task.label === 'push'))) ||
          (this._taskQueue.length > 0 &&
            this._taskQueue[this._taskQueue.length - 1].syncRemoteName ===
              task.syncRemoteName &&
            ((this._taskQueue[this._taskQueue.length - 1].label === 'sync' &&
              task.label === 'sync') ||
              (this._taskQueue[this._taskQueue.length - 1].label === 'push' &&
                task.label === 'push')))
        ) {
          task.cancel();
          this._statistics.cancel++;
          throw new Err.ConsecutiveSyncSkippedError(task.label, task.taskId);
        }
        // eslint-disable-next-line require-atomic-updates
        task.enqueueTime = this.getEnqueueTime();
        this._taskQueue.push(task);
      })
      .then(() => {
        const taskMetadata: TaskMetadata = {
          label: task.label,
          taskId: task.taskId,
          shortId: task.shortId,
          shortName: task.shortName,
          collectionPath: task.collectionPath,
          enqueueTime: task.enqueueTime,
          syncRemoteName: task.syncRemoteName,
          debounceTime: task.debounceTime,
        };

        if (task.enqueueCallback) {
          try {
            task.enqueueCallback(taskMetadata);
          } catch (e) {
            this._logger.debug(
              CONSOLE_STYLE.bgGreen()
                .fgRed()
                .tag()`Error in enqueueCallback (fullDocPath: ${
                task.collectionPath! + task.shortName
              }) ${e}`
            );
          }
        }
      })
      .catch(e => {
        if (e instanceof Err.ConsecutiveSyncSkippedError) {
          this._logger.debug(CONSOLE_STYLE.bgGreen().fgRed().tag()`${e.message}`);
        }
        else {
          throw e;
        }
      });
  }

  /**
   * Clear TaskQueue
   *
   * @public
   */
  clear () {
    // Clear not queued jobs

    clearInterval(this._checkTimer);

    // @ts-ignore
    this._lock.queues.taskQueue = null;

    // Cancel queued tasks
    this._taskQueue.forEach(task => task.cancel());
    this._taskQueue.length = 0;
    this._isTaskQueueWorking = false;
    this._currentTask = undefined;
    this._statistics = {
      put: 0,
      insert: 0,
      update: 0,
      delete: 0,
      push: 0,
      sync: 0,
      cancel: 0,
    };
  }

  /**
   * Get length of TaskQueue
   *
   * @public
   */
  length () {
    return this._taskQueue.length;
  }

  /**
   * Get current statistics
   *
   * @public
   */
  currentStatistics (): TaskStatistics {
    return JSON.parse(JSON.stringify(this._statistics));
  }

  /**
   * @internal
   */
  async waitCompletion (timeoutMsec: number) {
    const startMsec = Date.now();
    let isTimeout = false;
    while ((this._taskQueue.length > 0 || this._isTaskQueueWorking) && !isTimeout) {
      if (Date.now() - startMsec > timeoutMsec) {
        isTimeout = true;
      }
      // eslint-disable-next-line no-await-in-loop
      await sleep(100);
    }
    return isTimeout;
  }

  private _pullTargetTask (targetIndex: number) {
    if (targetIndex >= this._taskQueue.length) {
      return undefined;
    }
    if (targetIndex === 0) {
      return this._taskQueue.shift();
    }
    const [task] = this._taskQueue.splice(targetIndex, 1);
    return task;
  }

  /**
   * checkTaskQueue
   * @internal
   */
  private _checkTaskQueue () {
    if (this._lock.isBusy()) return;

    // eslint-disable-next-line complexity
    this._lock.acquire('TaskQueue', () => {
      if (this._taskQueue.length === 0 || this._isTaskQueueWorking) return;

      let taskIndex = 0;
      while (taskIndex < this._taskQueue.length) {
        const targetTask = this._taskQueue[taskIndex];

        if (targetTask.debounceTime! < 0) {
          this._currentTask = this._pullTargetTask(taskIndex);
          if (this._currentTask !== undefined) this._execTask();
          return;
        }

        if (
          targetTask.label !== 'put' &&
          targetTask.label !== 'update' &&
          targetTask.label !== 'insert'
        ) {
          this._currentTask = this._pullTargetTask(taskIndex);
          if (this._currentTask !== undefined) this._execTask();
          return;
        }
        const targetFullDocPath = targetTask.collectionPath! + targetTask.shortName!;
        const expiredTime = decodeTime(targetTask.enqueueTime!) + targetTask.debounceTime!;
        const current = Date.now();

        let nextPutExist = false;
        let nextDeleteExist = false;
        for (let i = taskIndex + 1; i < this._taskQueue.length; i++) {
          const tmpTask = this._taskQueue[i];
          if (decodeTime(tmpTask.enqueueTime!) > expiredTime) break;

          if (
            (tmpTask.label === 'put' ||
              tmpTask.label === 'insert' ||
              tmpTask.label === 'update' ||
              tmpTask.label === 'delete') &&
            targetFullDocPath === tmpTask.collectionPath! + tmpTask.shortName!
          ) {
            // eslint-disable-next-line max-depth
            if (tmpTask.label === 'delete') {
              nextDeleteExist = true;
              break;
            }
            nextPutExist = true;
            break;
          }
        }

        if (nextPutExist) {
          const cancelTask = this._pullTargetTask(taskIndex);
          cancelTask?.cancel();
          continue;
        }
        else if (nextDeleteExist) {
          this._currentTask = this._pullTargetTask(taskIndex);
          if (this._currentTask !== undefined) this._execTask();
          return;
        }

        if (expiredTime <= current) {
          this._currentTask = this._pullTargetTask(taskIndex);
          if (this._currentTask !== undefined) this._execTask();
          return;
        }
        taskIndex++;
      }
    });
  }

  /**
   * execTask
   * @internal
   */
  // eslint-disable-next-line complexity
  private _execTask () {
    if (this._currentTask !== undefined && this._currentTask.func !== undefined) {
      const label = this._currentTask.label;
      const shortId = this._currentTask.shortId;
      const shortName = this._currentTask.shortName;
      const collectionPath = this._currentTask.collectionPath;
      const fullDocPath = collectionPath ? collectionPath + shortName : '';
      const taskId = this._currentTask.taskId;
      const syncRemoteName = this._currentTask.syncRemoteName;

      this._logger.debug(
        CONSOLE_STYLE.bgYellow().fgBlack().tag()`Start: ${label}(${fullDocPath})`
      );

      const beforeResolve = () => {
        this._logger.debug(
          CONSOLE_STYLE.bgGreen().fgBlack().tag()`End: ${label}(${fullDocPath})`
        );
        this._statistics[label]++;

        this._isTaskQueueWorking = false;
        this._currentTask = undefined;
      };
      const beforeReject = () => {
        this._logger.debug(
          CONSOLE_STYLE.bgGreen().fgRed().tag()`End with error: ${label}(${fullDocPath})`
        );
        this._statistics[label]++;
        this._isTaskQueueWorking = false;
        this._currentTask = undefined;
      };
      const taskMetadata: TaskMetadata = {
        label,
        taskId,
        shortId,
        shortName,
        collectionPath,
        enqueueTime: this._currentTask.enqueueTime,
        syncRemoteName,
      };

      this._currentTask.func(beforeResolve, beforeReject, taskMetadata).finally(() => {});
    }
  }
}
