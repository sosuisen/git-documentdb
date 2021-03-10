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
import { JsonDoc, PutOptions, PutResult } from '../types';
import { AbstractDocumentDB } from '../types_gitddb';
import {
  CannotCreateDirectoryError,
  CannotWriteDataError,
  DatabaseClosingError,
  InvalidJsonObjectError,
  RepositoryNotOpenError,
  UndefinedDBError,
  UndefinedDocumentIdError,
} from '../error';
import { toSortedJSONString } from '../utils';

/**
 * Implementation of put()
 *
 * @internal
 */
export function putImpl (
  this: AbstractDocumentDB,
  idOrDoc: string | JsonDoc,
  docOrOptions: { [key: string]: any } | PutOptions,
  options?: PutOptions
): Promise<PutResult> {
  if (this.isClosing) {
    return Promise.reject(new DatabaseClosingError());
  }

  if (this.getRepository() === undefined) {
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
      return Promise.reject(new InvalidJsonObjectError());
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
    this._validator.validateId(_id);
  } catch (err) {
    return Promise.reject(err);
  }

  let data = '';
  try {
    data = JSON.stringify(document);
  } catch (err) {
    // not json
    return Promise.reject(new InvalidJsonObjectError());
  }

  // Must clone doc before rewriting _id
  const clone = JSON.parse(data);
  // _id of JSON document in Git repository includes just a filename.
  clone._id = path.basename(_id);

  try {
    this._validator.validateDocument(clone);
  } catch (err) {
    return Promise.reject(err);
  }

  data = toSortedJSONString(clone);

  options ??= {
    commit_message: undefined,
  };

  options.commit_message ??= `put: ${_id}`;

  // put() must be serial.
  return new Promise((resolve, reject) => {
    this._pushToTaskQueue({
      taskName: 'put',
      id: _id,
      func: () =>
        put_worker(this, _id, this.fileExt, data, options!.commit_message!)
          .then(result => {
            resolve(result);
          })
          .catch(err => reject(err)),
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
  gitDDB: AbstractDocumentDB,
  name: string,
  extension: string,
  data: string,
  commitMessage: string
): Promise<PutResult> {
  if (gitDDB === undefined) {
    return Promise.reject(new UndefinedDBError());
  }

  const _currentRepository = gitDDB.getRepository();
  if (_currentRepository === undefined) {
    return Promise.reject(new RepositoryNotOpenError());
  }

  let file_sha, commit_sha: string;

  const filename = name + extension;
  const filePath = path.resolve(gitDDB.workingDir(), filename);
  const dir = path.dirname(filePath);

  try {
    await fs.ensureDir(dir).catch((err: Error) => {
      return Promise.reject(new CannotCreateDirectoryError(err.message));
    });
    // 1. Write a file to disk
    await fs.writeFile(filePath, data);

    // 2. Repository#refreshIndex() grabs copy of latest index
    const index = await _currentRepository.refreshIndex();

    // 3. Index#addByPath() adds or updates an index entry from a file on disk.
    // https://libgit2.org/libgit2/#HEAD/group/index/git_index_add_bypath
    await index.addByPath(filename);

    // 4. Index#write() writes an existing index object from memory
    // back to disk using an atomic file lock.
    await index.write();

    /**
     * 5. Index#writeTree() writes the index as a tree.
     * https://libgit2.org/libgit2/#HEAD/group/index/git_index_write_tree
     * This method will scan the index and write a representation of its current state
     * back to disk; it recursively creates tree objects for each of the subtrees stored
     * in the index, but only returns the OID of the root tree.
     *
     * This is the OID that can be used e.g. to create a commit. (Repository#creatCommit())
     * The index must not contain any file in conflict.
     *
     * See https://git-scm.com/book/en/v2/Git-Internals-Git-Objects#_tree_objects
     * to understand Tree objects.
     */
    const treeOid = await index.writeTree();

    // Get SHA of blob if needed.
    const entry = index.getByPath(filename, 0); // https://www.nodegit.org/api/index/#STAGE
    file_sha = entry.id.tostrS();

    const author = nodegit.Signature.now(gitDDB.gitAuthor.name, gitDDB.gitAuthor.email);
    const committer = nodegit.Signature.now(gitDDB.gitAuthor.name, gitDDB.gitAuthor.email);

    const head = await _currentRepository.getHeadCommit();
    const parentCommits: nodegit.Commit[] = [];
    if (head !== null) {
      parentCommits.push(head);
    }
    // 6. Commit
    const commit = await _currentRepository.createCommit(
      'HEAD',
      author,
      committer,
      commitMessage,
      treeOid,
      parentCommits
    );

    commit_sha = commit.tostrS();
  } catch (err) {
    return Promise.reject(new CannotWriteDataError(err.message));
  }
  // console.log(commitId.tostrS());

  return {
    ok: true,
    id: name,
    file_sha: file_sha,
    commit_sha: commit_sha,
  };
}
