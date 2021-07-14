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
import { ChangedFile, NormalizedCommit, SyncResultPush, TaskMetadata } from '../types';
import { SyncInterface } from '../types_sync';
import { getChanges, getCommitLogs } from './worker_utils';
import { Remote } from './remote';

/**
 * Push and get changes
 *
 * @throws {@link Remote.Err.UnfetchedCommitExistsError} (from push() and validatePushResult())
 * @throws {@link Remote.Err.GitFetchError} (from validatePushResult())
 * @throws {@link Err.InvalidJsonObjectError} (from getChanges())
 */
export async function pushWorker (
  gitDDB: GitDDBInterface,
  sync: SyncInterface,
  taskMetadata: TaskMetadata,
  skipStartEvent = false,
  skipGetChanges = false
): Promise<SyncResultPush> {
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

  let remoteCommitOid = await git
    .resolveRef({ fs, dir: gitDDB.workingDir, ref: 'refs/remotes/origin/main' })
    .catch(() => undefined);

  if (headCommit.commit.parent.length === 2) {
    // HEAD is a merge commit.
    localCommitOid = headCommit.commit.parent[0];
  }
  else {
    localCommitOid = headCommitOid;
  }

  let baseCommitOid: string;

  if (remoteCommitOid === undefined) {
    // This is the first push in this repository.
    // Get the first commit.
    const logs = await git.log({ fs, dir: gitDDB.workingDir });
    baseCommitOid = logs[logs.length - 1].oid;
    remoteCommitOid = baseCommitOid;
  }
  else {
    [baseCommitOid] = await git.findMergeBase({
      fs,
      dir: gitDDB.workingDir,
      oids: [localCommitOid, remoteCommitOid],
    });
  }

  // Push
  await Remote.push(gitDDB.workingDir, sync.options);
  let remoteChanges: ChangedFile[] | undefined;
  if (skipGetChanges) {
    remoteChanges = undefined;
  }
  else {
    remoteChanges = await getChanges(gitDDB.workingDir, remoteCommitOid, headCommitOid);
  }

  const syncResult: SyncResultPush = {
    action: 'push',
    changes: {
      remote: remoteChanges!,
    },
  };

  // Get a list of commits which will be pushed to remote.
  let commitListRemote: NormalizedCommit[] | undefined;
  if (sync.options.includeCommits) {
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
