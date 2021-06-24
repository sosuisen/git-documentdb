/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import { monotonicFactory } from 'ulid';
import { Logger } from 'tslog';
import AsyncLock from 'async-lock';
import { Task, TaskMetadata, TaskStatistics } from './types';
import { CONSOLE_STYLE, sleep } from './utils';
import { ConsecutiveSyncSkippedError } from './error';

/**
 * TaskQueue
 *
 * @internal
 */
export class TaskQueue {
  // Monotonic counter
  private _ulid = monotonicFactory();
  private _lock = new AsyncLock();

  private _logger: Logger;

  // @ts-ignore
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

  constructor (logger: Logger) {
    this._logger = logger;
  }

  /**
   * Set logger
   */
  setLogger (logger: Logger) {
    this._logger = logger;
  }

  /**
   * Get current task ID
   */
  currentTaskId () {
    return this._currentTask?.taskId;
  }

  /**
   * Get default task ID
   *
   * @remarks ID monotonically increases. It does not ensures the task order in _taskQueue.
   */
  newTaskId () {
    return this._ulid(Date.now());
  }

  /**
   * Get enqueue time
   *
   * @remarks It ensures the task order in _taskQueue.
   */
  getEnqueueTime () {
    return this._ulid(Date.now());
  }

  /**
   * Push task to TaskQueue
   */
  // eslint-disable-next-line complexity
  pushToTaskQueue (task: Task) {
    // Critical section
    this._lock
      // eslint-disable-next-line complexity
      .acquire('taskQueue', () => {
        // Skip consecutive sync/push events
        if (
          (this._taskQueue.length === 0 &&
            ((this._currentTask?.label === 'sync' && task.label === 'sync') ||
              (this._currentTask?.label === 'push' && task.label === 'push'))) ||
          (this._taskQueue.length > 0 &&
            ((this._taskQueue[this._taskQueue.length - 1].label === 'sync' &&
              task.label === 'sync') ||
              (this._taskQueue[this._taskQueue.length - 1].label === 'push' &&
                task.label === 'push')))
        ) {
          task.cancel();
          this._statistics.cancel++;
          throw new ConsecutiveSyncSkippedError(task.label, task.taskId);
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
          shortName: task.shortId,
          collectionPath: task.collectionPath,
          enqueueTime: task.enqueueTime,
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
        this._execTaskQueue();
      })
      .catch(e => {
        if (e instanceof ConsecutiveSyncSkippedError) {
          this._logger.debug(CONSOLE_STYLE.bgGreen().fgRed().tag()`${e.message}`);
        }
        else {
          throw e;
        }
      });
  }

  /**
   * Unshift task to TaskQueue
   */
  /*
  unshiftSyncTaskToTaskQueue (task: Task) {
    if (
      (this._currentTask?.label === 'sync' && task.label === 'sync') ||
      (this._currentTask?.label === 'push' && task.label === 'push') ||
      (this._taskQueue.length > 0 &&
        ((this._taskQueue[0].label === 'sync' && task.label === 'sync') ||
          (this._taskQueue[0].label === 'push' && task.label === 'push')))
    ) {
      // console.log('## task skipped');
      task.cancel();
      return;
    }
    this._taskQueue.unshift(task);
    this._execTaskQueue();
  }
  */
  clear () {
    // Clear not queued jobs
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

  length () {
    return this._taskQueue.length;
  }

  currentStatistics (): TaskStatistics {
    return JSON.parse(JSON.stringify(this._statistics));
  }

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

  private _execTaskQueue () {
    if (this._taskQueue.length > 0 && !this._isTaskQueueWorking) {
      this._currentTask = this._taskQueue.shift();
      if (this._currentTask !== undefined && this._currentTask.func !== undefined) {
        const label = this._currentTask.label;
        const shortId = this._currentTask.shortId;
        const shortName = this._currentTask.shortName;
        const collectionPath = this._currentTask.collectionPath;
        const fullDocPath = collectionPath ? collectionPath + shortName : '';
        const taskId = this._currentTask.taskId;

        this._isTaskQueueWorking = true;
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
        };

        this._currentTask.func(beforeResolve, beforeReject, taskMetadata).finally(() => {
          this._execTaskQueue();
        });
      }
    }
  }
}
