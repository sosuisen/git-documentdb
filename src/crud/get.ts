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
  DatabaseClosingError,
  DocumentNotFoundError,
  InvalidJsonObjectError,
  RepositoryNotOpenError,
  UndefinedDocumentIdError,
} from '../error';
import { JsonDoc } from '../types';

export async function getImpl (this: AbstractDocumentDB, docId: string): Promise<JsonDoc> {
  const _id = docId;
  if (this.isClosing) {
    return Promise.reject(new DatabaseClosingError());
  }
  const _currentRepository = this.repository();
  if (_currentRepository === undefined) {
    return Promise.reject(new RepositoryNotOpenError());
  }

  if (_id === undefined) {
    return Promise.reject(new UndefinedDocumentIdError());
  }

  try {
    this.validator.validateId(_id);
  } catch (err) {
    return Promise.reject(err);
  }

  // Calling nameToId() for HEAD throws error when this is first commit.
  const head = await nodegit.Reference.nameToId(_currentRepository, 'HEAD').catch(
    e => false
  ); // get HEAD
  let document;
  if (!head) {
    return Promise.reject(new DocumentNotFoundError());
  }

  const commit = await _currentRepository.getCommit(head as nodegit.Oid); // get the commit of HEAD
  const filename = _id + this.fileExt;
  const entry = await commit.getEntry(filename).catch((err: Error) => {
    return Promise.reject(new DocumentNotFoundError(err.message));
  });
  const blob = await entry.getBlob();
  try {
    document = (JSON.parse(blob.toString()) as unknown) as JsonDoc;
    // _id in a document may differ from _id in a filename by mistake.
    // _id in a file is SSOT.
    // Overwrite _id in a document by _id in arguments
    document._id = _id;
  } catch (e) {
    return Promise.reject(new InvalidJsonObjectError());
  }

  return document;
}
