/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import { Octokit } from '@octokit/rest';
import nodegit from '@sosuisen/nodegit';
import {
  InvalidAuthenticationTypeError,
  InvalidSSHKeyFormatError,
  InvalidSSHKeyPathError,
  InvalidURLFormatError,
  PushPermissionDeniedError,
  RemoteRepositoryNotFoundError,
  RepositoryNotOpenError,
  UndefinedGitHubAuthenticationError,
  UndefinedPersonalAccessTokenError,
  UndefinedRemoteURLError,
  UnresolvedHostError,
} from '../error';
import { IRemoteAccess, RemoteAuthGitHub, RemoteAuthSSH, RemoteOptions } from '../types';
import { AbstractDocumentDB } from '../types_gitddb';
import { _sync_worker_impl } from './sync';

export async function syncImpl (
  this: AbstractDocumentDB,
  remoteURL: string,
  options?: RemoteOptions
) {
  const remote = new RemoteAccess(this, remoteURL, options);
  await remote.connectToRemote();
  return remote;
}

const defaultPullInterval = 10000;

export class RemoteAccess implements IRemoteAccess {
  private _gitDDB: AbstractDocumentDB;
  private _options: RemoteOptions;
  private _checkoutOptions: nodegit.CheckoutOptions;
  private _syncTimer: NodeJS.Timeout | undefined;
  private _octokit: Octokit | undefined;
  private _remoteURL: string;

  callbacks: { [key: string]: any };
  author: nodegit.Signature;
  committer: nodegit.Signature;

  constructor (_gitDDB: AbstractDocumentDB, _remoteURL: string, _options: RemoteOptions) {
    this._gitDDB = _gitDDB;
    this._remoteURL = _remoteURL;
    if (_remoteURL === undefined || _remoteURL === '') {
      throw new UndefinedRemoteURLError();
    }

    this._options = _options;
    this._options ??= {
      live: false,
      sync_direction: undefined,
      interval: undefined,
      auth: undefined,
    };
    this._options.sync_direction ??= 'both';
    this._options.interval ??= defaultPullInterval;

    this.callbacks = {
      credentials: this._createCredential(),
    };
    if (process.platform === 'darwin') {
      // @ts-ignore
      this._callbacks.certificateCheck = () => 0;
    }

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

  private _createCredential () {
    this._options.auth ??= { type: 'none' };

    if (this._options.auth.type === 'github') {
      const auth = this._options.auth as RemoteAuthGitHub;
      if (!auth.personal_access_token) {
        throw new UndefinedPersonalAccessTokenError();
      }
      this._octokit = new Octokit({
        auth: auth.personal_access_token,
      });
      const credentials = (url: string, userName: string) => {
        return nodegit.Cred.userpassPlaintextNew(userName, auth.personal_access_token!);
      };
      return credentials;
    }
    else if (this._options.auth.type === 'ssh') {
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
    }
    // @ts-ignore
    else if (this._options.auth.type !== 'none') {
      // @ts-ignore
      throw new InvalidAuthenticationTypeError(this._options.auth.type);
    }
  }

  private async _createRepository () {
    if (this._options.auth?.type === 'github') {
      await this._octokit!.repos.createForAuthenticatedUser({
        name: this._gitDDB.dbName(),
      }).catch(err => {
        throw err;
      });
      // May throw HttpError
      // HttpError: Repository creation failed.:
      // {"resource":"Repository","code":"custom","field":"name","message":"name already exists on this account
    }
  }

  private async _deleteRepository (owner: string, repo: string) {
    if (this._options.auth?.type === 'github') {
      await this._octokit!.repos.delete({ owner, repo });
    }
  }

  /**
   * Add remote repository (git remote add)
   * @internal
   */
  // eslint-disable-next-line complexity
  private async _addRemoteRepository (_remoteURL: string, onlyFetch?: boolean) {
    const repos = this._gitDDB.getRepository();
    if (repos === undefined) {
      throw new RepositoryNotOpenError();
    }
    // Check if already exists
    let remote = await nodegit.Remote.lookup(repos, 'origin');
    if (remote === undefined) {
      // Add remote repository
      remote = await nodegit.Remote.create(repos, 'origin', _remoteURL);
    }
    else if (remote.url() !== _remoteURL) {
      nodegit.Remote.setUrl(repos, 'origin', _remoteURL);
    }

    // Check fetch and push
    const fetchCode = await remote
      .connect(nodegit.Enums.DIRECTION.FETCH, this.callbacks)
      .catch(err => err);
    switch (true) {
      case fetchCode.startsWith('Error: unsupported URL protocol'):
        throw new InvalidURLFormatError(_remoteURL);
      case fetchCode.startsWith('Error: failed to resolve address'):
        throw new UnresolvedHostError(_remoteURL);
      case fetchCode.startsWith('Error: ERROR: Repository not found'):
        // Remote repository does not exist, or you do not have permission to the private repository
        if (_remoteURL.match(/github\.com/)) {
          // Try to create repository by octokit
          await this._createRepository().catch(err => {
            // Expected errors:
            //  - The private repository which has the same name exists.
            //  - Authentication error
            //  - Permission error
            throw err;
          });
          break;
        }
        else {
          throw new RemoteRepositoryNotFoundError(_remoteURL);
        }
      case fetchCode.startsWith('Failed to retrieve list of SSH authentication methods'):
        throw new InvalidSSHKeyFormatError();
      default:
        break;
    }

    if (!onlyFetch) {
      const pushCode = await remote
        .connect(nodegit.Enums.DIRECTION.PUSH, this.callbacks)
        .catch(err => err);
      switch (true) {
        case pushCode.startsWith('Error: ERROR: Permission to'): {
          // Remote repository is read only
          throw new PushPermissionDeniedError();
        }
        default:
          break;
      }
    }
  }

  /**
   * Connect to remote repository
   *
   * Call this just after creating instance.
   */
  async connectToRemote () {
    await this._addRemoteRepository(this._remoteURL).catch(err => {
      throw err;
    });
    await this._trySync();

    if (this._options.live) {
      this._syncTimer = setInterval(this._trySync, this._options.interval!);
    }
  }
  /**
   * Get remoteURL
   */
  remoteURL () {
    return this._remoteURL;
  }

  /**
   * Stop sync
   */
  cancel () {
    if (this._syncTimer) {
      clearInterval(this._syncTimer);
    }
  }

  /**
   * Alias of cancel()
   */
  pause () {
    this.cancel();
  }

  /**
   * Resume sync
   */
  resume () {
    if (this._options.live) {
      this._syncTimer = setInterval(this._trySync, this._options.interval!);
    }
  }

  private _trySync () {
    return new Promise((resolve, reject) => {
      this._gitDDB._unshiftSyncTaskToTaskQueue({
        taskName: 'sync',
        func: () =>
          _sync_worker_impl
            .call(this._gitDDB, this)
            .then(result => {
              resolve(result);
            })
            .catch(err => reject(err)),
      });
    });
  }
}