/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import fs from 'fs';
import { readBlob, ReadBlobResult, resolveRef } from 'isomorphic-git';
import { InvalidJsonObjectError } from '../error';
import { FatBinaryDoc, FatJsonDoc, FatTextDoc, JsonDoc } from '../types';

/**
 * blobToJsonDoc
 *
 * @throws {@link InvalidJsonObjectError}
 */
export function blobToJsonDoc (
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
        fileOid: readBlobResult.oid,
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
export function blobToText (
  shortId: string,
  readBlobResult: ReadBlobResult,
  withMetadata: boolean
): FatTextDoc | string {
  const text = Buffer.from(readBlobResult.blob).toString('utf-8');
  if (withMetadata) {
    const fatTextDoc: FatTextDoc = {
      _id: shortId,
      fileOid: readBlobResult.oid,
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
export function blobToBinary (
  shortId: string,
  readBlobResult: ReadBlobResult,
  withMetadata: boolean
): FatBinaryDoc | Buffer {
  const buffer = Buffer.from(readBlobResult.blob);
  if (withMetadata) {
    const fatBinaryDoc: FatBinaryDoc = {
      _id: shortId,
      fileOid: readBlobResult.oid,
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
export async function readBlobByOid (workingDir: string, oid: string) {
  return await readBlob({
    fs,
    dir: workingDir,
    oid,
  }).catch(() => undefined);
}

/**
 * readLatestBlob
 */
export async function readLatestBlob (workingDir: string, fullDocPath: string) {
  const commitOid = await resolveRef({ fs, dir: workingDir, ref: 'main' });
  return await readBlob({
    fs,
    dir: workingDir,
    oid: commitOid,
    filepath: fullDocPath,
  }).catch(() => undefined);
}