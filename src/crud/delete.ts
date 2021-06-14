/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of gitDDB source tree.
 */

import path from 'path';
import fs from 'fs-extra';
import { commit, readBlob, remove, resolveRef } from 'isomorphic-git';
import { SHORT_SHA_LENGTH } from '../const';
import { IDocumentDB } from '../types_gitddb';
import {
  CannotDeleteDataError,
  DatabaseClosingError,
  DocumentNotFoundError,
  RepositoryNotOpenError,
  TaskCancelError,
  UndefinedDBError,
} from '../error';
import { DeleteOptions, DeleteResult } from '../types';

/**
 * Implementation of delete()
 *
 * @throws {@link DatabaseClosingError}
 * @throws {@link TaskCancelError}
 *
 * @throws {@link UndefinedDBError} (from deleteWorker)
 * @throws {@link RepositoryNotOpenError} (deleteWorker)
 * @throws {@link DocumentNotFoundError} (from deleteWorker)
 * @throws {@link CannotDeleteDataError} (from deleteWorker)
 *
 * @internal
 */
export function deleteImpl (
  gitDDB: IDocumentDB,
  fullDocPath: string,
  options?: DeleteOptions
): Promise<Pick<DeleteResult, 'commitMessage' | 'commitOid' | 'fileOid'>> {
  if (gitDDB.isClosing) {
    return Promise.reject(new DatabaseClosingError());
  }

  options ??= {
    commitMessage: undefined,
    taskId: undefined,
    enqueueCallback: undefined,
  };
  const commitMessage = options.commitMessage ?? `delete: ${fullDocPath}(<%file_oid%>)`;

  const taskId = options.taskId ?? gitDDB.taskQueue.newTaskId();
  // delete() must be serial.
  return new Promise((resolve, reject) => {
    gitDDB.taskQueue.pushToTaskQueue({
      label: 'delete',
      taskId: taskId,
      targetId: fullDocPath,
      func: (beforeResolve, beforeReject) =>
        deleteWorker(gitDDB, fullDocPath, commitMessage!)
          .then(result => {
            beforeResolve();
            resolve(result);
          })
          .catch((err: Error) => {
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
 * Remove and commit a file
 *
 * @throws {@link UndefinedDBError}
 * @throws {@link RepositoryNotOpenError}
 * @throws {@link DocumentNotFoundError}
 * @throws {@link CannotDeleteDataError}
 */
export async function deleteWorker (
  gitDDB: IDocumentDB,
  fullDocPath: string,
  commitMessage: string
): Promise<Pick<DeleteResult, 'commitMessage' | 'commitOid' | 'fileOid'>> {
  if (gitDDB === undefined) {
    return Promise.reject(new UndefinedDBError());
  }

  if (!gitDDB.isOpened()) {
    return Promise.reject(new RepositoryNotOpenError());
  }

  if (fullDocPath === undefined || fullDocPath === '') {
    return Promise.reject(new DocumentNotFoundError());
  }

  let commitOid: string;
  const filePath = path.resolve(gitDDB.workingDir(), fullDocPath);

  const headCommit = await resolveRef({ fs, dir: gitDDB.workingDir(), ref: 'HEAD' });
  const { oid } = await readBlob({
    fs,
    dir: gitDDB.workingDir(),
    oid: headCommit,
    filepath: fullDocPath,
  }).catch(() => {
    return Promise.reject(new DocumentNotFoundError());
  });
  const fileOid = oid;
  await remove({ fs, dir: gitDDB.workingDir(), filepath: fullDocPath });

  commitMessage = commitMessage.replace(
    /<%file_oid%>/,
    fileOid.substr(0, SHORT_SHA_LENGTH)
  );

  try {
    // Default ref is HEAD
    commitOid = await commit({
      fs,
      dir: gitDDB.workingDir(),
      author: gitDDB.author,
      committer: gitDDB.committer,
      message: commitMessage,
    });

    await fs.remove(filePath);

    // remove parent directory recursively if empty
    const dirname = path.dirname(fullDocPath);
    const dirs = dirname.split(/[/\\¥]/);
    for (let i = 0; i < dirs.length; i++) {
      const dirpath =
        i === 0
          ? path.resolve(gitDDB.workingDir(), ...dirs)
          : path.resolve(gitDDB.workingDir(), ...dirs.slice(0, -i));
      // eslint-disable-next-line no-await-in-loop
      await fs.rmdir(dirpath).catch(e => {
        /* not empty */
      });
    }
  } catch (err) {
    return Promise.reject(new CannotDeleteDataError(err.message));
  }

  return {
    fileOid,
    commitOid,
    commitMessage,
  };
}
