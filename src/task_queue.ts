/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import { monotonicFactory } from 'ulid';
import { Logger } from 'tslog';
import {
  Task,
  TaskCallback,
  TaskEnqueueCallback,
  TaskEvent,
  TaskMetadata,
  TaskStatistics,
} from './types';
import { ConsoleStyle, sleep } from './utils';

const ulid = monotonicFactory();

/**
 * TaskQueue
 *
 * @internal
 */
export class TaskQueue {
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
  // eslint-disable-next-line complexity
  pushToTaskQueue (task: Task) {
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
      // console.log('## task skipped');
      task.cancel();
      return;
    }
    this._taskQueue.push(task);
    const taskMetadata: TaskMetadata = {
      label: task.label,
      taskId: task.taskId,
      targetId: task.targetId,
      enqueueTime: task.enqueueTime,
    };
    this._eventHandlers.enqueue.forEach(callback => {
      if (callback !== undefined) {
        callback(taskMetadata);
      }
    });
    while (this._eventHandlersOnce.enqueue.length > 0) {
      const callback = this._eventHandlersOnce.enqueue.shift();
      if (callback !== undefined) {
        callback(taskMetadata);
      }
    }
    this._execTaskQueue();
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
        const targetId = this._currentTask.targetId;
        const taskId = this._currentTask.taskId;

        this._isTaskQueueWorking = true;
        this._logger.debug(
          ConsoleStyle.BgYellow().FgBlack().tag()`Start: ${label}(${targetId || ''})`
        );

        const beforeResolve = () => {
          this._logger.debug(
            ConsoleStyle.BgGreen().FgBlack().tag()`End: ${label}(${targetId || ''})`
          );
          this._statistics[label]++;
          this._isTaskQueueWorking = false;
          this._currentTask = undefined;
        };
        const beforeReject = () => {
          this._logger.debug(
            ConsoleStyle.BgGreen().FgRed().tag()`End with error: ${label}(${
              targetId || ''
            })`
          );
          this._statistics[label]++;
          this._isTaskQueueWorking = false;
          this._currentTask = undefined;
        };
        this._currentTask.func(beforeResolve, beforeReject).finally(() => {
          this._execTaskQueue();
        });
      }
    }
  }
}
