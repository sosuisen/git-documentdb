/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import nodegit from '@sosuisen/nodegit';
import { AbstractDocumentDB } from '../types_gitddb';
import {
  CannotGetEntryError,
  DatabaseClosingError,
  DocumentNotFoundError,
  InvalidBackNumberError,
  InvalidJsonObjectError,
  RepositoryNotOpenError,
  UndefinedDocumentIdError,
  UndefinedFileSHAError,
} from '../error';
import { JsonDoc } from '../types';
import { getBackNumber } from './history';

export async function getImpl (
  this: AbstractDocumentDB,
  docId: string,
  backNumber?: number
): Promise<JsonDoc> {
  const _id = docId;
  if (this.isClosing) {
    throw new DatabaseClosingError();
  }
  const _currentRepository = this.repository();
  if (_currentRepository === undefined) {
    throw new RepositoryNotOpenError();
  }

  if (_id === undefined) {
    throw new UndefinedDocumentIdError();
  }

  // May throw error
  this.validator.validateId(_id);

  // Calling nameToId() for HEAD throws error when this is first commit.
  const head = await nodegit.Reference.nameToId(_currentRepository, 'HEAD').catch(
    e => false
  ); // get HEAD
  let document;
  if (!head) {
    throw new DocumentNotFoundError();
  }

  const filename = _id + this.fileExt;

  if (!backNumber || backNumber === 0) {
    const commit = await _currentRepository.getCommit(head as nodegit.Oid); // get the commit of HEAD
    const entry = await commit.getEntry(filename).catch(err => {
      if (err.errno === -3) {
        // -3 shows requested object could not be found error.
        // It is a generic return code of libgit2
        // https://github.com/libgit2/libgit2/blob/main/include/git2/errors.h
        // GIT_ERROR      = -1,		/**< Generic error */
        // GIT_ENOTFOUND  = -3,		/**< Requested object could not be found */
        throw new DocumentNotFoundError(err.message);
      }
      else {
        throw new CannotGetEntryError(err.message);
      }
    });
    const blob = await entry.getBlob();

    try {
      document = (JSON.parse(blob.toString()) as unknown) as JsonDoc;
      // _id in a document may differ from _id in a filename by mistake.
      // _id in a file is SSOT.
      // Overwrite _id in a document by _id in arguments
      document._id = _id;
    } catch (e) {
      throw new InvalidJsonObjectError();
    }

    return document;
  }
  else if (backNumber > 0) {
    const fileSHA = await getBackNumber(this, filename, backNumber);
    return await getByRevisionImpl.call(this, fileSHA);
  }

  throw new InvalidBackNumberError();
}

export async function getByRevisionImpl (
  this: AbstractDocumentDB,
  fileSHA: string
): Promise<JsonDoc> {
  if (this.isClosing) {
    throw new DatabaseClosingError();
  }
  const _currentRepository = this.repository();
  if (_currentRepository === undefined) {
    throw new RepositoryNotOpenError();
  }

  if (fileSHA === undefined) {
    throw new UndefinedFileSHAError();
  }

  const blob = await _currentRepository.getBlob(fileSHA).catch(err => {
    if (err.errno === -3) {
      // -3 shows requested object could not be found error.
      // It is a generic return code of libgit2
      // https://github.com/libgit2/libgit2/blob/main/include/git2/errors.h
      // GIT_ERROR      = -1,		/**< Generic error */
      // GIT_ENOTFOUND  = -3,		/**< Requested object could not be found */
      throw new DocumentNotFoundError(err.message);
    }
    else {
      throw new CannotGetEntryError(err.message);
    }
  });
  let document;
  try {
    document = (JSON.parse(blob.toString()) as unknown) as JsonDoc;
  } catch (e) {
    throw new InvalidJsonObjectError();
  }

  return document;
}
