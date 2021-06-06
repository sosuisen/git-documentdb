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
import nodegit from '@sosuisen/nodegit';
import { ConsoleStyle, sleep } from '../utils';
import {
  CombineDatabaseError,
  IntervalTooSmallError,
  NoMergeBaseFoundError,
  PushNotAllowedError,
  PushWorkerError,
  RemoteRepositoryConnectError,
  RepositoryNotOpenError,
  SyncIntervalLessThanOrEqualToRetryIntervalError,
  SyncWorkerError,
  UndefinedRemoteURLError,
  UnfetchedCommitExistsError,
} from '../error';
import {
  RemoteOptions,
  SyncActiveCallback,
  SyncCallback,
  SyncChangeCallback,
  SyncCombineDatabaseCallback,
  SyncCompleteCallback,
  SyncErrorCallback,
  SyncEvent,
  SyncLocalChangeCallback,
  SyncPausedCallback,
  SyncRemoteChangeCallback,
  SyncResult,
  SyncResultCancel,
  SyncResultPush,
  SyncStartCallback,
  Task,
  TaskMetadata,
} from '../types';
import { ISync } from '../types_sync';
import { IDocumentDB } from '../types_gitddb';
import { sync_worker } from './sync_worker';
import { push_worker } from './push_worker';
import { createCredential } from './authentication';
import { RemoteRepository } from './remote_repository';
import { checkHTTP } from './net';
import {
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

/**
 * Implementation of GitDocumentDB#sync(options, get_sync_result)
 *
 * @throws {@link RepositoryNotFoundError}
 * @throws {@link UndefinedRemoteURLError} (from Sync#constructor())
 * @throws {@link IntervalTooSmallError}  (from Sync#constructor())
 *
 * @throws {@link RemoteRepositoryConnectError} (from Sync#init())
 * @throws {@link PushWorkerError} (from Sync#init())
 * @throws {@link SyncWorkerError} (from Sync#init())
 * @throws {@link NoMergeBaseFoundError}
 * @throws {@link PushNotAllowedError}  (from Sync#init())
 *
 * @internal
 */
export async function syncAndGetResultImpl (
  this: IDocumentDB,
  options: RemoteOptions
): Promise<[Sync, SyncResult]> {
  const repos = this.repository();
  if (repos === undefined) {
    throw new RepositoryNotOpenError();
  }
  const sync = new Sync(this, options);
  const syncResult = await sync.init(repos);
  return [sync, syncResult];
}
/**
 * Implementation of GitDocumentDB#sync(options)
 *
 * @throws {@link RepositoryNotFoundError}
 * @throws {@link UndefinedRemoteURLError} (from Sync#constructor())
 * @throws {@link IntervalTooSmallError}  (from Sync#constructor())
 *
 * @throws {@link RemoteRepositoryConnectError} (from Sync#init())
 * @throws {@link PushWorkerError} (from Sync#init())
 * @throws {@link SyncWorkerError} (from Sync#init())
 * @throws {@link NoMergeBaseFoundError}
 * @throws {@link PushNotAllowedError}  (from Sync#init())
 *
 * @internal
 */
export async function syncImpl (this: IDocumentDB, options: RemoteOptions): Promise<Sync> {
  const repos = this.repository();
  if (repos === undefined) {
    throw new RepositoryNotOpenError();
  }
  const sync = new Sync(this, options);
  await sync.init(repos);
  return sync;
}

/**
 * Synchronizer class
 */
export class Sync implements ISync {
  private _gitDDB: IDocumentDB;
  private _options: RemoteOptions;
  private _checkoutOptions: nodegit.CheckoutOptions;
  private _syncTimer: NodeJS.Timeout | undefined;
  private _retrySyncCounter = 0; // Decremental count

  remoteRepository: RemoteRepository;

  /**
   * Return current retry count (incremental)
   */
  currentRetries (): number {
    let retries = this._options.retry! - this._retrySyncCounter + 1;
    if (this._retrySyncCounter === 0) retries = 0;
    return retries;
  }

  /**
   * SyncEvent handlers
   *
   * @internal
   */
  eventHandlers: {
    change: SyncChangeCallback[];
    localChange: SyncLocalChangeCallback[];
    remoteChange: SyncRemoteChangeCallback[];
    combine: SyncCombineDatabaseCallback[];
    paused: SyncPausedCallback[];
    active: SyncActiveCallback[];
    start: SyncStartCallback[];
    complete: SyncCompleteCallback[];
    error: SyncErrorCallback[];
  } = {
    change: [],
    localChange: [],
    remoteChange: [],
    combine: [],
    paused: [],
    active: [],
    start: [],
    complete: [],
    error: [],
  };

  upstream_branch = '';

  credential_callbacks: { [key: string]: any };
  author: nodegit.Signature;
  committer: nodegit.Signature;

  /**
   * JsonDiff
   */
  jsonDiff: JsonDiff;

  /**
   * JsonPatch
   */
  jsonPatch: JsonPatchOT;

  /**
   * constructor
   *
   * @throws {@link UndefinedRemoteURLError}
   * @throws {@link IntervalTooSmallError}
   * @throws {@link InvalidAuthenticationTypeError}
   */
  constructor (_gitDDB: IDocumentDB, _options?: RemoteOptions) {
    this._gitDDB = _gitDDB;

    _options ??= {
      remote_url: undefined,
      live: undefined,
      sync_direction: undefined,
      interval: undefined,
      retry: undefined,
      retry_interval: undefined,
      connection: undefined,
      combine_db_strategy: undefined,
      include_commits: undefined,
      conflict_resolution_strategy: undefined,
    };
    // Deep clone
    this._options = JSON.parse(JSON.stringify(_options));
    // Set function again
    this._options.conflict_resolution_strategy = _options.conflict_resolution_strategy;

    if (this._options.remote_url === undefined || this._options.remote_url === '') {
      /**
       * TODO: Check upstream branch of this repository
       * Set remote_url to the upstream branch and cloneRepository() if exists.
       */
      throw new UndefinedRemoteURLError();
    }

    this._options.live ??= false;
    this._options.sync_direction ??= 'both';
    this._options.interval ??= DEFAULT_SYNC_INTERVAL;
    this._options.retry_interval ??= NETWORK_RETRY_INTERVAL;

    if (this._options.interval < MINIMUM_SYNC_INTERVAL) {
      throw new IntervalTooSmallError(MINIMUM_SYNC_INTERVAL, this._options.interval);
    }
    if (this._options.interval <= this._options.retry_interval) {
      throw new SyncIntervalLessThanOrEqualToRetryIntervalError(
        this._options.interval,
        this._options.retry_interval
      );
    }

    this._options.retry ??= NETWORK_RETRY;
    this._options.combine_db_strategy ??= 'combine-head-with-theirs';
    this._options.include_commits ??= false;
    this._options.conflict_resolution_strategy ??= DEFAULT_CONFLICT_RESOLUTION_STRATEGY;

    this.jsonDiff = new JsonDiff(_gitDDB.schema.json);
    this.jsonPatch = new JsonPatchOT();

    this.credential_callbacks = createCredential(this._options);

    this.upstream_branch = `origin/${this._gitDDB.defaultBranch}`;

    this.author = nodegit.Signature.now(
      this._gitDDB.gitAuthor.name,
      this._gitDDB.gitAuthor.email
    );
    this.committer = nodegit.Signature.now(
      this._gitDDB.gitAuthor.name,
      this._gitDDB.gitAuthor.email
    );

    this._checkoutOptions = new nodegit.CheckoutOptions();
    // nodegit.Checkout.STRATEGY.USE_OURS: For unmerged files, checkout stage 2 from index
    this._checkoutOptions.checkoutStrategy =
      nodegit.Checkout.STRATEGY.FORCE | nodegit.Checkout.STRATEGY.USE_OURS;

    this.remoteRepository = new RemoteRepository({
      remote_url: this._options.remote_url,
      connection: this._options.connection,
    });
  }

  /**
   * Check network connection
   *
   * @internal
   */
  async canNetworkConnection (): Promise<boolean> {
    const okOrNetworkError = await checkHTTP(
      this._options.remote_url!,
      NETWORK_TIMEOUT
    ).catch(() => {
      return { ok: false };
    });
    return okOrNetworkError.ok;
  }

  /**
   * Create remote connection
   *
   * @remarks
   * Call init() once just after creating instance.
   *
   * @throws {@link RemoteRepositoryConnectError}
   * @throws {@link PushWorkerError}
   * @throws {@link NoMergeBaseFoundError}
   * @throws {@link SyncWorkerError}
   *
   */
  async init (repos: nodegit.Repository): Promise<SyncResult> {
    const onlyFetch = this._options.sync_direction === 'pull';
    const [gitResult, remoteResult] = await this.remoteRepository
      .connect(this._gitDDB.repository()!, this.credential_callbacks, onlyFetch)
      .catch(err => {
        throw new RemoteRepositoryConnectError(err.message);
      });
    this._gitDDB.getLogger().debug('git remote: ' + gitResult);
    this._gitDDB.getLogger().debug('remote repository: ' + remoteResult);
    if (remoteResult === 'create') {
      this.upstream_branch = '';
    }
    let syncResult: SyncResult = {
      action: 'nop',
    };
    if (this._options === 'pull') {
      /**
       * TODO: Implement case when sync_direction is 'pull'.
       */
    }
    else if (this.upstream_branch === '') {
      this._gitDDB.getLogger().debug('upstream_branch is empty. tryPush..');
      // Empty upstream_branch shows that an empty repository has been created on a remote site.
      // _trySync() pushes local commits to the remote branch.
      syncResult = await this.tryPush();

      // An upstream branch must be set to a local branch after the first push
      // because refs/remotes/origin/main is not created until the first push.
      await nodegit.Branch.setUpstream(
        await repos.getBranch(this._gitDDB.defaultBranch),
        `origin/${this._gitDDB.defaultBranch}`
      );
      this.upstream_branch = `origin/${this._gitDDB.defaultBranch}`;
    }
    else if (this._options.sync_direction === 'push') {
      this._gitDDB.getLogger().debug('upstream_branch exists. tryPush..');
      syncResult = await this.tryPush();
    }
    else if (this._options.sync_direction === 'both') {
      this._gitDDB.getLogger().debug('upstream_branch exists. trySync..');
      syncResult = await this.trySync();
    }

    if (this._options.live) {
      if (this._syncTimer === undefined) {
        this.eventHandlers.active.forEach(func => {
          func();
        });
        this._syncTimer = setInterval(() => {
          this.trySync().catch(() => undefined);
        }, this._options.interval!);
      }
    }
    return syncResult;
  }

  /**
   * Get remoteURL
   *
   */
  remoteURL () {
    return this._options.remote_url!;
  }

  /**
   * Get remote options (read only)
   */
  options (): Required<RemoteOptions> {
    const newOptions: Required<RemoteOptions> = JSON.parse(JSON.stringify(this._options));
    // options include function.
    newOptions.conflict_resolution_strategy = this._options.conflict_resolution_strategy!;
    return newOptions;
  }

  /**
   * Stop synchronization
   *
   */
  cancel () {
    if (!this._options.live) return false;

    // Cancel retrying
    this._retrySyncCounter = 0;
    if (this._syncTimer) {
      clearInterval(this._syncTimer);
    }
    this._options.live = false;

    this.eventHandlers.paused.forEach(func => {
      func();
    });
    return true;
  }

  /**
   * Alias of cancel()
   *
   */
  pause () {
    return this.cancel();
  }

  /**
   * Resume synchronization
   *
   * @remarks
   * Give new settings if needed.
   *
   * @throws {@link IntervalTooSmallError}
   *
   */
  resume (options?: { interval?: number; retry?: number }) {
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
        throw new IntervalTooSmallError(MINIMUM_SYNC_INTERVAL, options.interval);
      }
    }
    if (options.retry !== undefined) {
      this._options.retry = options.retry;
    }

    if (this._gitDDB.repository() !== undefined) {
      this._options.live = true;
      this._syncTimer = setInterval(() => {
        this.trySync().catch(() => undefined);
      }, this._options.interval!);
    }

    this.eventHandlers.active.forEach(func => {
      func();
    });

    return true;
  }

  /**
   * Try to push with retries
   *
   * @throws {@link PushNotAllowedError} (from this and enqueuePushTask)
   * @throws {@link PushWorkerError} (from this and enqueuePushTask)
   * @throws {@link UnfetchedCommitExistsError} (from this and enqueuePushTask)
   */
  // eslint-disable-next-line complexity
  async tryPush (): Promise<SyncResultPush | SyncResultCancel> {
    if (this._options.sync_direction === 'pull') {
      throw new PushNotAllowedError(this._options.sync_direction);
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

      if (error instanceof UnfetchedCommitExistsError) {
        if (this._options.sync_direction === 'push') {
          if (this._options.combine_db_strategy === 'replace-with-ours') {
            // TODO: Exec replace-with-ours instead of throw error
          }
          else {
            throw error;
          }
        }
      }

      if (error) {
        this._gitDDB.getLogger().debug('Push failed: ' + error.message);
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
        this._gitDDB
          .getLogger()
          .debug(
            ConsoleStyle.BgRed().tag()`...retryPush: ${this.currentRetries().toString()}`
          );
        // eslint-disable-next-line no-await-in-loop
        await sleep(this._options.retry_interval!);
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
   * @throws {@link PushNotAllowedError} (from this and enqueueSyncTask)
   * @throws {@link SyncWorkerError} (from enqueueSyncTask)
   * @throws {@link NoMergeBaseFoundError} (from enqueueSyncTask)
   * @throws {@link UnfetchedCommitExistsError} (from enqueueSyncTask)
   */
  // eslint-disable-next-line complexity
  async trySync (): Promise<SyncResult> {
    if (this._options.sync_direction === 'pull') {
      throw new PushNotAllowedError(this._options.sync_direction);
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

      if (error instanceof NoMergeBaseFoundError) {
        if (this._options.combine_db_strategy === 'throw-error') {
          throw error;
        }
        else if (this._options.combine_db_strategy === 'combine-head-with-theirs') {
          // return SyncResultCombineDatabase
          // eslint-disable-next-line no-await-in-loop
          const syncResultCombineDatabase = await combineDatabaseWithTheirs(
            this._gitDDB,
            this.options()
          ).catch(err => {
            throw new CombineDatabaseError(err.message);
          });
          // eslint-disable-next-line no-loop-func
          this.eventHandlers.combine.forEach(func =>
            func(syncResultCombineDatabase.duplicates)
          );
          return syncResultCombineDatabase;
        }
      }

      if (error) {
        this._gitDDB.getLogger().debug('Sync or push failed: ' + error.message);
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
        error instanceof UnfetchedCommitExistsError
      ) {
        // Retry for the following reasons:
        // - Network connection may be improved next time.
        // - Problem will be resolved by sync again.
        //   - 'push' action throws UnfetchedCommitExistsError
        //   - push_worker in 'merge and push' action throws UnfetchedCommitExistsError
        //   - push_worker in 'resolve conflicts and push' action throws UnfetchedCommitExistsError
        this._gitDDB
          .getLogger()
          .debug(
            ConsoleStyle.BgRed().tag()`...retrySync: ${this.currentRetries().toString()}`
          );
        // eslint-disable-next-line no-await-in-loop
        await sleep(this._options.retry_interval!);
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
   * @throws {@link PushWorkerError}
   * @throws {@link UnfetchedCommitExistsError}
   * @throws {@link PushNotAllowedError}
   */
  enqueuePushTask (): Promise<SyncResultPush | SyncResultCancel> {
    if (this._options.sync_direction === 'pull') {
      throw new PushNotAllowedError(this._options.sync_direction);
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
      push_worker(this._gitDDB, this, taskMetadata)
        .then((syncResultPush: SyncResultPush) => {
          this._gitDDB
            .getLogger()
            .debug(
              ConsoleStyle.BgWhite().FgBlack().tag()`push_worker: ${JSON.stringify(
                syncResultPush
              )}`
            );

          this.eventHandlers.change.forEach(func => func(syncResultPush, taskMetadata));
          if (syncResultPush.action === 'push') {
            this.eventHandlers.remoteChange.forEach(func =>
              func(syncResultPush.changes.remote, taskMetadata)
            );
          }
          this.eventHandlers.complete.forEach(func => func(taskMetadata));

          beforeResolve();
          resolve(syncResultPush);
        })
        .catch(err => {
          // console.log(`Error in push_worker: ${err}`);
          if (!(err instanceof UnfetchedCommitExistsError)) {
            err = new PushWorkerError(err.message);
          }
          this.eventHandlers.error.forEach(func => {
            func(err, taskMetadata);
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
   * @throws {@link SyncWorkerError}
   * @throws {@link NoMergeBaseFoundError}
   * @throws {@link UnfetchedCommitExistsError}
   * @throws {@link PushNotAllowedError}
   */
  enqueueSyncTask (): Promise<SyncResult> {
    if (this._options.sync_direction === 'pull') {
      throw new PushNotAllowedError(this._options.sync_direction);
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
      sync_worker(this._gitDDB, this, taskMetadata)
        // eslint-disable-next-line complexity
        .then(syncResult => {
          this._gitDDB
            .getLogger()
            .debug(
              ConsoleStyle.BgWhite().FgBlack().tag()`sync_worker: ${JSON.stringify(
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
            this.eventHandlers.change.forEach(func => func(syncResult, taskMetadata));
            if (
              syncResult.action === 'resolve conflicts and push' ||
              syncResult.action === 'merge and push' ||
              syncResult.action === 'resolve conflicts and push error' ||
              syncResult.action === 'merge and push error' ||
              syncResult.action === 'fast-forward merge'
            ) {
              this.eventHandlers.localChange.forEach(func =>
                func(syncResult.changes.local, taskMetadata)
              );
            }
            if (
              syncResult.action === 'resolve conflicts and push' ||
              syncResult.action === 'merge and push' ||
              syncResult.action === 'push'
            ) {
              this.eventHandlers.remoteChange.forEach(func =>
                func(syncResult.changes.remote, taskMetadata)
              );
            }
          }
          this.eventHandlers.complete.forEach(func => func(taskMetadata));

          beforeResolve();
          resolve(syncResult);
        })
        .catch(err => {
          // console.log(`Error in sync_worker: ${err}`);
          if (
            !(
              err instanceof NoMergeBaseFoundError ||
              err instanceof UnfetchedCommitExistsError
            )
          ) {
            err = new SyncWorkerError(err.message);
          }
          this.eventHandlers.error.forEach(func => {
            func(err, taskMetadata);
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
   * Add SyncEvent handler
   *
   */
  on (event: SyncEvent, callback: SyncCallback) {
    if (event === 'change') this.eventHandlers[event].push(callback as SyncChangeCallback);
    if (event === 'localChange')
      this.eventHandlers[event].push(callback as SyncLocalChangeCallback);
    if (event === 'remoteChange')
      this.eventHandlers[event].push(callback as SyncRemoteChangeCallback);
    if (event === 'combine')
      this.eventHandlers[event].push(callback as SyncCombineDatabaseCallback);
    if (event === 'paused') this.eventHandlers[event].push(callback as SyncPausedCallback);
    if (event === 'active') this.eventHandlers[event].push(callback as SyncActiveCallback);
    if (event === 'start') this.eventHandlers[event].push(callback as SyncStartCallback);
    if (event === 'complete')
      this.eventHandlers[event].push(callback as SyncCompleteCallback);
    if (event === 'error') this.eventHandlers[event].push(callback as SyncErrorCallback);

    return this;
  }

  /**
   * Remove SyncEvent handler
   *
   */
  off (event: SyncEvent, callback: SyncCallback) {
    // @ts-ignore
    this.eventHandlers[event] = this.eventHandlers[event].filter(
      (func: (res?: any) => void) => func !== callback
    );
    return this;
  }

  /**
   * Stop and clear remote connection
   *
   */
  close () {
    this.cancel();
    this.eventHandlers = {
      change: [],
      localChange: [],
      remoteChange: [],
      combine: [],
      paused: [],
      active: [],
      start: [],
      complete: [],
      error: [],
    };
  }
}
