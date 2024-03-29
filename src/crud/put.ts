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
import { Err } from '../error';

/**
 * Common implementation of put-like commands.
 *
 * @throws {@link Err.DatabaseClosingError}
 * @throws {@link Err.RepositoryNotOpenError}
 * @throws {@link Err.TaskCancelError}
 *
 * @throws # Errors from putWorker
 * @throws {@link Err.UndefinedDBError}
 * @throws {@link Err.CannotCreateDirectoryError}
 * @throws {@link Err.SameIdExistsError}
 * @throws {@link Err.DocumentNotFoundError}
 * @throws {@link Err.CannotWriteDataError}
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
    return Promise.reject(new Err.DatabaseClosingError());
  }
  if (!gitDDB.isOpened) {
    return Promise.reject(new Err.RepositoryNotOpenError());
  }

  options ??= {
    commitMessage: undefined,
    insertOrUpdate: undefined,
    taskId: undefined,
    enqueueCallback: undefined,
    debounceTime: undefined,
  };
  options.debounceTime ??= -1;

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
      debounceTime: options!.debounceTime,
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
        reject(new Err.TaskCancelError(taskId));
      },
      enqueueCallback: options?.enqueueCallback,
    });
  });
}

/**
 * Add and commit a file
 *
 * @throws {@link Err.UndefinedDBError}
 * @throws {@link Err.CannotCreateDirectoryError}
 * @throws {@link Err.SameIdExistsError}
 * @throws {@link Err.DocumentNotFoundError}
 * @throws {@link Err.CannotWriteDataError}
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
    throw new Err.UndefinedDBError();
  }

  const fullDocPath = collectionPath + shortName;

  let fileOid: string;
  let commit: NormalizedCommit;

  const filePath = path.resolve(gitDDB.workingDir, fullDocPath);
  await fs.ensureDir(path.dirname(filePath)).catch((err: Error) => {
    throw new Err.CannotCreateDirectoryError(err.message);
  });

  try {
    const headCommit = await git
      .resolveRef({ fs, dir: gitDDB.workingDir, ref: 'HEAD' })
      .catch(() => undefined);

    const oldEntryExists = fs.existsSync(filePath);

    if (oldEntryExists) {
      if (insertOrUpdate === 'insert') return Promise.reject(new Err.SameIdExistsError());
      insertOrUpdate ??= 'update';
    }
    else {
      if (insertOrUpdate === 'update')
        return Promise.reject(new Err.DocumentNotFoundError());
      insertOrUpdate ??= 'insert';
    }
    await fs.writeFile(filePath, data);

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
  } catch (err: unknown) {
    throw new Err.CannotWriteDataError((err as Error).message);
  }

  return {
    fileOid,
    commit,
    name: shortName,
  };
}
