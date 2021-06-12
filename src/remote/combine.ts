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
import {
  DocMetadata,
  DuplicatedFile,
  RemoteOptions,
  SyncResultCombineDatabase,
} from '../types';
import { IDocumentDB } from '../types_gitddb';
import { FileRemoveTimeoutError, RemoteRepositoryNotFoundError } from '../error';
import { DUPLICATED_FILE_POSTFIX, FILE_REMOVE_TIMEOUT, JSON_EXT } from '../const';
import { getAllMetadata, toSortedJSONString } from '../utils';

/**
 * Clone a remote repository and combine the current local working directory with it.
 *
 * @remarks Must catch errors
 */
// eslint-disable-next-line complexity
export async function combineDatabaseWithTheirs (
  gitDDB: IDocumentDB,
  remoteOptions: RemoteOptions
): Promise<SyncResultCombineDatabase> {
  // Clone repository if remoteURL exists
  const remoteDir = gitDDB.workingDir() + '_' + ulid(Date.now());
  const tmpLocalDir = gitDDB.workingDir() + '_' + ulid(Date.now());
  let remoteRepository: nodegit.Repository | undefined;
  const duplicates: DuplicatedFile[] = [];
  try {
    remoteRepository = await cloneRepository(remoteDir, remoteOptions, gitDDB.getLogger());
    if (remoteRepository === undefined) {
      // Remote repository not found.
      // This will not occur after NoBaseMergeFoundError.
      throw new RemoteRepositoryNotFoundError(remoteOptions.remoteUrl!);
    }
    const index = await remoteRepository.refreshIndex();

    const localMetadataList: DocMetadata[] = await getAllMetadata(gitDDB.repository()!);
    const remoteMetadataList: DocMetadata[] = await getAllMetadata(remoteRepository);
    const remoteIds = remoteMetadataList.map(meta => meta._id);

    for (let i = 0; i < localMetadataList.length; i++) {
      const meta = localMetadataList[i];
      const filename = meta._id + (meta.type === 'json' ? '.json' : '');
      const localFilePath = path.resolve(gitDDB.workingDir(), filename);
      const remoteFilePath = path.resolve(remoteDir, filename);
      const dir = path.dirname(remoteFilePath);

      await fs.ensureDir(dir);

      if (remoteIds.includes(meta._id)) {
        // Add postfix and copy localFilePath to remoteFilePath if remoteFilePath exists

        let duplicatedFileName = '';
        let duplicatedFileId = '';
        let duplicatedFileSha = '';
        let duplicatedFileExt = '';
        const postfix = DUPLICATED_FILE_POSTFIX + gitDDB.dbId();

        if (remoteFilePath.endsWith(JSON_EXT)) {
          const doc = fs.readJSONSync(localFilePath);
          doc._id = path.basename(meta._id + postfix);
          duplicatedFileName = meta._id + postfix + JSON_EXT;
          duplicatedFileId = meta._id + postfix;
          duplicatedFileExt = JSON_EXT;
          fs.writeFileSync(
            path.resolve(remoteDir, duplicatedFileName),
            toSortedJSONString(doc)
          );
        }
        else {
          // Add postfix before extension.
          duplicatedFileId = meta._id + postfix;
          duplicatedFileExt = path.extname(localFilePath);
          duplicatedFileName = duplicatedFileId + duplicatedFileExt;

          fs.copyFileSync(localFilePath, path.resolve(remoteDir, duplicatedFileName));
        }
        await index.addByPath(duplicatedFileName);
        await index.write();

        const entry = index.getByPath(duplicatedFileName, 0); // https://www.nodegit.org/api/index/#STAGE
        duplicatedFileSha = entry.id.tostrS();

        const remoteFile = remoteMetadataList.find(data => data._id === meta._id);
        duplicates.push({
          original: {
            _id: meta._id,
            fileOid: remoteFile!.fileOid,
            type: duplicatedFileExt === '.json' ? 'json' : '',
          },
          duplicate: {
            _id: duplicatedFileId,
            fileOid: duplicatedFileSha,
            type: duplicatedFileExt === '.json' ? 'json' : '',
          },
        });
      }
      else {
        // Copy localFilePath to remoteFilePath if remoteFilePath not exists
        await fs.copyFile(localFilePath, remoteFilePath);
        await index.addByPath(filename);
        await index.write();
      }
    }

    if (localMetadataList.length > 0) {
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

    gitDDB.repository()!.cleanup();
    await fs.rename(gitDDB.workingDir(), tmpLocalDir);

    if (remoteRepository) remoteRepository.cleanup();
    remoteRepository = undefined;

    await fs.rename(remoteDir, gitDDB.workingDir());
  } catch (e) {
    console.log(e);
    throw e;
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
  await gitDDB.loadDbInfo();

  const result: SyncResultCombineDatabase = {
    action: 'combine database',
    duplicates,
  };
  return result;
}
