/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import fs from 'fs';
import yaml from 'js-yaml';
import { readBlob, ReadBlobResult, resolveRef } from '@sosuisen/isomorphic-git';
import { YAML_POSTFIX } from '../const';
import { utf8decode } from '../utils';
import { Err } from '../error';
import {
  FatBinaryDoc,
  FatDoc,
  FatJsonDoc,
  FatTextDoc,
  JsonDoc,
  SerializeFormat,
} from '../types';

/**
 * textToJsonDoc
 * @throws {@link Err.InvalidJsonObjectError}
 */
// eslint-disable-next-line complexity
export function textToJsonDoc (
  text: string,
  serializeFormat: SerializeFormat,
  extension: string,
  shortId?: string
): JsonDoc {
  let jsonDoc: JsonDoc;
  if (serializeFormat.format === 'front-matter') {
    if (extension === YAML_POSTFIX) {
      try {
        jsonDoc = yaml.load(text) as JsonDoc;
      } catch {
        throw new Err.InvalidJsonObjectError(shortId);
      }
      if (jsonDoc === undefined) {
        if (shortId !== undefined) {
          jsonDoc = {
            _id: shortId,
          };
        }
        else {
          jsonDoc = {};
        }
      }
    }
    else {
      const mdArray = text.split('\n');
      let yamlText = '';
      let markdownText = '';
      let startFrontMatter = false;
      let endFrontMatter = false;
      for (let i = 0; i < mdArray.length; i++) {
        if (mdArray[i] === '---') {
          // eslint-disable-next-line max-depth
          if (!startFrontMatter) {
            startFrontMatter = true;
            continue;
          }
          else if (!endFrontMatter) {
            endFrontMatter = true;
            continue;
          }
        }
        if (startFrontMatter && !endFrontMatter) {
          if (yamlText !== '') {
            yamlText += '\n';
          }
          yamlText += mdArray[i];
        }
        else if (endFrontMatter) {
          if (markdownText !== '') {
            markdownText += '\n';
          }
          markdownText += mdArray[i];
        }
      }

      if (!endFrontMatter) {
        markdownText = text;
        if (shortId !== undefined) {
          jsonDoc = {
            _id: shortId,
          };
        }
        else {
          jsonDoc = {};
        }
      }
      else {
        try {
          jsonDoc = yaml.load(yamlText) as JsonDoc;
        } catch {
          throw new Err.InvalidJsonObjectError(shortId);
        }
        if (jsonDoc === undefined) {
          if (shortId !== undefined) {
            jsonDoc = {
              _id: shortId,
            };
          }
          else {
            jsonDoc = {};
          }
        }
      }
      if (markdownText !== '') {
        jsonDoc._body = markdownText;
      }
    }
  }
  else {
    try {
      jsonDoc = (JSON.parse(text) as unknown) as JsonDoc;
    } catch {
      throw new Err.InvalidJsonObjectError(shortId);
    }
  }
  return jsonDoc;
}

/**
 * blobToJsonDoc
 *
 * @throws {@link Err.InvalidJsonObjectError}
 */
export function blobToJsonDoc (
  shortId: string,
  readBlobResult: ReadBlobResult,
  withMetadata: boolean,
  serializeFormat: SerializeFormat,
  extension: string
): FatJsonDoc | JsonDoc {
  const text = utf8decode(readBlobResult.blob);
  const jsonDoc = textToJsonDoc(text, serializeFormat, extension, shortId);
  if (jsonDoc._id !== undefined) {
    // Overwrite _id property by shortId (_id without collectionPath) if JsonDoc is created by GitDocumentedDB (_id !== undefined).
    jsonDoc._id = shortId;
  }
  if (withMetadata) {
    const fatJsonDoc: FatJsonDoc = {
      _id: shortId,
      name: shortId + serializeFormat.extension(jsonDoc),
      fileOid: readBlobResult.oid,
      type: 'json',
      doc: jsonDoc,
    };
    return fatJsonDoc;
  }
  return jsonDoc;
}

/**
 * blobToJsonDocWithoutOverwrittenId
 *
 * @throws {@link Err.InvalidJsonObjectError}
 */
// eslint-disable-next-line complexity
export function blobToJsonDocWithoutOverwrittenId (
  readBlobResult: ReadBlobResult,
  serializeFormat: SerializeFormat,
  extension: string
): JsonDoc {
  const text = utf8decode(readBlobResult.blob);
  const jsonDoc = textToJsonDoc(text, serializeFormat, extension);
  return jsonDoc;
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

/**
 * Check if two FatDocs are the same.
 */
export function isSameFatDoc (a: FatDoc, b: FatDoc) {
  if (a.type !== b.type) {
    return false;
  }
  if (a.type === 'json') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return a === b;
}
