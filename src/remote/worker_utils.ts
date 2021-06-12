/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of gitDDB source tree.
 */

import nodePath from 'path';
import git, { ReadCommitResult } from 'isomorphic-git';
import fs from 'fs-extra';
import { normalizeCommit } from '../utils';
import { JSON_EXT } from '../const';
import { CannotCreateDirectoryError, InvalidJsonObjectError } from '../error';
import { ChangedFile, JsonDoc, NormalizedCommit } from '../types';
import { IDocumentDB } from '../types_gitddb';

/**
 * Write blob to file system
 *
 * @throws {@link CannotCreateDirectoryError}
 */
export async function writeBlobToFile (
  gitDDB: IDocumentDB,
  fileName: string,
  data: string
) {
  const filePath = nodePath.resolve(gitDDB.workingDir(), fileName);
  const dir = nodePath.dirname(filePath);
  await fs.ensureDir(dir).catch((err: Error) => {
    return Promise.reject(new CannotCreateDirectoryError(err.message));
  });
  await fs.writeFile(filePath, data);
}

export function getDocumentFromBuffer (filepath: string, buffer: Uint8Array) {
  const id = filepath.replace(new RegExp(JSON_EXT + '$'), '');
  let document: JsonDoc | undefined;
  try {
    document = (JSON.parse(Buffer.from(buffer).toString('utf-8')) as unknown) as JsonDoc;
    document._id = id;
  } catch (e) {
    throw new InvalidJsonObjectError(id);
  }
  return document;
}

export async function getDocument (workingDir: string, filepath: string, fileOid: string) {
  const { blob } = await git.readBlob({
    fs,
    dir: workingDir,
    oid: fileOid,
  });
  return getDocumentFromBuffer(filepath, blob);
}

/**
 * Get changed files
 *
 * @throws {@link InvalidJsonObjectError} (from getDocument())
 *
 * @internal
 */
export async function getChanges (
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
    map: async function (filepath, [a, b]) {
      // ignore directories
      if (filepath === '.') {
        return;
      }
      if (filepath.startsWith('.gitddb/')) {
        return;
      }

      let _id = filepath;
      if (_id.endsWith(JSON_EXT)) {
        _id = _id.replace(new RegExp(JSON_EXT + '$'), '');
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
          old: {
            _id,
            fileOid: aOid,
            // eslint-disable-next-line no-await-in-loop
            doc: await getDocument(workingDir, filepath, aOid),
          },
        };
      }
      else if (aOid === undefined && bOid !== undefined) {
        change = {
          operation: 'insert',
          new: {
            _id,
            fileOid: bOid,
            // eslint-disable-next-line no-await-in-loop
            doc: await getDocument(workingDir, filepath, bOid),
          },
        };
      }
      else if (aOid !== undefined && bOid !== undefined && aOid !== bOid) {
        change = {
          operation: 'update',
          old: {
            _id,
            fileOid: aOid,
            // eslint-disable-next-line no-await-in-loop
            doc: await getDocument(workingDir, filepath, aOid),
          },
          new: {
            _id,
            fileOid: bOid,
            // eslint-disable-next-line no-await-in-loop
            doc: await getDocument(workingDir, filepath, bOid),
          },
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
  walkToCommitOid: string,
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
export async function calcDistance (
  workingDir: string,
  localCommitOid: string,
  remoteCommitOid: string
) {
  const [baseCommitOid] = await git.findMergeBase({
    fs,
    dir: workingDir,
    oids: [localCommitOid, remoteCommitOid],
  });
  return {
    ahead: localCommitOid !== baseCommitOid ? 1 : 0,
    behind: remoteCommitOid !== baseCommitOid ? 1 : 0,
  };
}
