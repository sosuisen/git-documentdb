/* eslint-disable no-await-in-loop */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */
import path from 'path';
import git from 'isomorphic-git';
import nodegit from '@sosuisen/nodegit';
import fs from 'fs-extra';
import { ulid } from 'ulid';
import rimraf from 'rimraf';
import { cloneRepository } from './clone';
import {
  DocMetadata,
  DocType,
  DuplicatedFile,
  FatDoc,
  JsonDocMetadata,
  RemoteOptions,
  SyncResultCombineDatabase,
} from '../types';
import { GitDDBInterface } from '../types_gitddb';
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
  gitDDB: GitDDBInterface,
  remoteOptions: RemoteOptions
): Promise<SyncResultCombineDatabase> {
  // Clone repository if remoteURL exists
  const remoteDir = gitDDB.workingDir + '_' + ulid(Date.now());
  const tmpLocalDir = gitDDB.workingDir + '_' + ulid(Date.now());
  let remoteRepository: nodegit.Repository | undefined;
  const duplicates: DuplicatedFile[] = [];
  try {
    remoteRepository = await cloneRepository(remoteDir, remoteOptions, gitDDB.logger);
    if (remoteRepository === undefined) {
      // Remote repository not found.
      // This will not occur after NoBaseMergeFoundError.
      throw new RemoteRepositoryNotFoundError(remoteOptions.remoteUrl!);
    }

    const index = await remoteRepository.refreshIndex();

    const localMetadataList: DocMetadata[] = await getAllMetadata(gitDDB.repository()!);
    const remoteMetadataList: DocMetadata[] = await getAllMetadata(remoteRepository);
    const remoteNames = remoteMetadataList.map(meta => meta.name);

    for (let i = 0; i < localMetadataList.length; i++) {
      const meta = localMetadataList[i];
      const localFilePath = path.resolve(gitDDB.workingDir, meta.name);
      const remoteFilePath = path.resolve(remoteDir, meta.name);
      const dir = path.dirname(remoteFilePath);

      await fs.ensureDir(dir);

      const docType: DocType = localFilePath.endsWith('.json') ? 'json' : 'text';
      // eslint-disable-next-line max-depth
      if (docType === 'text') {
        // TODO: select binary or text by .gitattribtues
      }

      if (remoteNames.includes(meta.name)) {
        // Add postfix and copy localFilePath to remoteFilePath if remoteFilePath exists

        let duplicatedFileName = '';
        let duplicatedFileId = '';
        let duplicatedFileExt = '';
        const postfix = DUPLICATED_FILE_POSTFIX + gitDDB.dbId;

        let original: DocMetadata;
        let duplicate: DocMetadata;

        const remoteFile = remoteMetadataList.find(data => data.name === meta.name);

        if (docType === 'json') {
          const doc = fs.readJSONSync(localFilePath);
          const _id = (meta as JsonDocMetadata)._id;
          // eslint-disable-next-line max-depth
          if (doc._id !== undefined) {
            doc._id = _id + postfix;
          }
          duplicatedFileName = _id + postfix + JSON_EXT;
          duplicatedFileId = _id + postfix;
          duplicatedFileExt = JSON_EXT;
          fs.writeFileSync(
            path.resolve(remoteDir, duplicatedFileName),
            toSortedJSONString(doc)
          );
          const duplicatedOid = (await git.hashBlob({ object: toSortedJSONString(doc) }))
            .oid;
          original = {
            _id,
            name: meta.name,
            fileOid: remoteFile!.fileOid,
            type: 'json',
          };
          duplicate = {
            _id: duplicatedFileId,
            name: duplicatedFileName,
            fileOid: duplicatedOid,
            type: 'json',
          };
        }
        else {
          // Add postfix before extension.
          duplicatedFileExt = path.extname(localFilePath);
          const onlyName = localFilePath.replace(new RegExp(duplicatedFileExt + '$'), '');
          duplicatedFileName = onlyName + postfix + duplicatedFileExt;

          fs.copyFileSync(localFilePath, path.resolve(remoteDir, duplicatedFileName));

          original = {
            name: meta.name,
            fileOid: remoteFile!.fileOid,
            type: docType,
          };
          duplicate = {
            name: duplicatedFileName,
            fileOid: meta.fileOid,
            type: docType,
          };
        }
        await index.addByPath(duplicatedFileName);
        await index.write();

        duplicates.push({
          original,
          duplicate,
        });
      }
      else {
        // Copy localFilePath to remoteFilePath if remoteFilePath not exists
        await fs.copyFile(localFilePath, remoteFilePath);
        await index.addByPath(meta.name);
        await index.write();
      }
    }

    if (localMetadataList.length > 0) {
      await index.writeTree();

      const commitMessage = 'combine database head with theirs';

      await git.commit({
        fs,
        dir: remoteDir,
        author: gitDDB.author,
        committer: gitDDB.committer,
        message: commitMessage,
      });
    }

    gitDDB.repository()!.cleanup();
    await fs.rename(gitDDB.workingDir, tmpLocalDir);

    if (remoteRepository) remoteRepository.cleanup();
    remoteRepository = undefined;

    await fs.rename(remoteDir, gitDDB.workingDir);

    const userName = await git
      .getConfig({ fs, dir: tmpLocalDir, path: 'user.name' })
      .catch(() => undefined);
    const userEmail = await git
      .getConfig({ fs, dir: tmpLocalDir, path: 'user.email' })
      .catch(() => undefined);

    if (userName) {
      await git.setConfig({
        fs,
        dir: gitDDB.workingDir,
        path: 'user.name',
        value: userName,
      });
    }
    if (userEmail) {
      await git.setConfig({
        fs,
        dir: gitDDB.workingDir,
        path: 'user.email',
        value: userEmail,
      });
    }
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
  const repos = await nodegit.Repository.open(gitDDB.workingDir);
  gitDDB.setRepository(repos!);
  await gitDDB.loadDbInfo();

  const result: SyncResultCombineDatabase = {
    action: 'combine database',
    duplicates,
  };
  return result;
}
