/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of gitDDB source tree.
 */

import { log, readBlob, ReadBlobResult } from 'isomorphic-git';
import fs from 'fs-extra';
import {
  DocType,
  FatDoc,
  GetOptions,
  HistoryFilter,
  HistoryOptions,
  ReadMethod,
} from '../types';
import { IDocumentDB } from '../types_gitddb';
import { DatabaseClosingError, RepositoryNotOpenError } from '../error';
import { JSON_EXT } from '../const';
import { blobToBinary, blobToJsonDoc, blobToText } from './blob';

/**
 * Implementation of getHistory
 *
 * @throws {@link DatabaseClosingError}
 * @throws {@link RepositoryNotOpenError}
 * @throws {@link InvalidJsonObjectError}
 */
// eslint-disable-next-line complexity
export async function getHistoryImpl (
  gitDDB: IDocumentDB,
  shortId: string,
  collectionPath: string,
  readMethod: ReadMethod,
  historyOptions?: HistoryOptions,
  options?: GetOptions
): Promise<(FatDoc | undefined)[]> {
  if (gitDDB.isClosing) {
    throw new DatabaseClosingError();
  }
  const currentRepository = gitDDB.repository();
  if (currentRepository === undefined) {
    throw new RepositoryNotOpenError();
  }

  options ??= {
    forceDocType: undefined,
  };

  let fullDocPath = collectionPath + shortId;
  if (options.forceDocType === 'json' || readMethod === 'json') {
    if (!fullDocPath.endsWith(JSON_EXT)) {
      fullDocPath += JSON_EXT;
    }
  }
  const docType: DocType =
    options.forceDocType ??
    (readMethod === 'json' || fullDocPath.endsWith('.json') ? 'json' : 'text');
  if (docType === 'text') {
    // TODO: select binary or text by .gitattribtues
  }

  const docArray: (FatDoc | undefined)[] = [];

  const commits = await log({
    fs,
    dir: gitDDB.workingDir(),
    ref: 'main',
  });

  let prevOid: string | undefined = '';

  for (const commit of commits) {
    const commitOid = commit.oid;
    // eslint-disable-next-line no-await-in-loop
    const readBlobResult = await readBlob({
      fs,
      dir: gitDDB.workingDir(),
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
          docArray.push(blobToJsonDoc(shortId, readBlobResult, true) as FatDoc);
        }
        else if (docType === 'text') {
          docArray.push(blobToText(shortId, readBlobResult, true) as FatDoc);
        }
        else if (docType === 'binary') {
          docArray.push(blobToBinary(shortId, readBlobResult, true) as FatDoc);
        }
      }
    }
  }

  if (docArray.length === 1 && docArray[0] === undefined) {
    docArray.splice(0);
  }

  return docArray;
}

/**
 * readOldBlob
 */
export async function readOldBlob (
  workingDir: string,
  fullDocPath: string,
  backNumber: number,
  historyOptions?: HistoryOptions
) {
  let readBlobResult: ReadBlobResult | undefined;
  let prevSHA: string | undefined = '';
  let oidCounter = -1;

  const commits = await log({
    fs,
    dir: workingDir,
    ref: 'main',
  });

  for (const commit of commits) {
    const commitOid = commit.oid;

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

      if (
        historyOptions?.filter === undefined ||
        matchHistoryFilter(
          commit.commit.author,
          commit.commit.committer,
          historyOptions.filter
        )
      ) {
        oidCounter++;
      }
    }
    if (oidCounter >= backNumber) {
      break;
    }
  }
  return readBlobResult;
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
      (filter.author?.name && filter.author.name !== author.name) ||
      (filter.author?.email && filter.author.email !== author.email) ||
      (filter.committer?.name && filter.committer.name !== committer.name) ||
      (filter.committer?.email && filter.committer.name !== committer.email)
    )
      return false;
  }
  return true;
}
