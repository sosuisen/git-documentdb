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
import { ConsoleStyle, NormalizeCommit } from '../utils';
import {
  CannotDeleteDataError,
  GitMergeBranchError,
  NoMergeBaseFoundError,
  RepositoryNotOpenError,
  SyncWorkerFetchError,
  ThreeWayMergeError,
} from '../error';
import { IDocumentDB } from '../types_gitddb';
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
import { ISync } from '../types_sync';
import { push_worker } from './push_worker';
import { calcDistance, getChanges, getCommitLogs, writeBlobToFile } from './worker_utils';
import { threeWayMerge } from './3way_merge';

/**
 * git fetch
 *
 * @throws {@link SyncWorkerFetchError}
 */
async function fetch (gitDDB: IDocumentDB, sync: ISync) {
  gitDDB
    .getLogger()
    .debug(ConsoleStyle.BgWhite().FgBlack().tag()`sync_worker: fetch: ${sync.remoteURL()}`);
  await gitDDB
    .repository()!
    .fetch('origin', {
      callbacks: sync.credential_callbacks,
    })
    .catch(err => {
      throw new SyncWorkerFetchError(err.message);
    });
}

/**
 * sync_worker
 *
 * @throws {@link RepositoryNotOpenError} (from this and push_worker())
 * @throws {@link SyncWorkerFetchError} (from fetch() and push_worker())
 * @throws {@link NoMergeBaseFoundError}
 * @throws {@link ThreeWayMergeError}
 * @throws {@link CannotDeleteDataError}
 * @throws {@link InvalidJsonObjectError} (from getChanges())
 * @throws {@link UnfetchedCommitExistsError} (from push_worker())
 * @throws {@link InvalidJsonObjectError} (from push_worker())
 * @throws {@link GitPushError} (from push_worker())
 * @throws {@link GitMergeBranchError} (from NodeGit.repos.mergeBranches())
 *
 * @internal
 */
