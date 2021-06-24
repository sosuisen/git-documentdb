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
import { IDocumentDB } from '../types_gitddb';
import {
  CannotDeleteDataError,
  DatabaseClosingError,
  DocumentNotFoundError,
  RepositoryNotOpenError,
  TaskCancelError,
  UndefinedDBError,
} from '../error';
import { DeleteOptions, DeleteResult, NormalizedCommit } from '../types';
import { normalizeCommit } from '../utils';

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
  collectionPath: string,
  shortId: string | undefined,
  shortName: string,
  options?: DeleteOptions
): Promise<Pick<DeleteResult, 'commit' | 'fileOid' | 'name'>> {
  if (gitDDB.isClosing) {
    return Promise.reject(new DatabaseClosingError());
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
  collectionPath: string,
  shortName: string,
  commitMessage: string
): Promise<Pick<DeleteResult, 'commit' | 'fileOid' | 'name'>> {
  if (gitDDB === undefined) {
    throw new UndefinedDBError();
  }

  if (!gitDDB.isOpened()) {
    throw new RepositoryNotOpenError();
  }

  const fullDocPath = collectionPath + shortName;

  if (collectionPath === undefined || shortName === undefined || fullDocPath === '') {
    throw new DocumentNotFoundError();
  }

  let commit: NormalizedCommit;
  const filePath = path.resolve(gitDDB.workingDir(), fullDocPath);

  const headCommit = await git
    .resolveRef({ fs, dir: gitDDB.workingDir(), ref: 'HEAD' })
    .catch(() => undefined);
  if (headCommit === undefined) throw new DocumentNotFoundError();

  const { oid } = await git
    .readBlob({
      fs,
      dir: gitDDB.workingDir(),
      oid: headCommit,
      filepath: fullDocPath,
    })
    .catch(() => {
      throw new DocumentNotFoundError();
    });
  const fileOid = oid;
  await git.remove({ fs, dir: gitDDB.workingDir(), filepath: fullDocPath });

  commitMessage = commitMessage.replace(
    /<%file_oid%>/,
    fileOid.substr(0, SHORT_SHA_LENGTH)
  );

  try {
    // Default ref is HEAD
    const commitOid = await git.commit({
      fs,
      dir: gitDDB.workingDir(),
      author: gitDDB.author,
      committer: gitDDB.committer,
      message: commitMessage,
    });
    const readCommitResult = await git.readCommit({
      fs,
      dir: gitDDB.workingDir(),
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
    commit,
    name: shortName,
  };
}
