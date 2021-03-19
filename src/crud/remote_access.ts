/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import { setInterval } from 'timers';
import { Octokit } from '@octokit/rest';
import nodegit from '@sosuisen/nodegit';
import { ConsoleStyle, sleep } from '../utils';
import {
  AuthNeededForPushOrSyncError,
  HttpProtocolRequiredError,
  IntervalTooSmallError,
  InvalidAuthenticationTypeError,
  InvalidRepositoryURLError,
  InvalidSSHKeyFormatError,
  InvalidSSHKeyPathError,
  InvalidURLFormatError,
  PushAuthenticationError,
  PushPermissionDeniedError,
  RemoteRepositoryNotFoundError,
  RepositoryNotOpenError,
  UndefinedPersonalAccessTokenError,
  UndefinedRemoteURLError,
  UnresolvedHostError,
} from '../error';
import {
  IRemoteAccess,
  RemoteAuthGitHub,
  RemoteAuthSSH,
  RemoteOptions,
  SyncResult,
} from '../types';
import { AbstractDocumentDB } from '../types_gitddb';
import { push_worker, sync_worker } from './remote_worker';

export async function syncImpl (
  this: AbstractDocumentDB,
  remoteURL: string,
  options?: RemoteOptions
) {
  const repos = this.repository();
  if (repos === undefined) {
    throw new RepositoryNotOpenError();
  }
  const remote = new RemoteAccess(this, remoteURL, options);
  await remote.connectToRemote(repos);
  return remote;
}

export const defaultSyncInterval = 10000;
export const minimumSyncInterval = 1000;
export const defaultRetryInterval = 3000;
export const defaultRetry = 2;

/**
 * RemoteAccess class
 */
export class RemoteAccess implements IRemoteAccess {
  private _gitDDB: AbstractDocumentDB;
  private _options: RemoteOptions;
  private _checkoutOptions: nodegit.CheckoutOptions;
  private _syncTimer: NodeJS.Timeout | undefined;
  private _octokit: Octokit | undefined;
  private _remoteURL: string;

  upstream_branch = '';

  callbacks: { [key: string]: any };
  author: nodegit.Signature;
  committer: nodegit.Signature;

  constructor (_gitDDB: AbstractDocumentDB, _remoteURL: string, _options?: RemoteOptions) {
    this._gitDDB = _gitDDB;
    this._remoteURL = _remoteURL;
    if (_remoteURL === undefined || _remoteURL === '') {
      throw new UndefinedRemoteURLError();
    }

    _options ??= {
      live: false,
      sync_direction: undefined,
      interval: undefined,
      retry: undefined,
      retry_interval: undefined,
      auth: undefined,
      behavior_for_no_merge_base: undefined,
    };
    // Deep clone
    this._options = JSON.parse(JSON.stringify(_options));

    this._options.sync_direction ??= 'pull';
    this._options.interval ??= defaultSyncInterval;

    if (this._options.interval < minimumSyncInterval) {
      throw new IntervalTooSmallError(minimumSyncInterval, this._options.interval);
    }
    this._options.retry_interval ??= defaultRetryInterval;
    this._options.retry ??= defaultRetry;
    this._options.behavior_for_no_merge_base ??= 'nop';

    this.callbacks = {
      credentials: this.createCredential(),
    };
    if (process.platform === 'darwin') {
      // @ts-ignore
      this._callbacks.certificateCheck = () => 0;
    }

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
  }

