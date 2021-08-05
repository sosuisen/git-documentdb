/* eslint-disable unicorn/custom-error-definition */
/* eslint-disable @typescript-eslint/naming-convention */
import { Logger } from 'tslog';
import { RemoteOptions } from '../types';

/**
 * RemoteEngine
 *
 * @public
 */
export const RemoteEngine: { [key: string]: RemoteEngineInterface } = {};

/**
 * RemoteEngineInterface
 *
 * @public
 */
export interface RemoteEngineInterface {
  type: string;
  name: string;

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
    localBranchName?: string,
    remoteBranchName?: string,
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

class BaseError extends Error {
  constructor (e: string) {
    super(e);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * RemoteError
 *
 * @public
 */
export namespace RemoteErr {
  /**
   * Copy error message from parent
   */
  export class CannotConnectError extends BaseError {
    constructor (mes: unknown) {
      super('');
      this.message = mes as string;
    }
  }
  export class HTTPError401AuthorizationRequired extends BaseError {
    constructor (mes: unknown) {
      super('');
      this.message = mes as string;
    }
  }
  export class HTTPError403Forbidden extends BaseError {
    constructor (mes: unknown) {
      super('');
      this.message = mes as string;
    }
  }
  export class HTTPError404NotFound extends BaseError {
    constructor (mes: unknown) {
      super('');
      this.message = mes as string;
    }
  }
  export class InvalidAuthenticationTypeError extends BaseError {
    constructor (mes: unknown) {
      super('');
      this.message = mes as string;
    }
  }
  export class InvalidGitRemoteError extends BaseError {
    constructor (mes: unknown) {
      super('');
      this.message = mes as string;
    }
  }
  export class InvalidRepositoryURLError extends BaseError {
    constructor (mes: unknown) {
      super('');
      this.message = mes as string;
    }
  }
  export class InvalidSSHKeyPathError extends BaseError {
    constructor (mes: unknown) {
      super('');
      this.message = mes as string;
    }
  }
  export class InvalidURLFormatError extends BaseError {
    constructor (mes: unknown) {
      super('');
      this.message = mes as string;
    }
  }
  export class NetworkError extends BaseError {
    constructor (mes: unknown) {
      super('');
      this.message = mes as string;
    }
  }
  export class UnfetchedCommitExistsError extends BaseError {
    constructor (mes: unknown) {
      super('');
      this.message = mes as string;
    }
  }
}

/**
 * wrappingRemoteEngineError
 *
 * @public
 */
// eslint-disable-next-line complexity
export function wrappingRemoteEngineError (remoteEngineError: BaseError) {
  // Do not use 'instanceof' to compare git-documentdb-remote-errors
  switch (remoteEngineError.name) {
    case 'CannotConnectError':
      return new RemoteErr.CannotConnectError(remoteEngineError.message);
    case 'HTTPError401AuthorizationRequired':
      return new RemoteErr.HTTPError401AuthorizationRequired(remoteEngineError.message);
    case 'HTTPError403Forbidden':
      return new RemoteErr.HTTPError403Forbidden(remoteEngineError.message);
    case 'HTTPError404NotFound':
      return new RemoteErr.HTTPError404NotFound(remoteEngineError.message);
    case 'InvalidAuthenticationTypeError':
      return new RemoteErr.InvalidAuthenticationTypeError(remoteEngineError.message);
    case 'InvalidGitRemoteError':
      return new RemoteErr.InvalidGitRemoteError(remoteEngineError.message);
    case 'InvalidRepositoryURLError':
      return new RemoteErr.InvalidRepositoryURLError(remoteEngineError.message);
    case 'InvalidSSHKeyPathError':
      return new RemoteErr.InvalidSSHKeyPathError(remoteEngineError.message);
    case 'InvalidURLFormatError':
      return new RemoteErr.InvalidURLFormatError(remoteEngineError.message);
    case 'NetworkError':
      return new RemoteErr.NetworkError(remoteEngineError.message);
    case 'UnfetchedCommitExistsError':
      return new RemoteErr.UnfetchedCommitExistsError(remoteEngineError.message);
    default:
      return new Error(remoteEngineError.message);
  }
}
