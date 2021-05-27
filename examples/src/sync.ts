/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import { GitDocumentDB, RemoteOptions, SyncResult, Task, TaskMetadata } from 'git-documentdb';
import { showChanges, sleep } from './utils';

const sync_example = async () => {
  /**
   * This example assumes you have an account on GitHub.
   * Please get your personal access token with checked [repo].
   * (See https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token )
   */
  let github_repository = 'https://github.com/enter_your_account_name/git-documentdb-example-sync.git'; 
  let your_github_personal_access_token = 'Enter your personal access token with checked [repo]';
  // You can also set them from environment variables:
  //  - GITDDB_GITHUB_USER_URL: URL of your GitHub account
  //    e.g.) https://github.com/foo/
  //  - GITDDB_PERSONAL_ACCESS_TOKEN: A personal access token of your GitHub account
  if (process.env.GITDDB_GITHUB_USER_URL) github_repository = process.env.GITDDB_GITHUB_USER_URL + 'git-documentdb-example-sync.git';
  if (process.env.GITDDB_PERSONAL_ACCESS_TOKEN) your_github_personal_access_token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN;

  // @ts-ignore
  if (your_github_personal_access_token === 'Enter your personal access token with checked [repo]') {
    console.log('Please set your personal access token.');
    return;
  }

  // Set options for synchronization
  const remoteOptions: RemoteOptions = {
    live: true,
    remote_url: github_repository,
    interval: 10000, // 10,000 msec
    connection: { type: 'github', personal_access_token: your_github_personal_access_token },
  };

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
  // Create database A.
  let dbA = new GitDocumentDB({
    db_name: 'dbA',
    schema,
  });
  /**
   * Open or create local and remote repositories.
   * 
   * - Open a local repository, or create it if not ok.
   * 
   * - sync() connects to a remote repository on GitHub,
   *   or creates it if not exists.
   * 
   * - createDB() creates a local repository and opens it.
   *   createdDB() with RemoteOptions additionally clones a remote repository,
   *   or creates it if not exists.
   */
  const resultA = await dbA.open();  
  if (resultA.ok) await dbA.sync(remoteOptions);
  else await dbA.createDB(remoteOptions); 
  
  /**
   * git-documentdb-example-sync.git has been automatically created in your GitHub account.
   * 
   * Synchronization between database A and GitHub starts from now.
   * The data will be synchronized every remoteOptions.interval msec (10,000 msec).
   * 
   * Check below if you fail:
   *  - It throws Error if the github_repository has already exist. 
   *    Delete it before running this example.
   *  - It throws Error if [repo] is not checked
   *    in your personal access token settings.
   */

  // Create dbB
  let dbB = new GitDocumentDB({
    db_name: 'dbB',
    schema,
  });
  /**
   * Create another local repository.
   */  
  const resultB = await dbB.open();
  if (resultB.ok) await dbB.sync(remoteOptions);  
  else await dbB.createDB(remoteOptions);
  
  /**
   * Synchronization between database B and GitHub starts from now.
   */
  
  // Listen change event which occurs when a document is changed.
  const syncA = dbA.getSynchronizer(github_repository);
  syncA.on('change', (syncResult: SyncResult, taskMetadata: TaskMetadata) => {
    showChanges(syncResult, 'A'); 
  });
  syncA.on('error', (err: Error, taskMetadata: TaskMetadata) => console.log('[sync error on A] ' + err.message))
    .on('paused', () => console.log('[paused on A]'))
    .on('active', () => console.log('[resumed on A]'))
    .on('start', (taskMetadata: TaskMetadata, currentRetries: number) => console.log('[sync start on A] <' + taskMetadata.taskId + '> retries: ' + currentRetries))
    .on('complete', (taskMetadata: TaskMetadata) => console.log('[sync complete on A] <' + taskMetadata.taskId + '>'));

  const syncB = dbB.getSynchronizer(github_repository);    
  syncB.on('change', (syncResult: SyncResult, taskMetadata: TaskMetadata) => {
    showChanges(syncResult, 'B');    
  });
  syncB.on('error', (err: Error, taskMetadata: TaskMetadata) => console.log('[sync error on B] ' + err.message))
    .on('paused', () => console.log('[paused on B]'))
    .on('active', () => console.log('[resumed on B]'))
    .on('start', (taskMetadata: TaskMetadata, currentRetries: number) => console.log('[sync start on B] <' + taskMetadata.taskId + '> retries: ' + currentRetries))
    .on('complete', (taskMetadata: TaskMetadata) => console.log('[sync complete on B] <' + taskMetadata.taskId + '>'));

  /**
   * 'change' event includes changes in both local and remote sides in a synchronization.
   * 'localChange' event is shortcut to get only local changes.
   * syncA.on('localChange', (changedFiles: ChangedFile[]) => {
   *   changedFiles.forEach((file) => {
   *     // Get changes
   *   })
   * });
   */

  // Put documents on A.
  const json01 = { _id: '01', from: 'A', profile: 'I am from Kyoto.' };
  const json02 = { _id: '02', from: 'A', profile: 'I am from Tokyo.' };
  await dbA.insert(json01); 
  await dbA.insert(json02);

  // 'change' events will occur within 10 or 20 seconds
  // because remoteOptions.interval is set to 10,000(msec).
  // Call trySync() by hand if you cannot wait it!
  console.log('(1) Sync insert operations');
  await syncA.trySync(); // will invoke a change (push) on A, which includes two insert operations.
  await syncB.trySync(); // will invoke a change (fast-forward merge) on B, which includes two insert operations.

  // Update and delete on A.
  const json01dash = { _id: '01', from: 'A (updated)', profile: 'I am from Nara.' };
  await dbA.update(json01dash);
  await dbA.delete(json02);
  console.log('\n(2) Sync update and delete operations');
  await syncA.trySync(); // will invoke a change (push) on A, which includes update and delete operations.

  // Wait automated synchronization on B.
  await sleep(syncB.options().interval + 5); // will invoke a change (fast-forward merge) on B, which includes update and delete operations.

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
   * Update the same id document on both A and B.
   * Default strategy is "Last sync wins".
   * In other words a document synchronized later overwrites a previous document.
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
    // Check if convergence was reached.
    if(JSON.stringify(resultA) === JSON.stringify(resultB)) {
      console.log('\n(5) Resolved');
      // result: {"from":"B","profile":"My name is Hidekazu and I am from Nara. I love cherry blossoms.","_id":"01"}
      console.log('result: ' + JSON.stringify(resultA) + '\n');
      break;
    }
    timeout -= remoteOptions.interval!;
    await sleep(remoteOptions.interval!);
  }

  // Clear documents on GitHub
  await dbA.delete('01');
  await syncA.trySync();

  // Stop sync and destroy databases.
  // Use close() instead of destroy() if you would like to leave DBs.
  await dbA.destroy();
  await dbB.destroy();
}

