/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of gitDDB source tree.
 */

import nodegit from '@sosuisen/nodegit';
import { InvalidJsonObjectError } from '../error';
import { ChangedFile, CommitInfo, DocMetadata, JsonDoc } from '../types';
import { AbstractDocumentDB } from '../types_gitddb';

/**
 * Get document
 *
 * @throws {@link InvalidJsonObjectError}
 *
 * @internal
 */
export async function getDocument (
  gitDDB: AbstractDocumentDB,
  id: string,
  fileOid: nodegit.Oid
) {
  const blob = await gitDDB.repository()?.getBlob(fileOid);
  let document: JsonDoc | undefined;
  if (blob) {
    try {
      document = (JSON.parse(blob.toString()) as unknown) as JsonDoc;
      // _id in a document may differ from _id in a filename by mistake.
      // _id in a file is SSOT.
      // Overwrite _id in a document by _id in arguments
      document._id = id;
    } catch (e) {
      throw new InvalidJsonObjectError();
    }
  }
  return document;
}

/**
 * Get changed files
 *
 * @throws {@link InvalidJsonObjectError} (from getDocument())
 *
 * @internal
 */
export async function getChanges (gitDDB: AbstractDocumentDB, diff: nodegit.Diff) {
  const changes: ChangedFile[] = [];
  for (let i = 0; i < diff.numDeltas(); i++) {
    const delta = diff.getDelta(i);
    // https://libgit2.org/libgit2/#HEAD/type/git_diff_delta
    // Both oldFile() and newFile() will return the same file to show diffs.
    /*
    console.log(
      `changed old: ${delta.oldFile().path()}, ${delta.oldFile().flags().toString(2)}`
    );
    console.log(
      `        new: ${delta.newFile().path()}, ${delta.newFile().flags().toString(2)}`
    );
    */
    /**
     * flags:
     * https://libgit2.org/libgit2/#HEAD/type/git_diff_flag_t
     * The fourth bit represents whether file exists at this side of the delta or not.
     * [a file is removed]
     * changed old: test.txt, 1100
     *         new: test.txt,  100
     * [a file is added]
     * changed old: test.txt,  100
     *         new: test.txt, 1100
     * [a file is modified]
     * changed old: test.txt, 1100
     *         new: test.txt, 1100
     */

    const oldExist = delta.oldFile().flags() >> 3;
    const newExist = delta.newFile().flags() >> 3;

    const docId = delta
      .newFile()
      .path()
      .replace(new RegExp(gitDDB.fileExt + '$'), '');
    const oldDocMetadata: DocMetadata = {
      id: docId,
      file_sha: delta.oldFile().id().tostrS(),
    };
    const newDocMetadata: DocMetadata = {
      id: docId,
      file_sha: delta.newFile().id().tostrS(),
    };
    if (oldExist && !newExist) {
      // Use oldFile. newFile is empty when removed.
      changes.push({
        operation: 'delete',
        data: {
          ...oldDocMetadata,
          // eslint-disable-next-line no-await-in-loop
          doc: await getDocument(gitDDB, docId, delta.oldFile().id()),
        },
      });
    }
    else if (!oldExist && newExist) {
      changes.push({
        operation: 'create',
        data: {
          ...newDocMetadata,
          // eslint-disable-next-line no-await-in-loop
          doc: await getDocument(gitDDB, docId, delta.newFile().id()),
        },
      });
    }
    else if (oldExist && newExist) {
      changes.push({
        operation: 'update',
        data: {
          ...newDocMetadata,
          // eslint-disable-next-line no-await-in-loop
          doc: await getDocument(gitDDB, docId, delta.newFile().id()),
        },
      });
    }
  }

  return changes;
}

/**
 * Get commit logs newer than an oldCommit, until a newCommit
 *
 * @remarks
 * - This will leak memory. It may be a bug in NodeGit 0.27.
 *
 * - Logs are sorted from old to new.
 *
 * - oldCommit is not included to return value.
 *
 * @internal
 * @beta
 */
export async function getCommitLogs (
  oldCommit: nodegit.Commit,
  newCommit: nodegit.Commit
): Promise<CommitInfo[]> {
  const endId = oldCommit.id().tostrS();

  /**
   * TODO: Use RevWalk instead of Commit.history()
   * Using history() is inefficient.
   */

  // Walk the history from this commit backwards.
  const history = newCommit.history();
  const commitList = await new Promise<nodegit.Commit[]>((resolve, reject) => {
    const list: nodegit.Commit[] = [];
    const onCommit = (commit: nodegit.Commit) => {
      if (commit.id().tostrS() === endId) {
        history.removeAllListeners();
        resolve(list);
      }
      else {
        list.unshift(commit);
      }
    };
    const onEnd = (commits: nodegit.Commit[]) => {
      console.log(
        JSON.stringify(
          commits.map(commit => {
            return { id: commit.id, message: commit.message };
          })
        )
      );
      history.removeAllListeners();
      reject(new Error('Unexpected end of walking commit history'));
    };
    const onError = (error: Error) => {
      history.removeAllListeners();
      reject(error);
    };
    history.on('commit', onCommit);
    history.on('end', onEnd);
    history.on('error', onError);
    history.start();
  });
  // The list is sorted from old to new.
  const commitInfoList = commitList.map(commit => {
    return {
      sha: commit.id().tostrS(),
      date: commit.date(),
      author: commit.author().toString(),
      message: commit.message(),
    };
  });
  return commitInfoList;
}
