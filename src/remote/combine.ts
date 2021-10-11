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
import { DUPLICATED_FILE_POSTFIX, FILE_REMOVE_TIMEOUT, JSON_EXTENSION } from '../const';
import { getAllMetadata, toSortedJSONString } from '../utils';
import { RemoteEngine, wrappingRemoteEngineError } from './remote_engine';

/**
 * Clone a remote repository and combine the current local working directory with it.
 * TODO: Must catch errors
 *
 * @throws {@link Err.FileRemoveTimeoutError}
 *
 * @throws # Errors from RemoteEngine[engineName].clone
 * @throws - {@link RemoteErr.InvalidURLFormatError}
 * @throws - {@link RemoteErr.NetworkError}
 * @throws - {@link RemoteErr.HTTPError401AuthorizationRequired}
 * @throws - {@link RemoteErr.HTTPError404NotFound}
 * @throws - {@link RemoteErr.CannotConnectError}
 *
 * @throws - {@link RemoteErr.HttpProtocolRequiredError}
 * @throws - {@link RemoteErr.InvalidRepositoryURLError}
 * @throws - {@link RemoteErr.InvalidSSHKeyPathError}
 *
 * @throws - {@link RemoteErr.InvalidAuthenticationTypeError}
 *
 * @public
 */
// eslint-disable-next-line complexity
export async function combineDatabaseWithTheirs (
  gitDDB: GitDDBInterface,
  remoteOptions: RemoteOptions,
  remoteName: string
): Promise<SyncResultCombineDatabase> {
  // Clone repository if remoteURL exists
  const remoteDir = gitDDB.workingDir + '_' + ulid(Date.now());
  const tmpLocalDir = gitDDB.workingDir + '_' + ulid(Date.now());

  const duplicates: DuplicatedFile[] = [];
  try {
    await RemoteEngine[remoteOptions.connection!.engine!]
      .clone(remoteDir, remoteOptions, remoteName, gitDDB.logger)
      .catch(err => {
        throw wrappingRemoteEngineError(err);
      });
    // Add refs to remote branch
    const remoteCommitOid = await git.resolveRef({
      fs,
      dir: remoteDir,
      ref: `refs/remotes/origin/${gitDDB.defaultBranch}`,
    });
    await git.writeRef({
      fs,
      dir: remoteDir,
      ref: `refs/remotes/${remoteName}/${gitDDB.defaultBranch}`,
      value: remoteCommitOid,
      force: true,
    });
    // Overwrite upstream branch
    await git.setConfig({
      fs,
      dir: remoteDir,
      path: `branch.${gitDDB.defaultBranch}.remote`,
      value: remoteName,
    });
    await git.setConfig({
      fs,
      dir: remoteDir,
      path: `branch.${gitDDB.defaultBranch}.merge`,
      value: `refs/heads/${gitDDB.defaultBranch}`,
    });

    const localMetadataList: DocMetadata[] = await getAllMetadata(gitDDB.workingDir);
    const remoteMetadataList: DocMetadata[] = await getAllMetadata(remoteDir);
    const remoteNames = remoteMetadataList.map(meta => meta.name);

    for (let i = 0; i < localMetadataList.length; i++) {
      const meta = localMetadataList[i];
      const localFilePath = path.resolve(gitDDB.workingDir, meta.name);
      const remoteFilePath = path.resolve(remoteDir, meta.name);
      const dir = path.dirname(remoteFilePath);

      await fs.ensureDir(dir);

      const docType: DocType = localFilePath.endsWith(JSON_EXTENSION) ? 'json' : 'text';
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
          duplicatedFileName = _id + postfix + JSON_EXTENSION;
          duplicatedFileId = _id + postfix;
          duplicatedFileExt = JSON_EXTENSION;
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
