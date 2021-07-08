/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of gitDDB source tree.
 */

import nodegit from '@sosuisen/nodegit';
import git from 'isomorphic-git';
import fs from 'fs-extra';
import { CONSOLE_STYLE } from '../utils';
import { Err } from '../error';
import { GitDDBInterface } from '../types_gitddb';
import { NormalizedCommit, SyncResultPush, TaskMetadata } from '../types';
import { SyncInterface } from '../types_sync';
import { calcDistance, getChanges, getCommitLogs } from './worker_utils';

/**
 * git push
 *
 * @throws {@link Err.UnfetchedCommitExistsError} (from this and validatePushResult())
 * @throws {@link Err.SyncWorkerFetchError} (from validatePushResult())
 * @throws {@link Err.GitPushError} (from NodeGit.Remote.push())
 */
async function push (gitDDB: GitDDBInterface, sync: SyncInterface): Promise<void> {
  const repos = gitDDB.repository()!;
  const remote: nodegit.Remote = await repos.getRemote('origin');
  await remote
    .push(['refs/heads/main:refs/heads/main'], {
      callbacks: sync.credentialCallbacks,
    })
    .catch((err: Error) => {
      if (
        err.message.startsWith(
          'cannot push because a reference that you are trying to update on the remote contains commits that are not present locally'
        )
      ) {
        throw new Err.UnfetchedCommitExistsError();
      }
      throw new Err.GitPushError(err.message);
    });
  // gitDDB.logger.debug(CONSOLE_STYLE.BgWhite().FgBlack().tag()`sync_worker: May pushed.`);
  await validatePushResult(gitDDB, sync);
}

/**
 * NodeGit.Remote.push does not return valid error in race condition,
 * so check is needed.
 *
 * @throws {@link Err.SyncWorkerFetchError}
 * @throws {@link Err.UnfetchedCommitExistsError}
 */
async function validatePushResult (
  gitDDB: GitDDBInterface,
  sync: SyncInterface
): Promise<void> {
  const repos = gitDDB.repository()!;
  await repos
    .fetch('origin', {
      callbacks: sync.credentialCallbacks,
    })
    .catch(err => {
      throw new Err.SyncWorkerFetchError(err.message);
    });

  const localCommitOid = await git.resolveRef({
    fs,
    dir: gitDDB.workingDir,
    ref: 'HEAD',
  });
  const remoteCommitOid = await git.resolveRef({
    fs,
    dir: gitDDB.workingDir,
    ref: 'refs/remotes/origin/main',
  });
  const distance = await calcDistance(gitDDB.workingDir, localCommitOid, remoteCommitOid);

  if (distance.behind === undefined) {
    // This will not be occurred.
    gitDDB.logger.debug(
      CONSOLE_STYLE.bgWhite()
        .fgBlack()
        .tag()`sync_worker: push failed: cannot get merge base}`
    );
    throw new Err.NoMergeBaseFoundError();
  }
  else if (distance.behind > 0) {
    gitDDB.logger.debug(
      CONSOLE_STYLE.bgWhite()
        .fgBlack()
        .tag()`sync_worker: push failed: ahead ${distance.ahead} behind ${distance.behind}`
    );

    throw new Err.UnfetchedCommitExistsError();
  }
}

/**
 * Push and get changes
 *
 * @throws {@link Err.RepositoryNotOpenError}
 * @throws {@link Err.UnfetchedCommitExistsError} (from push() and validatePushResult())
 * @throws {@link Err.SyncWorkerFetchError} (from validatePushResult())
 * @throws {@link Err.InvalidJsonObjectError} (from getChanges())
 * @throws Error (Other errors from NodeGit.Remote.push())
 */
export async function pushWorker (
  gitDDB: GitDDBInterface,
  sync: SyncInterface,
  taskMetadata: TaskMetadata,
  skipStartEvent = false
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
  await push(gitDDB, sync);
  const remoteChanges = await getChanges(gitDDB.workingDir, remoteCommitOid, headCommitOid);

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
