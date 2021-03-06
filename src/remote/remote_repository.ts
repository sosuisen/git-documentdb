/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import nodegit from '@sosuisen/nodegit';
import { Octokit } from '@octokit/rest';
import { Err } from '../error';
import { RemoteOptions } from '../types';
import { NETWORK_RETRY, NETWORK_RETRY_INTERVAL } from '../const';
import { sleep } from '../utils';

/**
 * GitOrigin
 */
type GitRemoteAction = 'add' | 'change' | 'exist';

/**
 * Remote repository class
 *
 * @public
 */
export class RemoteRepository {
  private _options: RemoteOptions;

  private _octokit: Octokit | undefined;

  /**
   * Constructor
   *
   * @throws {@link Err.InvalidAuthenticationTypeError}
   *
   * @public
   */
  constructor (options: RemoteOptions) {
    if (options.remoteUrl === undefined || options.remoteUrl === '') {
      throw new Err.UndefinedRemoteURLError();
    }
    this._options = (JSON.parse(JSON.stringify(options)) as unknown) as RemoteOptions;
    this._options.connection ??= {
      type: 'none',
    };

    if (this._options.connection.type === 'github') {
      this._options.connection.private ??= true;
      this._octokit = new Octokit({
        auth: this._options.connection.personalAccessToken,
      });
    }
    else if (this._options.connection.type === 'none') {
      // nop
    }
    else {
      throw new Err.InvalidAuthenticationTypeError(this._options.connection.type);
    }
  }

  /**
   * Create a repository on a remote site
   * @remarks
   * connection.type must be 'github'
   *
   * @throws {@link Err.UndefinedPersonalAccessTokenError}
   * @throws {@link Err.PersonalAccessTokenForAnotherAccountError}
   * @throws {@link Err.CannotConnectError}
   *
   *  may include the following errors:
   *
   *  - HttpError
   *
   *  - Authentication error
   *
   *  - Permission error
   *
   *  - Other network errors
   *
   * @throws {@link Err.AuthenticationTypeNotAllowCreateRepositoryError}
   *
   * @public
   */
  async create () {
    if (this._options.connection?.type === 'github') {
      // @ts-ignore
      if (this._options.connection.personalAccessToken === undefined) {
        throw new Err.UndefinedPersonalAccessTokenError();
      }
      const urlArray = this._options.remoteUrl!.split('/');
      const owner = urlArray[urlArray.length - 2];
      let repo = urlArray[urlArray.length - 1];
      if (repo.endsWith('.git')) {
        repo = repo.replace(/\.git$/, '');
      }
      let result;
      let retry = 0;
      for (; retry < NETWORK_RETRY; retry++) {
        // @ts-ignore
        // eslint-disable-next-line no-await-in-loop
        result = await this._octokit!.repos.createForAuthenticatedUser({
          name: repo,
          private: this._options.connection.private,
        }).catch((err: Error) => {
          // May throw HttpError if the repository which has the same name already exists.
          // HttpError: Repository creation failed.:
          // {"resource":"Repository","code":"custom","field":"name","message":"name already exists on this account
          return err;
        });
        if (result instanceof Error) {
          // console.log(`NetworkError in creating remote repository: ${this._options.remoteUrl}, ` + result);
        }
        else {
          // Check owner name because personal access token does not check owner
          if (result.data.full_name === `${owner}/${repo}`) {
            break;
          }
          throw new Err.PersonalAccessTokenForAnotherAccountError();
        }
        // eslint-disable-next-line no-await-in-loop
        await sleep(NETWORK_RETRY_INTERVAL);
      }
      if (result instanceof Error) {
        throw new Err.CannotConnectError(retry, this._options.remoteUrl!, result.message);
      }
    }
    else {
      throw new Err.AuthenticationTypeNotAllowCreateRepositoryError(
        this._options.connection?.type
      );
    }
  }