// eslint-disable-next-line complexity
export async function sync_worker (
  gitDDB: IDocumentDB,
  sync: ISync,
  taskMetadata: TaskMetadata
): Promise<SyncResult> {
  const repos = gitDDB.repository();
  if (repos === undefined) {
    throw new RepositoryNotOpenError();
  }
  sync.eventHandlers.start.forEach(func => {
    func(taskMetadata, sync.currentRetries());
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
    dir: gitDDB.workingDir(),
    ref: 'HEAD',
  });
  const oldRemoteCommitOid = await git.resolveRef({
    fs,
    dir: gitDDB.workingDir(),
    ref: 'refs/remotes/origin/main',
  });
  const distance = await calcDistance(
    gitDDB.workingDir(),
    oldCommitOid,
    oldRemoteCommitOid
  );
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
      .mergeBranches(gitDDB.defaultBranch, `origin/${gitDDB.defaultBranch}`)
      .catch((res: nodegit.Index) => {
        /* returns conflicted index */ conflictedIndex = res;
        return undefined;
      });
  }
  else if (distance.ahead > 0 && distance.behind > 0) {
    newCommitOid = await repos
      .mergeBranches(gitDDB.defaultBranch, `origin/${gitDDB.defaultBranch}`)
      .catch((res: nodegit.Index) => {
        // Exception locks files. Try cleanup
        repos.cleanup();

        if (res instanceof Error) {
          if (res.message.startsWith('no merge base found')) {
            throw new NoMergeBaseFoundError();
          }
          throw new GitMergeBranchError(res.message);
        }
        /* returns conflicted index */ conflictedIndex = res;
        return undefined;
      });
  }
  else if (distance.ahead > 0 && distance.behind === 0) {
    // Push
    return await push_worker(gitDDB, sync, taskMetadata, true).catch(err => {
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
    const distance_again = await calcDistance(
      gitDDB.workingDir(),
      newCommitOid!,
      await git.resolveRef({
        fs,
        dir: gitDDB.workingDir(),
        ref: 'refs/remotes/origin/main',
      })
    );

    if (distance_again.ahead === 0) {
      const localChanges = await getChanges(
        gitDDB.workingDir(),
        oldCommitOid,
        newCommitOid!
      );

      const SyncResultFastForwardMerge: SyncResult = {
        action: 'fast-forward merge',
        changes: {
          local: localChanges,
        },
      };

      if (sync.options().include_commits) {
        // Get list of commits which has been merged to local
        const commitsFromRemote = await getCommitLogs(
          gitDDB.workingDir(),
          oldCommitOid,
          oldRemoteCommitOid
        );
        SyncResultFastForwardMerge.commits = {
          local: commitsFromRemote,
        };
      }
      return SyncResultFastForwardMerge;
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

    const localChanges = await getChanges(gitDDB.workingDir(), oldCommitOid, newCommitOid!);
    /**
     * Repository.mergeBranches does not handle updating and deleting file.
     * So a file updated/deleted on remote side is not applied to
     * on both local filesystem and local index.
     * Change them by hand.
     */
    // Cannot use await in forEach. Use for-of.
    for (const change of localChanges) {
      if (change.operation === 'delete') {
        const filename = change.old.id + JSON_EXT;
        const path = nodePath.resolve(repos.workdir(), filename);
        await fs.remove(path).catch(() => {
          throw new CannotDeleteDataError();
        });
        await currentIndex.removeByPath(filename);
      }
      else if (change.operation === 'update') {
        const filename = change.old.id + JSON_EXT;
        const { blob } = await git.readBlob({
          fs,
          dir: gitDDB.workingDir(),
          oid: change.old.id,
        });
        const data = Buffer.from(blob).toString('utf-8');
        await writeBlobToFile(gitDDB, filename, data);
        await currentIndex.addByPath(filename);
      }
    }

    await currentIndex.write();

    const treeOid: nodegit.Oid | void = await currentIndex.writeTree();
    const newTree = await nodegit.Tree.lookup(repos, treeOid);

    const newCommit = await repos.getCommit(newCommitOid!);
    // @ts-ignore
    await newCommit.amend('HEAD', sync.author, sync.committer, null, 'merge', newTree);

    // Get list of commits which has been added to local
    let localCommits: NormalizedCommit[] | undefined;
    if (sync.options().include_commits) {
      const amendedNewCommit = await repos.getHeadCommit();

      const [baseCommitOid] = await git.findMergeBase({
        fs,
        dir: gitDDB.workingDir(),
        oids: [oldCommitOid, oldRemoteCommitOid],
      });

      const commitsFromRemote = await getCommitLogs(
        gitDDB.workingDir(),
        baseCommitOid,
        oldRemoteCommitOid
      );
      // Add merge commit
      localCommits = [
        ...commitsFromRemote,
        {
          sha: amendedNewCommit.id().tostrS(),
          message: amendedNewCommit.message(),
          parent: amendedNewCommit.parents().map(oid => oid.tostrS()),
          author: {
            name: amendedNewCommit.author().name(),
            email: amendedNewCommit.author().email(),
            timestamp: new Date(amendedNewCommit.author().when().time()),
          },
          committer: {
            name: amendedNewCommit.committer().name(),
            email: amendedNewCommit.committer().email(),
            timestamp: new Date(amendedNewCommit.committer().when().time()),
          },
        },
      ];
    }

    // Need push because it is merged normally.
    const syncResultPush = await push_worker(gitDDB, sync, taskMetadata, true).catch(
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
    gitDDB
      .getLogger()
      .debug(ConsoleStyle.BgWhite().FgBlack().tag()`sync_worker: ${stage} : ${entry.path}`);

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
    dir: gitDDB.workingDir(),
    oids: [oldCommitOid, oldRemoteCommitOid],
  });

  const resolvers: Promise<void>[] = [];
  const strategy = sync.options().conflict_resolution_strategy;
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
        throw new ThreeWayMergeError(err.message);
      })
    );
  });
  await Promise.all(resolvers);
  resolvedIndex.conflictCleanup();
  await resolvedIndex.write();
  await resolvedIndex.writeTree();

  acceptedConflicts.sort((a, b) => {
    return a.target.id === b.target.id ? 0 : a.target.id > b.target.id ? 1 : -1;
  });
  // console.log(acceptedConflicts);

  let commitMessage = 'resolve: ';
  acceptedConflicts.forEach(conflict => {
    // e.g.) put-ours: myID
    const fileName =
      conflict.target.type === undefined || conflict.target.type === 'json'
        ? conflict.target.id + JSON_EXT
        : conflict.target.id;
    commitMessage += `${fileName}(${conflict.operation},${conflict.target.file_sha.substr(
      0,
      SHORT_SHA_LENGTH
    )},${conflict.strategy}), `;
  });
  if (commitMessage.endsWith(', ')) {
    commitMessage = commitMessage.slice(0, -2);
  }

  const overwriteCommitOid = await git.commit({
    fs,
    dir: gitDDB.workingDir(),
    author: {
      name: sync.author.name(),
      email: sync.author.email(),
    },
    committer: {
      name: sync.committer.name(),
      email: sync.committer.email(),
    },
    parent: [
      await git.resolveRef({
        fs,
        dir: gitDDB.workingDir(),
        ref: 'HEAD',
      }),
      await git.resolveRef({
        fs,
        dir: gitDDB.workingDir(),
        ref: 'refs/remotes/origin/main',
      }),
    ],
    message: commitMessage,
  });

  repos.stateCleanup();

  const localChanges = await getChanges(
    gitDDB.workingDir(),
    oldCommitOid,
    overwriteCommitOid
  );

  // Get list of commits which has been added to local
  let localCommits: NormalizedCommit[] | undefined;
  if (sync.options().include_commits) {
    const commitsFromRemote = await getCommitLogs(
      gitDDB.workingDir(),
      mergeBaseCommitOid,
      oldRemoteCommitOid
    );
    const overwriteCommit = await git.readCommit({
      fs,
      dir: gitDDB.workingDir(),
      oid: overwriteCommitOid,
    });
    // Add merge commit
    localCommits = [...commitsFromRemote, NormalizeCommit(overwriteCommit)];
  }

  const opt = new nodegit.CheckoutOptions();
  opt.checkoutStrategy = nodegit.Checkout.STRATEGY.FORCE;
  await nodegit.Checkout.head(repos, opt);

  // Push
  const syncResultPush = await push_worker(gitDDB, sync, taskMetadata, true).catch(
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
