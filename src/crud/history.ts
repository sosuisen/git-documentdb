/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of gitDDB source tree.
 */

import { log, readBlob, ReadBlobResult } from 'isomorphic-git';
import fs from 'fs-extra';
import { Doc, DocType, FatDoc, GetOptions, HistoryFilter, HistoryOptions } from '../types';
import { GitDDBInterface } from '../types_gitddb';
import { Err } from '../error';
import { blobToBinary, blobToJsonDoc, blobToText } from './blob';

/**
 * Implementation of getHistory
 *
 * @throws {@link Err.DatabaseClosingError}
 * @throws {@link Err.RepositoryNotOpenError}
 *
 * @throws # Errors from blobToJsonDoc
 * @throws {@link Err.InvalidJsonObjectError}
 */
// eslint-disable-next-line complexity
export async function getHistoryImpl (
  gitDDB: GitDDBInterface,
  shortName: string,
  collectionPath: string,
  jsonExt: string,
  historyOptions?: HistoryOptions,
  options?: GetOptions,
  withMetaData = false
): Promise<(FatDoc | Doc | undefined)[]> {
  if (gitDDB.isClosing) {
    throw new Err.DatabaseClosingError();
  }
  if (!gitDDB.isOpened) {
    return Promise.reject(new Err.RepositoryNotOpenError());
  }

  options ??= {
    forceDocType: undefined,
  };

  const fullDocPath = collectionPath + shortName;

  const docType: DocType =
    options.forceDocType ?? (fullDocPath.endsWith(jsonExt) ? 'json' : 'text');

  if (docType === 'text') {
    // TODO: select binary or text by .gitattribtues
  }

  const docArray: (FatDoc | Doc | undefined)[] = [];

  const commits = await log({
    fs,
    dir: gitDDB.workingDir,
    ref: 'main',
  });

  let prevOid: string | undefined = '';

  for (const commit of commits) {
    const commitOid = commit.oid;
    // eslint-disable-next-line no-await-in-loop
    const readBlobResult = await readBlob({
      fs,
      dir: gitDDB.workingDir,
      oid: commitOid,
      filepath: fullDocPath,
    }).catch(() => undefined);
    const oid = readBlobResult === undefined ? undefined : readBlobResult.oid;
    // Skip consecutive same SHAs
    if (prevOid !== oid) {
      prevOid = oid;

      if (
        historyOptions?.filter === undefined ||
        matchHistoryFilter(
          commit.commit.author,
          commit.commit.committer,
          historyOptions.filter
        )
      ) {
        if (readBlobResult === undefined) {
          docArray.push(undefined);
        }
        else if (docType === 'json') {
          const shortId = shortName.replace(new RegExp(jsonExt + '$'), '');

          // eslint-disable-next-line max-depth
          if (withMetaData) {
            docArray.push(blobToJsonDoc(shortId, readBlobResult, true, jsonExt) as FatDoc);
          }
          else {
            docArray.push(blobToJsonDoc(shortId, readBlobResult, false, jsonExt) as Doc);
          }
        }
        else if (docType === 'text') {
          // eslint-disable-next-line max-depth
          if (withMetaData) {
            docArray.push(blobToText(shortName, readBlobResult, true) as FatDoc);
          }
          else {
            docArray.push(blobToText(shortName, readBlobResult, false) as Doc);
          }
        }
        else if (docType === 'binary') {
          // eslint-disable-next-line max-depth
          if (withMetaData) {
            docArray.push(blobToBinary(shortName, readBlobResult, true) as FatDoc);
          }
          else {
            docArray.push(blobToBinary(shortName, readBlobResult, false) as Doc);
          }
        }
      }
    }
  }

  while (docArray.length > 0 && docArray[docArray.length - 1] === undefined) {
    docArray.pop();
  }

  return docArray;
}

/**
 * readOldBlob
 */
export async function readOldBlob (
  workingDir: string,
  fullDocPath: string,
  revision: number,
  historyOptions?: HistoryOptions
): Promise<ReadBlobResult | undefined> {
  let readBlobResult: ReadBlobResult | undefined;
  let prevSHA: string | undefined = '';
  let oidCounter = -1;

  if (revision < 0) {
    return undefined;
  }

  const commits = await log({
    fs,
    dir: workingDir,
    ref: 'main',
  });

  for (const commit of commits) {
    const commitOid = commit.oid;

    // Skip merge commit
    if (commit.commit.parent.length > 1) {
      continue;
    }

    // Filtering
    if (
      historyOptions?.filter !== undefined &&
      !matchHistoryFilter(
        commit.commit.author,
        commit.commit.committer,
        historyOptions.filter
      )
    ) {
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    readBlobResult = await readBlob({
      fs,
      dir: workingDir,
      oid: commitOid,
      filepath: fullDocPath,
    }).catch(() => undefined);

    const oid = readBlobResult === undefined ? undefined : readBlobResult.oid;
    // Skip consecutive same SHAs
    if (prevSHA !== oid) {
      prevSHA = oid;
      oidCounter++;
    }
    if (oidCounter >= revision) {
      break;
    }
  }
  if (oidCounter >= revision) {
    return readBlobResult;
  }
  return undefined;
}

/**
 * matchHistoryFilter
 */
function matchHistoryFilter (
  author: { name: string; email: string },
  committer: { name: string; email: string },
  historyFilter: HistoryFilter[]
) {
  for (const filter of historyFilter) {
    if (
      (!filter.author?.name || filter.author.name === author.name) &&
      (!filter.author?.email || filter.author.email === author.email) &&
      (!filter.committer?.name || filter.committer.name === committer.name) &&
      (!filter.committer?.email || filter.committer.email === committer.email)
    )
      return true;
  }
  return false;
}
