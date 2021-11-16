/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

/**
 * ! Must import both clearInterval and setInterval from 'timers'
 */
import { clearInterval, setInterval } from 'timers';

import { decodeTime, monotonicFactory } from 'ulid';
import { Logger } from 'tslog';
import AsyncLock from 'async-lock';
import { ColoredLogger, Task, TaskMetadata, TaskStatistics } from './types';
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
  private _lock: AsyncLock | undefined = new AsyncLock();

  private _logger: ColoredLogger;

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

  private _checkTimer: NodeJS.Timeout | undefined;
  private _checkTimerInterval = 100;

  /**
   * Constructor
   *
   * @remarks
   * Must call start() after new TaskQueue()
   *
   * @public
   */
  constructor (logger: ColoredLogger) {
    this._logger = logger;
  }

  /**
   * Set logger
   *
   * @internal
   */
  setLogger (logger: ColoredLogger) {
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
    this._lock! // eslint-disable-next-line complexity
      .acquire('TaskQueue', () => {
        // Skip consecutive sync/push events
        this._logger.debug(
          `Try to push ${task.label}@${task.taskId} into ${JSON.stringify(
            this._taskQueue
          )}`
        );
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
              `Error in enqueueCallback (fullDocPath: ${
                task.collectionPath! + task.shortName
              }) ${e}`,
              CONSOLE_STYLE.bgGreen().fgRed().tag
            );
          }
        }
      })
      .catch(e => {
        if (e instanceof Err.ConsecutiveSyncSkippedError) {
          this._logger.debug(e.message, CONSOLE_STYLE.bgGreen().fgRed().tag);
        }
        else {
          throw e;
        }
      });
  }

  /**
   * Start TaskQueue
   *
   * @public
   */
  start () {
    if (this._lock === undefined) {
      this._lock = new AsyncLock();
    }

    if (this._checkTimer === undefined) {
      this._checkTimer = setInterval(() => {
        this._checkTaskQueue();
      }, this._checkTimerInterval);
    }
  }

  /**
   * Stop TaskQueue
   *
   * @public
   */
  stop () {
    // Clear not queued job

    if (this._checkTimer !== undefined) {
      clearInterval(this._checkTimer);
      this._checkTimer = undefined;
    }

    if (this._lock !== undefined) {
      // @ts-ignore
      this._lock.queues.taskQueue = null;
    }
    this._lock = undefined;

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
    if (this._lock === undefined) return;
    if (this._lock.isBusy()) return;

    // eslint-disable-next-line complexity
    this._lock!.acquire('TaskQueue', () => {
      if (this._taskQueue.length === 0 || this._isTaskQueueWorking) return;

      let taskIndex = 0;
      while (taskIndex < this._taskQueue.length) {
        const targetTask = this._taskQueue[taskIndex];

        if (targetTask.debounceTime === undefined || targetTask.debounceTime! < 0) {
          this._currentTask = this._pullTargetTask(taskIndex);
          if (this._currentTask !== undefined) this._execTask();
          return;
        }

        if (targetTask.label !== 'put' && targetTask.label !== 'update') {
          this._currentTask = this._pullTargetTask(taskIndex);
          if (this._currentTask !== undefined) this._execTask();
          return;
        }
        const targetFullDocPath = targetTask.collectionPath! + targetTask.shortName!;
        const expiredTime = decodeTime(targetTask.enqueueTime!) + targetTask.debounceTime!;
        const current = Date.now();

        let nextPutUpdateExist = false;
        let nextDeleteExist = false;
        let nextInsertExist = false;
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
            if (tmpTask.label === 'insert') {
              nextInsertExist = true;
              break;
            }
            nextPutUpdateExist = true;
            break;
          }
        }

        if (nextPutUpdateExist) {
          const cancelTask = this._pullTargetTask(taskIndex);
          cancelTask?.cancel();
          continue;
        }
        else if (nextDeleteExist) {
          this._currentTask = this._pullTargetTask(taskIndex);
          if (this._currentTask !== undefined) this._execTask();
          return;
        }
        else if (nextInsertExist) {
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
      this._isTaskQueueWorking = true;

      const label = this._currentTask.label;
      const shortId = this._currentTask.shortId;
      const shortName = this._currentTask.shortName;
      const collectionPath = this._currentTask.collectionPath;
      const fullDocPath = collectionPath ? collectionPath + shortName : '';
      const taskId = this._currentTask.taskId;
      const syncRemoteName = this._currentTask.syncRemoteName;

      this._logger.debug(
        `Start: ${label}(${fullDocPath})@${taskId}`,
        CONSOLE_STYLE.bgYellow().fgBlack().tag
      );

      const beforeResolve = () => {
        this._logger.debug(
          `End: ${label}(${fullDocPath})@${taskId}`,
          CONSOLE_STYLE.bgGreen().fgBlack().tag
        );
        this._statistics[label]++;
      };
      const beforeReject = () => {
        this._logger.debug(
          `End with error: ${label}(${fullDocPath})@${taskId}`,
          CONSOLE_STYLE.bgGreen().fgRed().tag
        );
        this._statistics[label]++;
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

      this._currentTask.func(beforeResolve, beforeReject, taskMetadata).finally(() => {
        this._logger.debug(
          `Clear currentTask: ${this._currentTask?.label}@${this._currentTask?.taskId}`
        );
        this._isTaskQueueWorking = false;
        this._currentTask = undefined;
      });
    }
  }
}
