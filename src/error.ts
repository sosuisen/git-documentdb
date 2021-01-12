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
