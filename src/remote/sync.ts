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
import crypto from 'crypto';
import git from 'isomorphic-git';
import fs from 'fs-extra';
import { name as default_engine_name } from '../plugin/remote-isomorphic-git';

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
  SyncResultNop,
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
import {
  DEFAULT_COMBINE_DB_STRATEGY,
  DEFAULT_CONFLICT_RESOLUTION_STRATEGY,
  DEFAULT_SYNC_INTERVAL,
  MINIMUM_SYNC_INTERVAL,
  NETWORK_RETRY,
  NETWORK_RETRY_INTERVAL,
} from '../const';
import { JsonDiff } from './json_diff';
import { JsonPatchOT } from './json_patch_ot';
import { combineDatabaseWithTheirs } from './combine';
import { Validator } from '../validator';
import { RemoteEngine, RemoteErr, wrappingRemoteEngineError } from './remote_engine';

/**
 * encodeToGitRemoteName
 *
 * @remarks
 * The first default name of Git remote is "origin".
 *
 * GitDocumentDB adds an alias of "origin",
 * whose name is generated automatically by this function.
 * The second and subsequent remotes are also named in the same way.
 *
 * A remote name consists of [remote address]_[hash].
 * Periods are replaced with underscores.
 * e.g.) github_com_a0b1c23
 * It is human-readable.
 *
 * [remote address] is [hostname + domain name] or [ip address].
 * [hash] is calculated from remoteURL.
 *
 * [hash] is the first seven characters of SHA-1 so that it may collide.
 * Capitalize one of the remote addresses when hashes collide
 * because a hostname and a domain name are not case sensitive.
 *
 * @throws {@link RemoteErr.InvalidURLFormatError}
 *
 * @public
 */
export function encodeToGitRemoteName (remoteURL: string) {
  let host: string;
  if (/:\/\/.+?@(.+?):/.test(remoteURL)) {
    // ssh://user@foo.bar:xxx/path/repos.git
    host = RegExp.$1;
  }
  else if (/:\/\/(.+?):/.test(remoteURL)) {
    // http://foo.bar:xxx/path/repos.git
    host = RegExp.$1;
  }
  else if (/:\/\/.+?@(.+?)\//.test(remoteURL)) {
    // ssh://user@foo.bar/path/repos.git
    host = RegExp.$1;
  }
  else if (/:\/\/(.+?)\//.test(remoteURL)) {
    // http://foo.bar/user/repos.git
    host = RegExp.$1;
  }
  else if (/^.+?@(.+?):/.test(remoteURL)) {
    // user@foo.bar:path/repos.git
    host = RegExp.$1;
  }
  else {
    throw new RemoteErr.InvalidURLFormatError(`URL format is invalid: ${remoteURL}`);
  }

  const shortHash = crypto.createHash('sha1').update(remoteURL).digest('hex').substr(0, 7);

  // Use toLowerCase() because git.setConfig() and git.addRemote() automatically converts the path to lowercase.
  return host.toLowerCase().replace(/\./g, '_') + '_' + shortHash;
}

/**
 * Implementation of GitDocumentDB#sync(options, get_sync_result)
 *
 * @throws {@link Err.DatabaseClosingError}
 * @throws {@link Err.RepositoryNotOpenError}
 *
 * @throws # Errors from constructor of {@link Sync} class.
 * @throws # Errors from {@link Sync.init}
 *
 * @internal
 */
export async function syncAndGetResultImpl (
  this: GitDDBInterface,
  options: RemoteOptions
): Promise<[Sync, SyncResult]> {
  if (this.isClosing) {
    throw new Err.DatabaseClosingError();
  }
  if (!this.isOpened) {
    return Promise.reject(new Err.RepositoryNotOpenError());
  }

  const sync = new Sync(this, options);
  const syncResult = await sync.init();
  return [sync, syncResult];
}
/**
 * Implementation of GitDocumentDB#sync(options)
 *
 * @throws {@link Err.DatabaseClosingError}
 * @throws {@link Err.RepositoryNotOpenError}
 *
 * @throws # Errors from constructor of {@link Sync} class.
 * @throws # Errors from {@link Sync.init}
 *
 * @internal
 */
export async function syncImpl (
  this: GitDDBInterface,
  options: RemoteOptions
): Promise<Sync> {
  const [sync, syncResult] = await syncAndGetResultImpl.call(this, options);
  return sync;
}

