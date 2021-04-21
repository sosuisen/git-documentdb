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
  RepositoryNotOpenError,
  UndefinedDocumentIdError,
  UndefinedFileSHAError,
} from '../error';

export async function getDocHistoryImpl (
  this: AbstractDocumentDB,
  docId: string
): Promise<string[]> {
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

  // May throw errors
  this.validator.validateId(_id);

  // Calling nameToId() for HEAD throws error when this is first commit.
  await nodegit.Reference.nameToId(_currentRepository, 'HEAD').catch(() => {
    throw new DocumentNotFoundError();
  }); // get HEAD

  const fileName = _id + this.fileExt;

  const fileSHAArray: string[] = [];
  const fileSHAHash: { [key: string]: boolean } = {};
  const walk = _currentRepository.createRevWalk();

  walk.pushHead();
  walk.sorting(nodegit.Revwalk.SORT.TOPOLOGICAL, nodegit.Revwalk.SORT.TIME);
  await (async function step () {
    const oid = await walk.next().catch(() => {
      return null;
    });
    if (oid == null) {
      return;
    }
    const commit = await nodegit.Commit.lookup(_currentRepository, oid);
    let entry = null;
    try {
      entry = await commit.getEntry(fileName);
    } catch (err) {
      if (err.errno !== -3) {
        // -3 shows requested object could not be found error.
        // It is a generic return code of libgit2
        // https://github.com/libgit2/libgit2/blob/main/include/git2/errors.h
        // GIT_ERROR      = -1,		/**< Generic error */
        // GIT_ENOTFOUND  = -3,		/**< Requested object could not be found */
        throw new CannotGetEntryError(err.message);
      }
    }
    if (entry != null && !fileSHAHash[entry.sha()]) {
      fileSHAArray.push(entry.sha());
      fileSHAHash[entry.sha()] = true;
    }
    await step();
  })();

  return fileSHAArray;
}

export async function getBackNumber (
  gitDDB: AbstractDocumentDB,
  fileName: string,
  backNumber: number
): Promise<string> {
  const _currentRepository = gitDDB.repository();
  if (_currentRepository === undefined) {
    throw new RepositoryNotOpenError();
  }

  const fileSHAHash: { [key: string]: boolean } = {};
  const walk = _currentRepository.createRevWalk();

  let headFlag = true;
  let fileSHA = '';
  walk.pushHead();
  walk.sorting(nodegit.Revwalk.SORT.TOPOLOGICAL, nodegit.Revwalk.SORT.TIME);
  await (async function step () {
    const oid = await walk.next().catch(() => {
      return null;
    });
    if (oid == null) {
      return;
    }
    const commit = await nodegit.Commit.lookup(_currentRepository, oid);
    let entry = null;
    try {
      entry = await commit.getEntry(fileName);
    } catch (err) {
      if (err.errno !== -3) {
        // -3 shows requested object could not be found error.
        // It is a generic return code of libgit2
        // https://github.com/libgit2/libgit2/blob/main/include/git2/errors.h
        // GIT_ERROR      = -1,		/**< Generic error */
        // GIT_ENOTFOUND  = -3,		/**< Requested object could not be found */
        throw new CannotGetEntryError(err.message);
      }
    }

    if (entry != null) {
      if (backNumber === 0) {
        if (headFlag) {
          fileSHA = entry.sha();
          return;
        }
        throw new DocumentNotFoundError();
      }

      if (!fileSHAHash[entry.sha()]) {
        fileSHAHash[entry.sha()] = true;
        if (Object.keys(fileSHAHash).length === backNumber) {
          console.log(entry.sha());
          fileSHA = entry.sha();
          return;
        }
      }
    }
    headFlag = false;
    await step();
  })();

  if (fileSHA !== '') {
    return fileSHA;
  }
  throw new DocumentNotFoundError();
}
