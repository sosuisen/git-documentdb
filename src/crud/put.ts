import path from 'path';
import { AbstractDocumentDB, JsonDoc, PutOptions, PutResult } from '../types';
import {
  DatabaseClosingError,
  InvalidJsonObjectError,
  RepositoryNotOpenError,
  UndefinedDocumentIdError,
} from '../error';
import { toSortedJSONString } from '../utils';

export function putFunc (
  this: AbstractDocumentDB,
  idOrDoc: string | JsonDoc,
  docOrOptions: { [key: string]: any } | PutOptions,
  options?: PutOptions
): Promise<PutResult> {
  if (this.isClosing) {
    return Promise.reject(new DatabaseClosingError());
  }

  if (this.getRepository() === undefined) {
    return Promise.reject(new RepositoryNotOpenError());
  }

  let _id = '';
  let document: JsonDoc = {};
  if (typeof idOrDoc === 'string') {
    _id = idOrDoc;
    if (typeof docOrOptions === 'object') {
      document = docOrOptions;
    }
    else {
      return Promise.reject(new InvalidJsonObjectError());
    }
  }
  else if (typeof idOrDoc === 'object') {
    _id = idOrDoc._id;
    document = idOrDoc;
    options = docOrOptions;

    if (_id === undefined) {
      return Promise.reject(new UndefinedDocumentIdError());
    }
  }
  else {
    return Promise.reject(new UndefinedDocumentIdError());
  }

  try {
    this._validator.validateId(_id);
  } catch (err) {
    return Promise.reject(err);
  }

  let data = '';
  try {
    data = JSON.stringify(document);
  } catch (err) {
    // not json
    return Promise.reject(new InvalidJsonObjectError());
  }

  // Must clone doc before rewriting _id
  const clone = JSON.parse(data);
  // _id of JSON document in Git repository includes just a filename.
  clone._id = path.basename(_id);

  try {
    this._validator.validateDocument(clone);
  } catch (err) {
    return Promise.reject(err);
  }

  data = toSortedJSONString(clone);

  options ??= {
    commit_message: undefined,
  };

  options.commit_message ??= `put: ${_id}`;

  // put() must be serial.
  return new Promise((resolve, reject) => {
    this._pushToSerialQueue(() =>
      this._put_concurrent(_id, data, options!.commit_message!)
        .then(result => {
          resolve(result);
        })
        .catch(err => reject(err))
    );
  });
}
