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
import git from 'isomorphic-git';
import fs from 'fs-extra';
import { CONSOLE_STYLE, sleep } from '../utils';
import { Err } from '../error';
import {
  ChangedFile,
  FatDoc,
  RemoteOptions,
  SyncCallback,
  SyncChangeCallback,
  SyncCombineDatabaseCallback,
  SyncCompleteCallback,
  SyncErrorCallback,
  SyncEvent,
  SyncLocalChangeCallback,
  SyncPauseCallback,
  SyncRemoteChangeCallback,
  SyncResult,
  SyncResultCancel,
  SyncResultPush,
  SyncResumeCallback,
  SyncStartCallback,
  Task,
  TaskMetadata,
} from '../types';
import { SyncInterface } from '../types_sync';
import { GitDDBInterface } from '../types_gitddb';
import { syncWorker } from './sync_worker';
import { pushWorker } from './push_worker';
import { RemoteRepository } from './remote_repository';
import { checkHTTP } from './net';
import {
  DEFAULT_COMBINE_DB_STRATEGY,
  DEFAULT_CONFLICT_RESOLUTION_STRATEGY,
  DEFAULT_SYNC_INTERVAL,
  MINIMUM_SYNC_INTERVAL,
  NETWORK_RETRY,
  NETWORK_RETRY_INTERVAL,
  NETWORK_TIMEOUT,
} from '../const';
import { JsonDiff } from './json_diff';
import { JsonPatchOT } from './json_patch_ot';
import { combineDatabaseWithTheirs } from './combine';
import { Validator } from '../validator';
import { Remote } from './remote';

/**
 * Implementation of GitDocumentDB#sync(options, get_sync_result)
 *
 * @throws {@link Err.RepositoryNotFoundError}
 * @throws {@link Remote.Err.UndefinedRemoteURLError} (from Sync#constructor())
 * @throws {@link Err.IntervalTooSmallError}  (from Sync#constructor())
 *
 * @throws {@link Err.RemoteRepositoryConnectError} (from Sync#init())
 * @throws {@link Err.PushWorkerError} (from Sync#init())
 * @throws {@link Err.SyncWorkerError} (from Sync#init())
 * @throws {@link Err.NoMergeBaseFoundError}
 * @throws {@link Err.PushNotAllowedError}  (from Sync#init())
 *
 * @internal
 */
export async function syncAndGetResultImpl (
  this: GitDDBInterface,
  options: RemoteOptions
): Promise<[Sync, SyncResult]> {
  const sync = new Sync(this, options);
  const syncResult = await sync.init();
  return [sync, syncResult];
}
/**
 * Implementation of GitDocumentDB#sync(options)
 *
 * @throws {@link Err.RepositoryNotFoundError}
 * @throws {@link Err.UndefinedRemoteURLError} (from Sync#constructor())
 * @throws {@link Err.IntervalTooSmallError}  (from Sync#constructor())
 *
 * @throws {@link Err.RemoteRepositoryConnectError} (from Sync#init())
 * @throws {@link Err.PushWorkerError} (from Sync#init())
 * @throws {@link Err.SyncWorkerError} (from Sync#init())
 * @throws {@link Err.NoMergeBaseFoundError}
 * @throws {@link Err.PushNotAllowedError}  (from Sync#init())
 *
 * @internal
 */
export async function syncImpl (
  this: GitDDBInterface,
  options: RemoteOptions
): Promise<Sync> {
  const sync = new Sync(this, options);
  await sync.init();
  return sync;
}

/**
 * @internal
 */
