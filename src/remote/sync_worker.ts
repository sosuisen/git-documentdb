/* eslint-disable no-await-in-loop */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of gitDDB source tree.
 */

import git from 'isomorphic-git';
import fs from 'fs-extra';
import { SHORT_SHA_LENGTH } from '../const';
import { normalizeCommit } from '../utils';
import { GitDDBInterface } from '../types_gitddb';
import {
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
import { calcDistance, getAndWriteLocalChanges, getCommitLogs } from './worker_utils';
import { merge } from './3way_merge';
import { RemoteEngine } from './remote_engine';
import { Err } from '../error';

/**
 * sync_worker
 *
 * @throws {@link RemoteErr.InvalidGitRemoteError} (from fetch(), push())
 * @throws {@link RemoteErr.InvalidURLFormatError} (from fetch(), push(), combineDatabaseWithTheirs())
 * @throws {@link RemoteErr.NetworkError} (from fetch(), push(), combineDatabaseWithTheirs())
 * @throws {@link RemoteErr.HTTPError401AuthorizationRequired} (from fetch(), push(), combineDatabaseWithTheirs())
 * @throws {@link RemoteErr.HTTPError404NotFound} (from fetch(), push(), combineDatabaseWithTheirs())
 * @throws {@link RemoteErr.CannotConnectError} (from fetch()), push(), combineDatabaseWithTheirs())
 * @throws {@link RemoteErr.HttpProtocolRequiredError} (from fetch(), push(), combineDatabaseWithTheirs())
 * @throws {@link RemoteErr.InvalidRepositoryURLError} (from fetch(), push(), combineDatabaseWithTheirs())
 * @throws {@link RemoteErr.InvalidSSHKeyPathError} (from fetch(), push(), combineDatabaseWithTheirs())
 * @throws {@link RemoteErr.InvalidAuthenticationTypeError} (from fetch(), push(), combineDatabaseWithTheirs())
 *
 * @throws {@link HTTPError403Forbidden} (from push())
 * @throws {@link UnfetchedCommitExistsError} (from push())
 *
 * @throws {@link Err.NoMergeBaseFoundError}
 * @throws {@link Err.ThreeWayMergeError}
 * @throws {@link Err.CannotDeleteDataError}
 *
 * @throws {@link Err.InvalidJsonObjectError} (from getChanges())
 *
 *
 * @internal
 */
// eslint-disable-next-line complexity
export async function syncWorker (
  gitDDB: GitDDBInterface,
  sync: SyncInterface,
  taskMetadata: TaskMetadata
): Promise<SyncResult> {
  sync.eventHandlers.start.forEach(listener => {
    listener.func(
      { ...taskMetadata, collectionPath: listener.collectionPath },
      sync.currentRetries()
    );
  });

  /**
   * Fetch
   */
  await RemoteEngine[sync.engine].fetch(
    gitDDB.workingDir,
    sync.options,
    sync.remoteName,
    gitDDB.logger
  );

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
    ref: `refs/remotes/${sync.remoteName}/${gitDDB.defaultBranch}`,
  });

  const [baseCommitOid] = await git.findMergeBase({
    fs,
    dir: gitDDB.workingDir,
    oids: [oldCommitOid, oldRemoteCommitOid],
  });

  const distance = await calcDistance(baseCommitOid, oldCommitOid, oldRemoteCommitOid);
  // ahead: 0, behind 0 => Nothing to do: Local does not have new commits. Remote has not pushed new commits.
  // ahead: 0, behind 1 => Fast-forward merge : Local does not have new commits. Remote has pushed new commits.
  // ahead: 1, behind 0 => Push : Local has new commits. Remote has not pushed new commits.
  // ahead: 1, behind 1 => Merge, may resolve conflict and push: Local has new commits. Remote has pushed new commits.

  if (distance.ahead === undefined || distance.behind === undefined) {
    throw new Err.NoMergeBaseFoundError();
  }
  else if (distance.ahead === 0 && distance.behind === 0) {
    return { action: 'nop' };
  }
  else if (distance.ahead === 0 && distance.behind > 0) {
    /**
     * Fast forward
     */
    await git.writeRef({
      fs,
      dir: gitDDB.workingDir,
      ref: 'refs/heads/' + gitDDB.defaultBranch,
      value: oldRemoteCommitOid,
      force: true,
    });
    const newCommitOid = oldRemoteCommitOid;

    const localChanges = await getAndWriteLocalChanges(
      gitDDB.workingDir,
      oldCommitOid,
      newCommitOid!
    );

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
  else if (distance.ahead > 0 && distance.behind === 0) {
    /**
     * Push
     */
    return await pushWorker(gitDDB, sync, taskMetadata, true).catch(err => {
      throw err;
    });
  }

  /**
   * Merge (distance.ahead > 0 && distance.behind > 0)
   */
  const [mergedTreeOid, localChanges, remoteChanges, acceptedConflicts] = await merge(
    gitDDB,
    sync,
    baseCommitOid,
    oldCommitOid,
    oldRemoteCommitOid
  );

  if (acceptedConflicts.length === 0) {
    const mergeCommitOid = await git.commit({
      fs,
      dir: gitDDB.workingDir,
      author: gitDDB.author,
      committer: gitDDB.committer,
      parent: [oldCommitOid, oldRemoteCommitOid],
      message: 'merge',
      tree: mergedTreeOid,
    });

    let localCommits: NormalizedCommit[] | undefined;

    // Get list of commits which has been added to local
    if (sync.options.includeCommits) {
      const mergeCommit = await git.readCommit({
        fs,
        dir: gitDDB.workingDir,
        oid: mergeCommitOid!,
      });

      const commitsFromRemote = await getCommitLogs(
        gitDDB.workingDir,
        oldRemoteCommitOid,
        baseCommitOid
      );
      // Add merge commit
      localCommits = [...commitsFromRemote, normalizeCommit(mergeCommit)];
    }
    // Need push because it is merged normally.
    const syncResultPush = await pushWorker(gitDDB, sync, taskMetadata, true, true).catch(
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
        // remote: syncResultPush.changes.remote,
        remote: remoteChanges,
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

  const mergeCommitOid = await git.commit({
    fs,
    dir: gitDDB.workingDir,
    author: gitDDB.author,
    committer: gitDDB.committer,
    parent: [oldCommitOid, oldRemoteCommitOid],
    message: commitMessage,
    tree: mergedTreeOid,
  });

  //   const localChanges = await getChanges(gitDDB.workingDir, oldCommitOid, mergeCommitOid);

  // Get list of commits which has been added to local
  let localCommits: NormalizedCommit[] | undefined;
  if (sync.options.includeCommits) {
    const commitsFromRemote = await getCommitLogs(
      gitDDB.workingDir,
      oldRemoteCommitOid,
      baseCommitOid
    );
    const overwriteCommit = await git.readCommit({
      fs,
      dir: gitDDB.workingDir,
      oid: mergeCommitOid,
    });
    // Add merge commit
    localCommits = [...commitsFromRemote, normalizeCommit(overwriteCommit)];
  }

  // Push
  const syncResultPush = await pushWorker(gitDDB, sync, taskMetadata, true, true).catch(
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
      // remote: syncResultPush.changes.remote,
      remote: remoteChanges,
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
