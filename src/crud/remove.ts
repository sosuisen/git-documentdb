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
import { SHORT_SHA_LENGTH } from '../const';
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
import { JsonDoc, RemoveOptions, RemoveResult } from '../types';

/**
 * Implementation of remove()
 *
 * @internal
 */
export function removeImpl (
  this: IDocumentDB,
  idOrDoc: string | JsonDoc,
  options?: RemoveOptions
): Promise<RemoveResult> {
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
    commit_message: undefined,
  };
  const commit_message =
    options.commit_message ?? `remove: ${_id}${this.fileExt}(<%file_sha%>)`;

  const taskId = this.taskQueue.newTaskId();
  // delete() must be serial.
  return new Promise((resolve, reject) => {
    this.taskQueue.pushToTaskQueue({
      label: 'remove',
      taskId: taskId,
      targetId: _id,
      func: (beforeResolve, beforeReject) =>
        remove_worker(this, _id, this.fileExt, commit_message!)
          .then((result: RemoveResult) => {
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
export async function remove_worker (
  gitDDB: IDocumentDB,
  _id: string,
  extension: string,
  commitMessage: string
): Promise<RemoveResult> {
  if (gitDDB === undefined) {
    return Promise.reject(new UndefinedDBError());
  }

  const _currentRepository = gitDDB.repository();

  if (_currentRepository === undefined) {
    return Promise.reject(new RepositoryNotOpenError());
  }

  if (_id === undefined || _id === '') {
    return Promise.reject(new DocumentNotFoundError());
  }

  let file_sha, commit_sha: string;
  const filename = _id + extension;
  const filePath = path.resolve(gitDDB.workingDir(), filename);

  let index;
  try {
    index = await _currentRepository.refreshIndex();
    const entry = index.getByPath(filename, 0); // https://www.nodegit.org/api/index/#STAGE
    if (entry === undefined) {
      return Promise.reject(new DocumentNotFoundError());
    }
    file_sha = entry.id.tostrS();

    await index.removeByPath(filename); // stage
    await index.write(); // flush changes to index
  } catch (err) {
    return Promise.reject(new CannotDeleteDataError(err.message));
  }

  try {
    commitMessage = commitMessage.replace(
      /<%file_sha%>/,
      file_sha.substr(0, SHORT_SHA_LENGTH)
    );

    const changes = await index.writeTree(); // get reference to a set of changes

    const author = nodegit.Signature.now(gitDDB.gitAuthor.name, gitDDB.gitAuthor.email);
    const committer = nodegit.Signature.now(gitDDB.gitAuthor.name, gitDDB.gitAuthor.email);

    const head = await nodegit.Reference.nameToId(_currentRepository, 'HEAD');
    const parent = await _currentRepository.getCommit(head as nodegit.Oid); // get the commit of HEAD
    const commit = await _currentRepository.createCommit(
      'HEAD',
      author,
      committer,
      commitMessage,
      changes,
      [parent]
    );

    commit_sha = commit.tostrS();

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
    id: _id,
    file_sha,
    commit_sha,
  };
}
