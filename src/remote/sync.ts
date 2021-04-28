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
  IntervalTooSmallError,
  NoMergeBaseFoundError,
  PushNotAllowedError,
  PushWorkerError,
  RemoteIsAdvancedWhileMergingError,
  RemoteRepositoryConnectError,
  RepositoryNotOpenError,
  SyncIntervalLessThanOrEqualToRetryIntervalError,
  SyncWorkerError,
  UndefinedRemoteURLError,
  UnfetchedCommitExistsError,
} from '../error';
import {
  ISync,
  RemoteOptions,
  SyncActiveCallback,
  SyncCallback,
  SyncChangeCallback,
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
} from '../types';
import { IDocumentDB } from '../types_gitddb';
import { sync_worker } from './sync_worker';
import { push_worker } from './push_worker';
import { createCredential } from './authentication';
import { RemoteRepository } from './remote_repository';
import { checkHTTP } from './net';
import {
  DEFAULT_CONFLICT_RESOLVE_STRATEGY,
  NETWORK_RETRY,
  NETWORK_RETRY_INTERVAL,
  NETWORK_TIMEOUT,
} from '../const';

/**
 * Implementation of GitDocumentDB#sync()
 *
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
export async function syncImpl (this: IDocumentDB, options?: RemoteOptions) {
  const repos = this.repository();
  if (repos === undefined) {
    throw new RepositoryNotOpenError();
  }
  const remote = new Sync(this, options);
  await remote.init(repos);

  return remote;
}

/**
 * Synchronizer class
 */
export class Sync implements ISync {
  static defaultSyncInterval = 10000;
  static minimumSyncInterval = 3000;
  static defaultRetryInterval = NETWORK_RETRY_INTERVAL;
  static defaultRetry = NETWORK_RETRY;

