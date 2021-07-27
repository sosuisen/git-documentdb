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
import { SHORT_SHA_LENGTH } from '../const';
import { GitDDBInterface } from '../types_gitddb';
import { Err } from '../error';
import { DeleteOptions, DeleteResult, NormalizedCommit } from '../types';
import { normalizeCommit } from '../utils';

/**
 * Implementation of delete()
 *
 * @throws {@link Err.DatabaseClosingError}
 * @throws {@link Err.RepositoryNotOpenError}
 * @throws {@link Err.TaskCancelError}
 *
 * @throws {@link Err.UndefinedDBError} (from deleteWorker)
 * @throws {@link Err.DocumentNotFoundError} (from deleteWorker)
 * @throws {@link Err.CannotDeleteDataError} (from deleteWorker)
 *
 * @internal
 */
export function deleteImpl (
  gitDDB: GitDDBInterface,
  collectionPath: string,
  shortId: string | undefined,
  shortName: string,
  options?: DeleteOptions
): Promise<Pick<DeleteResult, 'commit' | 'fileOid' | 'name'>> {
  if (gitDDB.isClosing) {
    return Promise.reject(new Err.DatabaseClosingError());
  }
  if (!gitDDB.isOpened) {
    return Promise.reject(new Err.RepositoryNotOpenError());
  }

  options ??= {
    commitMessage: undefined,
    taskId: undefined,
    enqueueCallback: undefined,
  };

  const fullDocPath = collectionPath + shortName;

  const commitMessage = options.commitMessage ?? `delete: ${fullDocPath}(<%file_oid%>)`;

  const taskId = options.taskId ?? gitDDB.taskQueue.newTaskId();
  // delete() must be serial.
  return new Promise((resolve, reject) => {
    gitDDB.taskQueue.pushToTaskQueue({
      label: 'delete',
      taskId: taskId,
      collectionPath,
      shortId,
      shortName,
      func: (beforeResolve, beforeReject) =>
        deleteWorker(gitDDB, collectionPath, shortName, commitMessage!)
          .then(result => {
            beforeResolve();
            resolve(result);
          })
          .catch((err: Error) => {
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
 * Remove and commit a file
 *
 * @throws {@link Err.UndefinedDBError}
 * @throws {@link Err.DocumentNotFoundError}
 * @throws {@link Err.CannotDeleteDataError}
 */
export async function deleteWorker (
  gitDDB: GitDDBInterface,
  collectionPath: string,
  shortName: string,
  commitMessage: string
): Promise<Pick<DeleteResult, 'commit' | 'fileOid' | 'name'>> {
  if (gitDDB === undefined) {
    throw new Err.UndefinedDBError();
  }

  const fullDocPath = collectionPath + shortName;

  if (collectionPath === undefined || shortName === undefined || fullDocPath === '') {
    throw new Err.DocumentNotFoundError();
  }

  let commit: NormalizedCommit;
  const filePath = path.resolve(gitDDB.workingDir, fullDocPath);

  const headCommit = await git
    .resolveRef({ fs, dir: gitDDB.workingDir, ref: 'HEAD' })
    .catch(() => undefined);
  if (headCommit === undefined) throw new Err.DocumentNotFoundError();

  const { oid } = await git
    .readBlob({
      fs,
      dir: gitDDB.workingDir,
      oid: headCommit,
      filepath: fullDocPath,
    })
    .catch(() => {
      throw new Err.DocumentNotFoundError();
    });
  const fileOid = oid;
  await git.remove({ fs, dir: gitDDB.workingDir, filepath: fullDocPath });

  commitMessage = commitMessage.replace(
    /<%file_oid%>/,
    fileOid.substr(0, SHORT_SHA_LENGTH)
  );

  try {
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

    await fs.remove(filePath);

    // remove parent directory recursively if empty
    const dirname = path.dirname(fullDocPath);
    const dirs = dirname.split(/[/\\¥]/);
    for (let i = 0; i < dirs.length; i++) {
      const dirpath =
        i === 0
          ? path.resolve(gitDDB.workingDir, ...dirs)
          : path.resolve(gitDDB.workingDir, ...dirs.slice(0, -i));
      // eslint-disable-next-line no-await-in-loop
      await fs.rmdir(dirpath).catch(e => {
        /* not empty */
      });
    }
  } catch (err) {
    return Promise.reject(new Err.CannotDeleteDataError(err.message));
  }

  return {
    fileOid,
    commit,
    name: shortName,
  };
}
