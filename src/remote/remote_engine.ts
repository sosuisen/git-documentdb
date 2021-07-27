/* eslint-disable @typescript-eslint/naming-convention */
import { Logger } from 'tslog';
import * as RemoteErrors from 'git-documentdb-remote-errors';
import { RemoteOptions } from '../types';

export const RemoteEngine: { [key: string]: RemoteEngineInterface } = {};

export interface RemoteEngineInterface {
  checkFetch: (
    workingDir: string,
    options: RemoteOptions,
    remoteName?: string,
    logger?: Logger
  ) => Promise<boolean>;
  fetch: (
    workingDir: string,
    remoteOptions: RemoteOptions,
    remoteName?: string,
    logger?: Logger
  ) => Promise<void>;
  push: (
    workingDir: string,
    remoteOptions: RemoteOptions,
    remoteName?: string,
    localBranch?: string,
    remoteBranch?: string,
    logger?: Logger
  ) => Promise<void>;
  clone: (
    workingDir: string,
    remoteOptions: RemoteOptions,
    logger?: Logger
  ) => Promise<void>;
}

export namespace RemoteErr {
  export class CannotConnectError extends RemoteErrors.CannotConnectError {
    constructor (mes: unknown) {
      super(mes);
      this.name = 'CannotConnectError';
    }
  }
  export class HTTPError401AuthorizationRequired extends RemoteErrors.HTTPError401AuthorizationRequired {
    constructor (mes: unknown) {
      super(mes);
      this.name = 'HTTPError401AuthorizationRequired';
    }
  }
  export class HTTPError403Forbidden extends RemoteErrors.HTTPError403Forbidden {
    constructor (mes: unknown) {
      super(mes);
      this.name = 'HTTPError403Forbidden';
    }
  }
  export class HTTPError404NotFound extends RemoteErrors.HTTPError404NotFound {
    constructor (mes: unknown) {
      super(mes);
      this.name = 'HTTPError404NotFound';
    }
  }
  export class InvalidAuthenticationTypeError extends RemoteErrors.InvalidAuthenticationTypeError {
    constructor (type: unknown) {
      super(type);
      this.name = 'InvalidAuthenticationTypeError';
    }
  }
  export class InvalidGitRemoteError extends RemoteErrors.InvalidGitRemoteError {
    constructor (mes: unknown) {
      super(mes);
      this.name = 'InvalidGitRemoteError';
    }
  }
  export class InvalidRepositoryURLError extends RemoteErrors.InvalidRepositoryURLError {
    constructor (url: unknown) {
      super(url);
      this.name = 'InvalidRepositoryURLError';
    }
  }
  export class InvalidSSHKeyPathError extends RemoteErrors.InvalidSSHKeyPathError {
    constructor () {
      super();
      this.name = 'InvalidSSHKeyPathError';
    }
  }
  export class InvalidURLFormatError extends RemoteErrors.InvalidURLFormatError {
    constructor (mes: unknown) {
      super(mes);
      this.name = 'InvalidURLFormatError';
    }
  }
  export class NetworkError extends RemoteErrors.NetworkError {
    constructor (mes: unknown) {
      super(mes);
      this.name = 'NetworkError';
    }
  }
  export class UnfetchedCommitExistsError extends RemoteErrors.UnfetchedCommitExistsError {
    constructor () {
      super();
      this.name = 'UnfetchedCommitExistsError';
    }
  }
}

// eslint-disable-next-line complexity
export function wrappingRemoteEngineError (remoteEngineError: RemoteErrors.BaseError) {
  switch (true) {
    case remoteEngineError instanceof RemoteErrors.CannotConnectError:
      return new RemoteErr.CannotConnectError(remoteEngineError.message);
    case remoteEngineError instanceof RemoteErrors.HTTPError401AuthorizationRequired:
      return new RemoteErr.HTTPError401AuthorizationRequired(remoteEngineError.message);
    case remoteEngineError instanceof RemoteErrors.HTTPError403Forbidden:
      return new RemoteErr.HTTPError403Forbidden(remoteEngineError.message);
    case remoteEngineError instanceof RemoteErrors.HTTPError404NotFound:
      return new RemoteErr.HTTPError404NotFound(remoteEngineError.message);
    case remoteEngineError instanceof RemoteErrors.InvalidAuthenticationTypeError:
      return new RemoteErr.InvalidAuthenticationTypeError(remoteEngineError.message);
    case remoteEngineError instanceof RemoteErrors.InvalidGitRemoteError:
      return new RemoteErr.InvalidGitRemoteError(remoteEngineError.message);
    case remoteEngineError instanceof RemoteErrors.InvalidRepositoryURLError:
      return new RemoteErr.InvalidRepositoryURLError(remoteEngineError.message);
    case remoteEngineError instanceof RemoteErrors.InvalidSSHKeyPathError:
      return new RemoteErr.InvalidSSHKeyPathError();
    case remoteEngineError instanceof RemoteErrors.InvalidURLFormatError:
      return new RemoteErr.InvalidURLFormatError(remoteEngineError.message);
    case remoteEngineError instanceof RemoteErrors.NetworkError:
      return new RemoteErr.NetworkError(remoteEngineError.message);
    case remoteEngineError instanceof RemoteErrors.UnfetchedCommitExistsError:
      return new RemoteErr.UnfetchedCommitExistsError();
    default:
      return new Error(remoteEngineError.message);
  }
}
