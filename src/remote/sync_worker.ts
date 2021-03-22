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
  InvalidJsonObjectError,
  NoMergeBaseFoundError,
  RepositoryNotOpenError,
  SyncWorkerFetchError,
} from '../error';
import { AbstractDocumentDB } from '../types_gitddb';
import { CommitInfo, DocMetadata, FileChanges, ISync, JsonDoc, SyncResult } from '../types';

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
      // gitDDB.logger.debug('Error in push: ' + err);

      repos.cleanup();

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

    repos.cleanup();

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
 * git commit --amend -m <commitMessage>
 */
async function commitAmendMessage (
  gitDDB: AbstractDocumentDB,
  sync: ISync,
  commitOid: nodegit.Oid,
  commitMessage: string
) {
  const commit = await gitDDB.repository()!.getCommit(commitOid!);
  // Change commit message
  await commit.amend(
    'HEAD',
    sync.author,
    sync.committer,
    commit.messageEncoding(),
    commitMessage,
    await commit.getTree()
  );
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
      return Promise.reject(new InvalidJsonObjectError());
    }
  }
  return document;
}

/**
 * Get changed files
 */
async function getChanges (gitDDB: AbstractDocumentDB, diff: nodegit.Diff) {
  const changes: FileChanges = {
    add: [],
    remove: [],
    modify: [],
  };
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
     *
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
      //      console.log(delta.newFile().path() + ' is removed.');
      // Use oldFile. newFile is empty when removed.
      changes.remove.push(oldDocMetadata);
    }
    else if (!oldExist && newExist) {
      // console.log(delta.newFile().path() + ' is added.');
      changes.add.push({
        ...newDocMetadata,
        // eslint-disable-next-line no-await-in-loop
        doc: await getDocument(gitDDB, docId, delta.newFile().id()),
      });
    }
    else if (oldExist && newExist) {
      // console.log(delta.newFile().path() + ' is modified.');
      changes.modify.push({
        ...newDocMetadata,
        // eslint-disable-next-line no-await-in-loop
        doc: await getDocument(gitDDB, docId, delta.newFile().id()),
      });
    }
  }

  return changes;
}

/**
 * Get commit logs
 *
 * @remarks Logs are sorted from old to new
 */
async function getCommitLogs (newCommit: nodegit.Commit, oldCommit: nodegit.Commit) {
  const endId = oldCommit.id().tostrS();
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
 * push_worker
 */
export async function push_worker (
  gitDDB: AbstractDocumentDB,
  sync: ISync,
  taskId: string
): Promise<SyncResult> {
  const remoteCommit = await gitDDB
    .repository()!
    .getReferenceCommit('refs/remotes/origin/main')
    .catch(() => undefined);

  const syncResult: SyncResult = {
    operation: 'push',
  };

  // Get commit log
  if (remoteCommit) {
    syncResult.commits = await getCommitLogs(
      await gitDDB.repository()!.getHeadCommit(),
      remoteCommit
    );
  }

  const headCommit = await push(gitDDB, sync, taskId);

  // Get changes
  if (headCommit && remoteCommit) {
    const diff = await nodegit.Diff.treeToTree(
      gitDDB.repository()!,
      await remoteCommit.getTree(),
      await headCommit.getTree()
    );
    syncResult.remote_changes = await getChanges(gitDDB, diff);
  }

  return syncResult;
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

  /**
   * Fetch
   */
  await fetch(gitDDB, sync);

  /**
   * Calc distance
   */
  const oldCommit = await repos.getHeadCommit();
  const distance = await calcDistance(
    gitDDB,
    oldCommit,
    await repos.getReferenceCommit('refs/remotes/origin/main')
  );
  // ahead: 0, behind 0 => Nothing to do: If local does not commit and remote does not commit
  // ahead: 0, behind 1 => Fast-forward merge : If local does not commit and remote pushed
  // ahead: 1, behind 0 => Push : If local committed and remote does not commit
  // ahead: 1, behind 1 => Resolve conflict and push: If local committed and remote pushed

  let conflictedIndex: nodegit.Index | undefined;
  let newCommitOid: nodegit.Oid | undefined;
  if (distance.ahead === 0 && distance.behind === 0) {
    return { operation: 'nop' };
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
      const changes = await getChanges(gitDDB, diff);

      const syncResult: SyncResult = {
        operation: 'fast-forward merge',
        local_changes: changes,
      };
      // Get commit log
      syncResult.commits = await getCommitLogs(newCommit, oldCommit);

      return syncResult;
    }
    else if (distance_again.ahead > 0 && distance_again.behind === 0) {
      // This case is occurred when
      // - a local file is changed and another remote file is changed.
      // - a local file is removed and the same remote file is removed.

      const diff = await nodegit.Diff.treeToTree(
        repos,
        await oldCommit.getTree(),
        await newCommit.getTree()
      );
      const local_changes = await getChanges(gitDDB, diff);

      // Change commit message
      await commitAmendMessage(gitDDB, sync, newCommitOid!, 'merge');

      // Need push because it is merged normally.
      const syncResult = await push_worker(gitDDB, sync, taskId);
      syncResult.operation = 'merge and push';
      syncResult.local_changes = local_changes;
      return syncResult;
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

    /**
     * NOTE:
     * Index from Repository.mergeBranch, Merge.merge or Merge.commit is in-memory only.
     * It cannot be used for commit operations.
     * Create a new copy of index for commit.
     * Repository#refreshIndex() grabs copy of latest index
     * See https://github.com/nodegit/nodegit/blob/master/examples/merge-with-conflicts.js
     */
    const _index = await repos.refreshIndex();

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

    const diff = await nodegit.Diff.treeToTree(
      repos,
      await oldCommit.getTree(),
      await (await repos.getCommit(overwriteCommitOid)).getTree()
    );
    const local_changes = await getChanges(gitDDB, diff);

    const opt = new nodegit.CheckoutOptions();
    opt.checkoutStrategy = nodegit.Checkout.STRATEGY.FORCE;
    await nodegit.Checkout.head(repos, opt);

    // Push
    const syncResult = await push_worker(gitDDB, sync, taskId);
    syncResult.operation = 'resolve conflicts and push';
    syncResult.local_changes = local_changes;
    return syncResult;
  }
}
