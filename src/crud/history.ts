/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import git, { ReadBlobResult } from 'isomorphic-git';
import fs from 'fs-extra';
import { DocWithMetadata, JsonDoc } from '../types';
import { IDocumentDB } from '../types_gitddb';
import {
  DatabaseClosingError,
  InvalidJsonObjectError,
  RepositoryNotOpenError,
} from '../error';
import { JSON_EXT } from '../const';

export async function getDocHistoryImpl (
  this: IDocumentDB,
  fileName: string
): Promise<(DocWithMetadata | undefined)[]> {
  if (this.isClosing) {
    throw new DatabaseClosingError();
  }
  const currentRepository = this.repository();
  if (currentRepository === undefined) {
    throw new RepositoryNotOpenError();
  }

  const docArray: (DocWithMetadata | undefined)[] = [];

  const commits = await git.log({
    fs,
    dir: this.workingDir(),
    ref: 'main',
  });

  let prevSha: string | undefined = '';

  for (let i = 0; i < commits.length; i++) {
    const commitOid = commits[i].oid;
    // eslint-disable-next-line no-await-in-loop
    const readBlobResult = await git
      .readBlob({
        fs,
        dir: this.workingDir(),
        oid: commitOid,
        filepath: fileName,
      })
      .catch(() => undefined);
    const sha = readBlobResult === undefined ? undefined : readBlobResult.oid;
    // Skip consecutive same SHAs
    if (prevSha !== sha) {
      prevSha = sha;

      if (readBlobResult === undefined) {
        docArray.push(undefined);
      }
      else {
        const blob = Buffer.from(readBlobResult.blob).toString('utf-8');
        const docId = fileName.replace(new RegExp(JSON_EXT + '$'), '');
        try {
          const doc = (JSON.parse(blob) as unknown) as JsonDoc;
          doc._id = docId;
          docArray.push({
            _id: docId,
            fileSha: readBlobResult.oid,
            doc,
          });
        } catch (e) {
          throw new InvalidJsonObjectError(docId);
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
 * getBackNumber
 *
 * @param fileName e.g.) foo.json
 * @param backNumber 0 or greater
 * @returns DocWithMetadata type or undefined. Undefined shows the document is deleted or does not exist.
 */
// eslint-disable-next-line complexity
export async function getBackNumber (
  gitDDB: IDocumentDB,
  fileName: string,
  backNumber: number
): Promise<DocWithMetadata | undefined> {
  const currentRepository = gitDDB.repository();
  if (currentRepository === undefined) {
    throw new RepositoryNotOpenError();
  }

  let prevSHA: string | undefined = '';
  let shaCounter = 0;

  const commits = await git.log({
    fs,
    dir: gitDDB.workingDir(),
    ref: 'main',
  });

  let readBlobResult: ReadBlobResult | undefined;

  for (let i = 0; i < commits.length; i++) {
    const commitOid = commits[i].oid;

    // eslint-disable-next-line no-await-in-loop
    readBlobResult = await git
      .readBlob({
        fs,
        dir: gitDDB.workingDir(),
        oid: commitOid,
        filepath: fileName,
      })
      .catch(() => undefined);

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

  if (readBlobResult === undefined) return undefined;

  const docId = fileName.replace(new RegExp(JSON_EXT + '$'), '');
  const blob = Buffer.from(readBlobResult.blob).toString('utf-8');
  try {
    const doc = (JSON.parse(blob) as unknown) as JsonDoc;
    doc._id = docId;
    return {
      _id: docId,
      fileSha: readBlobResult.oid,
      doc,
    };
  } catch (e) {
    throw new InvalidJsonObjectError(docId);
  }
}
