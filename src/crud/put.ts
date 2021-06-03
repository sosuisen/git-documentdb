/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import fs from 'fs-extra';
import git from 'isomorphic-git';
import { SHORT_SHA_LENGTH } from '../const';
import { JsonDoc, PutOptions, PutResult } from '../types';
import { IDocumentDB } from '../types_gitddb';
import {
  CannotCreateDirectoryError,
  CannotWriteDataError,
  DatabaseClosingError,
  DocumentNotFoundError,
  InvalidJsonObjectError,
  RepositoryNotOpenError,
  SameIdExistsError,
  TaskCancelError,
  UndefinedDBError,
  UndefinedDocumentIdError,
} from '../error';
import { toSortedJSONString } from '../utils';

/**
 * Implementation of put()
 *
 * @internal
 */
// eslint-disable-next-line complexity
export function putImpl (
  this: IDocumentDB,
  idOrDoc: string | JsonDoc,
  docOrOptions: { [key: string]: any } | PutOptions,
  options?: PutOptions
): Promise<PutResult> {
  if (this.isClosing) {
    return Promise.reject(new DatabaseClosingError());
  }

  if (this.repository() === undefined) {
    return Promise.reject(new RepositoryNotOpenError());
  }

  let _id = '';
  let document: JsonDoc = {};
  if (typeof idOrDoc === 'string') {
    _id = idOrDoc;
    if (typeof docOrOptions === 'object') {
      document = docOrOptions;
    }
    else {
      return Promise.reject(new InvalidJsonObjectError(_id));
    }
  }
  else if (typeof idOrDoc === 'object') {
    _id = idOrDoc._id;
    document = idOrDoc;
    options = docOrOptions;

    if (_id === undefined) {
      return Promise.reject(new UndefinedDocumentIdError());
    }
  }
  else {
    return Promise.reject(new UndefinedDocumentIdError());
  }

  try {
    this.validator.validateId(_id);
  } catch (err) {
    return Promise.reject(err);
  }

  let data = '';
  try {
    data = JSON.stringify(document);
  } catch (err) {
    // not json
    return Promise.reject(new InvalidJsonObjectError(_id));
  }

  // Must clone doc before rewriting _id
  const clone = JSON.parse(data);
  // _id of JSON document in Git repository includes just a filename.
  clone._id = path.basename(_id);

  try {
    this.validator.validateDocument(clone);
  } catch (err) {
    return Promise.reject(err);
  }

  data = toSortedJSONString(clone);

  options ??= {
    commit_message: undefined,
    insertOrUpdate: undefined,
    taskId: undefined,
    enqueueCallback: undefined,
  };

  const commit_message =
    options.commit_message ?? `<%insertOrUpdate%>: ${_id}${this.fileExt}(<%file_sha%>)`;

  const taskId = options.taskId ?? this.taskQueue.newTaskId();
  // put() must be serial.
  return new Promise((resolve, reject) => {
    this.taskQueue.pushToTaskQueue({
      label: options!.insertOrUpdate === undefined ? 'put' : options!.insertOrUpdate,
      taskId: taskId,
      targetId: _id,
      func: (beforeResolve, beforeReject) =>
        put_worker(this, _id, this.fileExt, data, commit_message!, options!.insertOrUpdate)
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
 * @throws {@link RepositoryNotOpenError}
 * @throws {@link CannotCreateDirectoryError}
 * @throws {@link CannotWriteDataError}
 */
export async function put_worker (
  gitDDB: IDocumentDB,
  name: string,
  extension: string,
  data: string,
  commitMessage: string,
  insertOrUpdate?: 'insert' | 'update'
): Promise<PutResult> {
  if (gitDDB === undefined) {
    throw new UndefinedDBError();
  }

  const _currentRepository = gitDDB.repository();
  if (_currentRepository === undefined) {
    throw new RepositoryNotOpenError();
  }

  let file_sha, commit_sha: string;

  const filename = name + extension;
  const filePath = path.resolve(gitDDB.workingDir(), filename);
  const dir = path.dirname(filePath);

  try {
    await fs.ensureDir(dir).catch((err: Error) => {
      throw new CannotCreateDirectoryError(err.message);
    });
    // 1. Write a file to disk
    await fs.writeFile(filePath, data);

    const headCommit = await git
      .resolveRef({ fs, dir: gitDDB.workingDir(), ref: 'HEAD' })
      .catch(() => undefined);

    const oldEntry =
      headCommit === undefined
        ? undefined
        : await git
          .readBlob({
            fs,
            dir: gitDDB.workingDir(),
            oid: headCommit,
            filepath: filename,
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

    await git.add({ fs, dir: gitDDB.workingDir(), filepath: filename });

    const { oid } = await git.hashBlob({ object: data });
    file_sha = oid;

    // isomorphic-git automatically adds trailing LF to commitMessage.
    // (Trailing LFs are usually ignored when displaying git log.)
    commitMessage = commitMessage
      .replace(/<%insertOrUpdate%>/, insertOrUpdate)
      .replace(/<%file_sha%>/, file_sha.substr(0, SHORT_SHA_LENGTH));

    // Default ref is HEAD
    commit_sha = await git.commit({
      fs,
      dir: gitDDB.workingDir(),
      author: {
        name: gitDDB.gitAuthor.name,
        email: gitDDB.gitAuthor.email,
      },
      committer: {
        name: gitDDB.gitAuthor.name,
        email: gitDDB.gitAuthor.email,
      },
      message: commitMessage,
    });
  } catch (err) {
    throw new CannotWriteDataError(err.message);
  }

  return {
    ok: true,
    id: name,
    file_sha: file_sha,
    commit_sha: commit_sha,
  };
}
