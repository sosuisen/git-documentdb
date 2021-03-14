/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */
import nodePath from 'path';
import nodegit from '@sosuisen/nodegit';
import fs from 'fs-extra';
import { RepositoryNotOpenError, SyncWorkerFetchError } from '../error';
import { AbstractDocumentDB } from '../types_gitddb';
import { IRemoteAccess } from '../types';

export async function push_worker (this: AbstractDocumentDB, remoteAccess: IRemoteAccess) {
  const repos = this.getRepository();
  if (repos === undefined) {
    throw new RepositoryNotOpenError();
  }
  const remote: nodegit.Remote = await repos.getRemote('origin');
  await remote.push([`refs/heads/${this.defaultBranch}:refs/heads/${this.defaultBranch}`], {
    callbacks: remoteAccess.callbacks,
  });
}

// eslint-disable-next-line complexity
export async function sync_worker (this: AbstractDocumentDB, remoteAccess: IRemoteAccess) {
  const repos = this.getRepository();
  if (repos === undefined) {
    throw new RepositoryNotOpenError();
  }

  console.debug('fetch: ' + remoteAccess.getRemoteURL());
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
  console.dir(distance);
  // ahead: 0, behind 0 => Nothing to do: If local does not commit and remote does not commit
  // ahead: 0, behind 1 => Fast-forward merge : If local does not commit and remote pushed
  // ahead: 1, behind 0 => Push : If local committed and remote does not commit
  // ahead: 1, behind 1 => Resolve conflict and push: If local committed and remote pushed

  let conflictedIndex: nodegit.Index | undefined;
  let commitOid: nodegit.Oid | undefined;
  if (distance.ahead === 0 && distance.behind === 0) {
    console.log('Nothing to do.');
    return;
  }
  else if (distance.ahead === 0 && distance.behind > 0) {
    commitOid = await repos
      .mergeBranches(this.defaultBranch, `origin/${this.defaultBranch}`)
      .catch((res: nodegit.Index) => {
        /* returns conflicted index */ conflictedIndex = res;
        return undefined;
      });
  }
  else if (distance.ahead > 0 && distance.behind > 0) {
    commitOid = await repos
      .mergeBranches(this.defaultBranch, `origin/${this.defaultBranch}`)
      .catch((res: nodegit.Index) => {
        /* returns conflicted index */ conflictedIndex = res;
        return undefined;
      });
  }
  else if (distance.ahead > 0 && distance.behind === 0) {
    // Push
    const remote: nodegit.Remote = await repos.getRemote('origin');
    await remote.push(['refs/heads/main:refs/heads/main'], {
      callbacks: remoteAccess.callbacks,
    });
    console.log('Pushed.');
    return;
  }

  /*  
      // Check if merge is needed.
      const annotatedCommit = await nodegit.AnnotatedCommit.fromRevspec(repos, 'refs/remotes/origin/main')
      const head = await repos.getHeadCommit()
      console.log('ours:' + head.id().tostrS());
      console.log('theirs:' + annotatedCommit.id().tostrS());
      if (head.id().tostrS() === annotatedCommit.id().tostrS()){
        console.log('cancel merge');
        return;
      }
    
      // Start merge
      await nodegit.Merge.merge(repos, annotatedCommit, undefined, checkoutOptions);
    */
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
    // Conflict is not occurred if a local file is removed and the same remote file is removed.
    // But they cannot be fast-forward merged. They are merged by usual merging branch.

    /*
      await _index.write();
      const treeOid: nodegit.Oid = await _index.writeTree();
      const commitMessage = 'put: xxx';
      const commitOid: nodegit.Oid = await repos.createCommit(
          'HEAD',
          author,
          committer,
          commitMessage,
          treeOid!,
          [await repos.getHeadCommit(), annotatedCommit.id()]
        );
      repos.stateCleanup();
      // await nodegit.Checkout.head(repos, checkoutOptions);
      */

    const distance_again = ((await nodegit.Graph.aheadBehind(
      repos,
      (await repos.getHeadCommit()).id(),
      (await repos.getReferenceCommit('refs/remotes/origin/main')).id()
    )) as unknown) as { ahead: number; behind: number };
    console.dir(distance_again);
    if (distance_again.ahead === 0 && distance_again.behind === 0) {
      console.log('Fast-forward merge done.');
    }
    else if (distance_again.ahead > 0 && distance_again.behind === 0) {
      // It is occurred when a local file is removed and the same remote file is removed.
      // Normal merge. Need push
      console.log('Normal merge done.');
      const commit = await repos.getCommit(commitOid!);
      const commitMessage = 'merge';
      await commit.amend(
        'HEAD',
        remoteAccess.author,
        remoteAccess.committer,
        commit.messageEncoding(),
        commitMessage,
        await commit.getTree()
      );
      // Push
      const remote: nodegit.Remote = await repos.getRemote('origin');
      await remote.push(['refs/heads/main:refs/heads/main'], {
        callbacks: remoteAccess.callbacks,
      });
      console.log('Pushed.');
    }
    else if (distance_again.behind > 0) {
      /**
       * Remote is advanced while merging
       */
      throw new Error('Remote is advanced while merging.');
    }
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
      console.log(stage + ':' + entry.path);

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
    console.log('overwritten by ours');

    await _index.write();

    const treeOid: nodegit.Oid | void = await _index
      .writeTree()
      .catch(err => console.log('writeTree():', err));
    if (treeOid === undefined) return;

    const overwriteCommitOid: nodegit.Oid = await repos.createCommit(
      'HEAD',
      remoteAccess.author,
      remoteAccess.committer,
      commitMessage,
      treeOid,
      [await repos.getHeadCommit(), remoteCommit]
    );
    repos.stateCleanup();
    console.log('committed');
    await repos.getCommit(overwriteCommitOid);

    const opt = new nodegit.CheckoutOptions();
    opt.checkoutStrategy = nodegit.Checkout.STRATEGY.FORCE;
    await nodegit.Checkout.head(repos, opt);
    console.log('Resolving conflict done.');

    // Push
    const remote: nodegit.Remote = await repos.getRemote('origin');
    await remote.push(['refs/heads/main:refs/heads/main'], {
      callbacks: remoteAccess.callbacks,
    });
    console.log('Pushed.');
  }
}
