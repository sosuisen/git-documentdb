/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import fs from 'fs-extra';
import nodegit from '@sosuisen/nodegit';
import { JSON_EXT, SHORT_SHA_LENGTH } from '../const';
import { IDocumentDB } from '../types_gitddb';
import {
  CannotDeleteDataError,
  DatabaseClosingError,
  DocumentNotFoundError,
  RepositoryNotOpenError,
  TaskCancelError,
  UndefinedDBError,
  UndefinedDocumentIdError,
} from '../error';
import { DeleteOptions, DeleteResult, JsonDoc } from '../types';

/**
 * Implementation of delete()
 *
 * @internal
 */
export function deleteImpl (
  this: IDocumentDB,
  idOrDoc: string | JsonDoc,
  options?: DeleteOptions
): Promise<DeleteResult> {
  let _id: string;
  if (typeof idOrDoc === 'string') {
    _id = idOrDoc;
  }
  else if (idOrDoc?._id) {
    _id = idOrDoc._id;
  }
  else {
    return Promise.reject(new UndefinedDocumentIdError());
  }

  if (this.isClosing) {
    return Promise.reject(new DatabaseClosingError());
  }

  if (this.repository() === undefined) {
    return Promise.reject(new RepositoryNotOpenError());
  }

  try {
    this.validator.validateId(_id);
  } catch (err) {
    return Promise.reject(err);
  }

  options ??= {
    commitMessage: undefined,
    taskId: undefined,
    enqueueCallback: undefined,
  };
  const commitMessage = options.commitMessage ?? `delete: ${_id}${JSON_EXT}(<%file_sha%>)`;

  const taskId = options.taskId ?? this.taskQueue.newTaskId();
  // delete() must be serial.
  return new Promise((resolve, reject) => {
    this.taskQueue.pushToTaskQueue({
      label: 'delete',
      taskId: taskId,
      targetId: _id,
      func: (beforeResolve, beforeReject) =>
        deleteWorker(this, _id, JSON_EXT, commitMessage!)
          .then((result: DeleteResult) => {
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
 * @throws {@link RepositoryNotOpenError}
 * @throws {@link DocumentNotFoundError}
 * @throws {@link CannotDeleteDataError}
 */
export async function deleteWorker (
  gitDDB: IDocumentDB,
  _id: string,
  extension: string,
  commitMessage: string
): Promise<DeleteResult> {
  if (gitDDB === undefined) {
    return Promise.reject(new UndefinedDBError());
  }

  const currentRepository = gitDDB.repository();

  if (currentRepository === undefined) {
    return Promise.reject(new RepositoryNotOpenError());
  }

  if (_id === undefined || _id === '') {
    return Promise.reject(new DocumentNotFoundError());
  }

  let fileSha, commitSha: string;
  const filename = _id + extension;
  const filePath = path.resolve(gitDDB.workingDir(), filename);

  let index;
  try {
    index = await currentRepository.refreshIndex();
    const entry = index.getByPath(filename, 0); // https://www.nodegit.org/api/index/#STAGE
    if (entry === undefined) {
      return Promise.reject(new DocumentNotFoundError());
    }
    fileSha = entry.id.tostrS();

    await index.removeByPath(filename); // stage
    await index.write(); // flush changes to index
  } catch (err) {
    return Promise.reject(new CannotDeleteDataError(err.message));
  }

  try {
    commitMessage = commitMessage.replace(
      /<%file_sha%>/,
      fileSha.substr(0, SHORT_SHA_LENGTH)
    );

    const changes = await index.writeTree(); // get reference to a set of changes

    const author = nodegit.Signature.now(gitDDB.gitAuthor.name, gitDDB.gitAuthor.email);
    const committer = nodegit.Signature.now(gitDDB.gitAuthor.name, gitDDB.gitAuthor.email);

    const head = await nodegit.Reference.nameToId(currentRepository, 'HEAD');
    const parent = await currentRepository.getCommit(head as nodegit.Oid); // get the commit of HEAD
    const commit = await currentRepository.createCommit(
      'HEAD',
      author,
      committer,
      commitMessage,
      changes,
      [parent]
    );

    commitSha = commit.tostrS();

    await fs.remove(filePath);

    // remove parent directory recursively if empty
    const dirname = path.dirname(filename);
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
    ok: true,
    _id,
    fileSha,
    commitSha,
  };
}
