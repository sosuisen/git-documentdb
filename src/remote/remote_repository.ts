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
}
