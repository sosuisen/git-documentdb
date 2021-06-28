/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of gitDDB source tree.
 */

import path from 'path';
import fs from 'fs-extra';
import git from 'isomorphic-git';
import { normalizeCommit } from '../utils';
import { SHORT_SHA_LENGTH } from '../const';
import { NormalizedCommit, PutOptions, PutResult } from '../types';
import { GitDDBInterface } from '../types_gitddb';
import {
  CannotCreateDirectoryError,
  CannotWriteDataError,
  DatabaseClosingError,
  DocumentNotFoundError,
  RepositoryNotOpenError,
  SameIdExistsError,
  TaskCancelError,
  UndefinedDBError,
} from '../error';

/**
 * Common implementation of put-like commands.
 *
 * @throws {@link DatabaseClosingError}
 * @throws {@link TaskCancelError}
 *
 * @throws {@link UndefinedDBError} (from putWorker)
 * @throws {@link RepositoryNotOpenError} (from putWorker)
 * @throws {@link CannotCreateDirectoryError} (from putWorker)
 * @throws {@link SameIdExistsError} (from putWorker)
 * @throws {@link DocumentNotFoundError} (from putWorker)
 * @throws {@link CannotWriteDataError} (from putWorker)
 *
 * @internal
 */
// eslint-disable-next-line complexity
export function putImpl (
  gitDDB: GitDDBInterface,
  collectionPath: string,
  shortId: string | undefined,
  shortName: string,
  data: Uint8Array | string,
  options?: PutOptions
): Promise<Pick<PutResult, 'commit' | 'fileOid' | 'name'>> {
  if (gitDDB.isClosing) {
    return Promise.reject(new DatabaseClosingError());
  }

  options ??= {
    commitMessage: undefined,
    insertOrUpdate: undefined,
    taskId: undefined,
    enqueueCallback: undefined,
  };

  const fullDocPath = collectionPath + shortName;

  const commitMessage =
    options.commitMessage ?? `<%insertOrUpdate%>: ${fullDocPath}(<%file_oid%>)`;

  const taskId = options.taskId ?? gitDDB.taskQueue.newTaskId();
  // put() must be serial.
  return new Promise((resolve, reject) => {
    gitDDB.taskQueue.pushToTaskQueue({
      label: options!.insertOrUpdate === undefined ? 'put' : options!.insertOrUpdate,
      taskId: taskId,
      shortId,
      shortName,
      collectionPath,
      func: (beforeResolve, beforeReject) =>
        putWorker(
          gitDDB,
          collectionPath,
          shortName,
          data,
          commitMessage!,
          options!.insertOrUpdate
        )
          .then(result => {
            beforeResolve();
            resolve(result);
          })
          .catch(err => {
            beforeReject();
            reject(err);
          }),
      cancel: () => {
        reject(new TaskCancelError(taskId));
      },
      enqueueCallback: options?.enqueueCallback,
    });
  });
}

/**
 * Add and commit a file
 *
 * @throws {@link UndefinedDBError}
 * @throws {@link RepositoryNotOpenError}
 * @throws {@link CannotCreateDirectoryError}
 * @throws {@link SameIdExistsError}
 * @throws {@link DocumentNotFoundError}
 * @throws {@link CannotWriteDataError}
 */
export async function putWorker (
  gitDDB: GitDDBInterface,
  collectionPath: string,
  shortName: string,
  data: Uint8Array | string,
  commitMessage: string,
  insertOrUpdate?: 'insert' | 'update'
): Promise<Pick<PutResult, 'commit' | 'fileOid' | 'name'>> {
  if (gitDDB === undefined) {
    throw new UndefinedDBError();
  }

  if (!gitDDB.isOpened()) {
    throw new RepositoryNotOpenError();
  }
  const fullDocPath = collectionPath + shortName;

  let fileOid: string;
  let commit: NormalizedCommit;

  const filePath = path.resolve(gitDDB.workingDir, fullDocPath);
  await fs.ensureDir(path.dirname(filePath)).catch((err: Error) => {
    throw new CannotCreateDirectoryError(err.message);
  });

  try {
    await fs.writeFile(filePath, data);

    const headCommit = await git
      .resolveRef({ fs, dir: gitDDB.workingDir, ref: 'HEAD' })
      .catch(() => undefined);

    const oldEntry =
      headCommit === undefined
        ? undefined
        : await git
          .readBlob({
            fs,
            dir: gitDDB.workingDir,
            oid: headCommit,
            filepath: fullDocPath,
          })
          .catch(() => undefined);

    if (oldEntry) {
      if (insertOrUpdate === 'insert') return Promise.reject(new SameIdExistsError());
      insertOrUpdate ??= 'update';
    }
    else {
      if (insertOrUpdate === 'update') return Promise.reject(new DocumentNotFoundError());
      insertOrUpdate ??= 'insert';
    }

    await git.add({ fs, dir: gitDDB.workingDir, filepath: fullDocPath });

    const { oid } = await git.hashBlob({ object: data });
    fileOid = oid;

    // isomorphic-git automatically adds trailing LF to commitMessage.
    // (Trailing LFs are usually ignored when displaying git log.)
    commitMessage = commitMessage
      .replace(/<%insertOrUpdate%>/, insertOrUpdate)
      .replace(/<%file_oid%>/, fileOid.substr(0, SHORT_SHA_LENGTH));

    // Default ref is HEAD
    const commitOid = await git.commit({
      fs,
      dir: gitDDB.workingDir,
      author: gitDDB.author,
      committer: gitDDB.committer,
      message: commitMessage,
    });
    const readCommitResult = await git.readCommit({
      fs,
      dir: gitDDB.workingDir,
      oid: commitOid,
    });
    commit = normalizeCommit(readCommitResult);
  } catch (err) {
    throw new CannotWriteDataError(err.message);
  }

  return {
    fileOid,
    commit,
    name: shortName,
  };
}