/**
 * Filter file changes by collectionPath
 *
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

  /**
   * Remote Engine
   */
  private _engine = default_engine_name;
  get engine (): string {
    return this._engine;
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

  private _remoteName = '';
  /**
   * remoteName
   *
   * @readonly
   * @public
   */
  get remoteName (): string {
    return this._remoteName;
  }

  /***********************************************
   * Public properties
   ***********************************************/

  /**
   * runBeforeLiveSync
   *
   * This function is executed just before each automated(live) synchronization event is queued.
   * Set undefined to stop it.
   */
  public runBeforeLiveSync: (() => void) | undefined = undefined;

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
   * @throws {@link Err.SyncIntervalLessThanOrEqualToRetryIntervalError}
   *
   * @throws # Errors from encodeToGitRemoteName
   * @throws - {@link RemoteErr.InvalidURLFormatError}
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
    this.jsonPatch = new JsonPatchOT(gitDDB.schema.json);

    this._options.connection ??= { type: 'none' };
    this._options.connection.engine ??= default_engine_name;

    this._remoteRepository = new RemoteRepository({
      remoteUrl: this._options.remoteUrl,
      connection: this._options.connection,
    });

    this._remoteName = encodeToGitRemoteName(this.remoteURL);

    this._engine = this._options.connection.engine;
  }

  /***********************************************
   * Public methods
   ***********************************************/

  /**
   * Initialize remote connection
   *
   * @remarks
   * Call init() once just after creating an instance.
   *
   * @throws {@link Err.CannotCreateRemoteRepositoryError}
   *
   * @throws # Errors from RemoteEngine[engineName].checkFetch
   * @throws - {@link RemoteErr.InvalidGitRemoteError}
   * @throws - {@link RemoteErr.InvalidURLFormatError}
   * @throws - {@link RemoteErr.NetworkError}
   * @throws - {@link RemoteErr.HTTPError401AuthorizationRequired}
   * @throws - {@link RemoteErr.HTTPError404NotFound}
   * @throws - {@link RemoteErr.CannotConnectError}
   * @throws - {@link RemoteErr.InvalidURLFormatError}
   * @throws - {@link RemoteErr.InvalidRepositoryURLError}
   * @throws - {@link RemoteErr.InvalidSSHKeyPathError}
   * @throws - {@link RemoteErr.InvalidAuthenticationTypeError}
   *
   * @throws Errors from {@link Sync.trySync}
   * @throws Errors from {@link Sync.tryPush}
   *
   * @public
   */
  // eslint-disable-next-line complexity
  async init (): Promise<SyncResult> {
    this._isClosed = false;
    let isNewRemoteRepository = false;

    const urlOfRemote = await git.getConfig({
      fs,
      dir: this._gitDDB.workingDir,
      path: `remote.${this.remoteName}.url`,
    });
    if (urlOfRemote !== this.remoteURL) {
      await git.addRemote({
        fs,
        dir: this._gitDDB.workingDir,
        remote: this.remoteName,
        url: this.remoteURL,
      });
    }

    /**
     * Set origin if not exist
     */
    const originUrl = await git.getConfig({
      fs,
      dir: this._gitDDB.workingDir,
      path: `remote.origin.url`,
    });
    if (originUrl === undefined) {
      await git.addRemote({
        fs,
        dir: this._gitDDB.workingDir,
        remote: 'origin',
        url: this.remoteURL,
      });
    }

    let remoteResult: boolean | Error;
    if (this._options.syncDirection === 'push') {
      // checkFetch will return undefined if succeeds.

      // Do not download remote.
      // eslint-disable-next-line no-await-in-loop
      remoteResult = await RemoteEngine[this._engine]
        .checkFetch(
          this._gitDDB.workingDir,
          this._options,
          this.remoteName,
          this._gitDDB.tsLogger
        )
        .catch(err => err);
    }
    else {
      // fetch will return true if succeeds.

      // eslint-disable-next-line no-await-in-loop
      remoteResult = await RemoteEngine[this._engine]
        .fetch(
          this._gitDDB.workingDir,
          this._options,
          this.remoteName,
          this._gitDDB.defaultBranch,
          this._gitDDB.defaultBranch,
          this._gitDDB.tsLogger
        )
        .catch(err => err);
    }

    /**
     * Do not use 'instanceof' to compare git-documentdb-remote-errors
     * because an error from RemoteEngine plugin may not have the same prototype
     * in its prototype chain.
     * - https://nodejs.org/en/blog/npm/peer-dependencies/
     * - https://stackoverflow.com/questions/46618852/require-and-instanceof/46630766
     * Use name property instead.
     */
    if (typeof remoteResult === 'boolean' || remoteResult === undefined) {
      // nop
    }
    else if (remoteResult.name === 'InvalidGitRemoteError') {
      // checkFetch hardly invoke this error because checkFetch is called just after addRemote.
      throw wrappingRemoteEngineError(remoteResult);
    }
    else if (
      remoteResult.name === 'InvalidURLFormatError' ||
      remoteResult.name === 'InvalidRepositoryURLError' ||
      remoteResult.name === 'InvalidSSHKeyPathError' ||
      remoteResult.name === 'InvalidAuthenticationTypeError' ||
      remoteResult.name === 'HTTPError401AuthorizationRequired' ||
      remoteResult.name === 'NetworkError' ||
      remoteResult.name === 'CannotConnectError'
    ) {
      throw wrappingRemoteEngineError(remoteResult);
    }
    else if (remoteResult.name === 'HTTPError404NotFound') {
      // Try to create repository by octokit
      // eslint-disable-next-line no-await-in-loop
      await this.remoteRepository.create().catch(err => {
        throw new Err.CannotCreateRemoteRepositoryError(err.message);
      });
      isNewRemoteRepository = true;
    }

    let syncResult: SyncResult = {
      action: 'nop',
    };
    if (this._options.syncDirection === 'pull') {
      // Do not create a new remote repository because the direction is 'pull'.
      /**
       * TODO: Implement case when sync_direction is 'pull'.
       */
    }
    else {
      // push or both
      if (this._options.syncDirection === 'both') {
        // Check remote branch after fetching.
        const remoteCommitOid = await git
          .resolveRef({
            fs,
            dir: this._gitDDB.workingDir,
            ref: `refs/remotes/${this.remoteName}/${this._gitDDB.defaultBranch}`,
          })
          .catch(() => undefined);
        if (remoteCommitOid === undefined) {
          // Remote repository is empty.
          isNewRemoteRepository = true;
        }
      }
      if (isNewRemoteRepository) {
        this._gitDDB.logger.debug('upstream branch is not set yet. tryPush..');

        // Remote repository may not be created yet due to internal delay of GitHub.
        // Retry if not exist.
        for (let i = 0; i < this._options.retry! + 1; i++) {
          // eslint-disable-next-line no-await-in-loop
          const syncResultOrError = await this.tryPush().catch(err => err);
          if (syncResultOrError instanceof Error) {
            if (syncResultOrError instanceof RemoteErr.HTTPError404NotFound) {
              // eslint-disable-next-line no-await-in-loop
              await sleep(this._options.retryInterval!);
              if (i === this._options.retry!) {
                throw syncResultOrError;
              }
              continue;
            }
            throw syncResultOrError;
          }
          syncResult = syncResultOrError;
          break;
        }
      }
      else if (this._options.syncDirection === 'push') {
        this._gitDDB.logger.debug('upstream_branch exists. tryPush..');
        syncResult = await this.tryPush();
      }
      else if (this._options.syncDirection === 'both') {
        this._gitDDB.logger.debug('upstream_branch exists. trySync..');
        syncResult = await this.trySync();
      }
    }

    const branchRemote = await git.getConfig({
      fs,
      dir: this._gitDDB.workingDir,
      path: `branch.${this._gitDDB.defaultBranch}.remote`,
    });
    if (branchRemote === undefined) {
      await git.setConfig({
        fs,
        dir: this._gitDDB.workingDir,
        path: `branch.${this._gitDDB.defaultBranch}.remote`,
        value: this.remoteName,
      });
    }

    const branchMerge = await git.getConfig({
      fs,
      dir: this._gitDDB.workingDir,
      path: `branch.${this._gitDDB.defaultBranch}.merge`,
    });
    if (branchMerge === undefined) {
      await git.setConfig({
        fs,
        dir: this._gitDDB.workingDir,
        path: `branch.${this._gitDDB.defaultBranch}.merge`,
        value: `refs/heads/${this._gitDDB.defaultBranch}`,
      });
    }

    if (this._options.live) {
      if (this._syncTimer === undefined) {
        this.eventHandlers.resume.forEach(listener => {
          listener.func();
        });
        this._syncTimer = setInterval(() => {
          if (this.runBeforeLiveSync !== undefined) {
            try {
              this.runBeforeLiveSync();
            } catch (e) {
              this._gitDDB.logger.debug('Error in runBeforeLiveSync: ' + e);
            }
          }
          if (this._options.syncDirection === 'push') {
            this.tryPushImpl(true).catch(() => undefined);
          }
          else if (this._options.syncDirection === 'both') {
            this.trySyncImpl(true).catch(() => undefined);
          }
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
      if (this._options.syncDirection === 'push') {
        this.tryPushImpl(true).catch(() => undefined);
      }
      else if (this._options.syncDirection === 'both') {
        this.trySyncImpl(true).catch(() => undefined);
      }
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
   * Try to push
   *
   * @throws {@link Err.PushNotAllowedError}
   *
   * @throws # Errors from push
   * @throws - {@link RemoteErr.InvalidGitRemoteError}
   * @throws - {@link RemoteErr.UnfetchedCommitExistsError}
   * @throws - {@link RemoteErr.InvalidURLFormatError}
   * @throws - {@link RemoteErr.NetworkError}
   * @throws - {@link RemoteErr.HTTPError401AuthorizationRequired}
   * @throws - {@link RemoteErr.HTTPError404NotFound}
   * @throws - {@link RemoteErr.HTTPError403Forbidden}
   * @throws - {@link RemoteErr.CannotConnectError}
   * @throws - {@link RemoteErr.UnfetchedCommitExistsError}
   * @throws - {@link RemoteErr.CannotConnectError}
   * @throws - {@link RemoteErr.InvalidURLFormatError}
   * @throws - {@link RemoteErr.InvalidRepositoryURLError}
   * @throws - {@link RemoteErr.InvalidSSHKeyPathError}
   * @throws - {@link RemoteErr.InvalidAuthenticationTypeError}
   *
   * @throws # Errors from getChanges
   * @throws - {@link Err.InvalidJsonObjectError}
   *
   * @public
   */
  async tryPush (): Promise<SyncResultPush | SyncResultCancel | SyncResultNop> {
    return await this.tryPushImpl(false);
  }

  /**
   * tryPushImpl
   *
   * @internal
   */
  // eslint-disable-next-line complexity
  async tryPushImpl (
    calledAsPeriodicTask: boolean
  ): Promise<SyncResultPush | SyncResultCancel | SyncResultNop> {
    if (this._isClosed) return { action: 'canceled' };
    if (this._options.syncDirection === 'pull') {
      throw new Err.PushNotAllowedError(this._options.syncDirection);
    }

    /**
     * Enqueue pushWorker
     */
    const taskId = this._gitDDB.taskQueue.newTaskId();
    const callback = (
      resolve: (value: SyncResultPush | SyncResultCancel | SyncResultNop) => void,
      reject: (reason: any) => void
    ) => (
      beforeResolve: () => void,
      beforeReject: () => void,
      taskMetadata: TaskMetadata
    ) => {
      if (calledAsPeriodicTask && !this._options.live) {
        return Promise.resolve().then(() => {
          const resultCancel: SyncResultCancel = {
            action: 'canceled',
          };
          beforeResolve();
          resolve(resultCancel);
        });
      }
      return pushWorker(this._gitDDB, this, taskMetadata)
        .then((syncResultPush: SyncResultPush | SyncResultNop) => {
          this._gitDDB.logger.debug(
            `pushWorker: ${JSON.stringify(syncResultPush)}`,
            CONSOLE_STYLE.bgWhite().fgBlack().tag
          );

          if (syncResultPush.action === 'push') {
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

          if (syncResultPush.action === 'push') {
            this.eventHandlers.complete.forEach(listener => {
              listener.func({ ...taskMetadata, collectionPath: listener.collectionPath });
            });
          }

          beforeResolve();
          resolve(syncResultPush);
        })
        .catch(err => {
          // console.log(`Error in push_worker: ${err}`);
          this.eventHandlers.error.forEach(listener => {
            listener.func(err, {
              ...taskMetadata,
              collectionPath: listener.collectionPath,
            });
          });

          beforeReject();
          reject(err);
        });
    };

    const cancel = (resolve: (value: SyncResultCancel) => void) => () => {
      const result: SyncResultCancel = { action: 'canceled' };
      this._gitDDB.logger.debug(
        `pushWorker: ${JSON.stringify(result)}`,
        CONSOLE_STYLE.bgWhite().fgBlack().tag
      );
      resolve(result);
    };

    const task = (
      resolve: (value: SyncResultPush | SyncResultCancel | SyncResultNop) => void,
      reject: (reason: any) => void
    ): Task => {
      return {
        label: 'push',
        taskId: taskId!,
        syncRemoteName: this.remoteName,
        func: callback(resolve, reject),
        cancel: cancel(resolve),
      };
    };

    const resultOrError = await new Promise(
      (
        resolve: (value: SyncResultPush | SyncResultCancel | SyncResultNop) => void,
        reject
      ) => {
        this._gitDDB.taskQueue.pushToTaskQueue(task(resolve, reject));
        // this._gitDDB.taskQueue.unshiftSyncTaskToTaskQueue(task(resolve, reject));
      }
    ).catch((err: Error) => err);

    if (resultOrError instanceof Error) {
      if (resultOrError instanceof RemoteErr.UnfetchedCommitExistsError) {
        if (this._options.syncDirection === 'push') {
          if (this._options.combineDbStrategy === 'replace-with-ours') {
            // TODO: Exec replace-with-ours instead of throw error
          }
        }
      }
      // Fatal error. Don't retry?
      // this.pause();
      throw resultOrError;
    }

    return resultOrError;
  }

  /**
   * Try to sync with retries
   *
   * @throws {@link Err.PushNotAllowedError}
   * @throws {@link Err.CombineDatabaseError}
   *
   * @throws # Errors from syncWorker
   * @throws - {@link Err.NoMergeBaseFoundError}
   * @throws - {@link Err.ThreeWayMergeError}
   * @throws - {@link Err.CannotDeleteDataError}
   *
   * @throws # Errors from fetch, pushWorker
   * @throws - {@link RemoteErr.InvalidGitRemoteError}
   * @throws - {@link RemoteErr.InvalidURLFormatError}
   * @throws - {@link RemoteErr.NetworkError}
   * @throws - {@link RemoteErr.HTTPError401AuthorizationRequired}
   * @throws - {@link RemoteErr.HTTPError404NotFound}
   * @throws - {@link RemoteErr.CannotConnectError}
   * @throws - {@link RemoteErr.InvalidURLFormatError}
   * @throws - {@link RemoteErr.InvalidRepositoryURLError}
   * @throws - {@link RemoteErr.InvalidSSHKeyPathError}
   * @throws - {@link RemoteErr.InvalidAuthenticationTypeError}
   *
   * @throws # Errors from pushWorker
   * @throws - {@link RemoteErr.HTTPError403Forbidden}
   * @throws - {@link RemoteErr.UnfetchedCommitExistsError}
   *
   * @throws # Errors from merge
   * @throws - {@link Err.InvalidConflictStateError}
   * @throws - {@link Err.CannotDeleteDataError}
   * @throws - {@link Err.InvalidDocTypeError}
   * @throws - {@link Err.InvalidConflictResolutionStrategyError}
   * @throws - {@link Err.CannotCreateDirectoryError}
   * @throws - {@link Err.InvalidJsonObjectError}
   *
   * @throws # Errors from getChanges
   * @throws - {@link Err.InvalidJsonObjectError}
   *
   * @public
   */
  async trySync (): Promise<SyncResult> {
    return await this.trySyncImpl(false);
  }

  /**
   * trySyncImpl
   *
   * @internal
   */
  // eslint-disable-next-line complexity
  async trySyncImpl (calledAsPeriodicTask: boolean): Promise<SyncResult> {
    if (this._isClosed) return { action: 'canceled' };
    if (this._options.syncDirection === 'pull') {
      throw new Err.PushNotAllowedError(this._options.syncDirection);
    }
    if (this._retrySyncCounter === 0) {
      this._retrySyncCounter = this._options.retry! + 1;
    }

    while (this._retrySyncCounter > 0) {
      // eslint-disable-next-line no-await-in-loop
      const resultOrError = await this.enqueueSyncTask(calledAsPeriodicTask).catch(
        (err: Error) => err
      );

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

      if (error instanceof Err.NoMergeBaseFoundError) {
        if (this._options.combineDbStrategy === 'throw-error') {
          // nop
        }
        else if (this._options.combineDbStrategy === 'combine-head-with-theirs') {
          // return SyncResultCombineDatabase
          // eslint-disable-next-line no-await-in-loop
          const syncResultCombineDatabase = await combineDatabaseWithTheirs(
            this._gitDDB,
            this._options,
            this.remoteName
          ).catch(err => {
            if (err)
              // throw new Err.CombineDatabaseError(err.message);
              error = new Err.CombineDatabaseError(err.message);
            return undefined;
          });
          if (syncResultCombineDatabase !== undefined) {
            // eslint-disable-next-line no-loop-func
            this.eventHandlers.combine.forEach(callback =>
              callback.func(syncResultCombineDatabase.duplicates)
            );
            return syncResultCombineDatabase;
          }
        }
      }

      if (error !== undefined) {
        this._gitDDB.logger.debug('trySync failed: ' + error.message);
        if (error instanceof RemoteErr.UnfetchedCommitExistsError) {
          this._retrySyncCounter--;
          if (this._retrySyncCounter === 0) {
            // this.pause();
            throw error;
          }
          this._gitDDB.logger.debug(
            `...retrySync: ${this.currentRetries().toString()}`,
            CONSOLE_STYLE.bgRed().tag
          );
          // eslint-disable-next-line no-await-in-loop
          await sleep(this._options.retryInterval!);
        }
        else {
          // Throw error
          this._retrySyncCounter = 0;
          // this.pause();
          throw error;
        }
      }
      else if (result !== undefined) {
        // No error
        this._retrySyncCounter = 0;
        return result;
      }
    }
    // This line is reached when cancel() set _retrySyncCounter to 0;
    const cancel: SyncResultCancel = { action: 'canceled' };
    this._gitDDB.logger.debug(
      `syncWorker: ${JSON.stringify(cancel)}`,
      CONSOLE_STYLE.bgWhite().fgBlack().tag
    );
    this._retrySyncCounter = 0;
    return cancel;
  }

  /**
   * Enqueue sync task to TaskQueue
   *
   * @public
   */
  enqueueSyncTask (calledAsPeriodicTask: boolean): Promise<SyncResult> {
    const taskId = this._gitDDB.taskQueue.newTaskId();
    const callback = (
      resolve: (value: SyncResult) => void,
      reject: (reason: any) => void
    ) => (
      beforeResolve: () => void,
      beforeReject: () => void,
      taskMetadata: TaskMetadata
    ) => {
      if (calledAsPeriodicTask && !this._options.live) {
        return Promise.resolve().then(() => {
          const resultCancel: SyncResultCancel = {
            action: 'canceled',
          };
          beforeResolve();
          resolve(resultCancel);
        });
      }

      return (
        syncWorker(this._gitDDB, this, taskMetadata)
          // eslint-disable-next-line complexity
          .then((syncResult: SyncResult) => {
            this._gitDDB.logger.debug(
              `syncWorker: ${JSON.stringify(syncResult)}`,
              CONSOLE_STYLE.bgWhite().fgBlack().tag
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
              listener.func({
                ...taskMetadata,
                collectionPath: listener.collectionPath,
              })
            );

            beforeResolve();
            resolve(syncResult);
          })
          .catch((err: Error) => {
            // console.log(`Error in syncWorker: ${err}`);
            this.eventHandlers.error.forEach(listener => {
              listener.func(err, {
                ...taskMetadata,
                collectionPath: listener.collectionPath,
              });
            });

            beforeReject();
            reject(err);
          })
      );
    };

    const cancel = (resolve: (value: SyncResultCancel) => void) => () => {
      const result: SyncResultCancel = { action: 'canceled' };
      this._gitDDB.logger.debug(
        `syncWorker: ${JSON.stringify(result)}`,
        CONSOLE_STYLE.bgWhite().fgBlack().tag
      );
      resolve(result);
    };

    const task = (
      resolve: (value: SyncResult) => void,
      reject: (reason: any) => void
    ): Task => {
      return {
        label: 'sync',
        taskId: taskId!,
        syncRemoteName: this.remoteName,
        func: callback(resolve, reject),
        cancel: cancel(resolve),
      };
    };

    return new Promise((resolve: (value: SyncResult) => void, reject) => {
      this._gitDDB.taskQueue.pushToTaskQueue(task(resolve, reject));
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