function filterChanges (syncResult: SyncResult, collectionPath: string): SyncResult {
  if (collectionPath === '') {
    return syncResult;
  }
  const filter = (changedFiles: ChangedFile[]) => {
    // eslint-disable-next-line complexity
    return changedFiles.reduce((result, changedFile) => {
      let oldFatDoc: FatDoc | undefined;
      let newFatDoc: FatDoc | undefined;
      if (changedFile.operation === 'delete' || changedFile.operation === 'update') {
        oldFatDoc = changedFile.old;
      }
      if (changedFile.operation === 'insert' || changedFile.operation === 'update') {
        // insert
        newFatDoc = changedFile.new;
      }
      if (
        (oldFatDoc && oldFatDoc.name.startsWith(collectionPath)) ||
        (newFatDoc && newFatDoc.name.startsWith(collectionPath))
      ) {
        if (oldFatDoc) {
          oldFatDoc.name = oldFatDoc.name.replace(new RegExp('^' + collectionPath), '');
          if (oldFatDoc.type === 'json') {
            oldFatDoc._id = oldFatDoc._id.replace(new RegExp('^' + collectionPath), '');
            oldFatDoc.doc._id = oldFatDoc._id;
          }
        }

        if (newFatDoc) {
          newFatDoc.name = newFatDoc.name.replace(new RegExp('^' + collectionPath), '');
          if (newFatDoc.type === 'json') {
            newFatDoc._id = newFatDoc._id.replace(new RegExp('^' + collectionPath), '');
            newFatDoc.doc._id = newFatDoc._id;
          }
        }
        result.push(changedFile);
      }
      return result;
    }, [] as ChangedFile[]);
  };
  if (
    syncResult.action === 'resolve conflicts and push' ||
    syncResult.action === 'merge and push' ||
    syncResult.action === 'resolve conflicts and push error' ||
    syncResult.action === 'merge and push error' ||
    syncResult.action === 'fast-forward merge'
  ) {
    syncResult.changes.local = filter(syncResult.changes.local);
  }
  if (
    syncResult.action === 'resolve conflicts and push' ||
    syncResult.action === 'merge and push' ||
    syncResult.action === 'push'
  ) {
    syncResult.changes.remote = filter(syncResult.changes.remote);
  }

  return syncResult;
}
/**
 * Synchronizer class
 *
 * @public
 */
export class Sync implements SyncInterface {
  /**********************************************
   * Private properties
   ***********************************************/
  private _gitDDB: GitDDBInterface;
  private _syncTimer: NodeJS.Timeout | undefined;
  private _retrySyncCounter = 0; // Decremental count
  private _isClosed = false;
  /***********************************************
   * Public properties (readonly)
   ***********************************************/

  /**
   * remoteURL
   *
   * @readonly
   * @public
   */
  get remoteURL (): string {
    return this._options.remoteUrl!;
  }

  private _remoteRepository: RemoteRepository;
  /**
   * Remote repository
   *
   * @readonly
   * @public
   */
  get remoteRepository (): RemoteRepository {
    return this._remoteRepository;
  }

  private _options: RemoteOptions;
  /**
   * Get a clone of remote options
   *
   * @readonly
   * @public
   */
  get options (): Required<RemoteOptions> {
    const newOptions: Required<RemoteOptions> = JSON.parse(JSON.stringify(this._options));
    // options include function.
    newOptions.conflictResolutionStrategy = this._options.conflictResolutionStrategy!;
    return newOptions;
  }

  private _upstreamBranch = '';
  /**
   * upstreamBranch
   *
   * @readonly
   * @public
   */
  get upstreamBranch (): string {
    return this._upstreamBranch;
  }

  /***********************************************
   * Public properties
   ***********************************************/

  /**
   * SyncEvent handlers
   *
   * @internal
   */
  eventHandlers: {
    change: { collectionPath: string; func: SyncChangeCallback }[];
    localChange: { collectionPath: string; func: SyncLocalChangeCallback }[];
    remoteChange: { collectionPath: string; func: SyncRemoteChangeCallback }[];
    combine: { collectionPath: string; func: SyncCombineDatabaseCallback }[];
    pause: { collectionPath: string; func: SyncPauseCallback }[];
    resume: { collectionPath: string; func: SyncResumeCallback }[];
    start: { collectionPath: string; func: SyncStartCallback }[];
    complete: { collectionPath: string; func: SyncCompleteCallback }[];
    error: { collectionPath: string; func: SyncErrorCallback }[];
  } = {
    change: [],
    localChange: [],
    remoteChange: [],
    combine: [],
    pause: [],
    resume: [],
    start: [],
    complete: [],
    error: [],
  };

