/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import fs from 'fs-extra';
import path from 'path';
import { ulid } from 'ulid';
import { SHORT_SHA_LENGTH } from '../const';
import { cloneRepository } from './clone';
import {
  CannotCreateDirectoryError,
  CannotWriteDataError,
  DocumentNotFoundError,
  SameIdExistsError,
} from '../error';
import { RemoteOptions, SyncResultCombineDatabase } from '../types';
import { IDocumentDB } from '../types_gitddb';

/**
 * Clone a remote repository and combine the current local working directory with it.
 */
export async function combineDatabaseWithTheirs (
  gitDDB: IDocumentDB,
  remoteOptions: RemoteOptions
): Promise<SyncResultCombineDatabase> {
  // Clone repository if remoteURL exists
  const remoteDir = gitDDB.workingDir() + '_' + ulid(Date.now());
  const remoteRepository = await cloneRepository(
    remoteDir,
    remoteOptions,
    gitDDB.getLogger()
  ).catch((err: Error) => {
    throw err;
  });
  if (remoteRepository === undefined) {
    // Remote repository not found.
    // This will not occur after NoBaseMergeFoundError.
    throw new Error('Remote repository not found');
  }
  const index = await remoteRepository.refreshIndex();

  const listFiles = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap(dirent =>
      dirent.isFile() ? [`${dir}/${dirent.name}`] : listFiles(`${dir}/${dirent.name}`)
    );
  const localDocs = listFiles(gitDDB.workingDir());
  for (let i = 0; i < localDocs.length; i++) {
    const filename = localDocs[i];
    if (filename.startsWith('.git/') || filename.startsWith('.gitddb/')) {
      continue;
    }
    const localFilePath = path.resolve(gitDDB.workingDir(), filename);
    const remoteFilePath = path.resolve(remoteDir, filename);
    const dir = path.dirname(remoteFilePath);
    try {
      await fs.ensureDir(dir).catch((err: Error) => {
      throw new CannotCreateDirectoryError(err.message);
    });

    // Copy localFilePath to remoteFilePath if remoteFilePath not exists
    if (fs.existsSync(remoteFilePath)) {
      continue;
    }
    await fs.copyFile(localFilePath, remoteFilePath).catch(() => {
       throw new CannotWriteDataError();
      });


    const oldEntry = index.getByPath(filename);
    if (oldEntry) {
      if (insertOrUpdate === 'insert') return Promise.reject(new SameIdExistsError());
      insertOrUpdate ??= 'update';
    }
    else {
      if (insertOrUpdate === 'update') return Promise.reject(new DocumentNotFoundError());
      insertOrUpdate ??= 'insert';
    }

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

    commitMessage = commitMessage
      .replace(/<%insertOrUpdate%>/, insertOrUpdate)
      .replace(/<%file_sha%>/, file_sha.substr(0, SHORT_SHA_LENGTH));

    const author = nodegit.Signature.now(gitDDB.gitAuthor.name, gitDDB.gitAuthor.email);
    const committer = nodegit.Signature.now(gitDDB.gitAuthor.name, gitDDB.gitAuthor.email);

    const head = await _currentRepository.getHeadCommit();
    const parentCommits: nodegit.Commit[] = [];
    if (head !== null) {
      parentCommits.push(head);
    }
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

  this._gitDDB.setRepository(remoteRepository!);
  const result: SyncResultCombineDatabase = {
    action: 'combine database',
    changes: {
      local: [],
      remote: [],
    },
  };
  return result;
}
