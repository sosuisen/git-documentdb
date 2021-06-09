/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import nodegit from '@sosuisen/nodegit';
import {
  HttpProtocolRequiredError,
  InvalidAuthenticationTypeError,
  InvalidRepositoryURLError,
  InvalidSSHKeyPathError,
  UndefinedPersonalAccessTokenError,
} from '../error';
import { ConnectionSettingsGitHub, ConnectionSettingsSSH, RemoteOptions } from '../types';

/**
 * Insert credential options for GitHub
 *
 * @internal
 */
function createCredentialForGitHub (options: RemoteOptions) {
  if (!options.remoteUrl!.match(/^https?:\/\//)) {
    throw new HttpProtocolRequiredError(options.remoteUrl!);
  }
  const connection = options.connection as ConnectionSettingsGitHub;
  if (options.syncDirection !== 'pull' && !connection.personalAccessToken) {
    throw new UndefinedPersonalAccessTokenError();
  }
  const urlArray = options.remoteUrl!.replace(/^https?:\/\//, '').split('/');
  // github.com/account_name/repository_name
  if (urlArray.length !== 3) {
    throw new InvalidRepositoryURLError(options.remoteUrl!);
  }
  const owner = urlArray[urlArray.length - 2];
  const credentials = () => {
    return nodegit.Cred.userpassPlaintextNew(owner, connection.personalAccessToken!);
  };
  return credentials;
}

/**
 * Create credential options for SSH
 *
 * @internal
 */
function createCredentialForSSH (options: RemoteOptions) {
  const connection = options.connection as ConnectionSettingsSSH;
  if (connection.privateKeyPath === undefined || connection.privateKeyPath === '') {
    throw new InvalidSSHKeyPathError();
  }
  if (connection.publicKeyPath === undefined || connection.publicKeyPath === '') {
    throw new InvalidSSHKeyPathError();
  }
  connection.passPhrase ??= '';

  const credentials = (url: string, userName: string) => {
    return nodegit.Cred.sshKeyNew(
      userName,
      connection.publicKeyPath,
      connection.privateKeyPath,
      connection.passPhrase!
    );
  };
  return credentials;
}

/**
 * Create credential options
 *
 * @internal
 */
export function createCredential (options: RemoteOptions) {
  options.connection ??= { type: 'none' };
  let cred: any;
  if (options.connection.type === 'github') {
    cred = createCredentialForGitHub(options);
  }
  else if (options.connection.type === 'ssh') {
    cred = createCredentialForSSH(options);
  }
  else if (options.connection.type === 'none') {
    // nop
  }
  else {
    // @ts-ignore
    throw new InvalidAuthenticationTypeError(options.connection.type);
  }

  const callbacks = {
    credentials: cred,
  };

  if (process.platform === 'darwin') {
    // @ts-ignore
    callbacks.certificateCheck = () => 0;
  }
  return callbacks;
}
