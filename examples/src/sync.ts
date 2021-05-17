/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import { GitDocumentDB, RemoteOptions, SyncResult } from 'git-documentdb';

const sleep = (msec: number) => new Promise(resolve => setTimeout(resolve, msec));

const sync_example = async () => {
  /**
   * These examples assume you have an account on GitHub.
   * Please get your personal access token with checked [repo].
   * (See https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token )
   */
  const github_repository = 'https://github.com/enter_your_account_name/git-documentdb-example-sync.git'; // Please enter your GitHub account name.
  const your_github_personal_access_token = 'Enter your personal access token with checked [repo]';
  // @ts-ignore
  if (your_github_personal_access_token === 'Enter your personal access token with checked [repo]') {
    console.log('Please set your personal access token.');
    return;
  }

  // Set options for synchronization
  const remoteOptions: RemoteOptions = {
    live: true,
    remote_url: github_repository,
    interval: 10000,
    connection: { type: 'github', personal_access_token: your_github_personal_access_token },
  };

  /**
   * Synchronize among database A <--> GitHub <--> database B
   */

  /**
   * Use scheme for plain-text diff and patch.
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
   * Create a local repository.
   *
   * Calling createDB() with remoteOptions
   * creates and connects to a remote repository on GitHub
   * if the remote repository does not exist.
   */
  const resultA = await dbA.open();  
  if (resultA.ok) await dbA.sync(remoteOptions);
  else await dbA.createDB(remoteOptions); 

  /**
   * git-documentdb-example-sync.git was automatically created in your GitHub account.
   * Now synchronization between database A and GitHub has started.
   * The data will be synchronized every remoteOptions.interval msec (10000 msec).
   * 
   * Check below if you fail:
   *  - It throws Error if the github_repository has already exist. 
   *    Delete it before running this example.
   *  - It throws Error if [repo] is not checked
   *    in your personal access token settings.
   */

  // Create database B
  let dbB = new GitDocumentDB({
    db_name: 'dbB',
    schema,
  });
  /**
   * Create another local repository.
   *
   * Calling createDB() with remoteOptions
   * clones a remote repository on GitHub
   * if the remote repository exists.
   */  
  const resultB = await dbB.open();
  if (resultB.ok) await dbB.sync(remoteOptions);  
  else await dbB.createDB(remoteOptions);
  
  /**
   * Now synchronization between database B and GitHub has started.
   */
  
  // Listen localChange event which occurs when a document is changed.
  console.log('----------------------------------------');
  console.log('# Listen SyncResult on both A and B.');    
  const syncA = dbA.getSynchronizer(github_repository);
  const syncB = dbB.getSynchronizer(github_repository);
  // Listen change event which tells changes in detail.
  syncA.on('change', (syncResult: SyncResult) => {
    console.log('\n# ' + syncResult.action + ' action on A');
    if (syncResult.action === 'push')
      syncResult.changes.remote.forEach(file => { console.log(' - ' + file.operation + ' ' + JSON.stringify(file.data.doc) + ' on GitHub') });
    else if (syncResult.action === 'fast-forward merge')
      syncResult.changes.local.forEach(file => { console.log(' - ' + file.operation + ' ' + JSON.stringify(file.data.doc) + ' on A') });
    else if (syncResult.action === 'merge and push') {
      syncResult.changes.local.forEach(file => { console.log(' - ' + file.operation + ' ' + JSON.stringify(file.data.doc) + ' on A') });
      syncResult.changes.remote.forEach(file => { console.log(' - ' + file.operation + ' ' + JSON.stringify(file.data.doc) + ' on GitHub') });
    }
    else if (syncResult.action === 'merge and push error') {
      syncResult.changes.local.forEach(file => { console.log(' - ' + file.operation + ' ' + JSON.stringify(file.data.doc) + ' on A') });
    }
    else if (syncResult.action === 'resolve conflicts and push') {
      syncResult.changes.local.forEach(file => { console.log(' - ' + file.operation + ' ' + JSON.stringify(file.data.doc) + ' on A') });
      syncResult.changes.remote.forEach(file => { console.log(' - ' + file.operation + ' ' + JSON.stringify(file.data.doc) + ' on GitHub') });
    }
    else if (syncResult.action === 'resolve conflicts and push error') {
      syncResult.changes.local.forEach(file => { console.log(' - ' + file.operation + ' ' + JSON.stringify(file.data.doc) + ' on A') });
    }
    console.log('\n');
  });
  syncA.on('error', (err: Error) => console.log('sync error on A: ' + err.message));
  syncA.on('paused', () => console.log('[paused on A]'));
  syncA.on('active', () => console.log('[resumed on A]'));
  syncA.on('start', (taskId: string, currentRetries: number) => console.log('[sync start on A] ' + taskId + ', retries: ' + currentRetries));
  syncA.on('complete', (taskId: string) => console.log('[sync complete on A] ' + taskId));

  syncB.on('change', (syncResult: SyncResult) => {
    console.log('\n# ' + syncResult.action + ' action on B');
    if (syncResult.action === 'push')
      syncResult.changes.remote.forEach(file => { console.log(' - ' + file.operation + ' ' + JSON.stringify(file.data.doc) + ' on GitHub') });
    else if (syncResult.action === 'fast-forward merge')
      syncResult.changes.local.forEach(file => { console.log(' - ' + file.operation + ' ' + JSON.stringify(file.data.doc) + ' on B') });
    else if (syncResult.action === 'merge and push') {
      syncResult.changes.local.forEach(file => { console.log(' - ' + file.operation + ' ' + JSON.stringify(file.data.doc) + ' on B') });
      syncResult.changes.remote.forEach(file => { console.log(' - ' + file.operation + ' ' + JSON.stringify(file.data.doc) + ' on GitHub') });
    }
    else if (syncResult.action === 'resolve conflicts and push') {
      syncResult.changes.local.forEach(file => { console.log(' - ' + file.operation + ' ' + JSON.stringify(file.data.doc) + ' on B') });
      syncResult.changes.remote.forEach(file => { console.log(' - ' + file.operation + ' ' + JSON.stringify(file.data.doc) + ' on GitHub') });
    }
    console.log('\n');
  });
  syncB.on('error', (err: Error) => console.log('sync error on B: ' + err.message));
  syncB.on('paused', () => console.log('[paused on B]'));
  syncB.on('active', () => console.log('[resumed on B]'));
  syncB.on('start', (taskId: string, currentRetries: number) => console.log('[sync start on B] ' + taskId + ', retries: ' + currentRetries));
  syncB.on('complete', (taskId: string) => console.log('[sync complete on B] ' + taskId));

  /* localChange is shortcut to get local changes.
  syncA.on('localChange', (changedFiles: ChangedFile[]) => {
    changedFiles.forEach((file) => {
      console.log(' - ' + file.operation + ' ' + JSON.stringify(file.data.doc) + ' on A\n');      
    })
  });
  syncB.on('localChange', (changedFiles: ChangedFile[]) => {
    changedFiles.forEach((file) => {
      console.log(' - ' + file.operation + ' ' + JSON.stringify(file.data.doc) + ' on B\n');
    })
  });
  */

  console.log('----------------------------------------\n');

  // Put documents from dbA.
  const json01 = { _id: '01', from: 'A', profile: 'I am from Kyoto.' };
  const json02 = { _id: '02', from: 'A', profile: 'I am from Tokyo.' };
  await dbA.put(json01); // will invoke a change event (insert) on B.
  await dbA.put(json02); // will invoke a change event (insert) on B.

  // 'change' events will occur within 10 or 20 seconds
  // because remoteOptions.interval is set to 10000(msec).
  // Call trySync() by hand if you cannot wait it!
  await syncA.trySync();
  await syncB.trySync();

  // Update and delete from dbA.
  const json01dash = { _id: '01', from: 'A (updated)', profile: 'I am from Nara.' };
  await dbA.put(json01dash); // will invoke change event (update) on B
  await dbA.delete(json02); // will invoke change event (delete) on B  
  await syncA.trySync();

  // Wait automated synchronization on B
  await sleep(syncB.options().interval + 5);

  // Try to pause sync.
  await syncB.pause();
  // Try to resume sync.
  await syncB.resume();


  /**
   * Automated conflict resolution
   * 
   * Create the same id document on both A and B.
   * The data on the side synchronized later overwrites the another side.
   * Plain-texts are merged if possible.
   * This is a default conflict resolution strategy (ours-diff).
   * 
   * Set remoteOptions.conflict_resolution_strategy to change it.
   */
  console.log('\n**** Automated conflict resolution ****');
  const sameIdFromA = { _id: '01', from: 'A', profile: 'I am from Nara. I love cherry blossoms.' };
  const sameIdFromB = { _id: '01', from: 'B', profile: 'My name is Hidekazu and I am from Nara.' }; 
  await dbA.put(sameIdFromA); 
  await dbB.put(sameIdFromB); 

  // Several synchronizations will run to resolve the conflict.
  let timeout = remoteOptions.interval! * 10;
  while (timeout > 0) {
    const resultA = await dbA.get('01');
    const resultB = await dbB.get('01');
    if(JSON.stringify(resultA) === JSON.stringify(resultB)) {
      console.log('\n**** Resolved ****');
      // result: {"from":"B","profile":"My name is Hidekazu and I am from Nara. I love cherry blossoms.","_id":"01"}
      console.log('result: ' + JSON.stringify(resultA) + '\n');
      break;
    }
    timeout -= remoteOptions.interval!;
    await sleep(remoteOptions.interval!);
  }

  // Clear the documents on GitHub
  await dbA.delete('01');
  await syncA.trySync();

  // Stop sync and destroy DBs
  // Use close() instead of destroy() if you would like to leave DBs.
  await dbA.destroy();
  await dbB.destroy();
}

