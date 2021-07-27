/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

/* eslint-disable unicorn/custom-error-definition */

/**
 * Namespace for errors
 *
 * @public
 */
export namespace Err {
  /**
   * BaseError
   *
   * @privateRemarks
   * Use 'unknown' type assertion for constructor arguments in subclass of BaseError
   * to use 'expect' in test. See https://github.com/facebook/jest/issues/8279
   */
  class BaseError extends Error {
    constructor (e: string) {
      super(e);
      this.name = new.target.name;
      Object.setPrototypeOf(this, new.target.prototype);
    }
  }

  /**
   * @public
   */
  export class UndefinedDatabaseNameError extends BaseError {
    constructor (e = `Database name is undefined: Option must have dbName` as unknown) {
      super(e as string);
    }
  }

  /**
   * @public
   */
  export class CannotCreateDirectoryError extends BaseError {
    constructor (e = 'Cannot create directory' as unknown) {
      super(e as string);
    }
  }

  /**
   * @public
   */
  export class CannotWriteDataError extends BaseError {
    constructor (e = 'Cannot write data' as unknown) {
      super(e as string);
    }
  }

  /**
   * @public
   */
  export class CannotDeleteDataError extends BaseError {
    constructor (e = 'Cannot write data' as unknown) {
      super(e as string);
    }
  }

  /**
   * @public
   */
  export class InvalidCollectionPathCharacterError extends BaseError {
    constructor (name: unknown) {
      const e = `Invalid collectionPath character '${name}'`;
      super(e);
    }
  }

  /**
   * @public
   */
  export class InvalidCollectionPathLengthError extends BaseError {
    constructor (collectionPath: unknown, minLength: unknown, maxLength: unknown) {
      super(
        `Invalid collectionPath length: A byte length of '${collectionPath}' must be equal to or more than ${minLength} and equal to or less than ${maxLength}.`
      );
    }
  }

  /**
   * @public
   */
  export class InvalidWorkingDirectoryPathLengthError extends BaseError {
    constructor (path: unknown, minLength: unknown, maxLength: unknown) {
      super(
        `Invalid working directory path length: A byte length of '${path}' must be equal to or more than ${minLength} and equal to or less than ${maxLength}.`
      );
    }
  }

  /**
   * @public
   */
  export class InvalidIdCharacterError extends BaseError {
    constructor (id: unknown) {
      const e = `Invalid ID character '${id}'`;
      super(e);
    }
  }

  /**
   * @public
   */
  export class InvalidIdLengthError extends BaseError {
    constructor (id: unknown, minLength: unknown, maxLength: unknown) {
      super(
        `Invalid id length: A byte length of '${id}' must be equal to or more than ${minLength} and equal to or less than ${maxLength}.`
      );
    }
  }

  /**
   * @public
   */
  export class InvalidJsonObjectError extends BaseError {
    constructor (idOrSha: unknown) {
      super(`Invalid JSON object: ${idOrSha}`);
    }
  }

  /**
   * @public
   */
  export class InvalidJsonFileExtensionError extends BaseError {
    constructor () {
      super(`JSON file extension must be .json`);
    }
  }

  /**
   * @public
   */
  export class InvalidDocTypeError extends BaseError {
    constructor (type: unknown) {
      super(`Invalid Document type: ${type}`);
    }
  }

  /**
   * @public
   */
  export class UndefinedPersonalAccessTokenError extends BaseError {
    constructor () {
      super(`Personal Access Token of your GitHub account is needed.`);
    }
  }

  /**
   * @public
   */
  export class UndefinedDocumentIdError extends BaseError {
    constructor (
      e = `Document id is undefined: A document must have an '_id' key` as unknown
    ) {
      super(e as string);
    }
  }

  /**
   * @public
   */
  export class UndefinedSyncError extends BaseError {
    constructor (e = `Sync is undefined` as unknown) {
      super(e as string);
    }
  }

  /**
   * @public
   */
  export class RepositoryNotOpenError extends BaseError {
    constructor (e = 'Repository not opened' as unknown) {
      super(e as string);
    }
  }

  /**
   * @public
   */
  export class DocumentNotFoundError extends BaseError {
    constructor (e = 'Document not found' as unknown) {
      super(e as string);
    }
  }

  /**
   * @public
   */
  export class SameIdExistsError extends BaseError {
    constructor (e = 'The same id exists' as unknown) {
      super(e as string);
    }
  }

  /**
   * @public
   */
  export class DatabaseClosingError extends BaseError {
    constructor (e = 'Database is closing' as unknown) {
      super(e as string);
    }
  }

  /**
   * @public
   */
  export class DatabaseCloseTimeoutError extends BaseError {
    constructor (e = 'Queued operations are timeout' as unknown) {
      super(e as string);
    }
  }

  /**
   * @public
   */
  export class InvalidDbNameCharacterError extends BaseError {
    constructor (name: unknown) {
      const e = `Invalid dbName '${name}'`;
      super(e);
    }
  }

  /**
   * @public
   */
  export class InvalidLocalDirCharacterError extends BaseError {
    constructor (name: unknown) {
      const e = `Invalid localDir character '${name}'`;
      super(e);
    }
  }

  /**
   * @public
   */
  export class UndefinedRemoteURLError extends BaseError {
    constructor () {
      super(`Remote URL is undefined.`);
    }
  }

