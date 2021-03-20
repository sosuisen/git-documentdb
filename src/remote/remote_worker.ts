/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of gitDDB source tree.
 */
import nodePath from 'path';
import nodegit from '@sosuisen/nodegit';
import fs from 'fs-extra';
import { ConsoleStyle } from '../utils';
import {
  CannotPushBecauseUnfetchedCommitExistsError,
  NoMergeBaseFoundError,
  RepositoryNotOpenError,
  SyncWorkerFetchError,
} from '../error';
import { AbstractDocumentDB } from '../types_gitddb';
import { IRemoteAccess, SyncResult } from '../types';

/**
 * git push
 */
async function push (
  gitDDB: AbstractDocumentDB,
  remoteAccess: IRemoteAccess,
  taskId: string
) {
  const repos = gitDDB.repository();
  if (repos === undefined) return;
  const remote: nodegit.Remote = await repos.getRemote('origin');
  await remote
    .push(['refs/heads/main:refs/heads/main'], {
      callbacks: remoteAccess.callbacks,
    })
    .catch((err: Error) => {
      gitDDB.logger.debug(err);
      if (
        err.message.startsWith(
          'cannot push because a reference that you are trying to update on the remote contains commits that are not present locally'
        )
      ) {
        throw new CannotPushBecauseUnfetchedCommitExistsError();
      }
      throw err;
    });
  gitDDB.logger.debug(ConsoleStyle.BgWhite().FgBlack().tag()`sync_worker: May pushed.`);
  await validatePushResult(gitDDB, remoteAccess, taskId);
}

/**
 * Remote.push does not return valid error in race condition,
 * so check is needed.
 */