  /**
   * JsonDiff
   *
   * @public
   */
  jsonDiff: JsonDiff;

  /**
   * JsonPatch
   *
   * @public
   */
  jsonPatch: JsonPatchOT;

  /**
   * constructor
   *
   * @throws {@link Err.UndefinedRemoteURLError}
   * @throws {@link Err.IntervalTooSmallError}
   * @throws {@link Err.InvalidAuthenticationTypeError}
   *
   * @public
   */
  // eslint-disable-next-line complexity
  constructor (gitDDB: GitDDBInterface, options?: RemoteOptions) {
    this._gitDDB = gitDDB;

    options ??= {
      remoteUrl: undefined,
      live: undefined,
      syncDirection: undefined,
      interval: undefined,
      retry: undefined,
      retryInterval: undefined,
      connection: undefined,
      combineDbStrategy: undefined,
      includeCommits: undefined,
      conflictResolutionStrategy: undefined,
    };
    // Deep clone
    this._options = JSON.parse(JSON.stringify(options));
    // Set function again
    this._options.conflictResolutionStrategy = options.conflictResolutionStrategy;

    if (this._options.remoteUrl === undefined || this._options.remoteUrl === '') {
      throw new Err.UndefinedRemoteURLError();
    }

    this._options.live ??= false;
    this._options.syncDirection ??= 'both';
    this._options.interval ??= DEFAULT_SYNC_INTERVAL;
    this._options.retryInterval ??= NETWORK_RETRY_INTERVAL;

    if (this._options.interval < MINIMUM_SYNC_INTERVAL) {
      throw new Err.IntervalTooSmallError(MINIMUM_SYNC_INTERVAL, this._options.interval);
    }
    if (this._options.interval <= this._options.retryInterval) {
      throw new Err.SyncIntervalLessThanOrEqualToRetryIntervalError(
        this._options.interval,
        this._options.retryInterval
      );
    }

    this._options.retry ??= NETWORK_RETRY;
    this._options.combineDbStrategy ??= DEFAULT_COMBINE_DB_STRATEGY;
    this._options.includeCommits ??= false;
    this._options.conflictResolutionStrategy ??= DEFAULT_CONFLICT_RESOLUTION_STRATEGY;

    this.jsonDiff = new JsonDiff(gitDDB.schema.json);
    this.jsonPatch = new JsonPatchOT();

    this._upstreamBranch = `origin/${this._gitDDB.defaultBranch}`;

    this._remoteRepository = new RemoteRepository({
      remoteUrl: this._options.remoteUrl,
      connection: this._options.connection,
    });
  }

  /***********************************************
   * Private properties
   ***********************************************/

  /**
   * Check network connection
   *
   * @internal
   */
  async canNetworkConnection (): Promise<boolean> {
    const okOrNetworkError = await checkHTTP(
      this._options.remoteUrl!,
      NETWORK_TIMEOUT
    ).catch(() => {
      return { ok: false };
    });
    return okOrNetworkError.ok;
  }

  /***********************************************
   * Public properties
   ***********************************************/

