/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import fs from 'fs';
import { readBlob, ReadBlobResult, resolveRef } from 'isomorphic-git';
import { JSON_EXT } from '../const';
import { utf8decode } from '../utils';
import { Err } from '../error';
import { FatBinaryDoc, FatJsonDoc, FatTextDoc, JsonDoc } from '../types';

/**
 * blobToJsonDoc
 *
 * @throws {@link Err.InvalidJsonObjectError}
 */
export function blobToJsonDoc (
  shortId: string,
  readBlobResult: ReadBlobResult,
  withMetadata: boolean
): FatJsonDoc | JsonDoc {
  try {
    const text = utf8decode(readBlobResult.blob);
    const jsonDoc = (JSON.parse(text) as unknown) as JsonDoc;
    if (jsonDoc._id !== undefined) {
      // Overwrite _id property by shortId (_id without collectionPath) if JsonDoc is created by GitDocumentedDB (_id !== undefined).
      jsonDoc._id = shortId;
    }
    if (withMetadata) {
      const fatJsonDoc: FatJsonDoc = {
        _id: shortId,
        name: shortId + JSON_EXT,
        fileOid: readBlobResult.oid,
        type: 'json',
        doc: jsonDoc,
      };
      return fatJsonDoc;
    }
    return jsonDoc;
  } catch {
    throw new Err.InvalidJsonObjectError(shortId);
  }
}

/**
 * blobToJsonDocWithoutOverwrittenId
 *
 * @throws {@link Err.InvalidJsonObjectError}
 */
export function blobToJsonDocWithoutOverwrittenId (
  readBlobResult: ReadBlobResult
): JsonDoc {
  try {
    const text = utf8decode(readBlobResult.blob);
    const jsonDoc = (JSON.parse(text) as unknown) as JsonDoc;
    return jsonDoc;
  } catch (e) {
    throw new Err.InvalidJsonObjectError('');
  }
}

/**
 * blobToText
 */
export function blobToText (
  shortName: string,
  readBlobResult: ReadBlobResult,
  withMetadata: boolean
): FatTextDoc | string {
  const text = utf8decode(readBlobResult.blob);
  if (withMetadata) {
    const fatTextDoc: FatTextDoc = {
      name: shortName,
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
  shortName: string,
  readBlobResult: ReadBlobResult,
  withMetadata: boolean
): FatBinaryDoc | Uint8Array {
  if (withMetadata) {
    const fatBinaryDoc: FatBinaryDoc = {
      name: shortName,
      fileOid: readBlobResult.oid,
      type: 'binary',
      doc: readBlobResult.blob,
    };
    return fatBinaryDoc;
  }
  return readBlobResult.blob;
}

/**
 * readBlobByOid
 */
export async function readBlobByOid (
  workingDir: string,
  oid: string
): Promise<ReadBlobResult | undefined> {
  return await readBlob({
    fs,
    dir: workingDir,
    oid,
  }).catch(() => undefined);
}

/**
 * readLatestBlob
 */
export async function readLatestBlob (
  workingDir: string,
  fullDocPath: string
): Promise<ReadBlobResult | undefined> {
  const commitOid = await resolveRef({ fs, dir: workingDir, ref: 'HEAD' }).catch(
    () => undefined
  );
  if (commitOid === undefined) return undefined;
  return await readBlob({
    fs,
    dir: workingDir,
    oid: commitOid,
    filepath: fullDocPath,
  }).catch(() => undefined);
}
