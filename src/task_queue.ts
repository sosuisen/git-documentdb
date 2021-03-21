/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import { monotonicFactory } from 'ulid';
import { Logger } from 'tslog';
import { Task, TaskStatistics } from './types';
import { ConsoleStyle, sleep } from './utils';

const ulid = monotonicFactory();

export class TaskQueue {
  private _logger: Logger;

  // @ts-ignore
  private _taskQueue: Task[] = [];
  private _isTaskQueueWorking = false;

  /**
   * Task Statistics
   */
  private _statistics: TaskStatistics = {
    put: 0,
    remove: 0,
    push: 0,
    sync: 0,
  };

  private _currentTask: Task | undefined = undefined;

  constructor (logger: Logger) {
    this._logger = logger;
  }

  /**
   * Get current task ID
   */
  currentTaskId () {
    return this._currentTask?.taskId;
  }

  /**
   * Generate task ID
   *
   * @remarks ID monotonically increases.
   */
  newTaskId = () => {
    return ulid(Date.now());
  };

  /**
   * Push task to TaskQueue
   */
  pushToTaskQueue (task: Task) {
    this._taskQueue.push(task);
    this._execTaskQueue();
  }

  /**
   * Unshift task to TaskQueue
   */
  unshiftSyncTaskToTaskQueue (task: Task) {
    if (this._taskQueue.length > 0 && this._taskQueue[0].label === 'sync') {
      return;
    }
    this._taskQueue.unshift(task);
    this._execTaskQueue();
  }

  clear () {
    this._taskQueue.length = 0;
    this._isTaskQueueWorking = false;
    this._currentTask = undefined;
    this._statistics = {
      put: 0,
      remove: 0,
      push: 0,
      sync: 0,
    };
  }

  statistics (): TaskStatistics {
    return JSON.parse(JSON.stringify(this._statistics));
  }

  async waitCompletion (timeoutMsec: number) {
    const startMsec = Date.now();
    let isTimeout = false;
    while (this._taskQueue.length > 0 || this._isTaskQueueWorking) {
      if (Date.now() - startMsec > timeoutMsec) {
        this._taskQueue.length = 0;
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
        const targetId = this._currentTask.targetId;
        const taskId = this._currentTask.taskId;

        this._isTaskQueueWorking = true;
        this._logger.debug(
          ConsoleStyle.BgYellow().FgBlack().tag()`Start ${label}(${targetId || ''})`
        );

        const beforeResolve = () => {
          this._logger.debug(
            ConsoleStyle.BgGreen().FgBlack().tag()`End ${label}(${targetId || ''})`
          );
        };
        this._currentTask.func(beforeResolve).finally(() => {
          this._statistics[label]++;

          this._isTaskQueueWorking = false;
          this._currentTask = undefined;
          this._execTaskQueue();
        });
      }
    }
  }
}
