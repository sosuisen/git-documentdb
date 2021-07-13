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
import fs from 'fs-extra';
import { ulid } from 'ulid';
import rimraf from 'rimraf';
import {
  DocMetadata,
  DocType,
  DuplicatedFile,
  JsonDocMetadata,
  RemoteOptions,
  SyncResultCombineDatabase,
} from '../types';
import { GitDDBInterface } from '../types_gitddb';
import { Err } from '../error';
import { DUPLICATED_FILE_POSTFIX, FILE_REMOVE_TIMEOUT, JSON_EXT } from '../const';
import { getAllMetadata, toSortedJSONString } from '../utils';
import { Remote } from './remote';

/**
 * Clone a remote repository and combine the current local working directory with it.
 *
 * TODO: Must catch errors
 */
// eslint-disable-next-line complexity
export async function combineDatabaseWithTheirs (
  gitDDB: GitDDBInterface,
  remoteOptions: RemoteOptions
): Promise<SyncResultCombineDatabase> {
  // Clone repository if remoteURL exists
  const remoteDir = gitDDB.workingDir + '_' + ulid(Date.now());
  const tmpLocalDir = gitDDB.workingDir + '_' + ulid(Date.now());

  const duplicates: DuplicatedFile[] = [];
  try {
    await Remote.clone(remoteDir, remoteOptions, gitDDB.logger);

    const localMetadataList: DocMetadata[] = await getAllMetadata(gitDDB.workingDir);
    const remoteMetadataList: DocMetadata[] = await getAllMetadata(remoteDir);
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
        await git.add({ fs, dir: remoteDir, filepath: duplicatedFileName });

        duplicates.push({
          original,
          duplicate,
        });
      }
      else {
        // Copy localFilePath to remoteFilePath if remoteFilePath not exists
        await fs.copyFile(localFilePath, remoteFilePath);
        await git.add({ fs, dir: remoteDir, filepath: meta.name });
      }
    }

    if (localMetadataList.length > 0) {
      const commitMessage = 'combine database head with theirs';

      await git.commit({
        fs,
        dir: remoteDir,
        author: gitDDB.author,
        committer: gitDDB.committer,
        message: commitMessage,
      });
    }

    await fs.rename(gitDDB.workingDir, tmpLocalDir);

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
        reject(new Err.FileRemoveTimeoutError());
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
        reject(new Err.FileRemoveTimeoutError());
      }, FILE_REMOVE_TIMEOUT);
      rimraf(tmpLocalDir, error => {
        if (error) {
          reject(error);
        }
        resolve();
      });
    });
  }

  await gitDDB.loadDbInfo();

  const result: SyncResultCombineDatabase = {
    action: 'combine database',
    duplicates,
  };
  return result;
}
