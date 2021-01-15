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
