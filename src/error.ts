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

export class UndefinedDatabaseNameError extends BaseError {
  constructor (e = `Database name is undefined: Option must have dbName`) {
    super(e);
  }
}

export class CannotCreateDirectoryError extends BaseError {
  constructor (e = 'Cannot create directory') {
    super(e);
  }
}

/**
 * @beta
 */
export class CannotWriteDataError extends BaseError {
  constructor (e = 'Cannot write data') {
    super(e);
  }
}

export class CannotDeleteDataError extends BaseError {
  constructor (e = 'Cannot write data') {
    super(e);
  }
}

export class InvalidCollectionPathCharacterError extends BaseError {
  constructor (
    e = "Invalid collectionPath character: collectionPath allows UTF-8 string excluding OS reserved filenames and following characters: < > : \" | ? * \0. Each part of collectionPath that is separated by slash cannot end with a period . (e.g. '/users./' is disallowed.)"
  ) {
    super(e);
  }
}

export class InvalidCollectionPathLengthError extends BaseError {
  constructor (collectionPath: string, minLength: number, maxLength: number) {
    super(
      `Invalid collectionPath length: A length of '${collectionPath}' must be equal to or more than ${minLength} and equal to or less than ${maxLength}.`
    );
  }
}

export class InvalidWorkingDirectoryPathLengthError extends BaseError {
  constructor (path: string, minLength: number, maxLength: number) {
    super(
      `Invalid working directory path length: A length of '${path}' must be equal to or more than ${minLength} and equal to or less than ${maxLength}.`
    );
  }
}

export class InvalidIdCharacterError extends BaseError {
  constructor (
    e = 'Invalid ID character: id value allows UTF-8 string excluding following characters: < > : "  | ? * \0. id cannot start with an underscore _. id cannot end with a period .'
  ) {
    super(e);
  }
}

export class InvalidKeyLengthError extends BaseError {
  constructor (key: string, minLength: number, maxLength: number) {
    super(
      `Invalid Key length: A length of '${key}' must be equal to or more than ${minLength} and equal to or less than ${maxLength}.`
    );
  }
}

export class InvalidJsonObjectError extends BaseError {
  constructor (e = `Invalid JSON object`) {
    super(e);
  }
}

export class UndefinedDocumentIdError extends BaseError {
  constructor (e = `Document id is undefined: A document must have an '_id' key`) {
    super(e);
  }
}

export class RepositoryNotOpenError extends BaseError {
  constructor (e = 'Repository not opened') {
    super(e);
  }
}

export class DocumentNotFoundError extends BaseError {
  constructor (e = 'Document not found') {
    super(e);
  }
}

export class DatabaseClosingError extends BaseError {
  constructor (e = 'Database is closing') {
    super(e);
  }
}

export class DatabaseCloseTimeoutError extends BaseError {
  constructor (e = 'Queued operations are timeout') {
    super(e);
  }
}

export class InvalidPropertyNameInDocumentError extends BaseError {
  constructor (e = 'A property name cannot start with an underscore _ except _id.') {
    super(e);
  }
}

export class InvalidDbNameCharacterError extends BaseError {
  constructor (
    e = 'dbName allows UTF-8 string excluding OS reserved filenames and following characters: < > : " \\ | ? * \0. dbName cannot end with a period .'
  ) {
    super(e);
  }
}

export class InvalidLocalDirCharacterError extends BaseError {
  constructor (e = 'localDir cannot end with a period .') {
    super(e);
  }
}
