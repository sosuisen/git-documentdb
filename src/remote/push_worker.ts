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
import { ConsoleStyle } from '../utils';
import {
  GitPushError,
  RepositoryNotOpenError,
  SyncWorkerFetchError,
  UnfetchedCommitExistsError,
} from '../error';
import { IDocumentDB } from '../types_gitddb';
import { NormalizedCommit, SyncResultPush, TaskMetadata } from '../types';
import { ISync } from '../types_sync';
import { calcDistance, getChanges, getCommitLogs } from './worker_utils';

/**
 * git push
 *
 * @throws {@link UnfetchedCommitExistsError} (from this and validatePushResult())
 * @throws {@link SyncWorkerFetchError} (from validatePushResult())
 * @throws {@link GitPushError} (from NodeGit.Remote.push())
 */
async function push (gitDDB: IDocumentDB, sync: ISync): Promise<string> {
  const repos = gitDDB.repository()!;
  const remote: nodegit.Remote = await repos.getRemote('origin');
  await remote
    .push(['refs/heads/main:refs/heads/main'], {
      callbacks: sync.credential_callbacks,
    })
    .catch((err: Error) => {
      if (
        err.message.startsWith(
          'cannot push because a reference that you are trying to update on the remote contains commits that are not present locally'
        )
      ) {
        throw new UnfetchedCommitExistsError();
      }
      throw new GitPushError(err.message);
    });
  // gitDDB.logger.debug(ConsoleStyle.BgWhite().FgBlack().tag()`sync_worker: May pushed.`);
  const headCommit = await validatePushResult(gitDDB, sync);
  return headCommit;
}

/**
 * NodeGit.Remote.push does not return valid error in race condition,
 * so check is needed.
 *
 * @throws {@link SyncWorkerFetchError}
 * @throws {@link UnfetchedCommitExistsError}
 */
async function validatePushResult (gitDDB: IDocumentDB, sync: ISync): Promise<string> {
  const repos = gitDDB.repository()!;
  await repos
    .fetch('origin', {
      callbacks: sync.credential_callbacks,
    })
    .catch(err => {
      throw new SyncWorkerFetchError(err.message);
    });

  const localCommitOid = await git.resolveRef({
    fs,
    dir: gitDDB.workingDir(),
    ref: 'HEAD',
  });
  const remoteCommitOid = await git.resolveRef({
    fs,
    dir: gitDDB.workingDir(),
    ref: 'refs/remotes/origin/main',
  });
  const distance = await calcDistance(gitDDB.workingDir(), localCommitOid, remoteCommitOid);

  if (distance.behind > 0) {
    gitDDB
      .getLogger()
      .debug(
        ConsoleStyle.BgWhite()
          .FgBlack()
          .tag()`sync_worker: push failed: ahead ${distance.ahead} behind ${distance.behind}`
      );

    throw new UnfetchedCommitExistsError();
  }
  return localCommitOid;
  /*
  const localCommit = await repos.getHeadCommit();
  const remoteCommit = await repos.getReferenceCommit('refs/remotes/origin/main');
  // @types/nodegit is wrong
  const distance = ((await nodegit.Graph.aheadBehind(
    repos,
    localCommit.id(),
    remoteCommit.id()
  )) as unknown) as { ahead: number; behind: number };

  if (distance.ahead !== 0 || distance.behind !== 0) {
    gitDDB
      .getLogger()
      .debug(
        ConsoleStyle.BgWhite()
          .FgBlack()
          .tag()`sync_worker: push failed: ahead ${distance.ahead} behind ${distance.behind}`
      );

    throw new UnfetchedCommitExistsError();
  }
  */
}

/**
 * Push and get changes
 *
 * @throws {@link RepositoryNotOpenError}
 * @throws {@link UnfetchedCommitExistsError} (from push() and validatePushResult())
 * @throws {@link SyncWorkerFetchError} (from validatePushResult())
 * @throws {@link InvalidJsonObjectError} (from getChanges())
 * @throws Error (Other errors from NodeGit.Remote.push())
 */
export async function push_worker (
  gitDDB: IDocumentDB,
  sync: ISync,
  taskMetadata: TaskMetadata,
  skipStartEvent = false
): Promise<SyncResultPush> {
  const repos = gitDDB.repository();
  if (repos === undefined) {
    throw new RepositoryNotOpenError();
  }

  if (!skipStartEvent) {
    sync.eventHandlers.start.forEach(func => {
      func(taskMetadata, sync.currentRetries());
    });
  }

  // Get the oldest commit that has not been pushed yet.
  let oldestCommit = await git
    .resolveRef({ fs, dir: gitDDB.workingDir(), ref: 'refs/remotes/origin/main' })
    .catch(() => undefined);

  if (oldestCommit === undefined) {
    // This is the first push in this repository.
    // Get the first commit.
    const logs = await git.log({ fs, dir: gitDDB.workingDir() });
    oldestCommit = logs[logs.length - 1].oid;
  }

  // Push
  const headCommit = await push(gitDDB, sync);

  const remoteChanges = await getChanges(gitDDB.workingDir(), oldestCommit, headCommit);

  const syncResult: SyncResultPush = {
    action: 'push',
    changes: {
      remote: remoteChanges!,
    },
  };

  // Get a list of commits which will be pushed to remote.
  let commitListRemote: NormalizedCommit[] | undefined;
  if (sync.options().include_commits) {
    commitListRemote = await getCommitLogs(gitDDB.workingDir(), oldestCommit, headCommit);
    syncResult.commits = {
      remote: commitListRemote,
    };
  }

  return syncResult;
}
