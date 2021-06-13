/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of gitDDB source tree.
 */

import { ReadBlobResult } from 'isomorphic-git';
import { JSON_EXT } from '../const';
import { IDocumentDB } from '../types_gitddb';
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
  gitDDB: IDocumentDB,
  shortId: string,
  collectionPath: string,
  isJsonCollection: boolean,
  options?: GetOptions,
  internalOptions?: GetInternalOptions,
  historyOptions?: HistoryOptions
): Promise<Doc | FatDoc | undefined> {
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

  internalOptions ??= {
    withMetadata: undefined,
    backNumber: undefined,
    oid: undefined,
  };
  internalOptions.withMetadata ??= false;
  internalOptions.backNumber ??= 0;
  internalOptions.oid ??= '';

  let fullDocPath = collectionPath + shortId;
  if (options.forceDocType === 'json' || isJsonCollection) {
    if (!fullDocPath.endsWith(JSON_EXT)) {
      fullDocPath += JSON_EXT;
    }
  }

  gitDDB.validator.validateId(fullDocPath);

  let readBlobResult: ReadBlobResult | undefined;
  if (internalOptions.oid !== '') {
    readBlobResult = await readBlobByOid(gitDDB.workingDir(), internalOptions.oid);
  }
  else if (!internalOptions.backNumber || internalOptions.backNumber === 0) {
    readBlobResult = await readLatestBlob(gitDDB.workingDir(), fullDocPath);
  }
  else if (internalOptions.backNumber > 0) {
    readBlobResult = await readOldBlob(
      gitDDB.workingDir(),
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
    options.forceDocType ??
    (isJsonCollection || fullDocPath.endsWith('.json') ? 'json' : 'text');
  if (docType === 'text') {
    // TODO: select binary or text by .gitattribtues
  }

  if (docType === 'json') {
    return blobToJsonDoc(shortId, readBlobResult, internalOptions.withMetadata);
  }
  else if (docType === 'text') {
    return blobToText(shortId, readBlobResult, internalOptions.withMetadata);
  }
  else if (docType === 'binary') {
    return blobToBinary(shortId, readBlobResult, internalOptions.withMetadata);
  }
}