  /**
   * Create remote connection
   *
   * @remarks
   * Call init() once just after creating an instance.
   *
   * @throws {@link Err.RemoteRepositoryConnectError}
   * @throws {@link Err.PushWorkerError}
   * @throws {@link Err.NoMergeBaseFoundError}
   * @throws {@link Err.SyncWorkerError}
   *
   * @public
   */
  async init (): Promise<SyncResult> {
    this._isClosed = false;

    const onlyFetch = this._options.syncDirection === 'pull';

    const remoteResult: 'exist' | 'not_exist' = await Remote.checkFetch(
      this._gitDDB.workingDir,
      this._options,
      this._gitDDB.logger
    ).catch((err: Error) => {
      throw new Err.RemoteCheckFetchError(err.message);
    });
    if (remoteResult === 'not_exist') {
      // Try to create repository by octokit
      await this.remoteRepository.create().catch(err => {
        // App may check permission or
        throw new Err.CannotCreateRemoteRepositoryError(err.message);
      });
      this._upstreamBranch = '';
    }
    if (!onlyFetch) {
      await Remote.checkPush(
        this._gitDDB.workingDir,
        this._options,
        this._gitDDB.logger
      ).catch((err: Error) => {
        throw new Err.RemoteCheckPushError(err.message);
      });
    }

    let syncResult: SyncResult = {
      action: 'nop',
    };
    if (this._options === 'pull') {
      /**
       * TODO: Implement case when sync_direction is 'pull'.
       */
    }
    else if (this.upstreamBranch === '') {
      this._gitDDB.logger.debug('upstream_branch is empty. tryPush..');
      // Empty upstream_branch shows that an empty repository has been created on a remote site.
      // trySync() pushes local commits to the remote branch.
      syncResult = await this.tryPush();

      // An upstream branch must be set to a local branch after the first push
      // because refs/remotes/origin/main is not created until the first push.
      await git.setConfig({
        fs,
        dir: this._gitDDB.workingDir,
        path: `branch.${this._gitDDB.defaultBranch}.remote`,
        value: 'origin',
      });

      await git.setConfig({
        fs,
        dir: this._gitDDB.workingDir,
        path: `branch.${this._gitDDB.defaultBranch}.merge`,
        value: `refs/heads/${this._gitDDB.defaultBranch}`,
      });

      this._upstreamBranch = `origin/${this._gitDDB.defaultBranch}`;
    }
    else if (this._options.syncDirection === 'push') {
      this._gitDDB.logger.debug('upstream_branch exists. tryPush..');
      syncResult = await this.tryPush();
    }
    else if (this._options.syncDirection === 'both') {
      this._gitDDB.logger.debug('upstream_branch exists. trySync..');
      syncResult = await this.trySync();
    }

    if (this._options.live) {
      if (this._syncTimer === undefined) {
        this.eventHandlers.resume.forEach(listener => {
          listener.func();
        });
        this._syncTimer = setInterval(() => {
          this.trySync().catch(() => undefined);
        }, this._options.interval!);
      }
    }
    return syncResult;
  }

  /**
   * Pause synchronization
   *
   * @public
   */
  pause () {
    if (!this._options.live) return false;

    // Cancel retrying
    this._retrySyncCounter = 0;
    if (this._syncTimer) {
      clearInterval(this._syncTimer);
    }
    this._options.live = false;

    this.eventHandlers.pause.forEach(listener => {
      listener.func();
    });
    return true;
  }

  /**
   * Resume synchronization
   *
   * @remarks
   * Give new settings if needed.
   *
   * @throws {@link Err.IntervalTooSmallError}
   *
   * @public
   */
  resume (options?: { interval?: number; retry?: number }) {
    if (this._isClosed) return false;
    if (this._options.live) return false;

    options ??= {
      interval: undefined,
      retry: undefined,
    };
    if (options.interval !== undefined) {
      if (options.interval >= MINIMUM_SYNC_INTERVAL) {
        this._options.interval = options.interval;
      }
      else {
        throw new Err.IntervalTooSmallError(MINIMUM_SYNC_INTERVAL, options.interval);
      }
    }
    if (options.retry !== undefined) {
      this._options.retry = options.retry;
    }

    this._options.live = true;
    this._syncTimer = setInterval(() => {
      this.trySync().catch(() => undefined);
    }, this._options.interval!);

    this.eventHandlers.resume.forEach(listener => {
      listener.func();
    });

    return true;
  }

  /**
   * Stop and clear remote connection
   *
   * @public
   */
  close () {
    this._isClosed = true;
    this.pause();
    this.eventHandlers = {
      change: [],
      localChange: [],
      remoteChange: [],
      combine: [],
      pause: [],
      resume: [],
      start: [],
      complete: [],
      error: [],
    };
  }

