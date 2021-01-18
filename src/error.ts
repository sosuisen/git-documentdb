import { MAX_LENGTH_OF_KEY, MAX_LENGTH_OF_WORKING_DIRECTORY_PATH } from './const';

class BaseError extends Error {
  constructor(e?: string) {
    super(e);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class CannotCreateDirectoryError extends BaseError {
  constructor(e = 'Cannot create directory') {
    super(e);
  }
}

export class CannotWriteDataError extends BaseError {
  constructor(e = 'Cannot write data') {
    super(e);
  }
}

export class InvalidWorkingDirectoryPathLengthError extends BaseError {
  constructor(e = `Invalid path length: A length of working directory path must be equal to or less than ${MAX_LENGTH_OF_WORKING_DIRECTORY_PATH}.`) {
    super(e);
  }
}

export class InvalidKeyCharacterError extends BaseError {
  constructor(e = 'Invalid Key character: id value only allows **a to z, A to Z, 0 to 9, and these 7 punctuation marks _ - . ( ) [ ]**. Do not use a period at the end.<br>') {
    super(e);
  }
}

export class InvalidKeyLengthError extends BaseError {
  constructor(e = `Invalid Key length: A length of id value must be equal to or less than ${MAX_LENGTH_OF_KEY}.`) {
    super(e);
  }
}

export class InvalidJsonObjectError extends BaseError {
  constructor(e = `Invalid JSON object`) {
    super(e);
  }
}

export class DocumentIdNotFoundError extends BaseError {
  constructor(e = `Document id not found: A document must have an '_id' key`) {
    super(e);
  }
}

export class RepositoryNotOpenError extends BaseError {
  constructor(e = 'Repository not opened') {
    super(e);
  }
}


