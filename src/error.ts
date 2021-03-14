/* eslint-disable unicorn/custom-error-definition */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import { SyncDirection } from './types';

class BaseError extends Error {
  constructor (e?: string) {
    super(e);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * @public
 */
export class UndefinedDatabaseNameError extends BaseError {
  constructor (e = `Database name is undefined: Option must have dbName`) {
    super(e);
  }
}

/**
 * @public
 */
export class CannotCreateDirectoryError extends BaseError {
  constructor (e = 'Cannot create directory') {
    super(e);
  }
}

/**
 * @public
 */
export class CannotWriteDataError extends BaseError {
  constructor (e = 'Cannot write data') {
    super(e);
  }
}

/**
 * @public
 */
export class CannotDeleteDataError extends BaseError {
  constructor (e = 'Cannot write data') {
    super(e);
  }
}

/**
 * @public
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
 * @public
 */
export class InvalidCollectionPathError extends BaseError {
  constructor (name: string) {
    const e = `Invalid collectionPath: '${name}'
This name is not permitted as collectionPath.`;
    super(e);
  }
}

/**
 * @public
 */
export class InvalidCollectionPathLengthError extends BaseError {
  constructor (collectionPath: string, minLength: number, maxLength: number) {
    super(
      `Invalid collectionPath length: A byte length of '${collectionPath}' must be equal to or more than ${minLength} and equal to or less than ${maxLength}.`
    );
  }
}

/**
 * @public
 */
export class InvalidWorkingDirectoryPathLengthError extends BaseError {
  constructor (path: string, minLength: number, maxLength: number) {
    super(
      `Invalid working directory path length: A byte length of '${path}' must be equal to or more than ${minLength} and equal to or less than ${maxLength}.`
    );
  }
}

/**
 * @public
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
 * @public
 */
export class InvalidIdLengthError extends BaseError {
  constructor (id: string, minLength: number, maxLength: number) {
    super(
      `Invalid id length: A byte length of '${id}' must be equal to or more than ${minLength} and equal to or less than ${maxLength}.`
    );
  }
}

/**
 * @public
 */
export class InvalidJsonObjectError extends BaseError {
  constructor (e = `Invalid JSON object`) {
    super(e);
  }
}

/**
 * @public
 */
export class UndefinedDocumentIdError extends BaseError {
  constructor (e = `Document id is undefined: A document must have an '_id' key`) {
    super(e);
  }
}

/**
 * @public
 */
export class RepositoryNotOpenError extends BaseError {
  constructor (e = 'Repository not opened') {
    super(e);
  }
}

/**
 * @public
 */
export class DocumentNotFoundError extends BaseError {
  constructor (e = 'Document not found') {
    super(e);
  }
}

/**
 * @public
 */
export class DatabaseClosingError extends BaseError {
  constructor (e = 'Database is closing') {
    super(e);
  }
}

/**
 * @public
 */
export class DatabaseCloseTimeoutError extends BaseError {
  constructor (e = 'Queued operations are timeout') {
    super(e);
  }
}

/**
 * @public
 */
export class InvalidPropertyNameInDocumentError extends BaseError {
  constructor (name: string) {
    const e = `Invalid property name '${name}': A property name cannot start with an underscore _ except _id and _deleted.`;
    super(e);
  }
}

/**
 * @public
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
 * @public
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
 * @public
 */
export class InvalidSSHKeyPathError extends BaseError {
  constructor () {
    const e = `Invalid SSH key path`;
    super(e);
  }
}

/**
 * @public
 */
export class InvalidURLFormatError extends BaseError {
  constructor (url: string) {
    super(`Invalid url format: ${url}'`);
  }
}

/**
 * @public
 */
export class UnresolvedHostError extends BaseError {
  constructor (url: string) {
    super(`Failed to resolve address for ${url}'`);
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
export class RemoteRepositoryNotFoundError extends BaseError {
  constructor (url: string) {
    super(
      `Repository does not exist, or you do not have permission to access the private repository: ${url}`
    );
  }
}

/**
 * @public
 */
export class InvalidSSHKeyFormatError extends BaseError {
  constructor () {
    super(`Format of SSH key pair is invalid.`);
  }
}

/**
 * @public
 */
export class PushPermissionDeniedError extends BaseError {
  constructor () {
    super(`Permission denied to push to the repository.`);
  }
}

/**
 * @public
 */
export class PushAuthenticationError extends BaseError {
  constructor () {
    super(`401 Unauthorized to push to the repository.`);
  }
}

/**
 * @public
 */
export class UndefinedGitHubAuthenticationError extends BaseError {
  constructor (mes: string) {
    super(`Authentication data for GitHub is undefined: ${mes}`);
  }
}

/**
 * @public
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
 * @public
 */
export class InvalidAuthenticationTypeError extends BaseError {
  constructor (type: string) {
    super(`Authentication type must be one of the following values: 'github', 'ssh'.
Current value is '${type}'`);
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
export class AuthNeededForPushOrSyncError extends BaseError {
  constructor (direction: SyncDirection) {
    super(`Authentication data is needed for this sync direction: ${direction}`);
  }
}

/**
 * @public
 */
export class SyncWorkerFetchError extends BaseError {
  constructor (mes: string) {
    super(`Fetch error in sync worker: ${mes}`);
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
  constructor (url: string) {
    super(`HTTP protocol is required: ${url}`);
  }
}

/**
 * @public
 */
export class InvalidRepositoryURLError extends BaseError {
  constructor (url: string) {
    super(`Repository URL is invalid: ${url}`);
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