sync_example();

/** An example of output (It may change due to your network environment.)

(1) Sync insert operations
[sync start on A] <01F6J52Y2NPFTWK7A8EME7KVE6> retries: 0

[sync change (push) on A]
 - insert {"from":"A","profile":"I am from Kyoto.","_id":"01"} on GitHub
 - insert {"from":"A","profile":"I am from Tokyo.","_id":"02"} on GitHub

[sync complete on A] <01F6J52Y2NPFTWK7A8EME7KVE6>
[sync start on B] <01F6J530ZRM6SNYC71J01N2V6Z> retries: 0

[sync change (fast-forward merge) on B]
 - insert {"from":"A","profile":"I am from Kyoto.","_id":"01"} on B
 - insert {"from":"A","profile":"I am from Tokyo.","_id":"02"} on B

[sync complete on B] <01F6J530ZRM6SNYC71J01N2V6Z>

(2) Sync update and delete operations
[sync start on A] <01F6J531ZM1ZQJ6SN975ETGAK2> retries: 0

[sync change (push) on A]
 - update from {"from":"A","profile":"I am from Kyoto.","_id":"01"}
            to {"from":"A (updated)","profile":"I am from Nara.","_id":"01"} on GitHub
 - delete {"from":"A","profile":"I am from Tokyo.","_id":"02"} on GitHub

[sync complete on A] <01F6J531ZM1ZQJ6SN975ETGAK2>
[sync start on A] <01F6J535PEVB6Q1FNQH3KCGHDX> retries: 0
[sync complete on A] <01F6J535PEVB6Q1FNQH3KCGHDX>
[sync start on B] <01F6J537ST0BQBYYQ7HG02DRTS> retries: 0

[sync change (fast-forward merge) on B]
 - update from {"from":"A","profile":"I am from Kyoto.","_id":"01"}
            to {"from":"A (updated)","profile":"I am from Nara.","_id":"01"} on B
 - delete {"from":"A","profile":"I am from Tokyo.","_id":"02"} on B

[sync complete on B] <01F6J537ST0BQBYYQ7HG02DRTS>

(3) Pause and resume sync
[paused on A]
[paused on B]
[resumed on A]
[resumed on B]

(4) Automated conflict resolution
[sync start on A] <01F6J53RFH3Y1JP2Y5CX80K2HQ> retries: 0
[sync start on B] <01F6J53RFMGDW2340TM10SGSFD> retries: 0

[sync change (push) on A]
 - update from {"from":"A (updated)","profile":"I am from Nara.","_id":"01"}
            to {"from":"A","profile":"I am from Nara. I love cherry blossoms.","_id":"01"} on GitHub

[sync complete on A] <01F6J53RFH3Y1JP2Y5CX80K2HQ>
[sync error on B] Cannot push because a reference that you are trying to update on the remote contains commits that are not present locally.
[sync start on B] <01F6J53Y4THC89GYA4YQXSB58D> retries: 1

[sync change (resolve conflicts and push) on B]
 - update from {"from":"B","profile":"My name is Hidekazu and I am from Nara.","_id":"01"}
            to {"from":"B","profile":"My name is Hidekazu and I am from Nara. I love cherry blossoms.","_id":"01"} on B
 - update from {"from":"A","profile":"I am from Nara. I love cherry blossoms.","_id":"01"}
            to {"from":"B","profile":"My name is Hidekazu and I am from Nara. I love cherry blossoms.","_id":"01"} on GitHub

[sync complete on B] <01F6J53Y4THC89GYA4YQXSB58D>
[sync start on A] <01F6J5428R0Q2PTBGVFEM837ZP> retries: 0
[sync start on B] <01F6J5428V1R65D5G0DEW3VSWN> retries: 0
[sync complete on B] <01F6J5428V1R65D5G0DEW3VSWN>

[sync change (fast-forward merge) on A]
 - update from {"from":"A","profile":"I am from Nara. I love cherry blossoms.","_id":"01"}
            to {"from":"B","profile":"My name is Hidekazu and I am from Nara. I love cherry blossoms.","_id":"01"} on A

[sync complete on A] <01F6J5428R0Q2PTBGVFEM837ZP>
[sync start on A] <01F6J54C1JJ3033ZFWVAV00SK5> retries: 0
[sync start on B] <01F6J54C1N3N2A2QS28WDC9HVQ> retries: 0

(5) Resolved
result: {"from":"B","profile":"My name is Hidekazu and I am from Nara. I love cherry blossoms.","_id":"01"}

[sync complete on A] <01F6J54C1JJ3033ZFWVAV00SK5>
[sync complete on B] <01F6J54C1N3N2A2QS28WDC9HVQ>
[sync start on A] <01F6J54CGCVPMSXK6FE6S8E6A7> retries: 0

[sync change (push) on A]
 - delete {"from":"B","profile":"My name is Hidekazu and I am from Nara. I love cherry blossoms.","_id":"01"} on GitHub

[sync complete on A] <01F6J54CGCVPMSXK6FE6S8E6A7>
[paused on A]
[paused on B]

*/