  private _gitDDB: IDocumentDB;
  private _options: RemoteOptions;
  private _checkoutOptions: nodegit.CheckoutOptions;
  private _syncTimer: NodeJS.Timeout | undefined;
  private _remoteRepository: RemoteRepository;
  private _retrySyncCounter = 0; // Decremental count

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
    paused: SyncPausedCallback[];
    active: SyncActiveCallback[];
    start: SyncStartCallback[];
    complete: SyncCompleteCallback[];
    error: SyncErrorCallback[];
  } = {
    change: [],
    localChange: [],
    remoteChange: [],
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
   * constructor
   *
   * @throws {@link UndefinedRemoteURLError}
   * @throws {@link IntervalTooSmallError}
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
      conflict_resolve_strategy: undefined,
    };
    // Deep clone
    this._options = JSON.parse(JSON.stringify(_options));

    if (this._options.remote_url === undefined || this._options.remote_url === '') {
      /**
       * TODO: Check upstream branch of this repository
       * Set remote_url to the upstream branch and cloneRepository() if exists.
       */
      throw new UndefinedRemoteURLError();
    }

    this._options.live ??= false;
    this._options.sync_direction ??= 'both';
    this._options.interval ??= Sync.defaultSyncInterval;
    this._options.retry_interval ??= Sync.defaultRetryInterval;

    if (this._options.interval < Sync.minimumSyncInterval) {
      throw new IntervalTooSmallError(Sync.minimumSyncInterval, this._options.interval);
    }
    if (this._options.interval <= this._options.retry_interval) {
      throw new SyncIntervalLessThanOrEqualToRetryIntervalError(
        this._options.interval,
        this._options.retry_interval
      );
    }

    this._options.retry ??= Sync.defaultRetry;
    this._options.combine_db_strategy ??= 'throw-error';
    this._options.include_commits ??= false;
    this._options.conflict_resolve_strategy ??= DEFAULT_CONFLICT_RESOLVE_STRATEGY;

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

    this._remoteRepository = new RemoteRepository({
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
    const [gitResult, remoteResult] = await this._remoteRepository
      .connect(this._gitDDB.repository()!, this.credential_callbacks, onlyFetch)
      .catch(err => {
        throw new RemoteRepositoryConnectError(err.message);
      });
    this._gitDDB.logger.debug('git remote: ' + gitResult);
    this._gitDDB.logger.debug('remote repository: ' + remoteResult);
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
      this._gitDDB.logger.debug('upstream_branch is empty. tryPush..');
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
      this._gitDDB.logger.debug('upstream_branch exists. tryPush..');
      syncResult = await this.tryPush();
    }
    else if (this._options.sync_direction === 'both') {
      this._gitDDB.logger.debug('upstream_branch exists. trySync..');
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
   * Get remote options
   * (options are read only)
   *
   */
  options (): Required<RemoteOptions> {
    return JSON.parse(JSON.stringify(this._options));
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
      if (options.interval >= Sync.minimumSyncInterval) {
        this._options.interval = options.interval;
      }
      else {
        throw new IntervalTooSmallError(Sync.minimumSyncInterval, options.interval);
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
  async tryPush (options?: {
    onlyPush: boolean;
  }): Promise<SyncResultPush | SyncResultCancel> {
    if (this._options.sync_direction === 'pull') {
      throw new PushNotAllowedError(this._options.sync_direction);
    }
    if (this._retrySyncCounter === 0) {
      this._retrySyncCounter = this._options.retry! + 1;
    }
    else {
      const result: SyncResultCancel = { action: 'canceled' };
      this._retrySyncCounter = 0;
      return result;
    }

    while (this._retrySyncCounter > 0) {
      // eslint-disable-next-line no-await-in-loop
      const resultOrError = await this.enqueuePushTask().catch((err: Error) => {
        // Invoke retry fail event
        this._gitDDB.logger.debug('Push failed: ' + err.message);
        this._retrySyncCounter--;
        if (this._retrySyncCounter === 0) {
          throw err;
        }
        return err;
      });
      if (!(resultOrError instanceof Error)) {
        this._retrySyncCounter = 0;
        return resultOrError;
      }
      // eslint-disable-next-line no-await-in-loop
      if (!(await this.canNetworkConnection())) {
        // Retry to connect due to network error.
        this._gitDDB.logger.debug(
          ConsoleStyle.BgRed().tag()`...retryPush: ${this.currentRetries().toString()}`
        );
        // eslint-disable-next-line no-await-in-loop
        await sleep(this._options.retry_interval!);
      }
      else {
        this._retrySyncCounter = 0;
        throw resultOrError;
      }
    }
    // This line is reached when cancel() set _retrySyncCounter to 0;
    const result: SyncResultCancel = { action: 'canceled' };
    this._retrySyncCounter = 0;
    return result;
  }

  /**
   * Try to sync with retries
   *
   * @throws {@link PushNotAllowedError} (from this and enqueueSyncTask)
   * @throws {@link SyncWorkerError} (from enqueueSyncTask)
   * @throws {@link NoMergeBaseFoundError} (from enqueueSyncTask)
   * @throws {@link UnfetchedCommitExistsError} (from enqueueSyncTask)
   * @throws {@link RemoteIsAdvancedWhileMergingError} (from enqueueSyncTask)
   */
  async trySync (): Promise<SyncResult> {
    if (this._options.sync_direction === 'pull') {
      throw new PushNotAllowedError(this._options.sync_direction);
    }
    if (this._retrySyncCounter === 0) {
      this._retrySyncCounter = this._options.retry! + 1;
    }
    else {
      const result: SyncResultCancel = { action: 'canceled' };
      this._retrySyncCounter = 0;
      return result;
    }

    while (this._retrySyncCounter > 0) {
      // eslint-disable-next-line no-await-in-loop
      const resultOrError = await this.enqueueSyncTask().catch((err: Error) => {
        // Invoke retry fail event
        this._gitDDB.logger.debug('Sync failed: ' + err.message);
        this._retrySyncCounter--;
        if (this._retrySyncCounter === 0) {
          throw err;
        }
        return err;
      });
      if (!(resultOrError instanceof Error)) {
        this._retrySyncCounter = 0;
        return resultOrError;
      }
      if (
        // eslint-disable-next-line no-await-in-loop
        !(await this.canNetworkConnection()) ||
        resultOrError instanceof UnfetchedCommitExistsError ||
        resultOrError instanceof RemoteIsAdvancedWhileMergingError
      ) {
        // Retry for the following reasons:
        // - Network connection may be improved next time.
        // - Problem will be resolved by sync again.
        this._gitDDB.logger.debug(
          ConsoleStyle.BgRed().tag()`...retrySync: ${this.currentRetries().toString()}`
        );
        // eslint-disable-next-line no-await-in-loop
        await sleep(this._options.retry_interval!);
      }
      else {
        this._retrySyncCounter = 0;
        throw resultOrError;
      }
    }
    // This line is reached when cancel() set _retrySyncCounter to 0;
    const result: SyncResultCancel = { action: 'canceled' };
    this._retrySyncCounter = 0;
    return result;
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
    ) => (beforeResolve: () => void, beforeReject: () => void) =>
      push_worker(this._gitDDB, this, taskId)
        .then((syncResultPush: SyncResultPush) => {
          this._gitDDB.logger.debug(
            ConsoleStyle.BgWhite().FgBlack().tag()`push_worker: ${JSON.stringify(
              syncResultPush
            )}`
          );

          this.eventHandlers.change.forEach(func => func(syncResultPush));
          if (syncResultPush.action === 'push') {
            this.eventHandlers.remoteChange.forEach(func =>
              func(syncResultPush.changes.remote)
            );
          }
          this.eventHandlers.complete.forEach(func => func(taskId!));

          beforeResolve();
          resolve(syncResultPush);
        })
        .catch(err => {
          // console.log(`Error in push_worker: ${err}`);
          if (!(err instanceof UnfetchedCommitExistsError)) {
            err = new PushWorkerError(err.message);
          }
          this.eventHandlers.error.forEach(func => {
            func(err);
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
        this._gitDDB.taskQueue.unshiftSyncTaskToTaskQueue(task(resolve, reject));
      }
    );
  }

  /**
   * Enqueue sync task to TaskQueue
   *
   * @throws {@link SyncWorkerError}
   * @throws {@link NoMergeBaseFoundError}
   * @throws {@link UnfetchedCommitExistsError}
   * @throws {@link RemoteIsAdvancedWhileMergingError}
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
    ) => (beforeResolve: () => void, beforeReject: () => void) =>
      sync_worker(this._gitDDB, this, taskId)
        // eslint-disable-next-line complexity
        .then(syncResult => {
          this._gitDDB.logger.debug(
            ConsoleStyle.BgWhite().FgBlack().tag()`sync_worker: ${JSON.stringify(
              syncResult
            )}`
          );
          if (
            syncResult.action === 'resolve conflicts and push' ||
            syncResult.action === 'merge and push' ||
            syncResult.action === 'fast-forward merge' ||
            syncResult.action === 'push'
          ) {
            this.eventHandlers.change.forEach(func => func(syncResult));
            if (
              syncResult.action === 'resolve conflicts and push' ||
              syncResult.action === 'merge and push' ||
              syncResult.action === 'fast-forward merge'
            ) {
              this.eventHandlers.localChange.forEach(func =>
                func(syncResult.changes.local)
              );
            }
            if (
              syncResult.action === 'resolve conflicts and push' ||
              syncResult.action === 'merge and push' ||
              syncResult.action === 'push'
            ) {
              this.eventHandlers.remoteChange.forEach(func =>
                func(syncResult.changes.remote)
              );
            }
          }
          this.eventHandlers.complete.forEach(func => func(taskId!));

          beforeResolve();
          resolve(syncResult);
        })
        .catch(err => {
          // console.log(`Error in sync_worker: ${err}`);
          if (
            !(
              err instanceof NoMergeBaseFoundError ||
              err instanceof RemoteIsAdvancedWhileMergingError ||
              err instanceof UnfetchedCommitExistsError
            )
          ) {
            err = new SyncWorkerError(err.message);
          }
          this.eventHandlers.error.forEach(func => {
            func(err);
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
      this._gitDDB.taskQueue.unshiftSyncTaskToTaskQueue(task(resolve, reject));
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
      paused: [],
      active: [],
      start: [],
      complete: [],
      error: [],
    };
  }
}
