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
  CannotCreateDirectoryError,
  CannotDeleteDataError,
  CannotPushBecauseUnfetchedCommitExistsError,
  InvalidConflictStateError,
  InvalidJsonObjectError,
  NoMergeBaseFoundError,
  RepositoryNotOpenError,
  SyncWorkerFetchError,
} from '../error';
import { AbstractDocumentDB } from '../types_gitddb';
import {
  AcceptedConflict,
  ChangedFile,
  CommitInfo,
  ConflictResolveStrategies,
  DocMetadata,
  ISync,
  JsonDoc,
  SyncResult,
  SyncResultMergeAndPush,
  SyncResultPush,
  SyncResultResolveConflictsAndPush,
} from '../types';

/**
 * git push
 */
async function push (
  gitDDB: AbstractDocumentDB,
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
        throw new CannotPushBecauseUnfetchedCommitExistsError();
      }
      throw err;
    });
  // gitDDB.logger.debug(ConsoleStyle.BgWhite().FgBlack().tag()`sync_worker: May pushed.`);
  const headCommit = await validatePushResult(gitDDB, sync, taskId);
  return headCommit;
}

/**
 * Remote.push does not return valid error in race condition,
 * so check is needed.
 */
async function validatePushResult (
  gitDDB: AbstractDocumentDB,
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

    throw new CannotPushBecauseUnfetchedCommitExistsError();
  }

  return localCommit;
}

/**
 * git fetch
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
 */
function resolveNoMergeBase (sync: ISync) {
  if (sync.options().behavior_for_no_merge_base === 'nop') {
    throw new NoMergeBaseFoundError();
  }
  else if (sync.options().behavior_for_no_merge_base === 'theirs') {
    // remote local repository and clone remote repository
  }
  else if (sync.options().behavior_for_no_merge_base === 'ours') {
    // git merge -s ours
    // TODO:
    throw new Error(
      'ours option for behavior_for_no_merge_base is not implemented currently.'
    );
  }
}

/**
 * Get document
 */
async function getDocument (gitDDB: AbstractDocumentDB, id: string, fileOid: nodegit.Oid) {
  const blob = await gitDDB.repository()?.getBlob(fileOid);
  let document: JsonDoc | undefined;
  if (blob) {
    try {
      document = (JSON.parse(blob.toString()) as unknown) as JsonDoc;
      // _id in a document may differ from _id in a filename by mistake.
      // _id in a file is SSOT.
      // Overwrite _id in a document by _id in arguments
      document._id = id;
    } catch (e) {
      throw new InvalidJsonObjectError();
    }
  }
  return document;
}

/**
 * Get changed files
 */
async function getChanges (gitDDB: AbstractDocumentDB, diff: nodegit.Diff) {
  const changes: ChangedFile[] = [];
  for (let i = 0; i < diff.numDeltas(); i++) {
    const delta = diff.getDelta(i);
    // https://libgit2.org/libgit2/#HEAD/type/git_diff_delta
    // Both oldFile() and newFile() will return the same file to show diffs.
    /*
    console.log(
      `changed old: ${delta.oldFile().path()}, ${delta.oldFile().flags().toString(2)}`
    );
    console.log(
      `        new: ${delta.newFile().path()}, ${delta.newFile().flags().toString(2)}`
    );
    */
    /**
     * flags:
     * https://libgit2.org/libgit2/#HEAD/type/git_diff_flag_t
     * The fourth bit represents whether file exists at this side of the delta or not.
     * [a file is removed]
     * changed old: test.txt, 1100
     *         new: test.txt,  100
     * [a file is added]
     * changed old: test.txt,  100
     *         new: test.txt, 1100
     * [a file is modified]
     * changed old: test.txt, 1100
     *         new: test.txt, 1100
     */

    const oldExist = delta.oldFile().flags() >> 3;
    const newExist = delta.newFile().flags() >> 3;

    const docId = delta
      .newFile()
      .path()
      .replace(new RegExp(gitDDB.fileExt + '$'), '');
    const oldDocMetadata: DocMetadata = {
      id: docId,
      file_sha: delta.oldFile().id().tostrS(),
    };
    const newDocMetadata: DocMetadata = {
      id: docId,
      file_sha: delta.newFile().id().tostrS(),
    };
    if (oldExist && !newExist) {
      // Use oldFile. newFile is empty when removed.
      changes.push({
        operation: 'delete',
        data: {
          ...oldDocMetadata,
          // eslint-disable-next-line no-await-in-loop
          doc: await getDocument(gitDDB, docId, delta.oldFile().id()),
        },
      });
    }
    else if (!oldExist && newExist) {
      changes.push({
        operation: 'create',
        data: {
          ...newDocMetadata,
          // eslint-disable-next-line no-await-in-loop
          doc: await getDocument(gitDDB, docId, delta.newFile().id()),
        },
      });
    }
    else if (oldExist && newExist) {
      changes.push({
        operation: 'update',
        data: {
          ...newDocMetadata,
          // eslint-disable-next-line no-await-in-loop
          doc: await getDocument(gitDDB, docId, delta.newFile().id()),
        },
      });
    }
  }

  return changes;
}

/**
 * Get commit logs newer than an oldCommit, until a newCommit
 *
 * @remarks
 * - This will leak memory. It may be a bug in NodeGit 0.27.
 *
 * - Logs are sorted from old to new.
 *
 * - oldCommit is not included to return value.
 *
 * @beta
 */
