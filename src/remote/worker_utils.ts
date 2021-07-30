/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of gitDDB source tree.
 */

import nodePath from 'path';
import git, { ReadBlobResult, ReadCommitResult } from 'isomorphic-git';
import fs from 'fs-extra';
import { normalizeCommit, toSortedJSONString, utf8decode } from '../utils';
import { JSON_EXT } from '../const';
import { Err } from '../error';
import {
  ChangedFile,
  DocType,
  FatBinaryDoc,
  FatDoc,
  FatJsonDoc,
  FatTextDoc,
  JsonDoc,
  NormalizedCommit,
} from '../types';
import { blobToBinary, blobToJsonDoc, blobToText } from '../crud/blob';

/**
 * Write blob to file system
 *
 * @throws {@link Err.CannotCreateDirectoryError}
 */
export async function writeBlobToFile (
  workingDir: string,
  name: string,
  data: string | Uint8Array
) {
  const filePath = nodePath.resolve(workingDir, name);
  const dir = nodePath.dirname(filePath);
  await fs.ensureDir(dir).catch((err: Error) => {
    return Promise.reject(new Err.CannotCreateDirectoryError(err.message));
  });
  await fs.writeFile(filePath, data);
}

/**
 * getFatDocFromData
 *
 * @throws {@link Err.InvalidJsonObjectError}
 */
export async function getFatDocFromData (
  data: string | Uint8Array,
  fullDocPath: string,
  docType: DocType
) {
  let fatDoc: FatDoc;
  const { oid } = await git.hashBlob({ object: data });
  if (docType === 'json') {
    const _id = fullDocPath.replace(new RegExp(JSON_EXT + '$'), '');
    if (typeof data !== 'string') {
      data = utf8decode(data);
    }
    try {
      const jsonDoc = (JSON.parse(data) as unknown) as JsonDoc;
      if (jsonDoc._id !== undefined) {
        // Overwrite _id property by _id if JsonDoc is created by GitDocumentedDB (_id !== undefined).
        jsonDoc._id = _id;
      }
      fatDoc = {
        _id,
        name: fullDocPath,
        fileOid: oid,
        type: 'json',
        doc: jsonDoc,
      };
    } catch {
      throw new Err.InvalidJsonObjectError(_id);
    }
  }
  else if (docType === 'text') {
    if (typeof data !== 'string') {
      data = utf8decode(data);
    }
    fatDoc = {
      name: fullDocPath,
      fileOid: oid,
      type: 'text',
      doc: data as string,
    };
  }
  else if (docType === 'binary') {
    fatDoc = {
      name: fullDocPath,
      fileOid: oid,
      type: 'binary',
      doc: data as Uint8Array,
    };
  }
  return fatDoc!;
}

/**
 * getFatDocFromOid
 *
 * @throws {@link Err.InvalidJsonObjectError} (from getFatDocFromReadBlobResult)
 */
export async function getFatDocFromOid (
  workingDir: string,
  fullDocPath: string,
  fileOid: string,
  docType: DocType
) {
  const readBlobResult = await git.readBlob({
    fs,
    dir: workingDir,
    oid: fileOid,
  });
  return getFatDocFromReadBlobResult(fullDocPath, readBlobResult, docType);
}

/**
 * getFatDocFromReadBlobResult
 *
 * @throws {@link Err.InvalidJsonObjectError}
 */
export function getFatDocFromReadBlobResult (
  fullDocPath: string,
  readBlobResult: ReadBlobResult,
  docType: DocType
) {
  let fatDoc: FatDoc;
  if (docType === 'json') {
    const _id = fullDocPath.replace(new RegExp(JSON_EXT + '$'), '');
    fatDoc = blobToJsonDoc(_id, readBlobResult, true) as FatJsonDoc;
  }
  else if (docType === 'text') {
    fatDoc = blobToText(fullDocPath, readBlobResult, true) as FatTextDoc;
  }
  else if (docType === 'binary') {
    fatDoc = blobToBinary(fullDocPath, readBlobResult, true) as FatBinaryDoc;
  }
  return fatDoc!;
}

/**
 * Get changed files
 *
 * @throws {@link Err.InvalidJsonObjectError} (from getFatDocFromOid)
 *
 * @internal
 */
export async function getChanges (
  workingDir: string,
  oldCommitOid: string | undefined,
  newCommitOid: string
) {
  return await git.walk({
    fs,
    dir: workingDir,
    trees: [git.TREE({ ref: oldCommitOid }), git.TREE({ ref: newCommitOid })],
    // @ts-ignore
    // eslint-disable-next-line complexity
    map: async function (fullDocPath, [a, b]) {
      // ignore directories
      if (fullDocPath === '.') {
        return;
      }
      if (oldCommitOid === undefined) {
        // Must set null explicitly.
        a = null;
      }

      const docType: DocType = fullDocPath.endsWith('.json') ? 'json' : 'text';
      if (docType === 'text') {
        // TODO: select binary or text by .gitattribtues
      }

      const aType = a === null ? undefined : await a.type();
      const bType = b === null ? undefined : await b.type();

      if (aType === 'tree' || bType === 'tree') {
        return;
      }
      // generate ids
      const aOid = a === null ? undefined : await a.oid();
      const bOid = b === null ? undefined : await b.oid();

      let change: ChangedFile;
      if (bOid === undefined && aOid !== undefined) {
        change = {
          operation: 'delete',
          old: await getFatDocFromOid(workingDir, fullDocPath, aOid, docType),
        };
      }
      else if (aOid === undefined && bOid !== undefined) {
        change = {
          operation: 'insert',
          new: await getFatDocFromOid(workingDir, fullDocPath, bOid, docType),
        };
      }
      else if (aOid !== undefined && bOid !== undefined && aOid !== bOid) {
        change = {
          operation: 'update',
          old: await getFatDocFromOid(workingDir, fullDocPath, aOid, docType),
          new: await getFatDocFromOid(workingDir, fullDocPath, bOid, docType),
        };
      }
      else {
        return;
      }
      return change;
    },
  });
}

