/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import { GitDocumentDB, RemoteOptions, SyncResult, TaskMetadata } from 'git-documentdb';
import { showChanges, sleep } from './utils';

const sync_example = async () => {
  /**
   * This example assumes you have an account on GitHub.
   * Please get your personal access token with checked [repo].
   * (See https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token )
   */
  let github_repository = 'https://github.com/enter_your_account_name/git-documentdb-example-sync.git'; 
  let your_github_personal_access_token = 'Enter your personal access token with checked [repo]';
  /**
   * You can also set them from environment variables:
   *  - GITDDB_GITHUB_USER_URL
   *      URL of your GitHub account
   *      e.g.) https://github.com/foo/
   *  - GITDDB_PERSONAL_ACCESS_TOKEN
   *      A personal access token of your GitHub account
   */
  if (process.env.GITDDB_GITHUB_USER_URL) github_repository = process.env.GITDDB_GITHUB_USER_URL + 'git-documentdb-example-sync.git';
  if (process.env.GITDDB_PERSONAL_ACCESS_TOKEN) your_github_personal_access_token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN;

  // @ts-ignore
  if (your_github_personal_access_token === 'Enter your personal access token with checked [repo]') {
    console.log('Please set your personal access token.');
    return;
  }

  /**
   * Synchronize among database A <--> GitHub <--> database B
   */

  /**
   * Set scheme for plain-text diff and patch.
   * Value of 'profile' property will be merged as plain-text.
   */ 
  const schema = {
    json: {
      plainTextProperties: {
        'profile': true,
      },
    },
  };
  // Create local database A.
  let dbA = new GitDocumentDB({
    dbName: 'dbA',
    schema,
  });
  /**
   * Open a local repository, or create it if it does not exist.
   */
  await dbA.open();  

  // Set options for synchronization
  const remoteOptions: RemoteOptions = {
    live: true,
    remoteUrl: github_repository,
    interval: 10000, // Sync every 10,000 msec
    connection: { type: 'github', personalAccessToken: your_github_personal_access_token },
  };
  /**
   * sync() connects to a remote repository on GitHub,
   * or creates it if it does not exist.
   */
  const syncA = await dbA.sync(remoteOptions);

  // Open or create local database B
  let dbB = new GitDocumentDB({
    dbName: 'dbB',
    schema,
  });
  await dbB.open();
  // Sync between database B and GitHub.
  const syncB = await dbB.sync(remoteOptions);
  
  // Listen change event which occurs when a document is changed.
  syncA.on('change', (syncResult: SyncResult, taskMetadata: TaskMetadata) => {
    showChanges(syncResult, 'A'); 
  })
    .on('error', (err: Error, taskMetadata: TaskMetadata) => console.log('[sync error on A] ' + err.message))
    .on('pause', () => console.log('[paused on A]'))
    .on('resume', () => console.log('[resumed on A]'))
    .on('start', (taskMetadata: TaskMetadata, currentRetries: number) => console.log('[sync start on A] <' + taskMetadata.taskId + '> retries: ' + currentRetries))
    .on('complete', (taskMetadata: TaskMetadata) => console.log('[sync complete on A] <' + taskMetadata.taskId + '>'));

  syncB.on('change', (syncResult: SyncResult, taskMetadata: TaskMetadata) => {
    showChanges(syncResult, 'B');    
  })
    .on('error', (err: Error, taskMetadata: TaskMetadata) => console.log('[sync error on B] ' + err.message))
    .on('pause', () => console.log('[paused on B]'))
    .on('resume', () => console.log('[resumed on B]'))
    .on('start', (taskMetadata: TaskMetadata, currentRetries: number) => console.log('[sync start on B] <' + taskMetadata.taskId + '> retries: ' + currentRetries))
    .on('complete', (taskMetadata: TaskMetadata) => console.log('[sync complete on B] <' + taskMetadata.taskId + '>'));

  /**
   * 'change' event includes changes in both local and remote sides in a synchronization.
   * 'localChange' event is shortcut to get only local changes.
   * syncA.on('localChange', (changedFiles: ChangedFile[], taskMetadata: TaskMetadata) => {
   *   changedFiles.forEach((file) => {
   *     // Get changes
   *   })
   * });
   */

  // Insert documents
  const json01 = { _id: '01', from: 'A', profile: 'I am from Kyoto.' };
  const json02 = { _id: '02', from: 'A', profile: 'I am from Tokyo.' };
  await dbA.insert(json01); 
  await dbA.insert(json02);

  // Fetching from server and pushing to server occur every 10sec.
  // Call trySync() manually if you cannot wait it!
  console.log('(1) Sync insert operations');
  await syncA.trySync(); // will invoke a change (push) on A.
  await syncB.trySync(); // will invoke a change (fast-forward merge) on B.

  // Update and delete
  const json01dash = { _id: '01', from: 'A (updated)', profile: 'I am from Nara.' };
  await dbA.update(json01dash);
  await dbA.delete(json02);
  console.log('\n(2) Sync update and delete operations');
  await syncA.trySync(); // will invoke a change (push) on A.

  // Wait automated synchronization on B.
  await sleep(syncB.options.interval + 5); 
  // A change (fast-forward merge) on B will occur in sleep.

  console.log('\n(3) Pause and resume sync');
  // Try to pause sync.
  await syncA.pause();
  await syncB.pause();
  // Try to resume sync.
  await syncA.resume();
  await syncB.resume();


  /**
   * Automated conflict resolution
   * 
   * Conflict occurs when the same _id documents are updated on both A and B.
   * 
   * Default strategy is merging each JSON property by "last sync wins".
   * In other words a property synchronized later overwrites a previous one.
   * Set remoteOptions.conflict_resolution_strategy to change it.
   * 
   * Plain-text values in JSON are merged by diff and patch if specified in scheme.
   */
  console.log('\n(4) Automated conflict resolution');
  const sameIdFromA = { _id: '01', from: 'A', profile: 'I am from Nara. I love cherry blossoms.' };
  const sameIdFromB = { _id: '01', from: 'B', profile: 'My name is Hidekazu and I am from Nara.' }; 
  await dbA.put(sameIdFromA); 
  await dbB.put(sameIdFromB); 

  // Synchronizations will run several times to resolve the conflict.
  let timeout = remoteOptions.interval! * 10;
  while (timeout > 0) {
    const resultA = await dbA.get('01');
    const resultB = await dbB.get('01');
    // Check if convergence has been reached.
    if(JSON.stringify(resultA) === JSON.stringify(resultB)) {
      console.log('\n(5) Resolved');
      console.log('result: ' + JSON.stringify(resultA) + '\n');
      // result: {"from":"B","profile":"My name is Hidekazu and I am from Nara. I love cherry blossoms.","_id":"01"}
      // Sometimes it starts with {"from": "A", ...} due to network reasons.
      break;
    }
    timeout -= remoteOptions.interval!;
    await sleep(remoteOptions.interval!);
  }

  // Clear documents on GitHub
  await dbA.delete('01');
  await syncA.trySync();

  /**
   * Uncomment them if you would like to delete the remote repository on GitHub.
   * (Before that, please check [delete_repo] of your personal access token.)
   * 
   * await syncA.pause();
   * await syncB.pause();
   * await syncA.remoteRepository.destroy();
   */

  // Destroy databases. Synchronization is stopped automatically.
  // Use close() instead of destroy() if you would like to leave DBs.
  await dbA.destroy();
  await dbB.destroy();
}

