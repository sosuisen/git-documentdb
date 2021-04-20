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
import { SHORT_SHA_LENGTH } from '../const';
import { ConsoleStyle } from '../utils';
import {
  CannotCreateDirectoryError,
  CannotDeleteDataError,
  GitMergeBranchError,
  InvalidConflictStateError,
  NoMergeBaseFoundError,
  RemoteIsAdvancedWhileMergingError,
  RepositoryNotOpenError,
  SyncWorkerFetchError,
  ThreeWayMergeError,
} from '../error';
import { AbstractDocumentDB } from '../types_gitddb';
import {
  AcceptedConflict,
  CommitInfo,
  ConflictResolveStrategies,
  ISync,
  SyncResult,
  SyncResultMergeAndPush,
  SyncResultResolveConflictsAndPush,
} from '../types';
import { push_worker } from './push_worker';
import { getChanges, getCommitLogs, getDocument } from './worker_utils';

/**
 * git fetch
 *
 * @throws {@link SyncWorkerFetchError}
 */
async function fetch (gitDDB: AbstractDocumentDB, sync: ISync) {
  gitDDB.logger.debug(
    ConsoleStyle.BgWhite().FgBlack().tag()`sync_worker: fetch: ${sync.remoteURL()}`
  );
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
 * Calc distance
 */
async function calcDistance (
  gitDDB: AbstractDocumentDB,
  localCommit: nodegit.Commit,
  remoteCommit: nodegit.Commit
) {
  const repos = gitDDB.repository()!;
  // @types/nodegit is wrong
  const distance = ((await nodegit.Graph.aheadBehind(
    repos,
    localCommit.id(),
    remoteCommit.id()
  )) as unknown) as { ahead: number; behind: number };
  gitDDB.logger.debug(
    ConsoleStyle.BgWhite().FgBlack().tag()`sync_worker: ${JSON.stringify(distance)}`
  );
  return distance;
}

/**
 * Resolve no merge base
 *
 * @throws {@link NoMergeBaseFoundError}
 */
function resolveNoMergeBase (sync: ISync) {
  if (sync.options().combine_db_strategy === 'nop') {
    throw new NoMergeBaseFoundError();
  }
  else if (sync.options().combine_db_strategy === 'theirs') {
    // remote local repository and clone remote repository
  }
  else if (sync.options().combine_db_strategy === 'ours') {
    // git merge -s ours
    // TODO:
    throw new Error(
      'ours option for combine_db_strategy is not implemented currently.'
    );
  }
}

/**
 * Write blob to file system
 *
 * @throws {@link CannotCreateDirectoryError}
 */
async function writeBlobToFile (gitDDB: AbstractDocumentDB, entry: nodegit.TreeEntry) {
  const data = (await entry.getBlob()).toString();
  const filename = entry.name();
  const filePath = nodePath.resolve(gitDDB.workingDir(), filename);
  const dir = nodePath.dirname(filePath);
  await fs.ensureDir(dir).catch((err: Error) => {
    return Promise.reject(new CannotCreateDirectoryError(err.message));
  });
  await fs.writeFile(filePath, data);
}

async function getStrategy (
  gitDDB: AbstractDocumentDB,
  strategy: ConflictResolveStrategies | undefined,
  path: string,
  ours?: nodegit.TreeEntry,
  theirs?: nodegit.TreeEntry
) {
  const defaultStrategy: ConflictResolveStrategies = 'ours';
  if (strategy === undefined) {
    strategy = defaultStrategy;
  }
  else if (strategy !== 'ours' && strategy !== 'theirs') {
    // Strategy may be a function
    const id = path.replace(new RegExp(gitDDB.fileExt + '$'), '');
    const oursDoc = ours
      ? await getDocument(gitDDB, id, ours.id()).catch(() => undefined)
      : undefined;
    const theirsDoc = theirs
      ? await getDocument(gitDDB, id, theirs.id()).catch(() => undefined)
      : undefined;
    strategy = strategy(oursDoc, theirsDoc);
    if (strategy === undefined) {
      strategy = defaultStrategy;
    }
  }
  return strategy;
}

/**
 * 3-way merge
 *
 * @throws {@link RepositoryNotOpenError}
 * @throws {@link InvalidConflictStateError}
 * @throws {@link CannotDeleteDataError}
 * @throws {@link CannotCreateDirectoryError} (from writeBlobToFile())
 */
// eslint-disable-next-line complexity
async function threeWayMerge (
  gitDDB: AbstractDocumentDB,
  conflict_resolve_strategy: ConflictResolveStrategies,
  resolvedIndex: nodegit.Index,
  path: string,
  mergeBase: nodegit.Commit,
  oursCommit: nodegit.Commit,
  theirsCommit: nodegit.Commit,
  acceptedConflicts: AcceptedConflict[]
): Promise<void> {
  const repos = gitDDB.repository();
  if (repos === undefined) {
    throw new RepositoryNotOpenError();
  }
  // Try 3-way merge on the assumption that their is no conflict.
  const baseCommit = await repos.getCommit(mergeBase);

  const ours = await oursCommit.getEntry(path).catch(() => undefined);
  const theirs = await theirsCommit.getEntry(path).catch(() => undefined);
  const base = await baseCommit.getEntry(path).catch(() => undefined);

  const docId = path.replace(new RegExp(gitDDB.fileExt + '$'), '');

  // 2 x 2 x 2 cases
  if (!base && !ours && !theirs) {
    // This case must not occurred.
    throw new InvalidConflictStateError(
      'Neither a base entry nor a local entry nor a remote entry exists.'
    );
  }
  else if (!base && !ours && theirs) {
    // A new file has been created on theirs.
    // Write it to the file.
    // console.log(' #case 1 - Accept theirs (create): ' + path);
    await writeBlobToFile(gitDDB, theirs);
    await resolvedIndex.addByPath(path);
  }
  else if (!base && ours && !theirs) {
    // A new file has been created on ours.
    // Just add it to the index.
    // console.log(' #case 2 - Accept ours (create): ' + path);
    await resolvedIndex.addByPath(path);
  }
  else if (!base && ours && theirs) {
    if (ours.id().equal(theirs.id())) {
      // The same filenames with exactly the same contents are created on both local and remote.
      // console.log(' #case 3 - Accept both (create): ' + path);
      // Jut add it to the index.
      await resolvedIndex.addByPath(path);
    }
    else {
      // ! Conflict
      const strategy = await getStrategy(
        gitDDB,
        conflict_resolve_strategy,
        path,
        ours,
        theirs
      );
      if (strategy === 'ours') {
        // Just add it to the index.
        // console.log(' #case 4 - Conflict. Accept ours (create): ' + path);
        acceptedConflicts.push({
          target: {
            id: docId,
            file_sha: ours.sha(),
          },
          strategy: 'ours',
          operation: 'create',
        });
        await resolvedIndex.addByPath(path);
      }
      else if (strategy === 'theirs') {
        // Write theirs to the file.
        // console.log(' #case 5 - Conflict. Accept theirs (create): ' + path);
        acceptedConflicts.push({
          target: {
            id: docId,
            file_sha: theirs.sha(),
          },
          strategy: 'theirs',
          operation: 'create',
        });
        await writeBlobToFile(gitDDB, theirs);
        await resolvedIndex.addByPath(path);
      }
    }
  }
  else if (base && !ours && !theirs) {
    // The same files are removed.
    // console.log(' #case 6 - Accept both (delete): ' + path);
    await resolvedIndex.removeByPath(path);
  }
  else if (base && !ours && theirs) {
    if (base.id().equal(theirs.id())) {
      // A file has been removed on ours.
      // console.log(' #case 7 - Accept ours (delete): ' + path);
      await resolvedIndex.removeByPath(path);
    }
    else {
      // ! Conflict
      const strategy = await getStrategy(
        gitDDB,
        conflict_resolve_strategy,
        path,
        ours,
        theirs
      );
      if (strategy === 'ours') {
        // Just add it to the index.
        // console.log(' #case 8 - Conflict. Accept ours (delete): ' + path);
        acceptedConflicts.push({
          target: {
            id: docId,
            file_sha: base.sha(),
          },
          strategy: 'ours',
          operation: 'delete',
        });
        await resolvedIndex.removeByPath(path);
      }
      else if (strategy === 'theirs') {
        // Write theirs to the file.
        // console.log(' #case 9 - Conflict. Accept theirs (update): ' + path);
        acceptedConflicts.push({
          target: {
            id: docId,
            file_sha: theirs.sha(),
          },
          strategy: 'theirs',
          operation: 'update',
        });
        await writeBlobToFile(gitDDB, theirs);
        await resolvedIndex.addByPath(path);
      }
    }
  }
  else if (base && ours && !theirs) {
    if (base.id().equal(ours.id())) {
      // A file has been removed on theirs.
      // console.log(' #case 10 - Accept theirs (delete): ' + path);
      await fs.remove(nodePath.resolve(repos.workdir(), path)).catch(() => {
        throw new CannotDeleteDataError();
      });
      await resolvedIndex.removeByPath(path);
    }
    else {
      // ! Conflict
      const strategy = await getStrategy(
        gitDDB,
        conflict_resolve_strategy,
        path,
        ours,
        theirs
      );
      if (strategy === 'ours') {
        // Just add to the index.
        // console.log(' #case 11 - Conflict. Accept ours (update): ' + path);
        acceptedConflicts.push({
          target: {
            id: docId,
            file_sha: ours.sha(),
          },
          strategy: 'ours',
          operation: 'update',
        });
        await resolvedIndex.addByPath(path);
      }
      else if (strategy === 'theirs') {
        // Remove file
        // console.log(' #case 12 - Conflict. Accept theirs (delete): ' + path);
        acceptedConflicts.push({
          target: {
            id: docId,
            file_sha: base.sha(),
          },
          strategy: 'theirs',
          operation: 'delete',
        });
        await fs.remove(nodePath.resolve(repos.workdir(), path)).catch(() => {
          throw new CannotDeleteDataError();
        });
        await resolvedIndex.removeByPath(path);
      }
    }
  }
  else if (base && ours && theirs) {
    if (ours.id().equal(theirs.id())) {
      // The same filenames with exactly the same contents are created on both local and remote.
      // Jut add it to the index.
      // console.log(' #case 13 - Accept both (update): ' + path);
      await resolvedIndex.addByPath(path);
    }
    else if (base.id().equal(ours.id())) {
      // Write theirs to the file.
      // console.log(' #case 14 - Accept theirs (update): ' + path);
      await writeBlobToFile(gitDDB, theirs);
      await resolvedIndex.addByPath(path);
    }
    else if (base.id().equal(theirs.id())) {
      // Jut add it to the index.
      // console.log(' #case 15 - Accept ours (update): ' + path);
      await resolvedIndex.addByPath(path);
    }
    else {
      // ! Conflict
      const strategy = await getStrategy(
        gitDDB,
        conflict_resolve_strategy,
        path,
        ours,
        theirs
      );
      if (strategy === 'ours') {
        // Just add it to the index.
        // console.log(' #case 16 - Conflict. Accept ours (update): ' + path);
        acceptedConflicts.push({
          target: {
            id: docId,
            file_sha: ours.sha(),
          },
          strategy: 'ours',
          operation: 'update',
        });
        await resolvedIndex.addByPath(path);
      }
      else if (strategy === 'theirs') {
        // Write theirs to the file.
        // console.log(' #case 17 - Conflict. Accept theirs (update): ' + path);
        acceptedConflicts.push({
          target: {
            id: docId,
            file_sha: theirs.sha(),
          },
          strategy: 'theirs',
          operation: 'update',
        });
        await writeBlobToFile(gitDDB, theirs);
        await resolvedIndex.addByPath(path);
      }
    }
  }
}

/**
 * sync_worker
 *
 * @throws {@link RepositoryNotOpenError} (from this and push_worker())
 * @throws {@link SyncWorkerFetchError} (from fetch() and push_worker())
 * @throws {@link NoMergeBaseFoundError} (from resolveNoMergeBase())
 * @throws {@link ThreeWayMergeError}
 * @throws {@link CannotDeleteDataError}
 * @throws {@link RemoteIsAdvancedWhileMergingError}
 * @throws {@link InvalidJsonObjectError} (from getChanges())
 * @throws {@link CannotPushBecauseUnfetchedCommitExistsError} (from push_worker())
 * @throws {@link InvalidJsonObjectError} (from push_worker())
 * @throws {@link GitPushError} (from push_worker())
 * @throws {@link GitMergeBranchError} (from NodeGit.repos.mergeBranches())
 *
 * @internal
 */
// eslint-disable-next-line complexity
export async function sync_worker (
  gitDDB: AbstractDocumentDB,
  sync: ISync,
  taskId: string
): Promise<SyncResult> {
  const repos = gitDDB.repository();
  if (repos === undefined) {
    throw new RepositoryNotOpenError();
  }
  sync.eventHandlers.start.forEach(func => {
    func(taskId, sync.currentRetries());
  });

  /**
   * Fetch
   */
  await fetch(gitDDB, sync);

  /**
   * Calc distance
   */
  const oldCommit = await repos.getHeadCommit();
  const oldRemoteCommit = await repos.getReferenceCommit('refs/remotes/origin/main');
  const distance = await calcDistance(gitDDB, oldCommit, oldRemoteCommit);
  // ahead: 0, behind 0 => Nothing to do: Local does not have new commits. Remote has not pushed new commits.
  // ahead: 0, behind 1 => Fast-forward merge : Local does not have new commits. Remote has pushed new commits.
  // ahead: 1, behind 0 => Push : Local has new commits. Remote has not pushed new commits.
  // ahead: 1, behind 1 => Merge, may resolve conflict and push: Local has new commits. Remote has pushed new commits.

  let conflictedIndex: nodegit.Index | undefined;
  let newCommitOid: nodegit.Oid | undefined;
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

        /**
         * TODO:
         * May throw 'Error: no merge base found'
         */
        if (res instanceof Error) {
          if (res.message.startsWith('no merge base found')) {
            resolveNoMergeBase(sync);
          }
          throw new GitMergeBranchError(res.message);
        }
        /* returns conflicted index */ conflictedIndex = res;
        return undefined;
      });
  }
  else if (distance.ahead > 0 && distance.behind === 0) {
    // Push
    return await push_worker(gitDDB, sync, taskId).catch(err => {
      throw err;
    });
  }

  if (conflictedIndex === undefined) {
    // Conflict has not been occurred.
    // Exec fast-forward or normal merge.

    // When a local file is removed and the same remote file is removed,
    // they cannot be merged by fast-forward. They are merged as usual.

    const newCommit = await repos.getCommit(newCommitOid!);

    const distance_again = await calcDistance(
      gitDDB,
      newCommit,
      await repos.getReferenceCommit('refs/remotes/origin/main')
    );

    if (distance_again.ahead === 0 && distance_again.behind === 0) {
      const diff = await nodegit.Diff.treeToTree(
        repos,
        await oldCommit.getTree(),
        await newCommit.getTree()
      );
      const localChanges = await getChanges(gitDDB, diff);

      const SyncResultFastForwardMerge: SyncResult = {
        action: 'fast-forward merge',
        changes: {
          local: localChanges,
        },
      };

      if (sync.options().include_commits) {
        // Get list of commits which has been merged to local
        const commitsFromRemote = await getCommitLogs(oldCommit, oldRemoteCommit);
        SyncResultFastForwardMerge.commits = {
          local: commitsFromRemote,
        };
      }
      return SyncResultFastForwardMerge;
    }
    else if (distance_again.ahead > 0 && distance_again.behind === 0) {
      // This case is occurred when not fast-forward.
      // - create/update a remote file, and create/update another local file
      // - create/update a remote file, and create/update the same local file with the same contents
      // - create/update a remote file, and remove another local file
      // - remove a remote file, and create/update another local file
      // - remove a remote file, and remove the same local file

      // Compare trees before and after merge
      const diff = await nodegit.Diff.treeToTree(
        repos,
        await oldCommit.getTree(),
        await newCommit.getTree()
      );

      const currentIndex = await repos.refreshIndex();

      const localChanges = await getChanges(gitDDB, diff);
      /**
       * Repository.mergeBranches does not handle deleting file.
       * So a file deleted on remote side is not applied to
       * on both local filesystem and local index.
       * Change them by hand.
       */
      // Cannot use await in forEach. Use for-of.
      for (const change of localChanges) {
        const filename = change.data.id + gitDDB.fileExt;
        const path = nodePath.resolve(repos.workdir(), filename);
        if (change.operation === 'delete') {
          // eslint-disable-next-line no-await-in-loop
          await fs.remove(path).catch(() => {
            throw new CannotDeleteDataError();
          });
          // eslint-disable-next-line no-await-in-loop
          await currentIndex.removeByPath(filename);
        }
      }

      await currentIndex.write();

      const treeOid: nodegit.Oid | void = await currentIndex.writeTree();
      const newTree = await nodegit.Tree.lookup(repos, treeOid);
      // @ts-ignore
      await newCommit.amend('HEAD', null, null, null, 'merge', newTree);

      // Get list of commits which has been added to local
      let localCommits: CommitInfo[] | undefined;
      if (sync.options().include_commits) {
        const amendedNewCommit = await repos.getHeadCommit();

        const mergeBase = await nodegit.Merge.base(
          repos,
          oldCommit.id(),
          oldRemoteCommit.id()
        );

        const commitsFromRemote = await getCommitLogs(
          await repos.getCommit(mergeBase),
          oldRemoteCommit
        );
        // Add merge commit
        localCommits = [
          ...commitsFromRemote,
          {
            sha: amendedNewCommit.id().tostrS(),
            date: amendedNewCommit.date(),
            author: amendedNewCommit.author().toString(),
            message: amendedNewCommit.message(),
          },
        ];
      }

      // Need push because it is merged normally.
      const syncResultPush = await push_worker(gitDDB, sync, taskId).catch(err => {
        throw err;
      });
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
     * Remote is advanced while merging
     */
    throw new RemoteIsAdvancedWhileMergingError();
  }
  else {
    /**
     * Conflict
     * https://git-scm.com/docs/git-merge#_true_merge
     */

    const mergeBase = await nodegit.Merge.base(repos, oldCommit.id(), oldRemoteCommit.id());

    const allFileObj: { [key: string]: boolean } = {};
    conflictedIndex.entries().forEach((entry: nodegit.IndexEntry) => {
      const stage = nodegit.Index.entryStage(entry);
      gitDDB.logger.debug(
        ConsoleStyle.BgWhite().FgBlack().tag()`sync_worker: ${stage} : ${entry.path}`
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

    const mergeBaseCommit = await repos.getCommit(mergeBase);
    const resolvers: Promise<void>[] = [];
    const strategy = sync.options().conflict_resolve_strategy;
    // eslint-disable-next-line complexity
    Object.keys(allFileObj).forEach(path => {
      resolvers.push(
        threeWayMerge(
          gitDDB,
          strategy!,
          resolvedIndex,
          path,
          mergeBaseCommit,
          oldCommit,
          oldRemoteCommit,
          acceptedConflicts
        ).catch(err => {
          throw new ThreeWayMergeError(err.message);
        })
      );
    });
    await Promise.all(resolvers);
    resolvedIndex.conflictCleanup();

    acceptedConflicts.sort((a, b) => {
      return a.target.id === b.target.id ? 0 : a.target.id > b.target.id ? 1 : -1;
    });
    // console.log(acceptedConflicts);

    let commitMessage = 'resolve: ';
    acceptedConflicts.forEach(conflict => {
      // e.g.) put-ours: myID
      const fileName =
        conflict.target.type === undefined || conflict.target.type === 'json'
          ? conflict.target.id + gitDDB.fileExt
          : conflict.target.id;
      commitMessage += `${fileName}(${conflict.operation},${conflict.target.file_sha.substr(
        0,
        SHORT_SHA_LENGTH
      )},${conflict.strategy}), `;
    });
    if (commitMessage.endsWith(', ')) {
      commitMessage = commitMessage.slice(0, -2);
    }

    await resolvedIndex.write();

    const treeOid: nodegit.Oid | void = await resolvedIndex.writeTree();

    const overwriteCommitOid: nodegit.Oid = await repos.createCommit(
      'HEAD',
      sync.author,
      sync.committer,
      commitMessage,
      treeOid,
      [
        await repos.getHeadCommit(),
        await repos.getReferenceCommit('refs/remotes/origin/main'),
      ]
    );
    repos.stateCleanup();

    const overwriteCommit = await repos.getCommit(overwriteCommitOid);
    const diff = await nodegit.Diff.treeToTree(
      repos,
      await oldCommit.getTree(),
      await overwriteCommit.getTree()
    );
    const localChanges = await getChanges(gitDDB, diff);

    // Get list of commits which has been added to local
    let localCommits: CommitInfo[] | undefined;
    if (sync.options().include_commits) {
      const commitsFromRemote = await getCommitLogs(
        await repos.getCommit(mergeBase),
        oldRemoteCommit
      );
      // Add merge commit
      localCommits = [
        ...commitsFromRemote,
        {
          sha: overwriteCommit.id().tostrS(),
          date: overwriteCommit.date(),
          author: overwriteCommit.author().toString(),
          message: overwriteCommit.message(),
        },
      ];
    }

    const opt = new nodegit.CheckoutOptions();
    opt.checkoutStrategy = nodegit.Checkout.STRATEGY.FORCE;
    await nodegit.Checkout.head(repos, opt);

    // Push
    const syncResultPush = await push_worker(gitDDB, sync, taskId).catch(err => {
      throw err;
    });
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
}
