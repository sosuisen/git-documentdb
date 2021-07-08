/* eslint-disable no-await-in-loop */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of gitDDB source tree.
 */

import nodePath from 'path';
import nodegit from '@sosuisen/nodegit';
import git from 'isomorphic-git';
import fs from 'fs-extra';
import { JSON_EXT, SHORT_SHA_LENGTH } from '../const';
import { CONSOLE_STYLE, normalizeCommit, utf8decode } from '../utils';
import { Err } from '../error';
import { GitDDBInterface } from '../types_gitddb';
import {
  AcceptedConflict,
  NormalizedCommit,
  SyncResult,
  SyncResultMergeAndPush,
  SyncResultMergeAndPushError,
  SyncResultResolveConflictsAndPush,
  SyncResultResolveConflictsAndPushError,
  TaskMetadata,
} from '../types';
import { SyncInterface } from '../types_sync';
import { pushWorker } from './push_worker';
import { calcDistance, getChanges, getCommitLogs, writeBlobToFile } from './worker_utils';
import { threeWayMerge } from './3way_merge';

/**
 * git fetch
 *
 * @throws {@link Err.SyncWorkerFetchError}
 */
async function fetch (gitDDB: GitDDBInterface, sync: SyncInterface) {
  gitDDB.logger.debug(
    CONSOLE_STYLE.bgWhite().fgBlack().tag()`sync_worker: fetch: ${sync.remoteURL}`
  );
  await gitDDB
    .repository()!
    .fetch('origin', {
      callbacks: sync.credentialCallbacks,
    })
    .catch(err => {
      throw new Err.SyncWorkerFetchError(err.message);
    });
}

/**
 * sync_worker
 *
 * @throws {@link Err.RepositoryNotOpenError} (from this and push_worker())
 * @throws {@link Err.SyncWorkerFetchError} (from fetch() and push_worker())
 * @throws {@link Err.NoMergeBaseFoundError}
 * @throws {@link Err.ThreeWayMergeError}
 * @throws {@link Err.CannotDeleteDataError}
 * @throws {@link Err.InvalidJsonObjectError} (from getChanges())
 * @throws {@link Err.UnfetchedCommitExistsError} (from push_worker())
 * @throws {@link Err.InvalidJsonObjectError} (from push_worker())
 * @throws {@link Err.GitPushError} (from push_worker())
 * @throws {@link Err.GitMergeBranchError} (from NodeGit.repos.mergeBranches())
 *
 * @internal
 */