  /**
   * Try to push with retries
   *
   * @throws {@link Err.PushNotAllowedError} (from this and enqueuePushTask)
   * @throws {@link Err.PushWorkerError} (from this and enqueuePushTask)
   * @throws {@link Remote.Err.UnfetchedCommitExistsError} (from this and enqueuePushTask)
   *
   * @public
   */
  // eslint-disable-next-line complexity
  async tryPush (): Promise<SyncResultPush | SyncResultCancel> {
    if (this._isClosed) return { action: 'canceled' };
    if (this._options.syncDirection === 'pull') {
      throw new Err.PushNotAllowedError(this._options.syncDirection);
    }
    if (this._retrySyncCounter === 0) {
      this._retrySyncCounter = this._options.retry! + 1;
    }

    while (this._retrySyncCounter > 0) {
      // eslint-disable-next-line no-await-in-loop
      const resultOrError = await this.enqueuePushTask().catch((err: Error) => err);

      let error: Error | undefined;
      let result: SyncResultPush | SyncResultCancel | undefined;
      if (resultOrError instanceof Error) {
        error = resultOrError;
      }
      else {
        result = resultOrError;
      }

      if (error instanceof Remote.Err.UnfetchedCommitExistsError) {
        if (this._options.syncDirection === 'push') {
          if (this._options.combineDbStrategy === 'replace-with-ours') {
            // TODO: Exec replace-with-ours instead of throw error
          }
          else {
            throw error;
          }
        }
      }

      if (error) {
        this._gitDDB.logger.debug('Push failed: ' + error.message);
        this._retrySyncCounter--;
        if (this._retrySyncCounter === 0) {
          throw error;
        }
      }

      if (result && result.action === 'canceled') {
        return result;
      }

      if (error === undefined && result !== undefined) {
        this._retrySyncCounter = 0;
        return result;
      }

      // eslint-disable-next-line no-await-in-loop
      if (!(await this.canNetworkConnection())) {
        // Retry to connect due to network error.
        this._gitDDB.logger.debug(
          CONSOLE_STYLE.bgRed().tag()`...retryPush: ${this.currentRetries().toString()}`
        );
        // eslint-disable-next-line no-await-in-loop
        await sleep(this._options.retryInterval!);
      }
      else {
        this._retrySyncCounter = 0;
        throw error;
      }
    }
    // This line is reached when cancel() set _retrySyncCounter to 0;
    const cancel: SyncResultCancel = { action: 'canceled' };
    this._retrySyncCounter = 0;
    return cancel;
  }