  /**
   * Delete a repository on a remote site
   * @remarks
   * connection.type must be 'github'
   *
   * @throws {@link Err.UndefinedPersonalAccessTokenError}
   * @throws {@link Err.CannotConnectError}
   *
   *  may include the following errors:
   *
   *  - HttpError
   *
   *  - Authentication error
   *
   *  - Permission for private repository error
   *
   *  - Other network errors
   *
   * @throws {@link Err.AuthenticationTypeNotAllowCreateRepositoryError}
   *
   * @public
   */
  async destroy () {
    if (this._options.connection?.type === 'github') {
      // @ts-ignore
      if (this._options.connection?.personalAccessToken === undefined) {
        throw new Err.UndefinedPersonalAccessTokenError();
      }
      const urlArray = this._options.remoteUrl!.split('/');
      const owner = urlArray[urlArray.length - 2];
      let repo = urlArray[urlArray.length - 1];
      if (repo.endsWith('.git')) {
        repo = repo.replace(/\.git$/, '');
      }
      let result;
      let retry = 0;
      for (; retry < NETWORK_RETRY; retry++) {
        // @ts-ignore
        // eslint-disable-next-line no-await-in-loop
        result = await this._octokit!.repos.delete({
          owner,
          repo,
        }).catch((err: Error) => {
          return err;
        });
        if (result instanceof Error) {
          // console.log(`NetworkError in creating remote repository: ${this._options.remoteUrl}, ` + result);
        }
        else {
          break;
        }
        // eslint-disable-next-line no-await-in-loop
        await sleep(NETWORK_RETRY_INTERVAL);
      }
      if (result instanceof Error) {
        throw new Err.CannotConnectError(retry, this._options.remoteUrl!, result.message);
      }
    }
    else {
      throw new Err.AuthenticationTypeNotAllowCreateRepositoryError(
        this._options.connection?.type
      );
    }
  }

  /**
   * Get or create Git remote named 'origin'
   *
   * (git remote add)
   *
   * @internal
   */
  // eslint-disable-next-line complexity
  private async _getOrCreateGitRemote (
    repos: nodegit.Repository,
    remoteURL: string
  ): Promise<[GitRemoteAction, nodegit.Remote]> {
    let result: GitRemoteAction;
    // Check if remote repository already exists
    let remote = await nodegit.Remote.lookup(repos, 'origin').catch(() => {});
    if (remote === undefined) {
      // Add remote repository
      remote = await nodegit.Remote.create(repos, 'origin', remoteURL);
      result = 'add';
    }
    else if (remote.url() !== remoteURL) {
      nodegit.Remote.setUrl(repos, 'origin', remoteURL);
      result = 'change';
    }
    else {
      result = 'exist';
    }
    return [result, remote];
  }

  /**
   * Check connection by FETCH
   *
   * @throws {@link Err.InvalidURLError}
   * @throws {@link Err.RemoteRepositoryNotFoundError}
   * @throws Error (Other errors from NodeGit.Remote#connect())
   *
   * @internal
   */
  // eslint-disable-next-line complexity
  private async _checkFetch (
    remote: nodegit.Remote,
    credentialCallbacks: { [key: string]: any }
  ): Promise<'exist'> {
    const remoteURL = remote.url();
    const error = String(
      await remote
        .connect(nodegit.Enums.DIRECTION.FETCH, credentialCallbacks)
        .catch(err => err)
    );
    await remote.disconnect();
    // if (error !== 'undefined') console.warn('connect fetch error: ' + error);
    switch (true) {
      case error === 'undefined':
        break;
      case error.startsWith('Error: unsupported URL protocol'):
      case error.startsWith('Error: failed to resolve address'):
      case error.startsWith('Error: failed to send request'):
        throw new Err.InvalidURLError(remoteURL + ':' + error);
      case error.startsWith('Error: unexpected HTTP status code: 4'): // 401, 404 on Ubuntu
      case error.startsWith('Error: request failed with status code: 4'): // 401, 404 on Windows
      case error.startsWith('Error: Method connect has thrown an error'):
      case error.startsWith('Error: ERROR: Repository not found'):
        // Remote repository does not exist, or you do not have permission to the private repository
        throw new Err.RemoteRepositoryNotFoundError(remoteURL + ':' + error);
      case error.startsWith(
        'Error: remote credential provider returned an invalid cred type'
      ): // on Ubuntu
      case error.startsWith('Failed to retrieve list of SSH authentication methods'):
      case error.startsWith('Error: too many redirects or authentication replays'):
        throw new Err.FetchPermissionDeniedError(error);
      default:
        throw new Error(error);
    }
    return 'exist';
  }

