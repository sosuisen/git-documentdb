/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import fs from 'fs';
import git from 'isomorphic-git';
import { Logger } from 'tslog';
import {
  CannotConnectError,
  HTTPError401AuthorizationRequired,
  HTTPError403Forbidden,
  HTTPError404NotFound,
  InvalidAuthenticationTypeError,
  InvalidGitRemoteError,
  InvalidRepositoryURLError,
  InvalidURLFormatError,
  NetworkError,
  UnfetchedCommitExistsError,
} from 'git-documentdb-remote-errors';
import httpClient from 'isomorphic-git/http/node';
import { ConnectionSettingsGitHub, RemoteOptions } from '../types';
import { NETWORK_RETRY, NETWORK_RETRY_INTERVAL } from '../const';
import { sleep } from '../utils';

/**
 * @public
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const type = 'remote';

/**
 * @public
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const name = 'isomorphic-git';

/**
 * Insert credential options for GitHub
 *
 * @throws {@link InvalidURLFormatError}
 * @throws {@link InvalidRepositoryURLError}
 *
 * @internal
 */
function createCredentialForGitHub (options: RemoteOptions) {
  if (!options.remoteUrl!.match(/^https?:\/\//)) {
    throw new InvalidURLFormatError('http protocol required in createCredentialForGitHub');
  }
  const connection = options.connection as ConnectionSettingsGitHub;
  if (!connection.personalAccessToken) {
    return undefined;
  }
  const urlArray = options.remoteUrl!.replace(/^https?:\/\//, '').split('/');
  // github.com/account_name/repository_name
  if (urlArray.length !== 3) {
    throw new InvalidRepositoryURLError(options.remoteUrl!);
  }

  const credentials =
    connection.personalAccessToken !== undefined
      ? () => ({ username: connection.personalAccessToken })
      : undefined;

  return credentials;
}

/**
 * Create credential options
 *
 * @throws {@link InvalidAuthenticationTypeError}
 *
 * @throws # Error from createCredentialForGitHub
 * @throws - {@link InvalidURLFormatError}
 * @throws - {@link InvalidRepositoryURLError}
 *
 * @internal
 */
export function createCredentialCallback (options: RemoteOptions) {
  options.connection ??= { type: 'none' };
  if (options.connection.type === 'github') {
    return createCredentialForGitHub(options);
  }
  else if (options.connection.type === 'none') {
    return undefined;
  }
  // @ts-ignore
  throw new InvalidAuthenticationTypeError(options.connection.type);
}

/**
 * Clone
 *
 * @throws {@link InvalidURLFormatError}
 * @throws {@link NetworkError}
 * @throws {@link HTTPError401AuthorizationRequired}
 * @throws {@link HTTPError404NotFound}
 * @throws {@link CannotConnectError}
 *
 * @throws # Errors from createCredentialForGitHub
 * @throws - {@link HttpProtocolRequiredError}
 * @throws - {@link InvalidRepositoryURLError}
 *
 * @throws # Errors from createCredential
 * @throws - {@link InvalidAuthenticationTypeError}
 *
 * @internal
 */
// eslint-disable-next-line complexity
export async function clone (
  workingDir: string,
  remoteOptions: RemoteOptions,
  remoteName?: string,
  logger?: Logger
): Promise<void> {
  logger ??= new Logger({
    name: 'plugin-nodegit',
    minLevel: 'trace',
    displayDateTime: false,
    displayFunctionName: false,
    displayFilePath: 'hidden',
  });
  logger.debug(`remote-isomorphic-git: clone: ${remoteOptions.remoteUrl}`);

  remoteName ??= 'origin';

  remoteOptions.retry ??= NETWORK_RETRY;
  remoteOptions.retryInterval ??= NETWORK_RETRY_INTERVAL;

  const cloneOption: any = {
    fs,
    dir: workingDir,
    http: httpClient,
    url: remoteOptions.remoteUrl!,
  };
  const cred = createCredentialCallback(remoteOptions);
  if (cred) {
    cloneOption.onAuth = cred;
  }
  for (let i = 0; i < remoteOptions.retry! + 1; i++) {
    // eslint-disable-next-line no-await-in-loop
    const res = await git.clone(cloneOption).catch(err => err);

    let error = '';
    if (res instanceof Error) {
      error = res.toString();
    }
    else {
      break;
    }

    // if (error !== 'undefined') console.warn('connect fetch error: ' + error);
    switch (true) {
      case error.startsWith('UrlParseError:'):
      case error.startsWith('Error: getaddrinfo ENOTFOUND'):
        throw new InvalidURLFormatError(error);

      case error.startsWith('Error: connect EACCES'):
      case error.startsWith('Error: connect ECONNREFUSED'):
        // isomorphic-git throws this when network is limited.
        if (i >= remoteOptions.retry!) {
          throw new NetworkError(error);
        }
        break;

      case error.startsWith('HttpError: HTTP Error: 401 Authorization Required'):
        throw new HTTPError401AuthorizationRequired(error);

      case error.startsWith('HttpError: HTTP Error: 404 Not Found'):
        throw new HTTPError404NotFound(error);

      default:
        if (i >= remoteOptions.retry!) {
          throw new CannotConnectError(error);
        }
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(remoteOptions.retryInterval!);
  }

  // Rewrite remote

  // default is 'origin'
  if (remoteName !== 'origin') {
    // Add remote
    await git.setConfig({
      fs,
      dir: workingDir,
      path: `remote.${remoteName}.url`,
      value: remoteOptions.remoteUrl!,
    });
    await git.setConfig({
      fs,
      dir: workingDir,
      path: `remote.${remoteName}.fetch`,
      value: `+refs/heads/*:refs/remotes/${remoteName}/*`,
    });
  }
}

/**
 * Check connection by FETCH
 *
 * @throws {@link InvalidGitRemoteError}
 * @throws {@link InvalidURLFormatError}
 * @throws {@link NetworkError}
 * @throws {@link HTTPError401AuthorizationRequired}
 * @throws {@link HTTPError404NotFound}
 * @throws {@link CannotConnectError}
 *
 * @throws # Errors from createCredentialForGitHub
 * @throws - {@link HttpProtocolRequiredError}
 * @throws - {@link InvalidRepositoryURLError}
 *
 * @throws # Errors from createCredential
 * @throws - {@link InvalidAuthenticationTypeError}
 *
 * @internal
 */
// eslint-disable-next-line complexity
export async function checkFetch (
  workingDir: string,
  remoteOptions: RemoteOptions,
  remoteName?: string,
  logger?: Logger
): Promise<boolean> {
  logger ??= new Logger({
    name: 'plugin-nodegit',
    minLevel: 'trace',
    displayDateTime: false,
    displayFunctionName: false,
    displayFilePath: 'hidden',
  });
  remoteName ??= 'origin';

  const urlOfRemote = await git.getConfig({
    fs,
    dir: workingDir,
    path: `remote.${remoteName}.url`,
  });
  if (urlOfRemote === undefined) {
    throw new InvalidGitRemoteError(`remote '${remoteName}' does not exist`);
  }

  remoteOptions.retry ??= NETWORK_RETRY;
  remoteOptions.retryInterval ??= NETWORK_RETRY_INTERVAL;

  const checkOption: any = {
    http: httpClient,
    url: remoteOptions.remoteUrl!,
  };
  const cred = createCredentialCallback(remoteOptions);
  if (cred) {
    checkOption.onAuth = cred;
  }

  for (let i = 0; i < remoteOptions.retry! + 1; i++) {
    // eslint-disable-next-line no-await-in-loop
    const res = await git.getRemoteInfo2(checkOption).catch(err => err);

    let error = '';
    if (res instanceof Error) {
      error = res.toString();
    }
    else {
      break;
    }

    switch (true) {
      case error.startsWith('UrlParseError:'):
      case error.startsWith('Error: getaddrinfo ENOTFOUND'):
        throw new InvalidURLFormatError(error);

      case error.startsWith('Error: connect EACCES'):
      case error.startsWith('Error: connect ECONNREFUSED'):
        // isomorphic-git throws this when network is limited.
        if (i >= remoteOptions.retry!) {
          throw new NetworkError(error);
        }
        break;

      case error.startsWith('HttpError: HTTP Error: 401 Authorization Required'):
        throw new HTTPError401AuthorizationRequired(error);

      case error.startsWith('HttpError: HTTP Error: 404 Not Found'):
        throw new HTTPError404NotFound(error);

      default:
        if (i >= remoteOptions.retry!) {
          throw new CannotConnectError(error);
        }
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(remoteOptions.retryInterval!);
  }

  return true;
}

/**
 * git fetch
 *
 * @throws {@link InvalidGitRemoteError}
 * @throws {@link InvalidURLFormatError}
 * @throws {@link NetworkError}
 * @throws {@link HTTPError401AuthorizationRequired}
 * @throws {@link HTTPError404NotFound}
 * @throws {@link CannotConnectError}
 *
 * @throws # Errors from createCredentialForGitHub
 * @throws - {@link HttpProtocolRequiredError}
 * @throws - {@link InvalidRepositoryURLError}
 *
 * @throws # Errors from createCredential
 * @throws - {@link InvalidAuthenticationTypeError}
 *
 * @internal
 */
// eslint-disable-next-line complexity
export async function fetch (
  workingDir: string,
  remoteOptions: RemoteOptions,
  remoteName?: string,
  logger?: Logger
): Promise<void> {
  logger ??= new Logger({
    name: 'plugin-nodegit',
    minLevel: 'trace',
    displayDateTime: false,
    displayFunctionName: false,
    displayFilePath: 'hidden',
  });
  logger.debug(`remote-isomorphic-git: fetch: ${remoteOptions.remoteUrl}`);

  remoteName ??= 'origin';

  const urlOfRemote = await git.getConfig({
    fs,
    dir: workingDir,
    path: `remote.${remoteName}.url`,
  });
  if (urlOfRemote === undefined) {
    throw new InvalidGitRemoteError(`remote '${remoteName}' does not exist`);
  }

  remoteOptions.retry ??= NETWORK_RETRY;
  remoteOptions.retryInterval ??= NETWORK_RETRY_INTERVAL;

  const fetchOption: any = {
    fs,
    dir: workingDir,
    http: httpClient,
    url: remoteOptions.remoteUrl!,
  };
  const cred = createCredentialCallback(remoteOptions);
  if (cred) {
    fetchOption.onAuth = cred;
  }

  for (let i = 0; i < remoteOptions.retry! + 1; i++) {
    // eslint-disable-next-line no-await-in-loop
    const res = await git.fetch(fetchOption).catch(err => err);

    let error = '';
    if (res instanceof Error) {
      error = res.toString();
    }
    else {
      break;
    }

    // if (error !== 'undefined') console.warn('connect fetch error: ' + error);
    switch (true) {
      case error.startsWith('NoRefspecError'):
        throw new InvalidGitRemoteError(error);

      case error.startsWith('UrlParseError:'):
      case error.startsWith('Error: getaddrinfo ENOTFOUND'):
        throw new InvalidURLFormatError(error);

      case error.startsWith('Error: connect EACCES'):
      case error.startsWith('Error: connect ECONNREFUSED'):
        // isomorphic-git throws this when network is limited.
        if (i >= remoteOptions.retry!) {
          throw new NetworkError(error);
        }
        break;

      case error.startsWith('HttpError: HTTP Error: 401 Authorization Required'):
        throw new HTTPError401AuthorizationRequired(error);

      case error.startsWith('HttpError: HTTP Error: 404 Not Found'):
        throw new HTTPError404NotFound(error);

      default:
        if (i >= remoteOptions.retry!) {
          throw new CannotConnectError(error);
        }
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(remoteOptions.retryInterval!);
  }
}

/**
 * git push
 *
 * @throws {@link InvalidGitRemoteError}
 * @throws {@link UnfetchedCommitExistsError}
 * @throws {@link InvalidURLFormatError}
 * @throws {@link NetworkError}
 * @throws {@link HTTPError401AuthorizationRequired}
 * @throws {@link HTTPError404NotFound}
 * @throws {@link HTTPError403Forbidden}
 * @throws {@link CannotConnectError}
 *
 * @throws # Errors from createCredentialForGitHub
 * @throws - {@link InvalidURLFormatError}
 * @throws - {@link InvalidRepositoryURLError}
 *
 * @throws # Errors from createCredential
 * @throws - {@link InvalidAuthenticationTypeError}
 *
 * @internal
 */
// eslint-disable-next-line complexity
export async function push (
  workingDir: string,
  remoteOptions: RemoteOptions,
  remoteName?: string,
  localBranchName?: string,
  remoteBranchName?: string,
  logger?: Logger
): Promise<void> {
  logger ??= new Logger({
    name: 'plugin-nodegit',
    minLevel: 'trace',
    displayDateTime: false,
    displayFunctionName: false,
    displayFilePath: 'hidden',
  });
  logger.debug(`remote-isomorphic-git: push: ${remoteOptions.remoteUrl}`);

  remoteName ??= 'origin';
  localBranchName ??= 'main';
  remoteBranchName ??= 'main';

  const urlOfRemote = await git.getConfig({
    fs,
    dir: workingDir,
    path: `remote.${remoteName}.url`,
  });
  if (urlOfRemote === undefined) {
    throw new InvalidGitRemoteError(`remote '${remoteName}' does not exist`);
  }

  // const localBranch = 'refs/heads/' + localBranchName;
  // const remoteBranch = 'refs/heads/' + remoteBranchName;

  remoteOptions.retry ??= NETWORK_RETRY;
  remoteOptions.retryInterval ??= NETWORK_RETRY_INTERVAL;

  const pushOption: any = {
    fs,
    dir: workingDir,
    http: httpClient,
    url: remoteOptions.remoteUrl!,
    remote: remoteName,
    ref: localBranchName,
    remoteRef: remoteBranchName,
  };
  const cred = createCredentialCallback(remoteOptions);
  if (cred) {
    pushOption.onAuth = cred;
  }

  for (let i = 0; i < remoteOptions.retry! + 1; i++) {
    // eslint-disable-next-line no-await-in-loop
    const res = await git.push(pushOption).catch(err => err);

    let error = '';
    if (res instanceof Error) {
      error = res.toString();
    }
    else {
      break;
    }

    // console.warn('connect push error: ' + error);
    switch (true) {
      // NoRefspecError does not invoke because push does not need Remote when url is specified.
      // case error.startsWith('NoRefspecError'):
      //  throw new InvalidGitRemoteError(error);

      case error.startsWith('PushRejectedError:'):
        throw new UnfetchedCommitExistsError();

      case error.startsWith('UrlParseError:'):
      case error.startsWith('Error: getaddrinfo ENOTFOUND'):
        throw new InvalidURLFormatError(error);

      case error.startsWith('Error: connect EACCES'):
      case error.startsWith('Error: connect ECONNREFUSED'):
        // isomorphic-git throws this when network is limited.
        if (i >= remoteOptions.retry!) {
          throw new NetworkError(error);
        }
        break;

      case error.startsWith('HttpError: HTTP Error: 401 Authorization Required'):
        throw new HTTPError401AuthorizationRequired(error);

      case error.startsWith('HttpError: HTTP Error: 404 Not Found'):
        throw new HTTPError404NotFound(error);

      case error.startsWith('HttpError: HTTP Error: 403 Forbidden'):
        throw new HTTPError403Forbidden(error);

      default:
        if (i >= remoteOptions.retry!) {
          throw new CannotConnectError(error);
        }
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(remoteOptions.retryInterval!);
  }
}