  /**
   * Create credential options for GitHub
   */
  private _createCredentialForGitHub () {
    if (!this._remoteURL.match(/^https?:\/\//)) {
      throw new HttpProtocolRequiredError(this._remoteURL);
    }
    const auth = this._options.auth as RemoteAuthGitHub;
    if (!auth.personal_access_token) {
      throw new UndefinedPersonalAccessTokenError();
    }
    this._octokit = new Octokit({
      auth: auth.personal_access_token,
    });
    const urlArray = this._remoteURL.replace(/^https?:\/\//, '').split('/');
    // github.com/account_name/repository_name
    if (urlArray.length !== 3) {
      throw new InvalidRepositoryURLError(this._remoteURL);
    }
    const owner = urlArray[urlArray.length - 2];
    const credentials = () => {
      return nodegit.Cred.userpassPlaintextNew(owner, auth.personal_access_token!);
    };
    return credentials;
  }

  /**
   * Create credential options for SSH
   */
  private _createCredentialForSSH () {
    const auth = this._options.auth as RemoteAuthSSH;
    if (auth.private_key_path === undefined || auth.private_key_path === '') {
      throw new InvalidSSHKeyPathError();
    }
    if (auth.public_key_path === undefined || auth.public_key_path === '') {
      throw new InvalidSSHKeyPathError();
    }
    auth.pass_phrase ??= '';

    const credentials = (url: string, userName: string) => {
      return nodegit.Cred.sshKeyNew(
        userName,
        auth.public_key_path,
        auth.private_key_path,
        auth.pass_phrase!
      );
    };
    return credentials;
  }

  /**
   * Create credential options
   */
  createCredential () {
    this._options.auth ??= { type: 'none' };

    if (this._options.auth.type === 'github') {
      return this._createCredentialForGitHub();
    }
    else if (this._options.auth.type === 'ssh') {
      return this._createCredentialForSSH();
    }
    else if (this._options.auth.type === 'none') {
      if (this._options.sync_direction !== 'pull') {
        throw new AuthNeededForPushOrSyncError(this._options.sync_direction!);
      }
    }
    else {
      // @ts-ignore
      throw new InvalidAuthenticationTypeError(this._options.auth.type);
    }
  }

  /**
   * Connect to remote repository
   *
   * Call this just after creating instance.
   */
  async connectToRemote (repos: nodegit.Repository): Promise<SyncResult> {
    const remote = await this._addRemote(repos, this._remoteURL);
    const onlyFetch = this._options.sync_direction === 'pull';
    await this._ensureRemoteRepository(remote, onlyFetch);

    let syncResult: SyncResult;
    if (this.upstream_branch === '') {
      this._gitDDB.logger.debug('upstream_branch is empty. tryPush..');
      // Empty upstream_branch shows that an empty repository has been created on a remote site.
      // _trySync() pushes local commits to the remote branch.
      syncResult = await this.tryPush().catch(err => {
        // Push fails if the remote repository has already changed by another client.
        // It's rare. Throw exception.
        throw err;
      });

      // An upstream branch must be set to a local branch after the first push
      // because refs/remotes/origin/main is not created until the first push.
      await nodegit.Branch.setUpstream(
        await repos.getBranch(this._gitDDB.defaultBranch),
        `origin/${this._gitDDB.defaultBranch}`
      );
      this.upstream_branch = `origin/${this._gitDDB.defaultBranch}`;
    }
    else {
      this._gitDDB.logger.debug('upstream_branch exists. trySync..');
      syncResult = await this.trySync();
    }

    if (this._options.live) {
      this._syncTimer = setInterval(() => {
        this.trySync();
      }, this._options.interval!);
    }
    return syncResult;
  }

  /**
   * Create repository on remote site
   * @remarks
   * auth.type must be 'github'
   */
  async createRepositoryOnRemote (remoteURL: string) {
    this.upstream_branch = '';
    if (this._options.auth?.type === 'github') {
      const urlArray = remoteURL.split('/');
      const owner = urlArray[urlArray.length - 2];
      const repo = urlArray[urlArray.length - 1];
      await this._octokit!.repos.createForAuthenticatedUser({
        name: repo,
      });
      // May throw HttpError
      // HttpError: Repository creation failed.:
      // {"resource":"Repository","code":"custom","field":"name","message":"name already exists on this account
    }
    else {
      // TODO:
      throw new Error('Cannot create remote repository because auth type is not github');
    }
  }

  /**
   * Delete repository on remote site
   * @remarks
   * auth.type must be 'github'
   */
  async destroyRepositoryOnRemote (_remoteURL: string) {
    if (this._options.auth?.type === 'github') {
      const urlArray = _remoteURL.split('/');
      const owner = urlArray[urlArray.length - 2];
      const repo = urlArray[urlArray.length - 1];
      await this._octokit!.repos.delete({ owner, repo });
    }
  }

  // Get remote from arguments to be called from test
  // eslint-disable-next-line complexity
  private async _checkFetch (remote: nodegit.Remote) {
    const remoteURL = remote.url();
    const error = String(
      await remote.connect(nodegit.Enums.DIRECTION.FETCH, this.callbacks).catch(err => err)
    );
    await remote.disconnect();
    if (error !== 'undefined') this._gitDDB.logger.debug('connect fetch error: ' + error);
    switch (true) {
      case error === 'undefined':
        break;
      case error.startsWith('Error: unsupported URL protocol'):
        throw new InvalidURLFormatError(remoteURL);
      case error.startsWith('Error: failed to resolve address'):
        throw new UnresolvedHostError(remoteURL);
      case error.startsWith('Error: request failed with status code: 401'):
      case error.startsWith('Error: request failed with status code: 404'):
      case error.startsWith('Error: Method connect has thrown an error'):
      case error.startsWith('Error: ERROR: Repository not found'):
        // Remote repository does not exist, or you do not have permission to the private repository
        throw new RemoteRepositoryNotFoundError(remoteURL);
      case error.startsWith('Failed to retrieve list of SSH authentication methods'):
        throw new InvalidSSHKeyFormatError();
      default:
        throw new Error(error);
    }
    return 'ok';
  }

  // Get remote from arguments to be called from test
  private async _checkPush (remote: nodegit.Remote) {
    const error = String(
      await remote.connect(nodegit.Enums.DIRECTION.PUSH, this.callbacks).catch(err => err)
    );
    await remote.disconnect();
    if (error !== 'undefined') this._gitDDB.logger.debug('connect push error: ' + error);
    switch (true) {
      case error === 'undefined':
        break;
      case error.startsWith('Error: request failed with status code: 401'):
        throw new PushAuthenticationError();
      case error.startsWith('Error: ERROR: Permission to'): {
        // Remote repository is read only
        throw new PushPermissionDeniedError();
      }
      default:
        throw new Error(error);
    }
    return 'ok';
  }

  /**
   * Add remote repository (git remote add)
   * @internal
   */
  // eslint-disable-next-line complexity
  private async _addRemote (repos: nodegit.Repository, remoteURL: string) {
    // Check if remote repository already exists
    let remote = await nodegit.Remote.lookup(repos, 'origin').catch(() => {});
    if (remote === undefined) {
      this._gitDDB.logger.debug('remote add: ' + remoteURL);
      // Add remote repository
      remote = await nodegit.Remote.create(repos, 'origin', remoteURL);
    }
    else if (remote.url() !== remoteURL) {
      this._gitDDB.logger.debug('remote rename from: ' + remote.url() + ' to ' + remoteURL);
      nodegit.Remote.setUrl(repos, 'origin', remoteURL);
    }
    else {
      this._gitDDB.logger.debug('remote exists: ' + remoteURL);
    }
    return remote;
  }

  private async _ensureRemoteRepository (remote: nodegit.Remote, onlyFetch?: boolean) {
    const remoteURL = remote.url();
    // Check fetch and push
    const result = await this._checkFetch(remote).catch(err => {
      if (
        err instanceof RemoteRepositoryNotFoundError &&
        this._options.auth?.type === 'github'
      ) {
        return 'create';
      }

      throw err;
    });
    if (result === 'create') {
      this._gitDDB.logger.debug('create remote repository');
      // Try to create repository by octokit
      await this.createRepositoryOnRemote(remoteURL).catch(err => {
        // Expected errors:
        //  - The private repository which has the same name exists.
        //  - Authentication error
        //  - Permission error
        throw err;
      });
    }
    else {
      this._gitDDB.logger.debug('remote repository exists');
    }
    if (!onlyFetch) {
      await this._checkPush(remote);
    }
  }

  /**
   * Get remoteURL
   */
  remoteURL () {
    return this._remoteURL;
  }

  /**
   * Get remote options
   */
  options () {
    return this._options;
  }

  /**
   * Stop sync
   */
  cancel () {
    if (!this._options.live) return false;

    // Cancel retrying
    this._retrySyncCounter = 0;

    if (this._syncTimer) {
      clearInterval(this._syncTimer);
    }
    this._options.live = false;
    return true;
  }

  /**
   * Alias of cancel()
   */
  pause () {
    return this.cancel();
  }

  /**
   * Resume sync
   */
  resume (options?: { interval?: number; retry?: number }) {
    if (this._options.live) return false;

    options ??= {
      interval: undefined,
      retry: undefined,
    };
    if (options.interval !== undefined) {
      if (options.interval >= minimumSyncInterval) {
        this._options.interval = options.interval;
      }
      else {
        throw new IntervalTooSmallError(minimumSyncInterval, options.interval);
      }
    }
    if (options.retry !== undefined) {
      this._options.retry = options.retry;
    }

    if (this._gitDDB.repository() !== undefined) {
      this._options.live = true;
      this._syncTimer = setInterval(() => {
        this.trySync();
      }, this._options.interval!);
    }
    return true;
  }

  private _retrySyncCounter = 0;

  private async _retrySync (): Promise<SyncResult> {
    if (this._retrySyncCounter === 0) {
      this._retrySyncCounter = this._options.retry!;
    }
    while (this._retrySyncCounter > 0) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(this._options.retry_interval!);
      if (this._retrySyncCounter === 0) {
        break;
      }
      this._gitDDB.logger.debug(
        ConsoleStyle.BgRed().tag()`...retrySync: ${(
          this._options.retry! -
          this._retrySyncCounter +
          1
        ).toString()}`
      );
      // eslint-disable-next-line no-await-in-loop
      const result = await this.trySync().catch((err: Error) => {
        // Invoke retry fail event
        this._gitDDB.logger.debug('retrySync failed: ' + err.message);
        this._retrySyncCounter--;
        if (this._retrySyncCounter === 0) {
          throw err;
        }
        return undefined;
      });
      if (result !== undefined) {
        return result;
      }
    }
    // This line is reached when cancel() set _retrySyncCounter to 0;
    return 'canceled';
  }

  tryPush (taskId?: string) {
    taskId ??= this._gitDDB.newTaskId();
    return new Promise(
      (resolve: (value: SyncResult | PromiseLike<SyncResult>) => void, reject) => {
        this._gitDDB._unshiftSyncTaskToTaskQueue({
          label: 'push',
          taskId: taskId!,
          func: () =>
            push_worker(this._gitDDB, this, taskId!)
              .then((result: SyncResult) => {
                // Invoke success event
                resolve(result);
              })
              .catch(err => {
                // Call sync_worker() to resolve CannotPushBecauseUnfetchedCommitExistsError
                if (this._retrySyncCounter === 0) {
                  const promise = this._retrySync();
                  // Invoke fail event
                  // Give promise to the event.
                }
                else {
                  // Invoke fail event
                }
                reject(err);
              }),
        });
      }
    );
  }

  trySync (taskId?: string) {
    taskId ??= this._gitDDB.newTaskId();
    return new Promise(
      (resolve: (value: SyncResult | PromiseLike<SyncResult>) => void, reject) => {
        this._gitDDB._unshiftSyncTaskToTaskQueue({
          label: 'sync',
          taskId: taskId!,
          func: () =>
            sync_worker(this._gitDDB, this, taskId!)
              .then(result => {
                // Invoke success event
                resolve(result);
              })
              .catch(err => {
                if (this._retrySyncCounter === 0) {
                  const promise = this._retrySync();
                  // Invoke fail event
                  // Give promise to the event.
                }
                else {
                  // Invoke fail event
                }
                reject(err);
              }),
        });
      }
    );
  }
}
