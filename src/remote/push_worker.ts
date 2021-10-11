/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of gitDDB source tree.
 */

import git from 'isomorphic-git';
import fs from 'fs-extra';
import { GitDDBInterface } from '../types_gitddb';
import {
  ChangedFile,
  NormalizedCommit,
  SyncResultNop,
  SyncResultPush,
  TaskMetadata,
} from '../types';
import { SyncInterface } from '../types_sync';
import { getChanges, getCommitLogs } from './worker_utils';
import { RemoteEngine, RemoteErr, wrappingRemoteEngineError } from './remote_engine';

/**
 * Push and get changes
 *
 * @throws # Errors from push
 * @throws - {@link InvalidGitRemoteError}
 * @throws - {@link UnfetchedCommitExistsError}
 * @throws - {@link InvalidURLFormatError}
 * @throws - {@link NetworkError}
 * @throws - {@link HTTPError401AuthorizationRequired}
 * @throws - {@link HTTPError404NotFound}
 * @throws - {@link HTTPError403Forbidden}
 * @throws - {@link CannotConnectError}
 * @throws - {@link CannotConnectError}
 * @throws - {@link HttpProtocolRequiredError}
 * @throws - {@link InvalidRepositoryURLError}
 * @throws - {@link InvalidSSHKeyPathError}
 * @throws - {@link InvalidAuthenticationTypeError}
 *
 * @throws # Errors from getChanges
 * @throws - {@link Err.InvalidJsonObjectError}
 *
 * @internal
 */
// eslint-disable-next-line complexity
export async function pushWorker (
  gitDDB: GitDDBInterface,
  sync: SyncInterface,
  taskMetadata: TaskMetadata,
  skipStartEvent = false,
  afterMerge = false
): Promise<SyncResultPush | SyncResultNop> {
  const syncOptions = sync.options;
  if (!skipStartEvent) {
    sync.eventHandlers.start.forEach(listener => {
      listener.func(
        { ...taskMetadata, collectionPath: listener.collectionPath },
        sync.currentRetries()
      );
    });
  }

  /**
  a) The first push
              
  --[baseCommit(remoteCommit)]--(...)--[headCommit(localCommit)]

  b) Fast forward
              
  --[baseCommit]--(...)--[remoteCommit]--(...)--[headCommit(localCommit)]
  
  c) HEAD is a merge commit
                  ┌--(...)--[localCommit]---┐
  --[baseCommit]--+                         +--[headCommit]
                  └--(...)--[remoteCommit]--┘
  */

  const headCommitOid = await git.resolveRef({
    fs,
    dir: gitDDB.workingDir,
    ref: 'HEAD',
  });
  const headCommit = await git.readCommit({
    fs,
    dir: gitDDB.workingDir,
    oid: headCommitOid,
  });

  let localCommitOid: string;

  const remoteCommitOid = await git
    .resolveRef({
      fs,
      dir: gitDDB.workingDir,
      ref: `refs/remotes/${sync.remoteName}/${gitDDB.defaultBranch}`,
    })
    .catch(() => undefined);

  if (headCommit.commit.parent.length === 2) {
    // HEAD is a merge commit.
    localCommitOid = headCommit.commit.parent[0];
  }
  else {
    localCommitOid = headCommitOid;
  }

  let baseCommitOid: string | undefined;

  if (remoteCommitOid === undefined) {
    // This is the first push in this repository.
    // Get the first commit.
    const logs = await git.log({ fs, dir: gitDDB.workingDir });
    baseCommitOid = logs[logs.length - 1].oid;
    if (baseCommitOid === localCommitOid) {
      baseCommitOid = undefined;
    }
  }
  else {
    [baseCommitOid] = await git.findMergeBase({
      fs,
      dir: gitDDB.workingDir,
      oids: [localCommitOid, remoteCommitOid],
    });
  }

  // Push
  const res = await RemoteEngine[sync.engine]
    .push(
      gitDDB.workingDir,
      syncOptions,
      sync.remoteName,
      gitDDB.defaultBranch,
      gitDDB.defaultBranch,
      gitDDB.logger
    )
    .catch(err => err);

  if (res instanceof Error) {
    const error = wrappingRemoteEngineError(res);
    if (error instanceof RemoteErr.UnfetchedCommitExistsError) {
      if (localCommitOid === remoteCommitOid) {
        return { action: 'nop' };
      }
    }
    throw error;
  }
  // NodeGit does not throw UnfetchedCommitExistsError when localCommitOid equals remoteCommitOid,
  // So check it again here.
  if (localCommitOid === remoteCommitOid) {
    return { action: 'nop' };
  }

  let remoteChanges: ChangedFile[] | undefined;
  if (afterMerge) {
    remoteChanges = undefined;
  }
  else {
    remoteChanges = await getChanges(
      gitDDB.workingDir,
      remoteCommitOid,
      headCommitOid,
      gitDDB.jsonExt
    );
  }

  const syncResult: SyncResultPush = {
    action: 'push',
    changes: {
      remote: remoteChanges!,
    },
  };

  // Get a list of commits which will be pushed to remote.
  let commitListRemote: NormalizedCommit[] | undefined;
  if (syncOptions.includeCommits) {
    commitListRemote = await getCommitLogs(
      gitDDB.workingDir,
      headCommitOid,
      baseCommitOid,
      remoteCommitOid
    );
    syncResult.commits = {
      remote: commitListRemote,
    };
  }

  return syncResult;
}