  /**
   * Try to sync with retries
   *
   * @throws {@link Err.PushNotAllowedError} (from this and enqueueSyncTask)
   * @throws {@link Err.SyncWorkerError} (from enqueueSyncTask)
   * @throws {@link Err.NoMergeBaseFoundError} (from enqueueSyncTask)
   * @throws {@link Remote.Err.UnfetchedCommitExistsError} (from enqueueSyncTask)
   *
   * @public
   */
  // eslint-disable-next-line complexity
  async trySync (): Promise<SyncResult> {
    if (this._isClosed) return { action: 'canceled' };
    if (this._options.syncDirection === 'pull') {
      throw new Err.PushNotAllowedError(this._options.syncDirection);
    }
    if (this._retrySyncCounter === 0) {
      this._retrySyncCounter = this._options.retry! + 1;
    }

    while (this._retrySyncCounter > 0) {
      // eslint-disable-next-line no-await-in-loop
      const resultOrError = await this.enqueueSyncTask().catch((err: Error) => err);

      let error: Error | undefined;
      let result: SyncResult | undefined;
      if (resultOrError instanceof Error) {
        error = resultOrError;
      }
      else if (
        resultOrError.action === 'merge and push error' ||
        resultOrError.action === 'resolve conflicts and push error'
      ) {
        result = resultOrError;
        error = resultOrError.error;
      }
      else {
        result = resultOrError;
      }

      if (error instanceof Remote.Err.NoMergeBaseFoundError) {
        if (this._options.combineDbStrategy === 'throw-error') {
          throw error;
        }
        else if (this._options.combineDbStrategy === 'combine-head-with-theirs') {
          // return SyncResultCombineDatabase
          // eslint-disable-next-line no-await-in-loop
          const syncResultCombineDatabase = await combineDatabaseWithTheirs(
            this._gitDDB,
            this._options
          ).catch(err => {
            throw new Err.CombineDatabaseError(err.message);
          });
          // eslint-disable-next-line no-loop-func
          this.eventHandlers.combine.forEach(callback =>
            callback.func(syncResultCombineDatabase.duplicates)
          );
          return syncResultCombineDatabase;
        }
      }

      if (error) {
        this._gitDDB.logger.debug('Sync or push failed: ' + error.message);
        this._retrySyncCounter--;
        if (this._retrySyncCounter === 0) {
          throw error;
        }
      }

      if (result && result.action === 'canceled') {
        return result;
      }

      if (error === undefined && result !== undefined) {
        // No error
        this._retrySyncCounter = 0;
        return result;
      }

      if (
        // eslint-disable-next-line no-await-in-loop
        !(await this.canNetworkConnection()) ||
        error instanceof Remote.Err.UnfetchedCommitExistsError
      ) {
        // Retry for the following reasons:
        // - Network connection may be improved next time.
        // - Problem will be resolved by sync again.
        //   - 'push' action throws UnfetchedCommitExistsError
        //   - push_worker in 'merge and push' action throws UnfetchedCommitExistsError
        //   - push_worker in 'resolve conflicts and push' action throws UnfetchedCommitExistsError
        this._gitDDB.logger.debug(
          CONSOLE_STYLE.bgRed().tag()`...retrySync: ${this.currentRetries().toString()}`
        );
        // eslint-disable-next-line no-await-in-loop
        await sleep(this._options.retryInterval!);
      }
      else {
        // Throw error
        this._retrySyncCounter = 0;
        throw error;
      }
    }
    // This line is reached when cancel() set _retrySyncCounter to 0;
    const cancel: SyncResultCancel = { action: 'canceled' };
    this._retrySyncCounter = 0;
    return cancel;
  }

  /**
   * Enqueue push task to TaskQueue
   *
   * @throws {@link Err.PushWorkerError}
   * @throws {@link Remote.Err.UnfetchedCommitExistsError}
   * @throws {@link Err.PushNotAllowedError}
   *
   * @public
   */
  enqueuePushTask (): Promise<SyncResultPush | SyncResultCancel> {
    if (this._options.syncDirection === 'pull') {
      throw new Err.PushNotAllowedError(this._options.syncDirection);
    }
    const taskId = this._gitDDB.taskQueue.newTaskId();
    const callback = (
      resolve: (value: SyncResultPush | SyncResultCancel) => void,
      reject: (reason: any) => void
    ) => (
      beforeResolve: () => void,
      beforeReject: () => void,
      taskMetadata: TaskMetadata
    ) =>
      pushWorker(this._gitDDB, this, taskMetadata)
        .then((syncResultPush: SyncResultPush) => {
          this._gitDDB.logger.debug(
            CONSOLE_STYLE.bgWhite().fgBlack().tag()`push_worker: ${JSON.stringify(
              syncResultPush
            )}`
          );

          this.eventHandlers.change.forEach(listener => {
            const filteredSyncResultPush = filterChanges(
              JSON.parse(JSON.stringify(syncResultPush)),
              listener.collectionPath
            ) as SyncResultPush;
            listener.func(filteredSyncResultPush, {
              ...taskMetadata,
              collectionPath: listener.collectionPath,
            });
          });
          if (syncResultPush.action === 'push') {
            this.eventHandlers.remoteChange.forEach(listener => {
              const filteredSyncResultPush = filterChanges(
                JSON.parse(JSON.stringify(syncResultPush)),
                listener.collectionPath
              ) as SyncResultPush;
              listener.func(filteredSyncResultPush.changes.remote, {
                ...taskMetadata,
                collectionPath: listener.collectionPath,
              });
            });
          }
          this.eventHandlers.complete.forEach(listener => {
            listener.func({ ...taskMetadata, collectionPath: listener.collectionPath });
          });

          beforeResolve();
          resolve(syncResultPush);
        })
        .catch(err => {
          // console.log(`Error in push_worker: ${err}`);
          if (!(err instanceof Remote.Err.UnfetchedCommitExistsError)) {
            err = new Err.PushWorkerError(err.message);
          }
          this.eventHandlers.error.forEach(listener => {
            listener.func(err, {
              ...taskMetadata,
              collectionPath: listener.collectionPath,
            });
          });

          beforeReject();
          reject(err);
        });

    const cancel = (resolve: (value: SyncResultCancel) => void) => () => {
      const result: SyncResultCancel = { action: 'canceled' };
      resolve(result);
    };

    const task = (
      resolve: (value: SyncResultPush | SyncResultCancel) => void,
      reject: (reason: any) => void
    ): Task => {
      return {
        label: 'push',
        taskId: taskId!,
        func: callback(resolve, reject),
        cancel: cancel(resolve),
      };
    };

    return new Promise(
      (resolve: (value: SyncResultPush | SyncResultCancel) => void, reject) => {
        this._gitDDB.taskQueue.pushToTaskQueue(task(resolve, reject));
        // this._gitDDB.taskQueue.unshiftSyncTaskToTaskQueue(task(resolve, reject));
      }
    );
  }

