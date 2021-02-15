/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import { MAX_LENGTH_OF_KEY, MAX_LENGTH_OF_WORKING_DIRECTORY_PATH } from './const';

class BaseError extends Error {
  constructor(e?: string) {
    super(e);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UndefinedDatabaseNameError extends BaseError {
  constructor(e = `Database name is undefined: Option must have dbName`) {
    super(e);
  }
}

export class CannotCreateDirectoryError extends BaseError {
  constructor(e = 'Cannot create directory') {
    super(e);
  }
}

/**
 * @beta
 */
export class CannotWriteDataError extends BaseError {
  constructor(e = 'Cannot write data') {
    super(e);
  }
}

export class CannotDeleteDataError extends BaseError {
  constructor(e = 'Cannot write data') {
    super(e);
  }
}

export class InvalidWorkingDirectoryPathLengthError extends BaseError {
  constructor(e = `Invalid path length: A length of working directory path must be equal to or less than ${MAX_LENGTH_OF_WORKING_DIRECTORY_PATH}.`) {
    super(e);
  }
}

export class InvalidIdCharacterError extends BaseError {
  constructor(e = 'Invalid ID character: id value only allows **a to z, A to Z, 0 to 9, and these 7 punctuation marks _ - . ( ) [ ]**. Do not use a period at the end.<br>') {
    super(e);
  }
}

export class InvalidIdLengthError extends BaseError {
  constructor(e = `Invalid ID length: A length of id value must be equal to or less than ${MAX_LENGTH_OF_KEY}.`) {
    super(e);
  }
}

export class InvalidJsonObjectError extends BaseError {
  constructor(e = `Invalid JSON object`) {
    super(e);
  }
}

export class UndefinedDocumentIdError extends BaseError {
  constructor(e = `Document id is undefined: A document must have an '_id' key`) {
    super(e);
  }
}

export class RepositoryNotOpenError extends BaseError {
  constructor(e = 'Repository not opened') {
    super(e);
  }
}

export class DocumentNotFoundError extends BaseError {
  constructor(e = 'Document not found') {
    super(e);
  }
}

export class DatabaseClosingError extends BaseError {
  constructor(e = 'Database is closing') {
    super(e);
  }
}

export class DatabaseCloseTimeoutError extends BaseError {
  constructor(e = 'Queued operations are timeout') {
    super(e);
  }
}
