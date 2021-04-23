/* eslint-disable unicorn/custom-error-definition */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

class BaseError extends Error {
  constructor (e?: string) {
    super(e);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 */
export class UndefinedDatabaseNameError extends BaseError {
  constructor (e = `Database name is undefined: Option must have dbName`) {
    super(e);
  }
}

/**
 */
export class CannotCreateDirectoryError extends BaseError {
  constructor (e = 'Cannot create directory') {
    super(e);
  }
}

/**
 */
export class CannotWriteDataError extends BaseError {
  constructor (e = 'Cannot write data') {
    super(e);
  }
}

/**
 */
export class CannotDeleteDataError extends BaseError {
  constructor (e = 'Cannot write data') {
    super(e);
  }
}

/**
 */
export class InvalidCollectionPathCharacterError extends BaseError {
  constructor (name: string) {
    const e = `Invalid collectionPath character '${name}': 
A directory name allows Unicode characters excluding OS reserved filenames and following characters: < > : " | ? * \0
A directory name cannot end with a period or a white space.
A directory name does not allow '.' and '..'.
collectionPath cannot start with a slash or an underscore.`;
    super(e);
  }
}

/**
 */
export class InvalidCollectionPathError extends BaseError {
  constructor (name: string) {
    const e = `Invalid collectionPath: '${name}'
This name is not permitted as collectionPath.`;
    super(e);
  }
}

/**
 */
export class InvalidCollectionPathLengthError extends BaseError {
  constructor (collectionPath: string, minLength: number, maxLength: number) {
    super(
      `Invalid collectionPath length: A byte length of '${collectionPath}' must be equal to or more than ${minLength} and equal to or less than ${maxLength}.`
    );
  }
}

/**
 */
export class InvalidWorkingDirectoryPathLengthError extends BaseError {
  constructor (path: string, minLength: number, maxLength: number) {
    super(
      `Invalid working directory path length: A byte length of '${path}' must be equal to or more than ${minLength} and equal to or less than ${maxLength}.`
    );
  }
}

/**
 */
export class InvalidIdCharacterError extends BaseError {
  constructor (id: string) {
    const e = `Invalid ID character '${id}':
id allows Unicode characters excluding OS reserved filenames and following characters: < > : " | ? * \0
id cannot start with a slash and an underscore _.
id cannot end with a slash.
A directory name cannot end with a period or a white space.
A directory name does not allow '.' and '..'.`;
    super(e);
  }
}

/**
 */
export class InvalidIdLengthError extends BaseError {
  constructor (id: string, minLength: number, maxLength: number) {
    super(
      `Invalid id length: A byte length of '${id}' must be equal to or more than ${minLength} and equal to or less than ${maxLength}.`
    );
  }
}

/**
 */
export class InvalidJsonObjectError extends BaseError {
  constructor (e = `Invalid JSON object`) {
    super(e);
  }
}

/**
 */
export class UndefinedDocumentIdError extends BaseError {
  constructor (e = `Document id is undefined: A document must have an '_id' key`) {
    super(e);
  }
}

/**
 */
export class UndefinedFileSHAError extends BaseError {
  constructor (e = `File SHA is undefined.`) {
    super(e);
  }
}

/**
 */
export class InvalidBackNumberError extends BaseError {
  constructor (e = `Back number must be greater than or equal to 0.`) {
    super(e);
  }
}

/**
 */
export class CannotGetEntryError extends BaseError {
  constructor (e = `Cannot get blob entry.`) {
    super(e);
  }
}

/**
 */
export class RepositoryNotOpenError extends BaseError {
  constructor (e = 'Repository not opened') {
    super(e);
  }
}

/**
 */
export class DocumentNotFoundError extends BaseError {
  constructor (e = 'Document not found') {
    super(e);
  }
}

/**
 */
export class DatabaseClosingError extends BaseError {
  constructor (e = 'Database is closing') {
    super(e);
  }
}

/**
 */
export class DatabaseCloseTimeoutError extends BaseError {
  constructor (e = 'Queued operations are timeout') {
    super(e);
  }
}

/**
 */
export class InvalidPropertyNameInDocumentError extends BaseError {
  constructor (name: string) {
    const e = `Invalid property name '${name}': A property name cannot start with an underscore _ except _id and _deleted.`;
    super(e);
  }
}

/**
 */
export class InvalidDbNameCharacterError extends BaseError {
  constructor (name: string) {
    const e = `Invalid dbName '${name}': 
dbName allows Unicode characters excluding OS reserved filenames and following characters: < > : " ¥ / \\ | ? * \0.
dbName cannot end with a period or a white space.
dbName does not allow '.' and '..'.`;
    super(e);
  }
}

/**
 */
export class InvalidLocalDirCharacterError extends BaseError {
  constructor (name: string) {
    const e = `Invalid localDir character '${name}': 
A directory name allows Unicode characters excluding OS reserved filenames and following characters: < > : " | ? * \0.
A colon is generally not allowed, but a drive letter followed by a colon is allowed.
A directory name cannot end with a period or a white space, but the current directory . and the parent directory .. are allowed.`;
    super(e);
  }
}

/**
 */
export class InvalidSSHKeyPathError extends BaseError {
  constructor () {
    const e = `Invalid SSH key path`;
    super(e);
  }
}

/**
 */
export class InvalidURLError extends BaseError {
  constructor (url: string) {
    super(`Invalid url: ${url}'`);
  }
}

/**
 */
export class UndefinedRemoteURLError extends BaseError {
  constructor () {
    super(`Remote URL is undefined.`);
  }
}

/**
 */
export class RemoteRepositoryNotFoundError extends BaseError {
  constructor (url: string) {
    super(
      `Repository does not exist, or you do not have permission to access the repository: ${url}`
    );
  }
}

/**
 */
export class PushPermissionDeniedError extends BaseError {
  constructor (mes: string) {
    super(`Permission denied to push to the repository: ${mes}`);
  }
}

export class FetchPermissionDeniedError extends BaseError {
  constructor (mes: string) {
    super(`Permission denied to fetch to the repository: ${mes}`);
  }
}

/**
 */
export class FetchConnectionFailedError extends BaseError {
  constructor (mes: string) {
    super(`Fetch connection failed: ${mes}`);
  }
}

/**
 */
export class PushConnectionFailedError extends BaseError {
  constructor (mes: string) {
    super(`Push connection failed: ${mes}`);
  }
}

/**
 */
export class UndefinedGitHubAuthenticationError extends BaseError {
  constructor (mes: string) {
    super(`Authentication data for GitHub is undefined: ${mes}`);
  }
}

/**
 */
export class RemoteAlreadyRegisteredError extends BaseError {
  constructor (url: string) {
    super(
      `The remote repository has already been registered. :${url}
Call removeRemote() before register it again.`
    );
  }
}

/**
 */
export class InvalidAuthenticationTypeError extends BaseError {
  constructor (type: string) {
    super(`Authentication type must be one of the following values: 'github', 'ssh'.
Current value is '${type}'`);
  }
}

/**
 */
export class AuthenticationTypeNotAllowCreateRepositoryError extends BaseError {
  constructor (type: string | undefined) {
    super(
      `This authentication type does not allow to create repository. Current value is '${type}'`
    );
  }
}

/**
 */
export class UndefinedPersonalAccessTokenError extends BaseError {
  constructor () {
    super(`Personal Access Token of your GitHub account is needed.`);
  }
}

/**
 */
export class SyncWorkerFetchError extends BaseError {
  constructor (mes: string) {
    super(`Fetch error in sync worker: ${mes}`);
  }
}

/**
 */
export class UndefinedDBError extends BaseError {
  constructor () {
    super(`GitDocumentDB is undefined.`);
  }
}

/**
 */
export class HttpProtocolRequiredError extends BaseError {
  constructor (url: string) {
    super(`HTTP protocol is required: ${url}`);
  }
}

/**
 */
export class InvalidRepositoryURLError extends BaseError {
  constructor (url: string) {
    super(`Repository URL is invalid: ${url}`);
  }
}

/**
 */
export class NoMergeBaseFoundError extends BaseError {
  constructor () {
    super(`No merge base found`);
  }
}

/**
 */
export class CannotPushBecauseUnfetchedCommitExistsError extends BaseError {
  constructor () {
    super(
      'Cannot push because a reference that you are trying to update on the remote contains commits that are not present locally.'
    );
  }
}

/**
 */
export class IntervalTooSmallError extends BaseError {
  constructor (min: number, current: number) {
    super(`Interval is too small. Minimum value is ${min}. Current value is ${current}.`);
  }
}

/**
 */
export class FileRemoveTimeoutError extends BaseError {
  constructor () {
    super(`Removing file is timed out for some reason.`);
  }
}

/**
 */
export class InvalidConflictStateError extends BaseError {
  constructor (mes: string) {
    super(mes);
  }
}

/**
 */
export class DatabaseExistsError extends BaseError {
  constructor () {
    super('Database already exists');
  }
}

/**
 */
export class WorkingDirectoryExistsError extends BaseError {
  constructor () {
    super('Working directory already exists');
  }
}

/**
 */
export class CannotOpenRepositoryError extends BaseError {
  constructor (err: string) {
    super(`Cannot open repository: ${err}`);
  }
}

/**
 */
export class RepositoryNotFoundError extends BaseError {
  constructor (path: string) {
    super(
      `Repository does not exist, or you do not have permission to access the directory: ${path}`
    );
  }
}

/**
 */
export class CannotConnectError extends BaseError {
  constructor (public retry: number, url: string, mes: string) {
    super(`Cannot connect to ${url}: ${mes}`);
  }
}

/**
 */
export class RequestTimeoutError extends BaseError {
  constructor (url: string) {
    super(`Request timeout: ${url}`);
  }
}

/**
 */
export class SocketTimeoutError extends BaseError {
  constructor (url: string) {
    super(`Socket timeout: ${url}`);
  }
}

/**
 */
export class HTTPNetworkError extends BaseError {
  constructor (mes: string) {
    super(`HTTPNetworkError: ${mes}`);
  }
}

/**
 */
export class CannotCreateRemoteRepositoryError extends BaseError {
  constructor (reason: string) {
    super(`Cannot create remote repository: ${reason}`);
  }
}

/**
 */
export class TaskCancelError extends BaseError {
  constructor (taskId: string) {
    super(`Task is canceled: ${taskId}`);
  }
}

/**
 */
export class PersonalAccessTokenForAnotherAccountError extends BaseError {
  constructor () {
    super('This is a personal access token for another account.');
  }
}

/**
 */
export class PushWorkerError extends BaseError {
  constructor (mes: string) {
    super(`Error in push_worker: ${mes}`);
  }
}

/**
 */
export class SyncWorkerError extends BaseError {
  constructor (mes: string) {
    super(`Error in sync_worker: ${mes}`);
  }
}

/**
 */
export class ThreeWayMergeError extends BaseError {
  constructor (mes: string) {
    super(`Error in threeWayMerge: ${mes}`);
  }
}

/**
 */
export class RemoteIsAdvancedWhileMergingError extends BaseError {
  constructor () {
    super(`Remote is advanced while merging.`);
  }
}

/**
 */
export class RemoteRepositoryConnectError extends BaseError {
  constructor (mes: string) {
    super(`Error in RemoteRepository#connect(): ${mes}`);
  }
}

/**
 */
export class PushNotAllowedError extends BaseError {
  constructor (direction: string) {
    super(`Push is not allowed. Current sync direction setting is : ${direction}`);
  }
}

/**
 */
export class GitPushError extends BaseError {
  constructor (mes: string) {
    super(`Push error in Git : ${mes}`);
  }
}

/**
 */
export class GitMergeBranchError extends BaseError {
  constructor (mes: string) {
    super(`Merge branch error in Git : ${mes}`);
  }
}

export class SyncIntervalLessThanOrEqualToRetryIntervalError extends BaseError {
  constructor (syncInterval: number, retryInterval: number) {
    super(
      `Sync interval is less than or equal to retry interval : ${syncInterval} < ${retryInterval}`
    );
  }
}

export class InvalidFileSHAFormatError extends BaseError {
  constructor () {
    super(`File SHA format is invalid.`);
  }
}