  /**
   * Enqueue sync task to TaskQueue
   *
   * @throws {@link Err.SyncWorkerError}
   * @throws {@link Err.NoMergeBaseFoundError}
   * @throws {@link Remote.Err.UnfetchedCommitExistsError}
   * @throws {@link Err.PushNotAllowedError}
   *
   * @public
   */
  enqueueSyncTask (): Promise<SyncResult> {
    if (this._options.syncDirection === 'pull') {
      throw new Err.PushNotAllowedError(this._options.syncDirection);
    }
    const taskId = this._gitDDB.taskQueue.newTaskId();
    const callback = (
      resolve: (value: SyncResult) => void,
      reject: (reason: any) => void
    ) => (
      beforeResolve: () => void,
      beforeReject: () => void,
      taskMetadata: TaskMetadata
    ) =>
      syncWorker(this._gitDDB, this, taskMetadata)
        // eslint-disable-next-line complexity
        .then(syncResult => {
          this._gitDDB.logger.debug(
            CONSOLE_STYLE.bgWhite().fgBlack().tag()`sync_worker: ${JSON.stringify(
              syncResult
            )}`
          );

          if (
            syncResult.action === 'resolve conflicts and push' ||
            syncResult.action === 'merge and push' ||
            syncResult.action === 'resolve conflicts and push error' ||
            syncResult.action === 'merge and push error' ||
            syncResult.action === 'fast-forward merge' ||
            syncResult.action === 'push'
          ) {
            this.eventHandlers.change.forEach(listener => {
              let syncResultForChangeEvent = JSON.parse(JSON.stringify(syncResult));
              syncResultForChangeEvent = filterChanges(
                syncResultForChangeEvent,
                listener.collectionPath
              ) as SyncResult;

              listener.func(syncResultForChangeEvent, {
                ...taskMetadata,
                collectionPath: listener.collectionPath,
              });
            });
          }

          if (
            syncResult.action === 'resolve conflicts and push' ||
            syncResult.action === 'merge and push' ||
            syncResult.action === 'resolve conflicts and push error' ||
            syncResult.action === 'merge and push error' ||
            syncResult.action === 'fast-forward merge'
          ) {
            this.eventHandlers.localChange.forEach(listener => {
              let syncResultForLocalChangeEvent = JSON.parse(JSON.stringify(syncResult));
              syncResultForLocalChangeEvent = filterChanges(
                syncResultForLocalChangeEvent,
                listener.collectionPath
              ) as SyncResult;
              listener.func(syncResultForLocalChangeEvent.changes.local, {
                ...taskMetadata,
                collectionPath: listener.collectionPath,
              });
            });
          }

          if (
            syncResult.action === 'resolve conflicts and push' ||
            syncResult.action === 'merge and push' ||
            syncResult.action === 'push'
          ) {
            this.eventHandlers.remoteChange.forEach(listener => {
              let syncResultForRemoteChangeEvent = JSON.parse(JSON.stringify(syncResult));
              syncResultForRemoteChangeEvent = filterChanges(
                syncResultForRemoteChangeEvent,
                listener.collectionPath
              ) as SyncResult;
              listener.func(syncResultForRemoteChangeEvent.changes.remote, {
                ...taskMetadata,
                collectionPath: listener.collectionPath,
              });
            });
          }

          this.eventHandlers.complete.forEach(listener =>
            listener.func({ ...taskMetadata, collectionPath: listener.collectionPath })
          );

          beforeResolve();
          resolve(syncResult);
        })
        .catch(err => {
          // console.log(`Error in sync_worker: ${err}`);
          if (
            !(
              err instanceof Remote.Err.NoMergeBaseFoundError ||
              err instanceof Remote.Err.UnfetchedCommitExistsError
            )
          ) {
            err = new Err.SyncWorkerError(err.message);
          }
          this.eventHandlers.error.forEach(listener => {
            listener.func(err, {
              ...taskMetadata,
              collectionPath: listener.collectionPath,
            });
          });

          beforeReject();
          reject(err);
        });

    const cancel = (resolve: (value: SyncResultCancel) => void) => () => {
      const result: SyncResultCancel = { action: 'canceled' };
      resolve(result);
    };

    const task = (
      resolve: (value: SyncResult) => void,
      reject: (reason: any) => void
    ): Task => {
      return {
        label: 'sync',
        taskId: taskId!,
        func: callback(resolve, reject),
        cancel: cancel(resolve),
      };
    };

    return new Promise((resolve: (value: SyncResult) => void, reject) => {
      this._gitDDB.taskQueue.pushToTaskQueue(task(resolve, reject));
      // this._gitDDB.taskQueue.unshiftSyncTaskToTaskQueue(task(resolve, reject));
    });
  }