sync_example();

/** An example of output (It may change due to your network environment.)

(1) Sync insert operations
[sync start on A] <01F7G46PD12FB9ME6YMWEEDRHK> retries: 0

[sync change (push) on A]
 - insert {"from":"A","profile":"I am from Kyoto.","_id":"01"} into GitHub
 - insert {"from":"A","profile":"I am from Tokyo.","_id":"02"} into GitHub

[sync complete on A] <01F7G46PD12FB9ME6YMWEEDRHK>
[sync start on B] <01F7G46SPNYPADFPKR8D2YTS4Y> retries: 0

[sync change (fast-forward merge) on B]
 - insert {"from":"A","profile":"I am from Kyoto.","_id":"01"} into B
 - insert {"from":"A","profile":"I am from Tokyo.","_id":"02"} into B

[sync complete on B] <01F7G46SPNYPADFPKR8D2YTS4Y>

(2) Sync update and delete operations
[sync start on A] <01F7G46TF2ZKWXTQQBGA32BX8F> retries: 0

[sync change (push) on A]
 - update from {"from":"A","profile":"I am from Kyoto.","_id":"01"}
            to {"from":"A (updated)","profile":"I am from Nara.","_id":"01"} on GitHub
 - delete {"from":"A","profile":"I am from Tokyo.","_id":"02"} from GitHub

[sync complete on A] <01F7G46TF2ZKWXTQQBGA32BX8F>
[sync start on A] <01F7G46XTAAYYV9JR4W4EFF8WT> retries: 0
[sync complete on A] <01F7G46XTAAYYV9JR4W4EFF8WT>
[sync start on B] <01F7G47044NW8Z8PS3WG53D67Q> retries: 0

[sync change (fast-forward merge) on B]
 - update from {"from":"A","profile":"I am from Kyoto.","_id":"01"}
            to {"from":"A (updated)","profile":"I am from Nara.","_id":"01"} on B
 - delete {"from":"A","profile":"I am from Tokyo.","_id":"02"} from B

[sync complete on B] <01F7G47044NW8Z8PS3WG53D67Q>

(3) Pause and resume sync
[paused on A]
[paused on B]
[resumed on A]
[resumed on B]

(4) Automated conflict resolution
[sync start on A] <01F7G47H71T17F1E85MJ5A7D6V> retries: 0
[sync start on B] <01F7G47H73HBJD9C08TBB44EKC> retries: 0

[sync change (push) on A]
 - update from {"from":"A (updated)","profile":"I am from Nara.","_id":"01"}
            to {"from":"A","profile":"I am from Nara. I love cherry blossoms.","_id":"01"} on GitHub

[sync complete on A] <01F7G47H71T17F1E85MJ5A7D6V>
[sync error on B] Cannot push because a reference that you are trying to update on the remote contains commits that are not present locally.
[sync start on B] <01F7G47PSY3HQ8VG0WNVK11PME> retries: 1

[sync change (resolve conflicts and push) on B]
 - update from {"from":"B","profile":"My name is Hidekazu and I am from Nara.","_id":"01"}
            to {"from":"B","profile":"My name is Hidekazu and I am from Nara. I love cherry blossoms.","_id":"01"} on B
 - update from {"from":"A","profile":"I am from Nara. I love cherry blossoms.","_id":"01"}
            to {"from":"B","profile":"My name is Hidekazu and I am from Nara. I love cherry blossoms.","_id":"01"} on GitHub

[sync complete on B] <01F7G47PSY3HQ8VG0WNVK11PME>
[sync start on A] <01F7G47TZP5N2TPNM76BCHHATQ> retries: 0
[sync start on B] <01F7G47TZS0V8AP7SYZ31EENDM> retries: 0
[sync complete on B] <01F7G47TZS0V8AP7SYZ31EENDM>

[sync change (fast-forward merge) on A]
 - update from {"from":"A","profile":"I am from Nara. I love cherry blossoms.","_id":"01"}
            to {"from":"B","profile":"My name is Hidekazu and I am from Nara. I love cherry blossoms.","_id":"01"} on A

[sync complete on A] <01F7G47TZP5N2TPNM76BCHHATQ>
[sync start on A] <01F7G484RGSJ3DDFRA6JGG6ESA> retries: 0
[sync start on B] <01F7G484RKFS9G59N3D4S4PB9H> retries: 0

(5) Resolved
result: {"from":"B","profile":"My name is Hidekazu and I am from Nara. I love cherry blossoms.","_id":"01"}

[sync complete on B] <01F7G484RKFS9G59N3D4S4PB9H>
[sync complete on A] <01F7G484RGSJ3DDFRA6JGG6ESA>
[sync start on A] <01F7G4857RC2FPK0APRWSXPHZG> retries: 0

[sync change (push) on A]
 - delete {"from":"B","profile":"My name is Hidekazu and I am from Nara. I love cherry blossoms.","_id":"01"} from GitHub

[sync complete on A] <01F7G4857RC2FPK0APRWSXPHZG>
[paused on A]
[paused on B]
*/
