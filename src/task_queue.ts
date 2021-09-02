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

  private _debounceTime = -1;
  private _lastTaskTime: { [fullDocPath: string]: number } = {};

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

  /**
   * Constructor
   *
   * @public
   */
  constructor (logger: Logger, debounceTime?: number) {
    this._logger = logger;
    if (debounceTime !== undefined) {
      this._debounceTime = debounceTime;
    }
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
      .acquire('taskQueue', () => {
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
        // Reentrant lock cannot be used in current AsyncLock
        // because 'domain' module of Node.js is deprecated.
        // Use setTimeout not to be deadlock.
        setTimeout(() => {
          this._execTaskQueue();
        }, 100);
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

  /**
   * @internal
   */
  // eslint-disable-next-line complexity
  private _execTaskQueue () {
    if (this._taskQueue.length > 0 && !this._isTaskQueueWorking) {
      this._lock
        // eslint-disable-next-line complexity
        .acquire('taskQueue', async () => {
          // put and update may be debounced.
          if (this._debounceTime > 0) {
            const skippedTasks: Task[] = [];
            let nextTaskIndex = 0;
            let lastTaskTime = 0;
            let taskExistAfterDebounceTime = false;
            do {
              const nextTask = this._taskQueue[nextTaskIndex];
              // Check label
              if (nextTask.label !== 'put' && nextTask.label !== 'update') continue;

              const nextTaskTime = decodeTime(nextTask.enqueueTime!);
              lastTaskTime = this._lastTaskTime[
                nextTask.collectionPath + nextTask.shortName!
              ];
              console.log(
                `# ${nextTask.taskId}: ${
                  lastTaskTime + this._debounceTime
                } : ${nextTaskTime}`
              );
              // Check fullDocPath
              if (lastTaskTime === undefined) continue;

              if (nextTaskTime <= lastTaskTime + this._debounceTime) {
                skippedTasks.push(nextTask);
              }
              else {
                taskExistAfterDebounceTime = true;
              }
              nextTaskIndex++;
            } while (nextTaskIndex > this._taskQueue.length - 1);
            if (skippedTasks.length > 0) {
              const currentTime = Date.now();
              if (currentTime < lastTaskTime + this._debounceTime) {
                // Wait until debounced time
                console.log('# wait: ' + (lastTaskTime + this._debounceTime - currentTime));
                await sleep(lastTaskTime + this._debounceTime - currentTime);
              }
              if (!taskExistAfterDebounceTime) {
                // Exclude the last one
                skippedTasks.pop();
              }
              // Remove skipped task
              this._taskQueue = this._taskQueue.filter(
                task => !skippedTasks.includes(task)
              );
              for (const skippedTask of skippedTasks) {
                // Skipped task throws TaskCancelError
                skippedTask.cancel();
              }
              skippedTasks.length = 0;
            }
          }

          this._currentTask = this._taskQueue.shift();
        })
        .finally(() => {
          if (this._currentTask !== undefined && this._currentTask.func !== undefined) {
            const label = this._currentTask.label;
            const shortId = this._currentTask.shortId;
            const shortName = this._currentTask.shortName;
            const collectionPath = this._currentTask.collectionPath;
            const fullDocPath = collectionPath ? collectionPath + shortName : '';
            const taskId = this._currentTask.taskId;
            const syncRemoteName = this._currentTask.syncRemoteName;

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
                CONSOLE_STYLE.bgGreen()
                  .fgRed()
                  .tag()`End with error: ${label}(${fullDocPath})`
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

            this._currentTask
              .func(beforeResolve, beforeReject, taskMetadata)
              .finally(() => {
                // put and update may be debounced.
                console.log(`task complete: ${taskMetadata.taskId}`);
                if (taskMetadata.label === 'put' || taskMetadata.label === 'update') {
                  this._lastTaskTime[
                    taskMetadata.collectionPath! + taskMetadata.shortName!
                  ] = decodeTime(taskMetadata.enqueueTime!);
                }
                this._execTaskQueue();
              });
          }
        });
    }
  }
}