async function validatePushResult (
  gitDDB: AbstractDocumentDB,
  remoteAccess: IRemoteAccess,
  taskId: string
) {
  const repos = gitDDB.repository();
  if (repos === undefined) return;
  gitDDB.logger.debug(
    ConsoleStyle.BgWhite().FgBlack().tag()`sync_worker: Check if pushed.`
  );
  await repos
    .fetch('origin', {
      callbacks: remoteAccess.callbacks,
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
    throw new CannotPushBecauseUnfetchedCommitExistsError();
  }
}

export async function push_worker (
  gitDDB: AbstractDocumentDB,
  remoteAccess: IRemoteAccess,
  taskId: string
): Promise<SyncResult> {
  await push(gitDDB, remoteAccess, taskId);

  return 'push';
}

// eslint-disable-next-line complexity
export async function sync_worker (
  gitDDB: AbstractDocumentDB,
  remoteAccess: IRemoteAccess,
  taskId: string
): Promise<SyncResult> {
  const repos = gitDDB.repository();
  if (repos === undefined) {
    throw new RepositoryNotOpenError();
  }

  gitDDB.logger.debug(
    ConsoleStyle.BgWhite().FgBlack().tag()`sync_worker: fetch: ${remoteAccess.remoteURL()}`
  );
  // Fetch
  await repos
    .fetch('origin', {
      callbacks: remoteAccess.callbacks,
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
  gitDDB.logger.debug(
    ConsoleStyle.BgWhite().FgBlack().tag()`sync_worker: ${JSON.stringify(distance)}`
  );
  // ahead: 0, behind 0 => Nothing to do: If local does not commit and remote does not commit
  // ahead: 0, behind 1 => Fast-forward merge : If local does not commit and remote pushed
  // ahead: 1, behind 0 => Push : If local committed and remote does not commit
  // ahead: 1, behind 1 => Resolve conflict and push: If local committed and remote pushed

  let conflictedIndex: nodegit.Index | undefined;
  let commitOid: nodegit.Oid | undefined;
  if (distance.ahead === 0 && distance.behind === 0) {
    gitDDB.logger.debug(ConsoleStyle.BgWhite().FgBlack().tag()`sync_worker: nop`);
    return 'nop';
  }
  else if (distance.ahead === 0 && distance.behind > 0) {
    commitOid = await repos
      .mergeBranches(gitDDB.defaultBranch, `origin/${gitDDB.defaultBranch}`)
      .catch((res: nodegit.Index) => {
        /* returns conflicted index */ conflictedIndex = res;
        return undefined;
      });
  }
  else if (distance.ahead > 0 && distance.behind > 0) {
    commitOid = await repos
      .mergeBranches(gitDDB.defaultBranch, `origin/${gitDDB.defaultBranch}`)
      .catch((res: nodegit.Index) => {
        // Exception locks files. Try cleanup
        repos.cleanup();

        // May throw 'Error: no merge base found'
        if (res instanceof Error) {
          if (res.message.startsWith('no merge base found')) {
            if (remoteAccess.options().behavior_for_no_merge_base === 'nop') {
              throw new NoMergeBaseFoundError();
            }
            else if (remoteAccess.options().behavior_for_no_merge_base === 'theirs') {
              // remote local repository and clone remote repository
            }
            else if (remoteAccess.options().behavior_for_no_merge_base === 'ours') {
              // git merge -s ours
              // TODO:
              throw new Error(
                'ours option for behavior_for_no_merge_base is not implemented currently.'
              );
            }
          }
          throw res;
        }
        /* returns conflicted index */ conflictedIndex = res;
        return undefined;
      });
  }
  else if (distance.ahead > 0 && distance.behind === 0) {
    // Push
    await push(gitDDB, remoteAccess, taskId);

    return 'push';
  }

  /**
   * NOTE:
   * This _index from Merge.merge or Merge.commit is in-memory only.
   * It cannot be used for commit operations.
   * Create a new copy of index for commit.
   * Repository#refreshIndex() grabs copy of latest index
   * See https://github.com/nodegit/nodegit/blob/master/examples/merge-with-conflicts.js
   */
  // const _index = await repos.refreshIndex();

  if (conflictedIndex === undefined) {
    // Conflict has not been occurred.
    // Exec fast-forward or normal merge.

    // When a local file is removed and the same remote file is removed,
    // they cannot be merged by fast-forward. They are merged as usual.

    const distance_again = ((await nodegit.Graph.aheadBehind(
      repos,
      (await repos.getHeadCommit()).id(),
      (await repos.getReferenceCommit('refs/remotes/origin/main')).id()
    )) as unknown) as { ahead: number; behind: number };
    gitDDB.logger.debug(
      ConsoleStyle.BgWhite()
        .FgBlack()
        .tag()`sync_worker: check distance again ${JSON.stringify(distance_again)}`
    );
    if (distance_again.ahead === 0 && distance_again.behind === 0) {
      gitDDB.logger.debug(
        ConsoleStyle.BgWhite().FgBlack().tag()`sync_worker: fast-forward merge`
      );
      return 'fast-forward merge';
    }
    else if (distance_again.ahead > 0 && distance_again.behind === 0) {
      // It is occurred when
      // - a local file is changed and another remote file is changed.
      // - a local file is removed and the same remote file is removed.
      // Normal merge. Need push
      const commit = await repos.getCommit(commitOid!);
      const commitMessage = 'merge';
      // Change commit message
      await commit.amend(
        'HEAD',
        remoteAccess.author,
        remoteAccess.committer,
        commit.messageEncoding(),
        commitMessage,
        await commit.getTree()
      );
      // Push
      await push(gitDDB, remoteAccess, taskId);

      gitDDB.logger.debug(
        ConsoleStyle.BgWhite().FgBlack().tag()`sync_worker: merge and push`
      );
      return 'merge and push';
    }

    /**
     * Remote is advanced while merging
     */
    throw new Error('Remote is advanced while merging.');
  }
  else {
    /**
     * NOTE:
     * This _index from Repository.mergeBranch is in-memory only.
     * It cannot be used for commit operations.
     * Create a new copy of index for commit.
     * Repository#refreshIndex() grabs copy of latest index
     * See https://github.com/nodegit/nodegit/blob/master/examples/merge-with-conflicts.js
     */
    const _index = await repos.refreshIndex();
    /**
     * conflict
     * https://git-scm.com/docs/git-merge#_true_merge
     * The index file records up to three versions:
     * stage 1 stores the version from the common ancestor (Index.STAGE.ANCESTOR),
     * stage 2 from HEAD (Index.STAGE.OURS),
     * and stage 3 from MERGE_HEAD (Index.STAGE.THEIRS).
     *
     * In libgit2, non-conflicted file is distinguished by using 0 (Index.STAGE.NORMAL)
     */
    let commitMessage = '';
    const conflicts: { [key: string]: { [keys: string]: boolean } } = {};

    conflictedIndex.entries().forEach((entry: nodegit.IndexEntry) => {
      const stage = nodegit.Index.entryStage(entry);
      gitDDB.logger.debug(
        ConsoleStyle.BgWhite().FgBlack().tag()`sync_worker: ${stage} : ${entry.path}`
      );

      // entries() returns all files in stage 0, 1, 2 and 3.
      if (stage !== 0) {
        // is conflict
        conflicts[entry.path] ??= {};
        conflicts[entry.path][stage] = true;
      }
    });
    Object.keys(conflicts).forEach(async path => {
      // Conflict is resolved by using OURS.
      if (conflicts[path][2]) {
        // If 'ours' file is added or modified in a conflict, the file is sure to exist in stage 2.
        await _index.addByPath(path);
        if (commitMessage !== '') {
          commitMessage += ', ';
        }
        commitMessage += `put-overwrite: ${path}`;
      }
      else if (conflicts[path][1]) {
        // If 'ours' file is removed in a conflict, the file is sure to exist in stage 1 and not to exist in stage 2.
        await _index.removeByPath(path);
        await fs.remove(nodePath.resolve(repos.workdir(), path)).catch(() => {
          // TODO
        });
        if (commitMessage !== '') {
          commitMessage += ', ';
        }
        commitMessage += `remove-overwrite: ${path}`;
      }
    });
    _index.conflictCleanup();
    gitDDB.logger.debug(
      ConsoleStyle.BgWhite().FgBlack().tag()`sync_worker: overwritten by ours`
    );

    await _index.write();

    const treeOid: nodegit.Oid | void = await _index.writeTree();

    const overwriteCommitOid: nodegit.Oid = await repos.createCommit(
      'HEAD',
      remoteAccess.author,
      remoteAccess.committer,
      commitMessage,
      treeOid,
      [await repos.getHeadCommit(), remoteCommit]
    );
    repos.stateCleanup();
    // gitDDB.logger.debug('committed');
    await repos.getCommit(overwriteCommitOid);

    const opt = new nodegit.CheckoutOptions();
    opt.checkoutStrategy = nodegit.Checkout.STRATEGY.FORCE;
    await nodegit.Checkout.head(repos, opt);

    // Push
    await push(gitDDB, remoteAccess, taskId);

    gitDDB.logger.debug(
      ConsoleStyle.BgWhite()
        .FgBlack()
        .tag()`sync_worker${taskId}: resolve conflicts and push`
    );

    return 'resolve conflicts and push';
  }
}