  /**
   * Return current retry count (incremental)
   *
   * @public
   */
  currentRetries (): number {
    let retries = this._options.retry! - this._retrySyncCounter + 1;
    if (this._retrySyncCounter === 0) retries = 0;
    return retries;
  }

  /**
   * Add SyncEvent handler
   *
   * @eventProperty
   * @public
   */
  // eslint-disable-next-line complexity
  on (event: SyncEvent, callback: SyncCallback, collectionPath = '') {
    if (this._isClosed) return this;
    collectionPath = Validator.normalizeCollectionPath(collectionPath);
    if (event === 'change')
      this.eventHandlers[event].push({
        collectionPath,
        func: callback as SyncChangeCallback,
      });
    if (event === 'localChange')
      this.eventHandlers[event].push({
        collectionPath,
        func: callback as SyncLocalChangeCallback,
      });
    if (event === 'remoteChange')
      this.eventHandlers[event].push({
        collectionPath,
        func: callback as SyncRemoteChangeCallback,
      });
    if (event === 'combine')
      this.eventHandlers[event].push({
        collectionPath,
        func: callback as SyncCombineDatabaseCallback,
      });
    if (event === 'pause')
      this.eventHandlers[event].push({
        collectionPath,
        func: callback as SyncPauseCallback,
      });
    if (event === 'resume')
      this.eventHandlers[event].push({
        collectionPath,
        func: callback as SyncResumeCallback,
      });
    if (event === 'start')
      this.eventHandlers[event].push({
        collectionPath,
        func: callback as SyncStartCallback,
      });
    if (event === 'complete')
      this.eventHandlers[event].push({
        collectionPath,
        func: callback as SyncCompleteCallback,
      });
    if (event === 'error')
      this.eventHandlers[event].push({
        collectionPath,
        func: callback as SyncErrorCallback,
      });

    return this;
  }

  /**
   * Remove SyncEvent handler
   *
   * @eventProperty
   * @public
   */
  off (event: SyncEvent, callback: SyncCallback) {
    if (this._isClosed) return this;
    // @ts-ignore
    this.eventHandlers[event] = this.eventHandlers[event].filter(
      (listener: { collectionPath: string; func: (res?: any) => void }) => {
        return listener.func !== callback;
      }
    );
    return this;
  }
}
