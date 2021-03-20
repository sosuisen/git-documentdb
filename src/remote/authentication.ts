import nodegit from '@sosuisen/nodegit';
import {
  AuthNeededForPushOrSyncError,
  HttpProtocolRequiredError,
  InvalidRepositoryURLError,
  InvalidSSHKeyPathError,
  UndefinedPersonalAccessTokenError,
} from '../error';
import { RemoteAuthGitHub, RemoteAuthSSH, RemoteOptions } from '../types';

/**
 * Create credential options for GitHub
 */
const createCredentialForGitHub = (options: RemoteOptions) => {
  if (!options.remote_url!.match(/^https?:\/\//)) {
    throw new HttpProtocolRequiredError(options.remote_url!);
  }
  const auth = options.auth as RemoteAuthGitHub;
  if (!auth.personal_access_token) {
    throw new UndefinedPersonalAccessTokenError();
  }
  const urlArray = options.remote_url!.replace(/^https?:\/\//, '').split('/');
  // github.com/account_name/repository_name
  if (urlArray.length !== 3) {
    throw new InvalidRepositoryURLError(options.remote_url!);
  }
  const owner = urlArray[urlArray.length - 2];
  const credentials = () => {
    return nodegit.Cred.userpassPlaintextNew(owner, auth.personal_access_token!);
  };
  return credentials;
};

/**
 * Create credential options for SSH
 */
const createCredentialForSSH = (options: RemoteOptions) => {
  const auth = options.auth as RemoteAuthSSH;
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
};

/**
 * Create credential options
 */
export const createCredential = (options: RemoteOptions) => {
  options.auth ??= { type: 'none' };

  if (options.auth.type === 'github') {
    return createCredentialForGitHub(options);
  }
  else if (options.auth.type === 'ssh') {
    return createCredentialForSSH(options);
  }
  else if (options.auth.type === 'none') {
    if (options.sync_direction !== 'pull') {
      throw new AuthNeededForPushOrSyncError(options.sync_direction!);
    }
  }
  else {
    // @ts-ignore
    throw new InvalidAuthenticationTypeError(this._options.auth.type);
  }
};