// eslint-disable-next-line complexity
export async function syncWorker (
  gitDDB: GitDDBInterface,
  sync: SyncInterface,
  taskMetadata: TaskMetadata
): Promise<SyncResult> {
  const repos = gitDDB.repository();
  if (repos === undefined) {
    throw new Err.RepositoryNotOpenError();
  }
  sync.eventHandlers.start.forEach(listener => {
    listener.func(
      { ...taskMetadata, collectionPath: listener.collectionPath },
      sync.currentRetries()
    );
  });

  /**
   * Fetch
   */
  await fetch(gitDDB, sync);

  /**
   * Calc distance
   */
  const oldCommitOid = await git.resolveRef({
    fs,
    dir: gitDDB.workingDir,
    ref: 'HEAD',
  });
  const oldRemoteCommitOid = await git.resolveRef({
    fs,
    dir: gitDDB.workingDir,
    ref: 'refs/remotes/origin/main',
  });
  const distance = await calcDistance(gitDDB.workingDir, oldCommitOid, oldRemoteCommitOid);
  // ahead: 0, behind 0 => Nothing to do: Local does not have new commits. Remote has not pushed new commits.
  // ahead: 0, behind 1 => Fast-forward merge : Local does not have new commits. Remote has pushed new commits.
  // ahead: 1, behind 0 => Push : Local has new commits. Remote has not pushed new commits.
  // ahead: 1, behind 1 => Merge, may resolve conflict and push: Local has new commits. Remote has pushed new commits.

  let conflictedIndex: nodegit.Index | undefined;
  let newCommitOid: nodegit.Oid | string | undefined;
  if (distance.ahead === 0 && distance.behind === 0) {
    return { action: 'nop' };
  }
  else if (distance.ahead === 0 && distance.behind > 0) {
    newCommitOid = await repos
      .mergeBranches(gitDDB.defaultBranch, `origin/${gitDDB.defaultBranch}`);
//      .catch((res: nodegit.Index) => {
//        /* returns conflicted index */ conflictedIndex = res;
//        return undefined;
//      });
  }
  else if (distance.ahead > 0 && distance.behind > 0) {
    newCommitOid = await repos
      .mergeBranches(gitDDB.defaultBranch, `origin/${gitDDB.defaultBranch}`)
      .catch((res: nodegit.Index) => {
        // Exception locks files. Try cleanup
        repos.cleanup();

        if (res instanceof Error) {
          if (res.message.startsWith('no merge base found')) {
            throw new Err.NoMergeBaseFoundError();
          }
          throw new Err.GitMergeBranchError(res.message);
        }
        /* returns conflicted index */ conflictedIndex = res;
        return undefined;
      });
  }
  else if (distance.ahead > 0 && distance.behind === 0) {
    // Push
    return await pushWorker(gitDDB, sync, taskMetadata, true).catch(err => {
      throw err;
    });
  }

  if (newCommitOid instanceof nodegit.Oid) {
    newCommitOid = newCommitOid.tostrS();
  }

  if (conflictedIndex === undefined) {
    // Conflict has not been occurred.
    // Exec fast-forward or normal merge.

    // When a local file is removed and the same remote file is removed,
    // they cannot be merged by fast-forward. They are merged as usual.
    const distanceAgain = await calcDistance(
      gitDDB.workingDir,
      newCommitOid!,
      await git.resolveRef({
        fs,
        dir: gitDDB.workingDir,
        ref: 'refs/remotes/origin/main',
      })
    );

    if (distanceAgain.ahead === 0) {
      const localChanges = await getChanges(gitDDB.workingDir, oldCommitOid, newCommitOid!);

      const syncResultFastForwardMerge: SyncResult = {
        action: 'fast-forward merge',
        changes: {
          local: localChanges,
        },
      };

      if (sync.options.includeCommits) {
        // Get list of commits which has been merged to local
        const commitsFromRemote = await getCommitLogs(
          gitDDB.workingDir,
          oldRemoteCommitOid,
          oldCommitOid
        );
        syncResultFastForwardMerge.commits = {
          local: commitsFromRemote,
        };
      }
      return syncResultFastForwardMerge;
    }

    // distance_again.ahead > 0

    // This case is occurred when not fast-forward.
    // - insert/update a remote file, and insert/update another local file
    // - insert/update a remote file, and insert/update the same local file with the same contents
    // - insert/update a remote file, and remove another local file
    // - remove a remote file, and insert/update another local file
    // - remove a remote file, and remove the same local file

    // Compare trees before and after merge
    const currentIndex = await repos.refreshIndex();

    const localChanges = await getChanges(gitDDB.workingDir, oldCommitOid, newCommitOid!);
    /**
     * Repository.mergeBranches does not handle updating and deleting file.
     * So a file updated/deleted on remote side is not applied to
     * on both local filesystem and local index.
     * Change them by hand.
     */
    // Cannot use await in forEach. Use for-of.
    for (const change of localChanges) {
      if (change.operation === 'delete') {
        const filename = change.old._id + JSON_EXT;
        const path = nodePath.resolve(repos.workdir(), filename);
        await fs.remove(path).catch(() => {
          throw new Err.CannotDeleteDataError();
        });
        await currentIndex.removeByPath(filename);
      }
      else if (change.operation === 'update') {
        const filename = change.old._id + JSON_EXT;
        const { blob } = await git.readBlob({
          fs,
          dir: gitDDB.workingDir,
          oid: change.old._id,
        });
        const data = utf8decode(blob);
        await writeBlobToFile(gitDDB, filename, data);
        await currentIndex.addByPath(filename);
      }
    }

    await currentIndex.write();

    /**
     * Amend (move HEAD and commit again)
     */
    const newCommit = await git.readCommit({
      fs,
      dir: gitDDB.workingDir,
      oid: newCommitOid!,
    });
    const mergeParents = newCommit.commit.parent;
    const amendedNewCommitOid = await git.commit({
      fs,
      dir: gitDDB.workingDir,
      author: gitDDB.author,
      committer: gitDDB.committer,
      message: 'merge',
      parent: mergeParents,
    });

    let localCommits: NormalizedCommit[] | undefined;

    // Get list of commits which has been added to local
    if (sync.options.includeCommits) {
      const amendedNewCommit = await git.readCommit({
        fs,
        dir: gitDDB.workingDir,
        oid: amendedNewCommitOid,
      });

      const [baseCommitOid] = await git.findMergeBase({
        fs,
        dir: gitDDB.workingDir,
        oids: [oldCommitOid, oldRemoteCommitOid],
      });

      const commitsFromRemote = await getCommitLogs(
        gitDDB.workingDir,
        oldRemoteCommitOid,
        baseCommitOid
      );
      // Add merge commit
      localCommits = [...commitsFromRemote, normalizeCommit(amendedNewCommit)];
    }
    // Need push because it is merged normally.
    const syncResultPush = await pushWorker(gitDDB, sync, taskMetadata, true).catch(
      (err: Error) => {
        return err;
      }
    );

    if (syncResultPush instanceof Error) {
      const syncResultMergeAndPushError: SyncResultMergeAndPushError = {
        action: 'merge and push error',
        changes: {
          local: localChanges,
        },
        error: syncResultPush,
      };
      if (localCommits) {
        syncResultMergeAndPushError.commits = {
          local: localCommits,
        };
      }
      return syncResultMergeAndPushError;
    }

    const syncResultMergeAndPush: SyncResultMergeAndPush = {
      action: 'merge and push',
      changes: {
        local: localChanges,
        remote: syncResultPush.changes.remote,
      },
    };
    if (localCommits) {
      syncResultMergeAndPush.commits = {
        local: localCommits,
        remote: syncResultPush.commits!.remote,
      };
    }

    return syncResultMergeAndPush;
  }

  /**
   * Conflict
   * https://git-scm.com/docs/git-merge#_true_merge
   */

  const allFileObj: { [key: string]: boolean } = {};
  conflictedIndex.entries().forEach((entry: nodegit.IndexEntry) => {
    const stage = nodegit.Index.entryStage(entry);
    gitDDB.logger.debug(
      CONSOLE_STYLE.bgWhite().fgBlack().tag()`sync_worker: ${stage} : ${entry.path}`
    );

    // entries() returns all files in stage 0, 1, 2 and 3.
    // A file may exist in multiple stages.
    // Add once per file to allFileObj.
    allFileObj[entry.path] = true;
  });

  /**
   * NOTE:
   * Index from Repository.mergeBranch, Merge.merge or Merge.commit is in-memory only.
   * It cannot be used for commit operations.
   * Create a new copy of index for commit.
   *  Repository#refreshIndex() grabs copy of latest index
   * See https://github.com/nodegit/nodegit/blob/master/examples/merge-with-conflicts.js
   */
  const resolvedIndex = await repos.refreshIndex();

  const acceptedConflicts: AcceptedConflict[] = [];

  // Try to check conflict for all files in conflicted index.
  // console.log('3-way merge..');
  const [mergeBaseCommitOid] = await git.findMergeBase({
    fs,
    dir: gitDDB.workingDir,
    oids: [oldCommitOid, oldRemoteCommitOid],
  });

  const resolvers: Promise<void>[] = [];
  const strategy = sync.options.conflictResolutionStrategy;
  // eslint-disable-next-line complexity
  Object.keys(allFileObj).forEach(path => {
    resolvers.push(
      threeWayMerge(
        gitDDB,
        sync,
        strategy!,
        resolvedIndex,
        path,
        mergeBaseCommitOid,
        oldCommitOid,
        oldRemoteCommitOid,
        acceptedConflicts
      ).catch(err => {
        throw new Err.ThreeWayMergeError(err.message);
      })
    );
  });
  await Promise.all(resolvers);
  resolvedIndex.conflictCleanup();
  await resolvedIndex.write();
  await resolvedIndex.writeTree();

  acceptedConflicts.sort((a, b) => {
    return a.fatDoc.name === b.fatDoc.name ? 0 : a.fatDoc.name > b.fatDoc.name ? 1 : -1;
  });
  // console.log(acceptedConflicts);

  let commitMessage = 'resolve: ';
  acceptedConflicts.forEach(conflict => {
    // e.g.) put-ours: myID
    commitMessage += `${conflict.fatDoc.name}(${
      conflict.operation
    },${conflict.fatDoc.fileOid.substr(0, SHORT_SHA_LENGTH)},${conflict.strategy}), `;
  });
  if (commitMessage.endsWith(', ')) {
    commitMessage = commitMessage.slice(0, -2);
  }

  const overwriteCommitOid = await git.commit({
    fs,
    dir: gitDDB.workingDir,
    author: gitDDB.author,
    committer: gitDDB.committer,
    parent: [
      await git.resolveRef({
        fs,
        dir: gitDDB.workingDir,
        ref: 'HEAD',
      }),
      await git.resolveRef({
        fs,
        dir: gitDDB.workingDir,
        ref: 'refs/remotes/origin/main',
      }),
    ],
    message: commitMessage,
  });

  repos.stateCleanup();

  const localChanges = await getChanges(
    gitDDB.workingDir,
    oldCommitOid,
    overwriteCommitOid
  );

  // Get list of commits which has been added to local
  let localCommits: NormalizedCommit[] | undefined;
  if (sync.options.includeCommits) {
    const commitsFromRemote = await getCommitLogs(
      gitDDB.workingDir,
      oldRemoteCommitOid,
      mergeBaseCommitOid
    );
    const overwriteCommit = await git.readCommit({
      fs,
      dir: gitDDB.workingDir,
      oid: overwriteCommitOid,
    });
    // Add merge commit
    localCommits = [...commitsFromRemote, normalizeCommit(overwriteCommit)];
  }

  const opt = new nodegit.CheckoutOptions();
  opt.checkoutStrategy = nodegit.Checkout.STRATEGY.FORCE;
  await nodegit.Checkout.head(repos, opt);

  // Push
  const syncResultPush = await pushWorker(gitDDB, sync, taskMetadata, true).catch(
    (err: Error) => {
      return err;
    }
  );

  if (syncResultPush instanceof Error) {
    const syncResultResolveConflictsAndPushError: SyncResultResolveConflictsAndPushError = {
      action: 'resolve conflicts and push error',
      conflicts: acceptedConflicts,
      changes: {
        local: localChanges,
      },
      error: syncResultPush,
    };
    if (localCommits) {
      syncResultResolveConflictsAndPushError.commits = {
        local: localCommits,
      };
    }
    return syncResultResolveConflictsAndPushError;
  }

  const syncResultResolveConflictsAndPush: SyncResultResolveConflictsAndPush = {
    action: 'resolve conflicts and push',
    conflicts: acceptedConflicts,
    changes: {
      local: localChanges,
      remote: syncResultPush.changes.remote,
    },
  };
  if (localCommits) {
    syncResultResolveConflictsAndPush.commits = {
      local: localCommits,
      remote: syncResultPush.commits!.remote,
    };
  }

  return syncResultResolveConflictsAndPush;
}
