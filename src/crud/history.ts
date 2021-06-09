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
  RepositoryNotOpenError,
  UndefinedDocumentIdError,
} from '../error';
import { JSON_EXT } from '../const';

export async function getDocHistoryImpl (
  this: IDocumentDB,
  docId: string
): Promise<string[]> {
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

  // May throw errors
  this.validator.validateId(_id);

  // Calling nameToId() for HEAD throws error when this is first commit.
  await nodegit.Reference.nameToId(currentRepository, 'HEAD').catch(() => {
    // throw new DocumentNotFoundError();
    return [];
  }); // get HEAD

  const fileName = _id + JSON_EXT;

  const fileSHAArray: string[] = [];
  const fileSHAHash: { [key: string]: boolean } = {};
  const walk = currentRepository.createRevWalk();

  walk.pushHead();
  walk.sorting(nodegit.Revwalk.SORT.TOPOLOGICAL, nodegit.Revwalk.SORT.TIME);
  await (async function step () {
    const oid = await walk.next().catch(() => {
      return null;
    });
    if (oid == null) {
      return;
    }
    const commit = await nodegit.Commit.lookup(currentRepository, oid);
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

/**
 * getBackNumber
 *
 * @param fileName e.g.) foo.json
 * @param backNumber 0 or greater
 */
export async function getBackNumber (
  gitDDB: IDocumentDB,
  fileName: string,
  backNumber: number
): Promise<string | undefined> {
  const currentRepository = gitDDB.repository();
  if (currentRepository === undefined) {
    throw new RepositoryNotOpenError();
  }

  const walk = currentRepository.createRevWalk();

  let headFlag = true;
  let fileSHA = '';
  walk.pushHead();
  walk.sorting(nodegit.Revwalk.SORT.TOPOLOGICAL, nodegit.Revwalk.SORT.TIME);
  let prevSHA = '';
  let shaCounter = 0;
  // eslint-disable-next-line complexity

  // eslint-disable-next-line complexity
  async function step (): Promise<'success' | 'failure' | 'next'> {
    const oid = await walk.next().catch(() => {
      return null;
    });
    if (oid == null) {
      return 'failure';
    }
    const commit = await nodegit.Commit.lookup(currentRepository!, oid);
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

    if (headFlag) {
      if (backNumber === 0) {
        if (entry != null) {
          // The file is not deleted when headFlag equals true and entry exists.
          fileSHA = entry.sha();
          return 'success';
        }
        // The file is deleted.
        return 'failure';
      }
      // Go next step
      if (entry != null) {
        prevSHA = entry.sha();
        shaCounter++;
        backNumber++;
      }
      headFlag = false;
      return 'next';
    }

    if (entry != null) {
      // Skip consecutive same SHAs
      const sha = entry.sha();
      if (prevSHA !== sha) {
        prevSHA = sha;
        shaCounter++;
        if (shaCounter >= backNumber) {
          // console.log(entry.sha());
          fileSHA = sha;
          return 'success';
        }
      }
    }
    else {
      // Reset check for consecutive SHAs
      prevSHA = '';
    }
    return 'next';
  }
  // eslint-disable-next-line no-await-in-loop
  while ((await step()) === 'next') {}

  if (fileSHA !== '') {
    return fileSHA;
  }
  // throw new DocumentNotFoundError();
  return undefined;
}
