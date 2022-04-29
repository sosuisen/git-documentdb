/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import fs from 'fs';
import { readBlob, readTree, resolveRef, TreeEntry, TreeObject } from 'isomorphic-git';
import { GIT_DOCUMENTDB_METADATA_DIR } from '../const';
import { Err } from '../error';
import {
  Doc,
  DocType,
  FatBinaryDoc,
  FatDoc,
  FatJsonDoc,
  FatTextDoc,
  FindOptions,
  JsonDoc,
  SerializeFormat,
} from '../types';
import { GitDDBInterface } from '../types_gitddb';
import { blobToBinary, blobToJsonDoc, blobToText } from './blob';
import {
  getBinaryDocFromWorkingDir,
  getJsonDocFromWorkingDir,
  getTextDocFromWorkingDir,
} from './get';

/**
 * Implementation of find()
 *
 * @throws {@link Err.DatabaseClosingError}
 * @throws {@link Err.RepositoryNotOpenError}
 * @throws {@link Err.InvalidJsonObjectError}
 */
// eslint-disable-next-line complexity
export async function findImpl (
  gitDDB: GitDDBInterface,
  collectionPath: string,
  serializeFormat: SerializeFormat,
  findOnlyJson: boolean,
  withMetadata: boolean,
  options?: FindOptions
): Promise<(Doc | FatDoc)[]> {
  if (gitDDB.isClosing) {
    return Promise.reject(new Err.DatabaseClosingError());
  }
  if (!gitDDB.isOpened) {
    return Promise.reject(new Err.RepositoryNotOpenError());
  }

  options ??= {
    descending: undefined,
    recursive: undefined,
    prefix: undefined,
    forceDocType: undefined,
  };
  options.descending ??= false;
  options.recursive ??= true;
  options.prefix ??= '';
  options.prefix = collectionPath + options.prefix;

  const commitOid = await resolveRef({ fs, dir: gitDDB.workingDir, ref: 'HEAD' });

  // Normalize prefix and targetDir
  let prefix = options!.prefix;
  let targetDir = '';
  const prefixArray = prefix.split('/'); // returns number which is equal or larger than 1
  if (prefixArray.length === 1) {
    // prefix equals '' or prefix includes no slash
    // nop
  }
  else if (prefixArray[prefixArray.length - 1] === '') {
    // prefix ends with slash
    targetDir = prefix.slice(0, -1); // remove trailing slash
    prefix = '';
  }
  else {
    // prefix does not end with slash
    prefix = prefixArray.pop()!;
    targetDir = prefixArray.join('/');
  }

  // Breadth-first search
  const directories: { path: string; entries: TreeObject }[] = []; // type TreeObject = Array<TreeEntry>
  const specifiedTreeResult = await readTree({
    fs,
    dir: gitDDB.workingDir,
    oid: commitOid,
    filepath: targetDir,
  }).catch(() => undefined);
  if (specifiedTreeResult) {
    directories.push({ path: targetDir, entries: specifiedTreeResult.tree });
  }

  const docs: (Doc | FatDoc)[] = [];

  while (directories.length > 0) {
    const directory = directories.shift();
    if (directory === undefined) break;
    let filteredEntries: TreeEntry[];
    if (prefix === '') {
      filteredEntries = directory.entries;
    }
    else {
      filteredEntries = [];
      let matchPrefix = false;
      for (const entry of directory.entries) {
        if (entry.path.startsWith(prefix)) {
          filteredEntries.push(entry);
          matchPrefix = true;
        }
        else if (matchPrefix) {
          // Can break because entries are alphabetical order.
          // https://github.com/isomorphic-git/isomorphic-git/blob/1316820b5665346414f9bd1287d4701f9cf77727/src/models/GitTree.js#L93-L95
          // Not that Git sorts tree entries as if there is a trailing slash on directory names.
          // See https://github.com/isomorphic-git/isomorphic-git/blob/89c0da78d5ebf3c9f2754b3c8d557155dd70c8d7/src/utils/compareTreeEntryPath.js
          break;
        }
      }
    }

    // Ascendant alphabetical order (default)
    // let sortFunc = (a: TreeEntry, b: TreeEntry) =>
    //  a.path.localeCompare(b.path);
    // Descendant alphabetical order
    if (options.descending) {
      const sortFunc = (a: TreeEntry, b: TreeEntry) => -a.path.localeCompare(b.path);
      filteredEntries.sort(sortFunc);
    }

    for (const entry of filteredEntries) {
      const fullDocPath =
        directory.path !== '' ? `${directory.path}/${entry.path}` : entry.path;
      if (entry.type === 'tree') {
        if (options.recursive && fullDocPath !== GIT_DOCUMENTDB_METADATA_DIR) {
          // eslint-disable-next-line no-await-in-loop
          const { tree } = await readTree({
            fs,
            dir: gitDDB.workingDir,
            oid: entry.oid,
          });
          directories.push({ path: fullDocPath, entries: tree });

          prefix = '';
        }
      }
      else {
        if (findOnlyJson && !serializeFormat.hasObjectExtension(fullDocPath)) {
          continue;
        }

        const docType: DocType =
          options.forceDocType ??
          (serializeFormat.hasObjectExtension(fullDocPath) ? 'json' : 'text');
        if (docType === 'text') {
          // TODO: select binary or text by .gitattribtues
        }
        const shortName = fullDocPath.replace(new RegExp('^' + collectionPath), '');

        if (docType === 'json') {
          const [, extension] = fullDocPath.match(/.+(\..+?)$/)!;
          const shortId = serializeFormat.removeExtension(shortName);
          if (withMetadata) {
            // eslint-disable-next-line no-await-in-loop
            const readBlobResult = await readBlob({
              fs,
              dir: gitDDB.workingDir,
              oid: commitOid,
              filepath: fullDocPath,
            }).catch(() => undefined);
            // Skip if cannot read
            if (readBlobResult) {
              docs.push(
                blobToJsonDoc(
                  shortId,
                  readBlobResult,
                  true,
                  serializeFormat,
                  extension
                ) as FatJsonDoc
              );
            }
          }
          else {
            docs.push(
              // eslint-disable-next-line no-await-in-loop
              (await getJsonDocFromWorkingDir(
                gitDDB,
                shortName,
                collectionPath,
                serializeFormat
              )) as JsonDoc
            );
          }
        }
        else if (docType === 'text') {
          if (withMetadata) {
            // eslint-disable-next-line no-await-in-loop
            const readBlobResult = await readBlob({
              fs,
              dir: gitDDB.workingDir,
              oid: commitOid,
              filepath: fullDocPath,
            }).catch(() => undefined);
            // Skip if cannot read
            if (readBlobResult) {
              docs.push(blobToText(shortName, readBlobResult, true) as FatTextDoc);
            }
          }
          else {
            docs.push(
              // eslint-disable-next-line no-await-in-loop
              (await getTextDocFromWorkingDir(
                gitDDB,
                shortName,
                collectionPath,
                serializeFormat
              )) as string
            );
          }
        }
        else if (docType === 'binary') {
          if (withMetadata) {
            // eslint-disable-next-line no-await-in-loop
            const readBlobResult = await readBlob({
              fs,
              dir: gitDDB.workingDir,
              oid: commitOid,
              filepath: fullDocPath,
            }).catch(() => undefined);
            // Skip if cannot read
            if (readBlobResult) {
              docs.push(blobToBinary(shortName, readBlobResult, true) as FatBinaryDoc);
            }
          }
          else {
            docs.push(
              // eslint-disable-next-line no-await-in-loop
              (await getBinaryDocFromWorkingDir(
                gitDDB,
                shortName,
                collectionPath,
                serializeFormat
              )) as Uint8Array
            );
          }
        }
      }
    }
  }
  return docs;
}
