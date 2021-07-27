/* eslint-disable unicorn/custom-error-definition */
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
    remoteName: string,
    logger?: Logger
  ) => Promise<void>;
}

export namespace RemoteErr {
  /**
   * Copy error message from parent
   */
  export class CannotConnectError extends RemoteErrors.CannotConnectError {
    constructor (mes: unknown) {
      super('');
      this.message = mes as string;
    }
  }
  export class HTTPError401AuthorizationRequired extends RemoteErrors.HTTPError401AuthorizationRequired {
    constructor (mes: unknown) {
      super('');
      this.message = mes as string;
    }
  }
  export class HTTPError403Forbidden extends RemoteErrors.HTTPError403Forbidden {
    constructor (mes: unknown) {
      super('');
      this.message = mes as string;
    }
  }
  export class HTTPError404NotFound extends RemoteErrors.HTTPError404NotFound {
    constructor (mes: unknown) {
      super('');
      this.message = mes as string;
    }
  }
  export class InvalidAuthenticationTypeError extends RemoteErrors.InvalidAuthenticationTypeError {
    constructor (mes: unknown) {
      super('');
      this.message = mes as string;
    }
  }
  export class InvalidGitRemoteError extends RemoteErrors.InvalidGitRemoteError {
    constructor (mes: unknown) {
      super('');
      this.message = mes as string;
    }
  }
  export class InvalidRepositoryURLError extends RemoteErrors.InvalidRepositoryURLError {
    constructor (mes: unknown) {
      super('');
      this.message = mes as string;
    }
  }
  export class InvalidSSHKeyPathError extends RemoteErrors.InvalidSSHKeyPathError {
    constructor (mes: unknown) {
      super();
      this.message = mes as string;
    }
  }
  export class InvalidURLFormatError extends RemoteErrors.InvalidURLFormatError {
    constructor (mes: unknown) {
      super('');
      this.message = mes as string;
    }
  }
  export class NetworkError extends RemoteErrors.NetworkError {
    constructor (mes: unknown) {
      super('');
      this.message = mes as string;
    }
  }
  export class UnfetchedCommitExistsError extends RemoteErrors.UnfetchedCommitExistsError {
    constructor (mes: unknown) {
      super();
      this.message = mes as string;
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
      return new RemoteErr.InvalidSSHKeyPathError(remoteEngineError.message);
    case remoteEngineError instanceof RemoteErrors.InvalidURLFormatError:
      return new RemoteErr.InvalidURLFormatError(remoteEngineError.message);
    case remoteEngineError instanceof RemoteErrors.NetworkError:
      return new RemoteErr.NetworkError(remoteEngineError.message);
    case remoteEngineError instanceof RemoteErrors.UnfetchedCommitExistsError:
      return new RemoteErr.UnfetchedCommitExistsError(remoteEngineError.message);
    default:
      return new Error(remoteEngineError.message);
  }
}
