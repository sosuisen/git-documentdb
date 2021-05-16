/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import nodegit from '@sosuisen/nodegit';
import { IDocumentDB } from '../types_gitddb';
import {
  CannotGetEntryError,
  DatabaseClosingError,
  InvalidBackNumberError,
  InvalidFileSHAFormatError,
  InvalidJsonObjectError,
  RepositoryNotOpenError,
  UndefinedDocumentIdError,
  UndefinedFileSHAError,
} from '../error';
import { JsonDoc, JsonDocWithMetadata } from '../types';
import { getBackNumber } from './history';

type GetOptions = {
  back_number?: number;
  with_metadata?: boolean;
};

// eslint-disable-next-line complexity
export async function getImpl (
  this: IDocumentDB,
  docId: string,
  options: GetOptions
): Promise<JsonDoc | JsonDocWithMetadata | undefined> {
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
    return undefined;
  }

  const filename = _id + this.fileExt;

  if (!options.back_number || options.back_number === 0) {
    const commit = await _currentRepository.getCommit(head as nodegit.Oid); // get the commit of HEAD
    const entry = await commit.getEntry(filename).catch(err => {
      if (err.errno === -3) {
        // -3 shows requested object could not be found error.
        // It is a generic return code of libgit2
        // https://github.com/libgit2/libgit2/blob/main/include/git2/errors.h
        // GIT_ERROR      = -1,		/**< Generic error */
        // GIT_ENOTFOUND  = -3,		/**< Requested object could not be found */

        return undefined;
      }

      throw new CannotGetEntryError(err.message);
    });
    if (entry === undefined) {
      return undefined;
    }
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

    if (options.with_metadata) {
      return {
        id: document._id,
        file_sha: blob.id().tostrS(),
        doc: document,
      };
    }
    return document;
  }
  else if (options.back_number > 0) {
    const fileSHA = await getBackNumber(this, filename, options.back_number);
    if (fileSHA === undefined) {
      return undefined;
    }
    const doc = await getByRevisionImpl.call(this, fileSHA);
    if (doc) {
      if (options.with_metadata) {
        return {
          id: doc._id,
          file_sha: fileSHA,
          doc,
        };
      }
      return doc;
    }
    return undefined;
  }

  throw new InvalidBackNumberError();
}

export async function getByRevisionImpl (
  this: IDocumentDB,
  fileSHA: string
): Promise<JsonDoc | undefined> {
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

  if (!fileSHA.match(/^[\da-z]{40}$/)) {
    throw new InvalidFileSHAFormatError();
  }

  const blob = await _currentRepository.getBlob(fileSHA).catch(err => {
    if (err.errno === -3) {
      // -3 shows requested object could not be found error.
      // It is a generic return code of libgit2
      // https://github.com/libgit2/libgit2/blob/main/include/git2/errors.h
      // GIT_ERROR      = -1,		/**< Generic error */
      // GIT_ENOTFOUND  = -3,		/**< Requested object could not be found */

      return undefined;
    }

    // Other errors
    // e.g.) "unable to parse OID - contains invalid characters"
    throw new CannotGetEntryError(err.message);
  });
  let document;
  try {
    if (blob === undefined) {
      return undefined;
    }
    document = (JSON.parse(blob.toString()) as unknown) as JsonDoc;
  } catch (e) {
    throw new InvalidJsonObjectError();
  }

  return document;
}