sync_example();

/** An example of output (It may change due to your network environment.)

----------------------------------------
# Listen SyncResult on both A and B.
----------------------------------------

[sync start on A] 01F5R6PMYZK34CNQ09KXQ6DH8S, retries: 0

# push action on A
 - insert {"from":"A","profile":"I am from Kyoto.","_id":"01"} on GitHub
 - insert {"from":"A","profile":"I am from Tokyo.","_id":"02"} on GitHub


[sync complete on A] 01F5R6PMYZK34CNQ09KXQ6DH8S
[sync start on B] 01F5R6PQSXC9E819R67A749TAQ, retries: 0

# fast-forward merge action on B
 - insert {"from":"A","profile":"I am from Kyoto.","_id":"01"} on B
 - insert {"from":"A","profile":"I am from Tokyo.","_id":"02"} on B


[sync complete on B] 01F5R6PQSXC9E819R67A749TAQ
[sync start on A] 01F5R6PRRVWSPCE2B69HW0ZYVW, retries: 0

# push action on A
 - update {"from":"A (updated)","profile":"I am from Nara.","_id":"01"} on GitHub
 - delete {"from":"A","profile":"I am from Tokyo.","_id":"02"} on GitHub


[sync complete on A] 01F5R6PRRVWSPCE2B69HW0ZYVW
[sync start on A] 01F5R6PWMQZFMM0GY7PZA6V48Y, retries: 0
[sync complete on A] 01F5R6PWMQZFMM0GY7PZA6V48Y
[sync start on B] 01F5R6PYNR23F5JBANBY68GN2P, retries: 0

# fast-forward merge action on B
 - update {"from":"A (updated)","profile":"I am from Nara.","_id":"01"} on B
 - delete {"from":"A","profile":"I am from Tokyo.","_id":"02"} on B


[sync complete on B] 01F5R6PYNR23F5JBANBY68GN2P
[paused on B]
[resumed on B]

**** Automated conflict resolution ****
[sync start on A] 01F5R6Q6D8DMNVP4Q0PP27AN9Q, retries: 0

# push action on A
 - update {"from":"A","profile":"I am from Nara. I love cherry blossoms.","_id":"01"} on GitHub


[sync complete on A] 01F5R6Q6D8DMNVP4Q0PP27AN9Q
[sync start on B] 01F5R6QF7MDP357B852GV64VH8, retries: 0
[sync start on A] 01F5R6QG64TRXNM4X25C9DPJRG, retries: 0
[sync complete on A] 01F5R6QG64TRXNM4X25C9DPJRG

# resolve conflicts and push action on B
 - update {"from":"B","profile":"My name is Hidekazu and I am from Nara. I love cherry blossoms.","_id":"01"} on B
 - update {"from":"B","profile":"My name is Hidekazu and I am from Nara. I love cherry blossoms.","_id":"01"} on GitHub


[sync complete on B] 01F5R6QF7MDP357B852GV64VH8
[sync start on B] 01F5R6QS09ZNTMMPF84JN1S2TP, retries: 0
[sync complete on B] 01F5R6QS09ZNTMMPF84JN1S2TP
[sync start on A] 01F5R6QSYTCHA8638PWAB8P3NY, retries: 0

# fast-forward merge action on A
 - update {"from":"B","profile":"My name is Hidekazu and I am from Nara. I love cherry blossoms.","_id":"01"} on A


[sync complete on A] 01F5R6QSYTCHA8638PWAB8P3NY
[sync start on B] 01F5R6R2S0V9TZV3ZMVXRV2K97, retries: 0

**** Resolved ****
result: {"from":"B","profile":"My name is Hidekazu and I am from Nara. I love cherry blossoms.","_id":"01"}

[sync start on A] 01F5R6R2V6PJNWRRQZAWKRG3ER, retries: 0
[sync complete on B] 01F5R6R2S0V9TZV3ZMVXRV2K97

# push action on A
 - delete {"from":"B","profile":"My name is Hidekazu and I am from Nara. I love cherry blossoms.","_id":"01"} on GitHub


[sync complete on A] 01F5R6R2V6PJNWRRQZAWKRG3ER
[paused on A]
[paused on B]
*/
