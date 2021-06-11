/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import { log, readBlob, ReadBlobResult, resolveRef } from 'isomorphic-git';
import fs from 'fs-extra';
import { IDocumentDB } from '../types_gitddb';
import {
  DatabaseClosingError,
  InvalidJsonObjectError,
  RepositoryNotOpenError,
} from '../error';
import {
  Doc,
  FatBinaryDoc,
  FatDoc,
  FatJsonDoc,
  FatTextDoc,
  GetInternalOptions,
  JsonDoc,
} from '../types';
import { Collection } from '../collection';

/**
 * getImpl
 *
 * Common implementation of get-like commands
 *
 * @throws {@link InvalidJsonObjectError}
 */
// eslint-disable-next-line complexity
export async function getImpl (
  this: IDocumentDB,
  shortId: string,
  collection: Collection,
  internalOptions?: GetInternalOptions
): Promise<Doc | FatDoc | undefined> {
  if (this.isClosing) {
    throw new DatabaseClosingError();
  }
  const currentRepository = this.repository();
  if (currentRepository === undefined) {
    throw new RepositoryNotOpenError();
  }

  internalOptions ??= {
    withMetadata: undefined,
    backNumber: undefined,
    oid: undefined,
  };
  internalOptions.withMetadata ??= false;
  internalOptions.backNumber ??= 0;
  internalOptions.oid ??= '';

  let fullDocPath = collection.collectionPath() + shortId;
  if (collection.collectionType() === 'json') {
    fullDocPath += '.json';
  }

  // May throw error
  this.validator.validateId(fullDocPath);

  let readBlobResult: ReadBlobResult | undefined;
  if (internalOptions.oid !== '') {
    readBlobResult = await readBlobByOid(this.workingDir(), internalOptions.oid);
  }
  else if (!internalOptions.backNumber || internalOptions.backNumber === 0) {
    readBlobResult = await readLatestBlob(this.workingDir(), fullDocPath);
  }
  else if (internalOptions.backNumber > 0) {
    readBlobResult = await readOldBlob(
      this.workingDir(),
      fullDocPath,
      internalOptions.backNumber
    );
  }
  else {
    return undefined;
  }

  if (readBlobResult === undefined) return undefined;

  if (collection.collectionType() === 'json' || fullDocPath.endsWith('.json')) {
    return blobToJsonDoc(shortId, readBlobResult, internalOptions.withMetadata);
  }
  else if (collection.collectionType() === 'file') {
    // TODO: select binary or text by .gitattribtues
    // Return text
    return blobToText(shortId, readBlobResult, internalOptions.withMetadata);
    // Return binary
    // blobToBinary(shortId, readBlobResult, internalOptions.withMetadata);
  }
}

/**
 * blobToJsonDoc
 *
 * @throws {@link InvalidJsonObjectError}
 */
function blobToJsonDoc (
  shortId: string,
  readBlobResult: ReadBlobResult,
  withMetadata: boolean
): FatJsonDoc | JsonDoc {
  try {
    const text = Buffer.from(readBlobResult.blob).toString('utf-8');
    const jsonDoc = (JSON.parse(text) as unknown) as JsonDoc;
    jsonDoc._id = shortId;
    if (withMetadata) {
      const fatJsonDoc: FatJsonDoc = {
        _id: shortId,
        fileSha: readBlobResult.oid,
        type: 'json',
        doc: jsonDoc,
      };
      return fatJsonDoc;
    }
    return jsonDoc;
  } catch (e) {
    throw new InvalidJsonObjectError(shortId);
  }
}

/**
 * blobToText
 */
function blobToText (
  shortId: string,
  readBlobResult: ReadBlobResult,
  withMetadata: boolean
): FatTextDoc | string {
  const text = Buffer.from(readBlobResult.blob).toString('utf-8');
  if (withMetadata) {
    const fatTextDoc: FatTextDoc = {
      _id: shortId,
      fileSha: readBlobResult.oid,
      type: 'text',
      doc: text,
    };
    return fatTextDoc;
  }
  return text;
}

/**
 * blobToBinary
 */
function blobToBinary (
  shortId: string,
  readBlobResult: ReadBlobResult,
  withMetadata: boolean
): FatBinaryDoc | Buffer {
  const buffer = Buffer.from(readBlobResult.blob);
  if (withMetadata) {
    const fatBinaryDoc: FatBinaryDoc = {
      _id: shortId,
      fileSha: readBlobResult.oid,
      type: 'binary',
      doc: buffer,
    };
    return fatBinaryDoc;
  }
  return buffer;
}

/**
 * readBlobByOid
 */
async function readBlobByOid (workingDir: string, oid: string) {
  return await readBlob({
    fs,
    dir: workingDir,
    oid,
  }).catch(() => undefined);
}

/**
 * readLatestBlob
 */
async function readLatestBlob (workingDir: string, fullDocPath: string) {
  const commitOid = await resolveRef({ fs, dir: workingDir, ref: 'main' });
  return await readBlob({
    fs,
    dir: workingDir,
    oid: commitOid,
    filepath: fullDocPath,
  }).catch(() => undefined);
}

/**
 * readOldBlob
 */
async function readOldBlob (workingDir: string, fullDocPath: string, backNumber: number) {
  let readBlobResult: ReadBlobResult | undefined;
  let prevSHA: string | undefined = '';
  let shaCounter = 0;

  const commits = await log({
    fs,
    dir: workingDir,
    ref: 'main',
  });

  for (let i = 0; i < commits.length; i++) {
    const commitOid = commits[i].oid;

    // eslint-disable-next-line no-await-in-loop
    readBlobResult = await readBlob({
      fs,
      dir: workingDir,
      oid: commitOid,
      filepath: fullDocPath,
    }).catch(() => undefined);

    if (shaCounter >= backNumber) {
      // console.log(entry.sha());
      break;
    }
    const sha = readBlobResult === undefined ? undefined : readBlobResult.oid;
    // Skip consecutive same SHAs
    if (prevSHA !== sha) {
      prevSHA = sha;
      shaCounter++;
    }
  }
  return readBlobResult;
}