  /**
   * @public
   */
  export class RemoteAlreadyRegisteredError extends BaseError {
    constructor (url: unknown) {
      super(
        `The remote repository has already been registered. :${url}
Call removeRemote() before register it again.`
      );
    }
  }

  /**
   * @public
   */
  export class AuthenticationTypeNotAllowCreateRepositoryError extends BaseError {
    constructor (type: unknown) {
      super(
        `This authentication type does not allow to create repository. Current value is '${type}'`
      );
    }
  }

  /**
   * @public
   */
  export class UndefinedDBError extends BaseError {
    constructor () {
      super(`GitDocumentDB is undefined.`);
    }
  }

  /**
   * @public
   */
  export class HttpProtocolRequiredError extends BaseError {
    constructor (url: unknown) {
      super(`HTTP protocol is required: ${url}`);
    }
  }

  /**
   * @public
   */
  export class IntervalTooSmallError extends BaseError {
    constructor (min: unknown, current: unknown) {
      super(`Interval is too small. Minimum value is ${min}. Current value is ${current}.`);
    }
  }

  /**
   * @public
   */
  export class FileRemoveTimeoutError extends BaseError {
    constructor () {
      super(`Removing file is timed out for some reason.`);
    }
  }

  /**
   * @public
   */
  export class InvalidConflictStateError extends BaseError {
    constructor (mes: unknown) {
      super(mes as string);
    }
  }

  /**
   * @public
   */
  export class InvalidConflictResolutionStrategyError extends BaseError {
    constructor () {
      super(`Conflict resolution strategy is invalid.`);
    }
  }

  /**
   * @public
   */
  export class CannotOpenRepositoryError extends BaseError {
    constructor (err: unknown) {
      super(`Cannot open repository though .git directory exists. : ${err}`);
    }
  }

  /**
   * @public
   */
  export class RepositoryNotFoundError extends BaseError {
    constructor (path: unknown) {
      super(
        `Repository does not exist, or you do not have permission to access the directory: ${path}`
      );
    }
  }

  /**
   * @public
   */
  export class CannotConnectRemoteRepositoryError extends BaseError {
    constructor (public retry: number, url: string, mes: string) {
      super(`Cannot connect to ${url}: ${mes}`);
    }
  }

  /**
   * @public
   */
  export class RequestTimeoutError extends BaseError {
    constructor (url: unknown) {
      super(`Request timeout: ${url}`);
    }
  }

  /**
   * @public
   */
  export class SocketTimeoutError extends BaseError {
    constructor (url: unknown) {
      super(`Socket timeout: ${url}`);
    }
  }

  /**
   * @public
   */
  export class HTTPNetworkError extends BaseError {
    constructor (mes: unknown) {
      super(`HTTPNetworkError: ${mes}`);
    }
  }

  /**
   * @public
   */
  export class CannotCreateRepositoryError extends BaseError {
    constructor (reason: unknown) {
      super(`Cannot create repository: ${reason}`);
    }
  }

  /**
   * @public
   */
  export class CannotCreateRemoteRepositoryError extends BaseError {
    constructor (reason: unknown) {
      super(`Cannot create remote repository: ${reason}`);
    }
  }

  /**
   * @public
   */
  export class TaskCancelError extends BaseError {
    constructor (taskId: unknown) {
      super(`Task is canceled: ${taskId}`);
    }
  }

  /**
   * @public
   */
  export class PersonalAccessTokenForAnotherAccountError extends BaseError {
    constructor () {
      super('This is a personal access token for another account.');
    }
  }

  /**
   * @public
   */
  export class PushWorkerError extends BaseError {
    constructor (mes: unknown) {
      super(`Error in push_worker: ${mes}`);
    }
  }

  /**
   * @public
   */
  export class SyncWorkerError extends BaseError {
    constructor (mes: unknown) {
      super(`Error in sync_worker: ${mes}`);
    }
  }

  /**
   * @public
   */
  export class ThreeWayMergeError extends BaseError {
    constructor (mes: string) {
      super(`Error in threeWayMerge: ${mes}`);
    }
  }

  /**
   * @public
   */
  export class PushNotAllowedError extends BaseError {
    constructor (direction: unknown) {
      super(`Push is not allowed. Current sync direction setting is : ${direction}`);
    }
  }

  /**
   * @public
   */
  export class GitMergeBranchError extends BaseError {
    constructor (mes: string) {
      super(`Merge branch error in Git : ${mes}`);
    }
  }

  /**
   * @public
   */
  export class SyncIntervalLessThanOrEqualToRetryIntervalError extends BaseError {
    constructor (syncInterval: unknown, retryInterval: unknown) {
      super(
        `Sync interval is less than or equal to retry interval : ${syncInterval} < ${retryInterval}`
      );
    }
  }

  /**
   * @public
   */
  export class ConsecutiveSyncSkippedError extends BaseError {
    constructor (taskLabel: string, taskId: string) {
      super(`Consecutive ${taskLabel} skipped (id: ${taskId})`);
    }
  }

  /**
   * @public
   */
  export class CombineDatabaseError extends BaseError {
    constructor (mes: string) {
      super(`Combine database failed: ${mes})`);
    }
  }

  /**
   * @public
   */
  export class NoMergeBaseFoundError extends BaseError {
    constructor () {
      super(`No merge base found`);
    }
  }
}