async function getCommitLogs (
  oldCommit: nodegit.Commit,
  newCommit: nodegit.Commit
): Promise<CommitInfo[]> {
  const endId = oldCommit.id().tostrS();

  /**
   * TODO: Use RevWalk instead of Commit.history()
   * Using history() is inefficient.
   */

  // Walk the history from this commit backwards.
  const history = newCommit.history();
  const commitList = await new Promise<nodegit.Commit[]>((resolve, reject) => {
    const list: nodegit.Commit[] = [];
    const onCommit = (commit: nodegit.Commit) => {
      if (commit.id().tostrS() === endId) {
        history.removeAllListeners();
        resolve(list);
      }
      else {
        list.unshift(commit);
      }
    };
    const onEnd = (commits: nodegit.Commit[]) => {
      console.log(
        JSON.stringify(
          commits.map(commit => {
            return { id: commit.id, message: commit.message };
          })
        )
      );
      history.removeAllListeners();
      reject(new Error('Unexpected end of walking commit history'));
    };
    const onError = (error: Error) => {
      history.removeAllListeners();
      reject(error);
    };
    history.on('commit', onCommit);
    history.on('end', onEnd);
    history.on('error', onError);
    history.start();
  });
  // The list is sorted from old to new.
  const commitInfoList = commitList.map(commit => {
    return {
      id: commit.id().tostrS(),
      date: commit.date(),
      author: commit.author().toString(),
      message: commit.message(),
    };
  });
  return commitInfoList;
}

/**
 * Write blob to file system
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
 * Push and get changes
 */
export async function push_worker (
  gitDDB: AbstractDocumentDB,
  sync: ISync,
  taskId: string
): Promise<SyncResultPush> {
  const repos = gitDDB.repository();
  if (repos === undefined) {
    throw new RepositoryNotOpenError();
  }
  sync.eventHandlers.start.forEach(func => {
    func(taskId, sync.currentRetries());
  });

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
  const syncResult: SyncResult = {
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
    console.log('case 1 - Accept theirs (create): ' + path);
    await writeBlobToFile(gitDDB, theirs);
    console.log('try to add ' + path);
    await resolvedIndex.addByPath(path);
    console.log('end to add ' + path);
  }
  else if (!base && ours && !theirs) {
    // A new file has been created on ours.
    // Just add it to the index.
    console.log('case 2 - Accept ours (create): ' + path);
    await resolvedIndex.addByPath(path);
  }
  else if (!base && ours && theirs) {
    if (ours.id().equal(theirs.id())) {
      // The same filenames with exactly the same contents are created on both local and remote.
      console.log('case 3 - Accept both (create): ' + path);
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
        console.log('case 4 - Conflict. Accept ours (create): ' + path);
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
        console.log('case 5 - Conflict. Accept theirs (create): ' + path);
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
    console.log('case 6 - Accept both (delete): ' + path);
    await resolvedIndex.removeByPath(path);
  }
  else if (base && !ours && theirs) {
    if (base.id().equal(theirs.id())) {
      // A file has been removed on ours.
      console.log('case 7 - Accept ours (delete): ' + path);
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
        console.log('case 8 - Conflict. Accept ours (delete): ' + path);
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
        console.log('case 9 - Conflict. Accept theirs (update): ' + path);
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
      console.log('case 10 - Accept theirs (delete): ' + path);
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
        console.log('case 11 - Conflict. Accept ours (update): ' + path);
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
        console.log('12 - Conflict. Accept theirs (delete): ' + path);
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
      console.log('case 13 - Accept both: ' + path);
      await resolvedIndex.addByPath(path);
    }
    else if (base.id().equal(ours.id())) {
      // Write theirs to the file.
      console.log('case 14 - Accept theirs (create): ' + path);
      await writeBlobToFile(gitDDB, theirs);
      await resolvedIndex.addByPath(path);
    }
    else if (base.id().equal(theirs.id())) {
      // Jut add it to the index.
      console.log('case 15 - Accept ours (create): ' + path);
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
        console.log('case 16 - Conflict. Accept ours (update): ' + path);
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
        console.log('case 17 - Conflict. Accept theirs (update): ' + path);
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
          throw res;
        }
        /* returns conflicted index */ conflictedIndex = res;
        return undefined;
      });
  }
  else if (distance.ahead > 0 && distance.behind === 0) {
    // Push
    return await push_worker(gitDDB, sync, taskId);
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
            id: amendedNewCommit.id().tostrS(),
            date: amendedNewCommit.date(),
            author: amendedNewCommit.author().toString(),
            message: amendedNewCommit.message(),
          },
        ];
      }

      // Need push because it is merged normally.
      const syncResultPush = await push_worker(gitDDB, sync, taskId);
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
    throw new Error('Remote is advanced while merging.');
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
    console.log('3-way merge..');

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
        )
      );
    });
    await Promise.all(resolvers);
    resolvedIndex.conflictCleanup();

    acceptedConflicts.sort((a, b) => {
      return a.target.id === b.target.id ? 0 : a.target.id > b.target.id ? 1 : -1;
    });
    console.log(acceptedConflicts);

    let commitMessage = '[resolve] ';
    acceptedConflicts.forEach(conflict => {
      // e.g.) put-ours: myID
      const fileName =
        conflict.target.type === undefined || conflict.target.type === 'json'
          ? conflict.target.id + gitDDB.fileExt
          : conflict.target.id;
      commitMessage += `${fileName}(${conflict.operation},${conflict.target.file_sha},${conflict.strategy}), `;
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
          id: overwriteCommit.id().tostrS(),
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
    const syncResultPush = await push_worker(gitDDB, sync, taskId);
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
