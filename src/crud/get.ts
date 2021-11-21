/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of gitDDB source tree.
 */

import path from 'path';
import fs from 'fs-extra';
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
  JsonDoc,
  SerializeFormat,
} from '../types';
import {
  blobToBinary,
  blobToJsonDoc,
  blobToJsonDocWithoutOverwrittenId,
  blobToText,
  readBlobByOid,
  readLatestBlob,
  textToJsonDoc,
} from './blob';
import { readOldBlob } from './history';

/**
 * Read json file from working directory.
 * This is x10 faster than readBlob() from loose object,
 * x100 faster than readBlob() from packed object.
 *
 * @throws {@link Err.DatabaseClosingError}
 * @throws {@link Err.RepositoryNotOpenError}
 * @throws {@link Err.InvalidJsonObjectError}
 */
export async function getJsonDocFromWorkingDir (
  gitDDB: GitDDBInterface,
  shortName: string,
  collectionPath: string,
  serializeFormat: SerializeFormat
): Promise<JsonDoc | undefined> {
  if (gitDDB.isClosing) {
    throw new Err.DatabaseClosingError();
  }
  if (!gitDDB.isOpened) {
    return Promise.reject(new Err.RepositoryNotOpenError());
  }
  const fullDocPath = collectionPath + shortName;
  const shortId = serializeFormat.removeExtension(shortName);

  if (serializeFormat.format === 'json') {
    const jsonDoc = await fs.readJSON(gitDDB.workingDir + '/' + fullDocPath).catch(err => {
      if (err instanceof SyntaxError) {
        throw new Err.InvalidJsonObjectError(shortId);
      }
      else return undefined;
    });
    if (jsonDoc === undefined) return undefined;
    if (jsonDoc._id !== undefined) {
      // Overwrite _id property by shortId (_id without collectionPath) if JsonDoc is created by GitDocumentedDB (_id !== undefined).
      jsonDoc._id = shortId;
    }
    return jsonDoc;
  }

  const extMatch = fullDocPath.match(/.+(\..+?)$/)!;
  let extension = '';
  if (extMatch) {
    extension = extMatch[1];
  }
  const text = await fs
    .readFile(gitDDB.workingDir + '/' + fullDocPath, 'utf-8')
    .catch(() => {
      return undefined;
    });
  if (text === undefined) return undefined;
  const jsonDoc = textToJsonDoc(text, serializeFormat, extension, shortId);
  if (jsonDoc._id !== undefined) {
    // Overwrite _id property by shortId (_id without collectionPath) if JsonDoc is created by GitDocumentedDB (_id !== undefined).
    jsonDoc._id = shortId;
  }
  return jsonDoc;
}

/**
 * Read text file from working directory.
 * This is x10 faster than readBlob() from loose object,
 * x100 faster than readBlob() from packed object.
 *
 * @throws {@link Err.DatabaseClosingError}
 * @throws {@link Err.RepositoryNotOpenError}
 * @throws {@link Err.InvalidJsonObjectError}
 */
export async function getTextDocFromWorkingDir (
  gitDDB: GitDDBInterface,
  shortName: string,
  collectionPath: string,
  serializeFormat: SerializeFormat
): Promise<string | undefined> {
  if (gitDDB.isClosing) {
    throw new Err.DatabaseClosingError();
  }
  if (!gitDDB.isOpened) {
    return Promise.reject(new Err.RepositoryNotOpenError());
  }
  const fullDocPath = collectionPath + shortName;
  const textDoc = await fs
    .readFile(gitDDB.workingDir + '/' + fullDocPath, 'utf-8')
    .catch(() => {
      return undefined;
    });
  if (textDoc === undefined) return undefined;
  return textDoc;
}

/**
 * Read binary file from working directory.
 * This is x10 faster than readBlob() from loose object,
 * x100 faster than readBlob() from packed object.
 *
 * @throws {@link Err.DatabaseClosingError}
 * @throws {@link Err.RepositoryNotOpenError}
 * @throws {@link Err.InvalidJsonObjectError}
 */
export async function getBinaryDocFromWorkingDir (
  gitDDB: GitDDBInterface,
  shortName: string,
  collectionPath: string,
  serializeFormat: SerializeFormat
): Promise<Uint8Array | undefined> {
  if (gitDDB.isClosing) {
    throw new Err.DatabaseClosingError();
  }
  if (!gitDDB.isOpened) {
    return Promise.reject(new Err.RepositoryNotOpenError());
  }
  const fullDocPath = collectionPath + shortName;
  const binaryDoc = await fs.readFile(gitDDB.workingDir + '/' + fullDocPath).catch(() => {
    return undefined;
  });
  if (binaryDoc === undefined) return undefined;
  return binaryDoc;
}

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
  serializeFormat: SerializeFormat,
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
    options.forceDocType ??
    (serializeFormat.hasObjectExtension(fullDocPath) ? 'json' : 'text');
  if (docType === 'text') {
    // TODO: select binary or text by .gitattribtues
  }

  if (docType === 'json') {
    const extMatch = fullDocPath.match(/.+(\..+?)$/)!;
    let extension = '';
    if (extMatch) {
      extension = extMatch[1];
    }
    if (internalOptions.oid !== '') {
      return blobToJsonDocWithoutOverwrittenId(readBlobResult, serializeFormat, extension);
    }
    const shortId = serializeFormat.removeExtension(shortName);
    return blobToJsonDoc(
      shortId,
      readBlobResult,
      internalOptions.withMetadata,
      serializeFormat,
      extension
    );
  }
  else if (docType === 'text') {
    return blobToText(shortName, readBlobResult, internalOptions.withMetadata);
  }
  else if (docType === 'binary') {
    return blobToBinary(shortName, readBlobResult, internalOptions.withMetadata);
  }
}
