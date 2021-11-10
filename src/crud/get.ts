/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of gitDDB source tree.
 */

import { ReadBlobResult } from '@sosuisen/isomorphic-git';
import { GitDDBInterface } from '../types_gitddb';
import { Err } from '../error';
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
 * @throws {@link Err.DatabaseClosingError}
 * @throws {@link Err.RepositoryNotOpenError}
 * @throws {@link Err.InvalidJsonObjectError}
 */
// eslint-disable-next-line complexity
export async function getImpl (
  gitDDB: GitDDBInterface,
  shortName: string,
  collectionPath: string,
  jsonExt: string,
  options?: GetOptions,
  internalOptions?: GetInternalOptions,
  historyOptions?: HistoryOptions
): Promise<Doc | FatDoc | undefined> {
  if (gitDDB.isClosing) {
    throw new Err.DatabaseClosingError();
  }
  if (!gitDDB.isOpened) {
    return Promise.reject(new Err.RepositoryNotOpenError());
  }

  options ??= {
    forceDocType: undefined,
  };

  internalOptions ??= {
    withMetadata: undefined,
    revision: undefined,
    oid: undefined,
  };
  internalOptions.withMetadata ??= false;
  internalOptions.revision ??= 0;
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
    (!internalOptions.revision || internalOptions.revision === 0)
  ) {
    readBlobResult = await readLatestBlob(gitDDB.workingDir, fullDocPath);
  }
  else if (internalOptions.revision >= 0) {
    readBlobResult = await readOldBlob(
      gitDDB.workingDir,
      fullDocPath,
      internalOptions.revision,
      historyOptions
    );
  }
  else {
    return undefined;
  }

  if (readBlobResult === undefined) return undefined;

  const docType: DocType =
    options.forceDocType ?? (fullDocPath.endsWith(jsonExt) ? 'json' : 'text');
  if (docType === 'text') {
    // TODO: select binary or text by .gitattribtues
  }

  if (docType === 'json') {
    if (internalOptions.oid !== '') {
      return blobToJsonDocWithoutOverwrittenId(readBlobResult, jsonExt);
    }
    const shortId = shortName.replace(new RegExp(jsonExt + '$'), '');
    return blobToJsonDoc(shortId, readBlobResult, internalOptions.withMetadata, jsonExt);
  }
  else if (docType === 'text') {
    return blobToText(shortName, readBlobResult, internalOptions.withMetadata);
  }
  else if (docType === 'binary') {
    return blobToBinary(shortName, readBlobResult, internalOptions.withMetadata);
  }
}
