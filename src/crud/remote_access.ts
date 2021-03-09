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
  InvalidSSHKeyFormatError,
  InvalidSSHKeyPathError,
  InvalidURLFormatError,
  PushPermissionDeniedError,
  RemoteRepositoryNotFoundError,
  RepositoryNotOpenError,
  UndefinedGitHubAuthenticationError,
  UndefinedRemoteURLError,
  UnresolvedHostError,
} from '../error';
import { IRemoteAccess, RemoteOptions } from '../types';
import { AbstractDocumentDB } from '../types_gitddb';
import { _sync_worker_impl } from './sync';

export function syncImpl (
  this: AbstractDocumentDB,
  remoteURL: string,
  options: RemoteOptions
) {
  return new RemoteAccess(this, remoteURL, options);
}

const defaultPullInterval = 10000;

export class RemoteAccess implements IRemoteAccess {
  private _gitDDB: AbstractDocumentDB;
  private _options: RemoteOptions;
  private _checkoutOptions: nodegit.CheckoutOptions;
  private _pullTimer: NodeJS.Timeout | undefined;
  private _octokit: Octokit;

  callbacks: { [key: string]: any };
  author: nodegit.Signature;
  committer: nodegit.Signature;

  constructor (_gitDDB: AbstractDocumentDB, _remoteURL: string, _options: RemoteOptions) {
    this._gitDDB = _gitDDB;

    if (_remoteURL === undefined || _remoteURL === '') {
      throw new UndefinedRemoteURLError();
    }

    this._options = _options;
    this._options ??= {
      live: false,
      interval: undefined,
      github: undefined,
      ssh: undefined,
    };
    this._options.interval ??= defaultPullInterval;

    this._options.github ??= {
      personal_access_token: undefined,
    };
    this._options.github.personal_access_token ??= '';

    this._options.ssh ??= {
      use: false,
      private_key_path: '',
      public_key_path: '',
      pass_phrase: undefined,
    };

    if (this._options.ssh?.use) {
      if (
        this._options.ssh?.private_key_path === undefined ||
        this._options.ssh?.private_key_path === ''
      ) {
        throw new InvalidSSHKeyPathError(this._options.ssh.private_key_path);
      }
      if (
        this._options.ssh?.public_key_path === undefined ||
        this._options.ssh?.public_key_path === ''
      ) {
        throw new InvalidSSHKeyPathError(this._options.ssh.public_key_path);
      }
      this._options.ssh.pass_phrase ??= '';
    }

    this.callbacks = {
      credentials: function (url: string, userName: string) {
        return nodegit.Cred.sshKeyNew(
          userName,
          this._options.ssh!.public_key_path,
          this._options.ssh!.private_key_path,
          this._options.ssh!.pass_phrase!
        );
      },
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

    this._octokit = new Octokit({
      auth: this._options.github.personal_access_token,
    });

    this._addRemoteRepository(_remoteURL).catch(err => {
      throw err;
    });
    this._trySync();

    if (this._options.live) {
      this._pullTimer = setInterval(this._trySync, this._options.interval);
    }
  }

  private async _createRepository () {
    await this._octokit.repos
      .createForAuthenticatedUser({ name: this._gitDDB.dbName() })
      .catch(err => {
        throw err;
      });
    // May throw HttpError
    // HttpError: Repository creation failed.:
    // {"resource":"Repository","code":"custom","field":"name","message":"name already exists on this account
  }

  private async _deleteRepository (owner: string, repo: string) {
    await this._octokit.repos.delete({ owner, repo });
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
          if (this._options.github?.personal_access_token === '') {
            throw new UndefinedGitHubAuthenticationError(
              'Personal access token is needed.'
            );
          }
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
        throw new InvalidSSHKeyFormatError(this._options.ssh!.private_key_path);
      default:
        break;
    }

    if (!onlyFetch) {
      const pushCode = await remote
        .connect(nodegit.Enums.DIRECTION.PUSH, this.callbacks)
        .catch(err => err);
      switch (true) {
        case pushCode.startsWith('Error: ERROR: Permission to'):
          // Remote repository is read only
          throw new PushPermissionDeniedError(this._options.ssh!.private_key_path);
        default:
          break;
      }
    }
  }

  /**
   * stopSync
   */
  cancel () {
    if (this._pullTimer) {
      clearInterval(this._pullTimer);
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
