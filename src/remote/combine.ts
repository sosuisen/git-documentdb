/* eslint-disable no-await-in-loop */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */
import path from 'path';
import nodegit from '@sosuisen/nodegit';
import fs from 'fs-extra';
import { ulid } from 'ulid';
import rimraf from 'rimraf';
import { cloneRepository } from './clone';
import { RemoteOptions, SyncResultCombineDatabase } from '../types';
import { IDocumentDB } from '../types_gitddb';
import { FileRemoveTimeoutError } from '../error';
import { FILE_REMOVE_TIMEOUT } from '../const';
import { sleep } from '../utils';

/**
 * Clone a remote repository and combine the current local working directory with it.
 *
 *  @remarks Must catch errors
 */
export async function combineDatabaseWithTheirs (
  gitDDB: IDocumentDB,
  remoteOptions: RemoteOptions
): Promise<SyncResultCombineDatabase> {
  // Clone repository if remoteURL exists
  const remoteDir = gitDDB.workingDir() + '_' + ulid(Date.now());
  const tmpLocalDir = gitDDB.workingDir() + '_' + ulid(Date.now());
  let remoteRepository: nodegit.Repository | undefined;
  try {
    remoteRepository = await cloneRepository(remoteDir, remoteOptions, gitDDB.getLogger());
    if (remoteRepository === undefined) {
      // Remote repository not found.
      // This will not occur after NoBaseMergeFoundError.
      throw new Error('Remote repository not found');
    }
    const index = await remoteRepository.refreshIndex();

    const listFiles = (dir: string): string[] =>
      fs
        .readdirSync(dir, { withFileTypes: true })
        .flatMap(dirent =>
          dirent.isFile()
            ? [`${dir}/${dirent.name}`.replace(gitDDB.workingDir() + '/', '')]
            : listFiles(`${dir}/${dirent.name}`)
        )
        .filter(name => !name.match(/^(\.gitddb|\.git)/));

    const localDocs = listFiles(gitDDB.workingDir());

    for (let i = 0; i < localDocs.length; i++) {
      const filename = localDocs[i];
      const localFilePath = path.resolve(gitDDB.workingDir(), filename);
      const remoteFilePath = path.resolve(remoteDir, filename);
      const dir = path.dirname(remoteFilePath);

      await fs.ensureDir(dir);

      if (fs.existsSync(remoteFilePath)) {
        // Add postfix and copy localFilePath to remoteFilePath if remoteFilePath exists
        let duplicatedFileName = '';
        const postfix = '-from-' + gitDDB.dbId();
        if (remoteFilePath.endsWith(gitDDB.fileExt)) {
          const doc = fs.readJSONSync(localFilePath);
          doc._id += postfix;
          duplicatedFileName = doc._id + gitDDB.fileExt;
          fs.writeJSONSync(path.resolve(remoteDir, duplicatedFileName), doc);
        }
        else {
          // Add postfix before extension.
          duplicatedFileName = path.resolve(
            path.dirname(filename),
            path.basename(filename, path.extname(remoteDir)) +
              postfix +
              path.extname(remoteDir)
          );
          fs.copyFileSync(localFilePath, path.resolve(remoteDir, duplicatedFileName));
        }
        await index.addByPath(duplicatedFileName);
        await index.write();
      }
      else {
        // Copy localFilePath to remoteFilePath if remoteFilePath not exists
        await fs.copyFile(localFilePath, remoteFilePath);
        await index.addByPath(filename);
        await index.write();
      }
    }

    if (localDocs.length > 0) {
      const treeOid = await index.writeTree();

      const commitMessage = 'combine database head with theirs';
      const author = nodegit.Signature.now(gitDDB.gitAuthor.name, gitDDB.gitAuthor.email);
      const committer = nodegit.Signature.now(
        gitDDB.gitAuthor.name,
        gitDDB.gitAuthor.email
      );

      const head = await remoteRepository.getHeadCommit();
      const parentCommits: nodegit.Commit[] = [];
      if (head !== null) {
        parentCommits.push(head);
      }

      await remoteRepository.createCommit(
        'HEAD',
        author,
        committer,
        commitMessage,
        treeOid,
        parentCommits
      );
    }
    await fs.rename(gitDDB.workingDir(), tmpLocalDir);

    if (remoteRepository) remoteRepository.cleanup();
    remoteRepository = undefined;

    await fs.rename(remoteDir, gitDDB.workingDir());
  } finally {
    await new Promise<void>((resolve, reject) => {
      // Set timeout because rimraf sometimes does not catch EPERM error.
      setTimeout(() => {
        reject(new FileRemoveTimeoutError());
      }, FILE_REMOVE_TIMEOUT);
      rimraf(remoteDir, error => {
        if (error) {
          reject(error);
        }
        resolve();
      });
    });
    await new Promise<void>((resolve, reject) => {
      // Set timeout because rimraf sometimes does not catch EPERM error.
      setTimeout(() => {
        reject(new FileRemoveTimeoutError());
      }, FILE_REMOVE_TIMEOUT);
      rimraf(tmpLocalDir, error => {
        if (error) {
          reject(error);
        }
        resolve();
      });
    });
    if (remoteRepository) remoteRepository.cleanup();
    remoteRepository = undefined;
  }
  const repos = await nodegit.Repository.open(gitDDB.workingDir());
  gitDDB.setRepository(repos!);

  const result: SyncResultCombineDatabase = {
    action: 'combine database',
  };
  return result;
}
