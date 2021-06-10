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
import { DocWithMetadata, JsonDoc } from '../types';
import { getBackNumber } from './history';
import { JSON_EXT } from '../const';

type GetOptions = {
  backNumber?: number;
  withMetadata?: boolean;
};

// eslint-disable-next-line complexity
export async function getImpl (
  this: IDocumentDB,
  docId: string,
  options: GetOptions
): Promise<JsonDoc | DocWithMetadata | undefined> {
  const _id = docId;
  if (this.isClosing) {
    throw new DatabaseClosingError();
  }
  const currentRepository = this.repository();
  if (currentRepository === undefined) {
    throw new RepositoryNotOpenError();
  }

  if (_id === undefined) {
    throw new UndefinedDocumentIdError();
  }

  // May throw error
  this.validator.validateId(_id);

  // Calling nameToId() for HEAD throws error when this is first commit.
  const head = await nodegit.Reference.nameToId(currentRepository, 'HEAD').catch(
    e => false
  ); // get HEAD
  if (!head) {
    return undefined;
  }

  const filename = _id + JSON_EXT;

  if (!options.backNumber || options.backNumber === 0) {
    const commit = await currentRepository.getCommit(head as nodegit.Oid); // get the commit of HEAD
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
      const document = (JSON.parse(blob.toString()) as unknown) as JsonDoc;
      // _id in a document may differ from _id in a filename by mistake.
      // _id in a file is SSOT.
      // Overwrite _id in a document by _id in arguments
      document._id = _id;
      if (options.withMetadata) {
        return {
          id: document._id,
          fileSha: blob.id().tostrS(),
          doc: document,
        };
      }
      return document;
    } catch (e) {
      throw new InvalidJsonObjectError(_id);
    }
  }
  else if (options.backNumber > 0) {
    const docWithMetadata = await getBackNumber(this, filename, options.backNumber);
    if (docWithMetadata === undefined) {
      return undefined;
    }
    if (options.withMetadata) {
      return docWithMetadata;
    }
    return docWithMetadata.doc;
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
  const currentRepository = this.repository();
  if (currentRepository === undefined) {
    throw new RepositoryNotOpenError();
  }

  if (fileSHA === undefined) {
    throw new UndefinedFileSHAError();
  }

  if (!fileSHA.match(/^[\da-z]{40}$/)) {
    throw new InvalidFileSHAFormatError();
  }

  const blob = await currentRepository.getBlob(fileSHA).catch(err => {
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
    throw new InvalidJsonObjectError('file_sha: ' + fileSHA);
  }

  return document;
}