  /**
   * Check connection by PUSH
   *
   * @throws {@link Err.InvalidURLError}
   * @throws {@link Err.RemoteRepositoryNotFoundError}
   * @throws {@link Err.PushPermissionDeniedError}
   * @throws Error (Other errors from NodeGit.Remote#connect())
   *
   * @internal
   */
  // eslint-disable-next-line complexity
  private async _checkPush (
    remote: nodegit.Remote,
    credentialCallbacks: { [key: string]: any }
  ) {
    const remoteURL = remote.url();
    const error = String(
      await remote
        .connect(nodegit.Enums.DIRECTION.PUSH, credentialCallbacks)
        .catch(err => err)
    );
    await remote.disconnect();
    // if (error !== 'undefined') console.warn('connect push error: ' + error);
    switch (true) {
      case error === 'undefined':
        break;
      case error.startsWith('Error: unsupported URL protocol'):
      case error.startsWith('Error: failed to resolve address'):
      case error.startsWith('Error: failed to send request'):
        throw new Err.InvalidURLError(remoteURL);
      case error.startsWith('Error: unexpected HTTP status code: 4'): // 401, 404 on Ubuntu
      case error.startsWith('Error: request failed with status code: 4'): // 401, 404 on Windows
      case error.startsWith('Error: Method connect has thrown an error'):
      case error.startsWith('Error: ERROR: Repository not found'): {
        // Remote repository does not exist, or you do not have permission to the private repository
        throw new Err.RemoteRepositoryNotFoundError(remoteURL);
      }
      // Invalid personal access token
      // Personal access token is read only
      case error.startsWith(
        'Error: remote credential provider returned an invalid cred type'
      ): // on Ubuntu
      case error.startsWith('Error: too many redirects or authentication replays'):
      case error.startsWith('Error: ERROR: Permission to'): {
        throw new Err.PushPermissionDeniedError(error);
      }
      default:
        throw new Error(error);
    }
    return 'ok';
  }

  /**
   * Set a remote repository and connect to the remote repository.
   * A remote repository will be created if not exists.
   *
   * @throws {@link Err.UndefinedPersonalAccessTokenError} (from RemoteRepository#create())
   * @throws {@link Err.PersonalAccessTokenForAnotherAccountError} (from RemoteRepository#create())
   * @throws {@link Err.CannotConnectError} (from RemoteRepository#create())
   * @throws {@link Err.AuthenticationTypeNotAllowCreateRepositoryError} (from RemoteRepository#create())
   * @throws {@link Err.FetchConnectionFailedError}
   * @throws {@link Err.CannotCreateRemoteRepositoryError}
   * @throws {@link Err.PushConnectionFailedError}
   *
   * @public
   */
  async connect (
    repos: nodegit.Repository,
    credentialCallbacks: { [key: string]: any },
    onlyFetch?: boolean
  ): Promise<[GitRemoteAction, 'exist' | 'create']> {
    // Get NodeGit.Remote
    const [gitResult, remote] = await this._getOrCreateGitRemote(
      repos,
      this._options.remoteUrl!
    );

    // Check fetch and push by NodeGit.Remote
    const remoteResult: 'exist' | 'create' = await this._checkFetch(
      remote,
      credentialCallbacks
    ).catch(err => {
      if (
        err instanceof Err.RemoteRepositoryNotFoundError &&
        this._options.connection?.type === 'github'
      ) {
        return 'create';
      }

      throw new Err.FetchConnectionFailedError(err.message);
    });
    if (remoteResult === 'create') {
      // Try to create repository by octokit
      await this.create().catch(err => {
        // App may check permission or
        throw new Err.CannotCreateRemoteRepositoryError(err.message);
      });
    }

    if (!onlyFetch) {
      await this._checkPush(remote, credentialCallbacks).catch(err => {
        throw new Err.PushConnectionFailedError(err.message);
      });
    }
    return [gitResult, remoteResult];
  }
}
