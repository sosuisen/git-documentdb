/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import nodegit from '@sosuisen/nodegit';
import {
  DatabaseClosingError,
  InvalidJsonObjectError,
  RepositoryNotOpenError,
} from '../error';
import { AllDocsOptions, AllDocsResult, JsonDocWithMetadata } from '../types';
import { Validator } from '../validator';
import { AbstractDocumentDB } from '../types_gitddb';

// eslint-disable-next-line complexity
export async function allDocsImpl (
  this: AbstractDocumentDB,
  options?: AllDocsOptions
): Promise<AllDocsResult> {
  if (this.isClosing) {
    return Promise.reject(new DatabaseClosingError());
  }
  const _currentRepository = this.repository();
  if (_currentRepository === undefined) {
    return Promise.reject(new RepositoryNotOpenError());
  }

  // Calling nameToId() for HEAD throws error when there is not a commit object yet.
  const head = await nodegit.Reference.nameToId(_currentRepository, 'HEAD').catch(
    e => false
  ); // get HEAD
  if (!head) {
    return { total_rows: 0 };
  }

  const commit_sha = (head as nodegit.Oid).tostrS();
  const commit = await _currentRepository.getCommit(head as nodegit.Oid); // get the commit of HEAD

  const rows: JsonDocWithMetadata[] = [];

  // Breadth-first search
  const directories: nodegit.Tree[] = [];
  const tree = await commit.getTree();

  let collection_path = '';
  if (options?.collection_path) {
    collection_path = Validator.normalizeCollectionPath(options.collection_path);
    try {
      this._validator.validateCollectionPath(collection_path);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  if (collection_path !== '') {
    const specifiedTreeEntry = await tree
      .getEntry(options!.collection_path!)
      .catch(e => null);
    if (specifiedTreeEntry && specifiedTreeEntry.isTree()) {
      const specifiedTree = await specifiedTreeEntry.getTree();
      directories.push(specifiedTree);
    }
    else {
      return { total_rows: 0 };
    }
  }
  else {
    directories.push(tree);
  }
  while (directories.length > 0) {
    const dir = directories.shift();
    if (dir === undefined) break;
    const entries = dir.entries();

    // Ascendant (alphabetical order)
    let sortFunc = (a: nodegit.TreeEntry, b: nodegit.TreeEntry) =>
      a.name().localeCompare(b.name());
    // Descendant (alphabetical order)
    if (options?.descending) {
      sortFunc = (a: nodegit.TreeEntry, b: nodegit.TreeEntry) =>
        -a.name().localeCompare(b.name());
    }
    entries.sort(sortFunc);

    while (entries.length > 0) {
      const entry = entries.shift();
      if (entry === undefined) break;
      if (entry?.isDirectory()) {
        if (options?.recursive && entry.name() !== '.gitddb') {
          // eslint-disable-next-line no-await-in-loop
          const subtree = await entry.getTree();
          directories.push(subtree);
        }
      }
      else {
        let _id = entry.path().replace(new RegExp(this.fileExt + '$'), '');
        const reg = new RegExp('^' + collection_path);
        _id = _id.replace(reg, '');
        const documentInBatch: JsonDocWithMetadata = {
          id: _id,
          file_sha: entry.id().tostrS(),
        };

        if (options?.include_docs) {
          // eslint-disable-next-line no-await-in-loop
          const blob = await entry.getBlob();
          // eslint-disable-next-line max-depth
          try {
            const doc = JSON.parse(blob.toString());
            doc._id = _id;
            documentInBatch.doc = doc;
          } catch (err) {
            return Promise.reject(new InvalidJsonObjectError(err.message));
          }
        }
        rows.push(documentInBatch);
      }
    }
  }

  return {
    total_rows: rows.length,
    commit_sha,
    rows,
  };
}
