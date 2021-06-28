/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of gitDDB source tree.
 */

import { ReadBlobResult } from 'isomorphic-git';
import { JSON_EXT } from '../const';
import { GitDDBInterface } from '../types_gitddb';
import { DatabaseClosingError, RepositoryNotOpenError } from '../error';
import {
  Doc,
  DocType,
  FatDoc,
  GetInternalOptions,
  GetOptions,
  HistoryOptions,
} from '../types';
import {
  blobToBinary,
  blobToJsonDoc,
  blobToJsonDocWithoutOverwrittenId,
  blobToText,
  readBlobByOid,
  readLatestBlob,
} from './blob';
import { readOldBlob } from './history';

/**
 * Common implementation of get-like commands
 *
 * @throws {@link DatabaseClosingError}
 * @throws {@link RepositoryNotOpenError}
 * @throws {@link InvalidJsonObjectError}
 */
// eslint-disable-next-line complexity
export async function getImpl (
  gitDDB: GitDDBInterface,
  shortName: string,
  collectionPath: string,
  options?: GetOptions,
  internalOptions?: GetInternalOptions,
  historyOptions?: HistoryOptions
): Promise<Doc | FatDoc | undefined> {
  if (gitDDB.isClosing) {
    throw new DatabaseClosingError();
  }

  if (!gitDDB.isOpened()) {
    throw new RepositoryNotOpenError();
  }

  options ??= {
    forceDocType: undefined,
  };

  internalOptions ??= {
    withMetadata: undefined,
    backNumber: undefined,
    oid: undefined,
  };
  internalOptions.withMetadata ??= false;
  internalOptions.backNumber ??= 0;
  internalOptions.oid ??= '';

  const fullDocPath = collectionPath + shortName;

  // Do not use validateId for get()
  // Just return undefined if not exists.
  // gitDDB.validator.validateId(fullDocPath);

  let readBlobResult: ReadBlobResult | undefined;
  if (internalOptions.oid !== '') {
    readBlobResult = await readBlobByOid(gitDDB.workingDir, internalOptions.oid);
    // Do not return FatDoc because _id is not specified.
    // eslint-disable-next-line require-atomic-updates
    internalOptions.withMetadata = false;
  }
  else if (
    historyOptions === undefined &&
    (!internalOptions.backNumber || internalOptions.backNumber === 0)
  ) {
    readBlobResult = await readLatestBlob(gitDDB.workingDir, fullDocPath);
  }
  else if (internalOptions.backNumber >= 0) {
    readBlobResult = await readOldBlob(
      gitDDB.workingDir,
      fullDocPath,
      internalOptions.backNumber,
      historyOptions
    );
  }
  else {
    return undefined;
  }

  if (readBlobResult === undefined) return undefined;

  const docType: DocType =
    options.forceDocType ?? (fullDocPath.endsWith('.json') ? 'json' : 'text');
  if (docType === 'text') {
    // TODO: select binary or text by .gitattribtues
  }

  if (docType === 'json') {
    if (internalOptions.oid !== '') {
      return blobToJsonDocWithoutOverwrittenId(readBlobResult);
    }
    const shortId = shortName.replace(new RegExp(JSON_EXT + '$'), '');
    return blobToJsonDoc(shortId, readBlobResult, internalOptions.withMetadata);
  }
  else if (docType === 'text') {
    return blobToText(shortName, readBlobResult, internalOptions.withMetadata);
  }
  else if (docType === 'binary') {
    return blobToBinary(shortName, readBlobResult, internalOptions.withMetadata);
  }
}
