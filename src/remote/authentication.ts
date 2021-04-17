/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import nodegit from '@sosuisen/nodegit';
import {
  AuthNeededForPushOrSyncError,
  HttpProtocolRequiredError,
  InvalidRepositoryURLError,
  InvalidSSHKeyPathError,
  UndefinedPersonalAccessTokenError,
} from '../error';
import { ConnectionSettingsGitHub, ConnectionSettingsSSH, RemoteOptions } from '../types';

/**
 * Create credential options for GitHub
 */
const createCredentialForGitHub = (options: RemoteOptions) => {
  if (!options.remote_url!.match(/^https?:\/\//)) {
    throw new HttpProtocolRequiredError(options.remote_url!);
  }
  const connection = options.connection as ConnectionSettingsGitHub;
  if (!connection.personal_access_token) {
    throw new UndefinedPersonalAccessTokenError();
  }
  const urlArray = options.remote_url!.replace(/^https?:\/\//, '').split('/');
  // github.com/account_name/repository_name
  if (urlArray.length !== 3) {
    throw new InvalidRepositoryURLError(options.remote_url!);
  }
  const owner = urlArray[urlArray.length - 2];
  const credentials = () => {
    return nodegit.Cred.userpassPlaintextNew(owner, connection.personal_access_token!);
  };
  return credentials;
};

/**
 * Create credential options for SSH
 */
const createCredentialForSSH = (options: RemoteOptions) => {
  const connection = options.connection as ConnectionSettingsSSH;
  if (connection.private_key_path === undefined || connection.private_key_path === '') {
    throw new InvalidSSHKeyPathError();
  }
  if (connection.public_key_path === undefined || connection.public_key_path === '') {
    throw new InvalidSSHKeyPathError();
  }
  connection.pass_phrase ??= '';

  const credentials = (url: string, userName: string) => {
    return nodegit.Cred.sshKeyNew(
      userName,
      connection.public_key_path,
      connection.private_key_path,
      connection.pass_phrase!
    );
  };
  return credentials;
};

/**
 * Create credential options
 */
export const createCredential = (options: RemoteOptions) => {
  options.connection ??= { type: 'none' };
  let cred: any;
  if (options.connection.type === 'github') {
    cred = createCredentialForGitHub(options);
  }
  else if (options.connection.type === 'ssh') {
    cred = createCredentialForSSH(options);
  }
  else if (options.connection.type === 'none') {
    if (options.sync_direction !== 'pull') {
      throw new AuthNeededForPushOrSyncError(options.sync_direction!);
    }
  }
  else {
    // @ts-ignore
    throw new InvalidAuthenticationTypeError(this._options.connection.type);
  }

  const callbacks = {
    credentials: cred,
  };

  if (process.platform === 'darwin') {
    // @ts-ignore
    callbacks.certificateCheck = () => 0;
  }
  return callbacks;
};
