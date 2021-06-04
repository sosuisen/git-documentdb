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
import { NormalizeCommit } from '../utils';
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

export async function getDocument (workingDir: string, filepath: string, file_sha: string) {
  const { blob } = await git.readBlob({
    fs,
    dir: workingDir,
    oid: file_sha,
  });
  return getDocumentFromBuffer(filepath, blob);
}

async function getAllFilesFromCommit (
  workingDir: string,
  commitOid: string
): Promise<[string[], { [key: string]: string }]> {
  const commit = await git.readCommit({ fs, dir: workingDir, oid: commitOid });
  const files: string[] = [];
  const fileOidMap: { [key: string]: string } = {};
  const trees = [];
  trees.push(commit.commit.tree);
  while (trees.length > 0) {
    // eslint-disable-next-line no-await-in-loop
    const tree = await git.readTree({ fs, dir: workingDir, oid: commitOid });
    tree.tree.forEach(entry => {
      if (entry.type === 'tree') trees.push(entry.oid);
      else {
        files.push(entry.path);
        fileOidMap[entry.path] = entry.oid;
      }
    });
  }
  return [files, fileOidMap];
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
    map: async function (filepath, [A, B]) {
      // ignore directories
      if (filepath === '.') {
        return;
      }
      if (filepath.startsWith('.gitddb/')) {
        return;
      }

      let id = filepath;
      if (id.endsWith(JSON_EXT)) {
        id = id.replace(new RegExp(JSON_EXT + '$'), '');
      }

      const Atype = A === null ? undefined : await A.type();
      const Btype = B === null ? undefined : await B.type();

      if (Atype === 'tree' || Btype === 'tree') {
        return;
      }
      // generate ids
      const Aoid = A === null ? undefined : await A.oid();
      const Boid = B === null ? undefined : await B.oid();

      let change: ChangedFile;
      if (Boid === undefined) {
        change = {
          operation: 'delete',
          old: {
            id,
            file_sha: Aoid,
            // eslint-disable-next-line no-await-in-loop
            doc: await getDocument(workingDir, filepath, Aoid),
          },
        };
      }
      else if (Aoid === undefined) {
        change = {
          operation: 'insert',
          new: {
            id,
            file_sha: Boid,
            // eslint-disable-next-line no-await-in-loop
            doc: await getDocument(workingDir, filepath, Boid),
          },
        };
      }
      else if (Aoid !== Boid) {
        change = {
          operation: 'update',
          old: {
            id,
            file_sha: Aoid,
            // eslint-disable-next-line no-await-in-loop
            doc: await getDocument(workingDir, filepath, Aoid),
          },
          new: {
            id,
            file_sha: Boid,
            // eslint-disable-next-line no-await-in-loop
            doc: await getDocument(workingDir, filepath, Boid),
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

export async function getChangesIso2 (
  workingDir: string,
  oldCommitOid: string,
  newCommitOid: string
) {
  const changes: ChangedFile[] = [];
  const [oldFiles, oldFileOidMap] = await getAllFilesFromCommit(workingDir, oldCommitOid);
  const [newFiles, newFileOidMap] = await getAllFilesFromCommit(workingDir, newCommitOid);

  const allFiles = [...oldFiles, ...newFiles].sort();

  for (let i = 0; i < allFiles.length; i++) {
    const file = allFiles[i];

    if (oldFileOidMap[file] && !newFileOidMap[file]) {
      changes.push({
        operation: 'delete',
        old: {
          id: file,
          file_sha: oldFileOidMap[file],
          // eslint-disable-next-line no-await-in-loop
          doc: await getDocument(workingDir, file, oldFileOidMap[file]),
        },
      });
    }
    else if (!oldFileOidMap[file] && newFileOidMap[file]) {
      changes.push({
        operation: 'insert',
        new: {
          id: file,
          file_sha: newFileOidMap[file],
          // eslint-disable-next-line no-await-in-loop
          doc: await getDocument(workingDir, file, newFileOidMap[file]),
        },
      });
    }
    else if (oldFileOidMap[file] !== newFileOidMap[file]) {
      changes.push({
        operation: 'update',
        old: {
          id: file,
          file_sha: oldFileOidMap[file],
          // eslint-disable-next-line no-await-in-loop
          doc: await getDocument(workingDir, file, oldFileOidMap[file]),
        },
        new: {
          id: file,
          file_sha: newFileOidMap[file],
          // eslint-disable-next-line no-await-in-loop
          doc: await getDocument(workingDir, file, newFileOidMap[file]),
        },
      });
    }
    else {
      // no changes
    }
  }
  return changes;
}

/**
 * Get commit logs newer than an oldCommit, until a newCommit
 *
 * @remarks
 *
 * - Logs are sorted from old to new.
 *
 * - oldCommit is not included to return value.
 *
 * @internal
 */
export async function getCommitLogs (
  workingDir: string,
  oldCommitOid: string,
  newCommitOid: string
): Promise<NormalizedCommit[]> {
  // Return partial logs.
  // See https://github.com/isomorphic-git/isomorphic-git/blob/main/src/commands/log.js
  const tips = [await git.readCommit({ fs, dir: workingDir, oid: newCommitOid })];
  const commits: NormalizedCommit[] = [];
  while (tips.length > 0) {
    const commit = tips.pop();

    // Not include oldCommitOid
    if (commit?.oid === oldCommitOid) break;

    commits.unshift(NormalizeCommit(commit!));

    // Add the parents of this commit to the queue
    const parents: ReadCommitResult[] = [];
    for (const oid of commit!.commit.parent) {
      // eslint-disable-next-line no-await-in-loop
      const parent_commit = await git.readCommit({ fs, dir: workingDir, oid });
      if (!tips.map(my_commit => my_commit.oid).includes(parent_commit.oid)) {
        parents.push(parent_commit);
      }
    }
    parents
      .sort((a, b) => {
        if (a.commit.committer.timestamp < b.commit.committer.timestamp) return 1;
        if (a.commit.committer.timestamp > b.commit.committer.timestamp) return -1;
        return 0;
      })
      .forEach(parent => tips.unshift(parent));
  }
  // The list is sorted from old to new.
  return commits;
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
