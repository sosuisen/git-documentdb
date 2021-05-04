/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of gitDDB source tree.
 */

import nodegit from '@sosuisen/nodegit';
import { ConsoleStyle } from '../utils';
import {
  GitPushError,
  RepositoryNotOpenError,
  SyncWorkerFetchError,
  UnfetchedCommitExistsError,
} from '../error';
import { IDocumentDB } from '../types_gitddb';
import { CommitInfo, SyncResultPush } from '../types';
import { ISync } from '../types_sync';
import { getChanges, getCommitLogs } from './worker_utils';

/**
 * git push
 *
 * @throws {@link UnfetchedCommitExistsError} (from this and validatePushResult())
 * @throws {@link SyncWorkerFetchError} (from validatePushResult())
 * @throws {@link GitPushError} (from NodeGit.Remote.push())
 */
async function push (
  gitDDB: IDocumentDB,
  sync: ISync,
  taskId: string
): Promise<nodegit.Commit | undefined> {
  const repos = gitDDB.repository();
  if (repos === undefined) return;
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
  const headCommit = await validatePushResult(gitDDB, sync, taskId);
  return headCommit;
}

/**
 * NodeGit.Remote.push does not return valid error in race condition,
 * so check is needed.
 *
 * @throws {@link SyncWorkerFetchError}
 * @throws {@link UnfetchedCommitExistsError}
 */
async function validatePushResult (
  gitDDB: IDocumentDB,
  sync: ISync,
  taskId: string
): Promise<nodegit.Commit | undefined> {
  const repos = gitDDB.repository();
  if (repos === undefined) return undefined;
  /*
  gitDDB.logger.debug(
    ConsoleStyle.BgWhite().FgBlack().tag()`sync_worker: Check if pushed.`
  );
  */
  await repos
    .fetch('origin', {
      callbacks: sync.credential_callbacks,
    })
    .catch(err => {
      throw new SyncWorkerFetchError(err.message);
    });

  const localCommit = await repos.getHeadCommit();
  const remoteCommit = await repos.getReferenceCommit('refs/remotes/origin/main');
  // @types/nodegit is wrong
  const distance = ((await nodegit.Graph.aheadBehind(
    repos,
    localCommit.id(),
    remoteCommit.id()
  )) as unknown) as { ahead: number; behind: number };

  if (distance.ahead !== 0 || distance.behind !== 0) {
    gitDDB.logger.debug(
      ConsoleStyle.BgWhite()
        .FgBlack()
        .tag()`sync_worker: push failed: ahead ${distance.ahead} behind ${distance.behind}`
    );

    throw new UnfetchedCommitExistsError();
  }

  return localCommit;
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
  taskId: string,
  skipStartEvent?: boolean
): Promise<SyncResultPush> {
  const repos = gitDDB.repository();
  if (repos === undefined) {
    throw new RepositoryNotOpenError();
  }

  skipStartEvent ??= false;
  if (!skipStartEvent) {
    sync.eventHandlers.start.forEach(func => {
      func(taskId, sync.currentRetries());
    });
  }

  const headCommit = await gitDDB.repository()!.getHeadCommit();

  // Get the oldest commit that has not been pushed yet.
  let oldestCommit = await gitDDB
    .repository()!
    .getReferenceCommit('refs/remotes/origin/main')
    .catch(() => undefined);

  if (oldestCommit === undefined) {
    // This is the first push in this repository.
    // Get the first commit.
    const revwalk = nodegit.Revwalk.create(gitDDB.repository()!);
    revwalk.push(headCommit.id());
    revwalk.sorting(nodegit.Revwalk.SORT.REVERSE);
    const commitList: nodegit.Oid[] = await revwalk.fastWalk(1);
    oldestCommit = await gitDDB.repository()!.getCommit(commitList[0]);
  }

  // Get a list of commits which will be pushed to remote.
  let commitListRemote: CommitInfo[] | undefined;
  if (sync.options().include_commits) {
    commitListRemote = await getCommitLogs(oldestCommit, headCommit);
  }

  // Push
  const headCommitAfterPush = await push(gitDDB, sync, taskId);

  // Get changes
  const diff = await nodegit.Diff.treeToTree(
    gitDDB.repository()!,
    await oldestCommit.getTree(),
    await headCommitAfterPush!.getTree()
  );
  const remoteChanges = await getChanges(gitDDB, diff);
  const syncResult: SyncResultPush = {
    action: 'push',
    changes: {
      remote: remoteChanges!,
    },
  };

  if (commitListRemote) {
    syncResult.commits = {
      remote: commitListRemote,
    };
  }

  return syncResult;
}
