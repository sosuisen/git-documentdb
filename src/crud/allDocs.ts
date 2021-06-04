/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import nodegit from '@sosuisen/nodegit';
import { JSON_EXT } from '../const';
import {
  DatabaseClosingError,
  InvalidJsonObjectError,
  RepositoryNotOpenError,
} from '../error';
import { AllDocsOptions, AllDocsResult, JsonDocWithMetadata } from '../types';
import { IDocumentDB } from '../types_gitddb';

// eslint-disable-next-line complexity
export async function allDocsImpl (
  this: IDocumentDB,
  options?: AllDocsOptions
): Promise<AllDocsResult> {
  if (this.isClosing) {
    return Promise.reject(new DatabaseClosingError());
  }
  const _currentRepository = this.repository();
  if (_currentRepository === undefined) {
    return Promise.reject(new RepositoryNotOpenError());
  }

  options ??= {
    include_docs: undefined,
    descending: undefined,
    recursive: undefined,
    prefix: undefined,
  };
  options.include_docs ??= false;
  options.descending ??= false;
  options.recursive ??= true;
  options.prefix ??= '';

  // Calling nameToId() for HEAD throws error when there is not a commit object yet.
  const head = await nodegit.Reference.nameToId(_currentRepository, 'HEAD').catch(
    e => false
  ); // get HEAD
  if (!head) {
    return { total_rows: 0, rows: [] };
  }

  const commit_sha = (head as nodegit.Oid).tostrS();
  const commit = await _currentRepository.getCommit(head as nodegit.Oid); // get the commit of HEAD

  const rows: JsonDocWithMetadata[] = [];

  // Breadth-first search
  const directories: nodegit.Tree[] = [];
  const tree = await commit.getTree();

  let prefix = options!.prefix;
  let targetDir = '';
  const prefixArray = prefix.split('/'); // returns number which is equal or larger than 1
  if (prefixArray.length === 1) {
    // prefix equals '' or prefix includes no slash
    // nop
  }
  else if (prefixArray[prefixArray.length - 1] === '') {
    // prefix ends with slash
    targetDir = prefix;
    prefix = '';
  }
  else {
    // prefix does not end with slash
    prefix = prefixArray.pop()!;
    targetDir = prefixArray.join('/');
  }

  if (targetDir !== '') {
    const specifiedTreeEntry = await tree.getEntry(targetDir).catch(e => null);
    if (specifiedTreeEntry && specifiedTreeEntry.isTree()) {
      const specifiedTree = await specifiedTreeEntry.getTree();
      directories.push(specifiedTree);
    }
    else {
      return { total_rows: 0, commit_sha, rows: [] };
    }
  }
  else {
    directories.push(tree);
  }
  while (directories.length > 0) {
    const dir = directories.shift();
    if (dir === undefined) break;
    const entries = dir.entries(); // returns entry by alphabetical order
    let filteredEntries: nodegit.TreeEntry[];
    if (prefix === '') {
      filteredEntries = entries;
    }
    else {
      filteredEntries = [];
      let matchPrefix = false;
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (entry.name().startsWith(prefix)) {
          filteredEntries.push(entry);
          matchPrefix = true;
        }
        else if (matchPrefix) {
          // can break because array is alphabetical order
          break;
        }
      }
    }

    // Ascendant alphabetical order (default)
    // let sortFunc = (a: nodegit.TreeEntry, b: nodegit.TreeEntry) =>
    //  a.name().localeCompare(b.name());
    // Descendant alphabetical order
    if (options.descending) {
      const sortFunc = (a: nodegit.TreeEntry, b: nodegit.TreeEntry) =>
        -a.name().localeCompare(b.name());
      filteredEntries.sort(sortFunc);
    }

    while (filteredEntries.length > 0) {
      const entry = filteredEntries.shift();
      if (entry?.isDirectory()) {
        if (options.recursive && entry.name() !== '.gitddb') {
          // eslint-disable-next-line no-await-in-loop
          const subtree = await entry.getTree();
          directories.push(subtree);

          prefix = '';
        }
      }
      else {
        const _id = entry!.path().replace(new RegExp(JSON_EXT + '$'), '');
        const documentInBatch: JsonDocWithMetadata = {
          id: _id,
          file_sha: entry!.id().tostrS(),
        };

        if (options.include_docs) {
          // eslint-disable-next-line no-await-in-loop
          const blob = await entry!.getBlob();
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