/**
 * Get and write changed files on local
 *
 * @throws {@link Err.InvalidJsonObjectError} (from getFatDocFromOid)
 * @throws {@link Err.CannotCreateDirectoryError} (from writeBlobToFile)
 *
 * @internal
 */
export async function getAndWriteLocalChanges (
  workingDir: string,
  oldCommitOid: string,
  newCommitOid: string
) {
  return await git.walk({
    fs,
    dir: workingDir,
    trees: [git.TREE({ ref: oldCommitOid }), git.TREE({ ref: newCommitOid })],
    // @ts-ignore
    // eslint-disable-next-line complexity
    map: async function (fullDocPath, [a, b]) {
      // ignore directories
      if (fullDocPath === '.') {
        return;
      }

      const docType: DocType = fullDocPath.endsWith('.json') ? 'json' : 'text';
      if (docType === 'text') {
        // TODO: select binary or text by .gitattribtues
      }

      const aType = a === null ? undefined : await a.type();
      const bType = b === null ? undefined : await b.type();

      if (aType === 'tree' || bType === 'tree') {
        return;
      }
      // generate ids
      const aOid = a === null ? undefined : await a.oid();
      const bOid = b === null ? undefined : await b.oid();

      let change: ChangedFile;
      if (bOid === undefined && aOid !== undefined) {
        change = {
          operation: 'delete',
          old: await getFatDocFromOid(workingDir, fullDocPath, aOid, docType),
        };
        await git.remove({ fs, dir: workingDir, filepath: fullDocPath });
        const path = nodePath.resolve(workingDir, fullDocPath);
        await fs.remove(path).catch(() => {
          throw new Err.CannotDeleteDataError();
        });
      }
      else if (aOid === undefined && bOid !== undefined) {
        change = {
          operation: 'insert',
          new: await getFatDocFromOid(workingDir, fullDocPath, bOid, docType),
        };
        if (change.new.type === 'json') {
          await writeBlobToFile(
            workingDir,
            fullDocPath,
            toSortedJSONString(change.new.doc)
          );
        }
        else if (change.new.type === 'text' || change.new.type === 'binary') {
          await writeBlobToFile(workingDir, fullDocPath, change.new.doc);
        }
        await git.add({ fs, dir: workingDir, filepath: fullDocPath });
      }
      else if (aOid !== undefined && bOid !== undefined && aOid !== bOid) {
        change = {
          operation: 'update',
          old: await getFatDocFromOid(workingDir, fullDocPath, aOid, docType),
          new: await getFatDocFromOid(workingDir, fullDocPath, bOid, docType),
        };
        if (change.new.type === 'json') {
          await writeBlobToFile(
            workingDir,
            fullDocPath,
            toSortedJSONString(change.new.doc)
          );
        }
        else if (change.new.type === 'text' || change.new.type === 'binary') {
          await writeBlobToFile(workingDir, fullDocPath, change.new.doc);
        }
        await git.add({ fs, dir: workingDir, filepath: fullDocPath });
      }
      else {
        return;
      }
      return change;
    },
  });
}

/**
 * Get commit logs by walking backward
 *
 * @remarks
 *
 * - Logs are sorted by topology. Ancestors are placed before descendants. Topic branches are placed before the main branch.
 *
 * - Walking stops when it reaches to walkToCommitOid or walkToCommitOid2.
 *
 * - Use walkToCommitOid2 when walkFromCommit has two parents.
 *
 * - walkToCommit is not included to return value.
 *
 * @internal
 */
export async function getCommitLogs (
  workingDir: string,
  walkFromCommitOid: string,
  walkToCommitOid?: string,
  walkToCommitOid2?: string
): Promise<NormalizedCommit[]> {
  // Return partial logs.
  // See https://github.com/isomorphic-git/isomorphic-git/blob/main/src/commands/log.js
  const parents = [await git.readCommit({ fs, dir: workingDir, oid: walkFromCommitOid })];
  const history: ReadCommitResult[] = [];
  const commits: NormalizedCommit[] = [];
  while (parents.length > 0) {
    const commit = parents.pop();

    if (commit!.oid === walkToCommitOid || commit!.oid === walkToCommitOid2) continue;

    commits.push(normalizeCommit(commit!));

    // Add the parents of this commit to the queue
    for (const oid of commit!.commit.parent) {
      // eslint-disable-next-line no-await-in-loop
      const parentCommit = await git.readCommit({ fs, dir: workingDir, oid });
      if (!history.map(myCommit => myCommit.oid).includes(parentCommit.oid)) {
        history.push(parentCommit);
        parents.push(parentCommit);
      }
    }
  }
  // The list is sorted by topology.
  return commits.reverse();
}

/**
 * Calc distance
 */
export function calcDistance (
  baseCommitOid: string,
  localCommitOid: string,
  remoteCommitOid: string
) {
  if (baseCommitOid === undefined) {
    return {
      ahead: undefined,
      behind: undefined,
    };
  }
  return {
    ahead: localCommitOid !== baseCommitOid ? 1 : 0,
    behind: remoteCommitOid !== baseCommitOid ? 1 : 0,
  };
}
