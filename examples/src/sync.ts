/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import { ChangedFile, GitDocumentDB, RemoteOptions, SyncResult } from 'git-documentdb';

const sleep = (msec: number) => new Promise(resolve => setTimeout(resolve, msec));

const sync_example = async () => {
  /**
   * These examples assume you have an account on GitHub.
   * Please get your personal access token with checked [repo].
   * (See https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token )
   */
  const github_repository = 'https://github.com/enter_your_accunt_name/git-documentdb-example-sync.git'; // Please enter your GitHub account name.
  const your_github_personal_access_token = 'Enter your personal access token with checked [repo]';
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

  // Create database A.
  let dbA = new GitDocumentDB({
    db_name: 'dbA',
  });
  /**
   * Create a local repository.
   *
   * Calling create() with remoteOptions
   * creates and connects to a remote repository on GitHub
   * if the remote repository does not exist.
   */
  const resultA = await dbA.open();  
  if (resultA.ok) await dbA.sync(remoteOptions);
  else await dbA.create(remoteOptions); 

  /**
   * git-documentdb-example-sync.git was automatically created in your GitHub account.
   * Now synchronization between database A and GitHub has started.
   * The data will be synchronized every remoteOptions.interval msec (10000 msec).
   * 
   * Check below if you fail:
   *  - It throws NoMergeBaseFoundError if the github_repository has already exist. 
   *    Delete it before running this example.
   *  - It throws RemoteRepositoryConnectError if [repo] is not checked
   *    in your personal access token settings.
   */

  // Create database B
  let dbB = new GitDocumentDB({
    db_name: 'dbB',
  });
  /**
   * Create another local repository.
   *
   * Calling create() with remoteOptions
   * clones a remote repository on GitHub
   * if the remote repository exists.
   */  
  const resultB = await dbB.open();
  if (resultB.ok) await dbB.sync(remoteOptions);  
  else await dbB.create(remoteOptions);
  
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
    else if (syncResult.action === 'resolve conflicts and push') {
      syncResult.changes.local.forEach(file => { console.log(' - ' + file.operation + ' ' + JSON.stringify(file.data.doc) + ' on A') });
      syncResult.changes.remote.forEach(file => { console.log(' - ' + file.operation + ' ' + JSON.stringify(file.data.doc) + ' on GitHub') });
    }
    console.log('\n');
  });
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

  // Listen synchronization error event.
  syncA.on('error', (err: Error) => {
    console.log('sync error on A: ' + err.message);
  });
  syncB.on('error', (err: Error) => {
    console.log('sync error on B: ' + err.message);
  });

  // Listen other events only on B for simplification.
  console.log('Listen [other events on B].');
  syncB.on('paused', () => {
    console.log('[paused on B]');
  });
  syncB.on('active', () => {
    console.log('[resumed on B]');
  });
  syncB.on('start', (taskId: string, currentRetries: number) => {
    // Can detect retry of a synchronization task
    console.log('[sync start on B] ' + taskId + ', retries: ' + currentRetries);
  });
  syncB.on('complete', (taskId: string) => {
    console.log('[sync complete on B] ' + taskId);
  });

  console.log('----------------------------------------\n');

  // Put documents from dbA.
  const json01 = { _id: '01', name: 'fromA' }
  const json02 = { _id: '02', name: 'fromA' }
  await dbA.put(json01); // invokes localChange event (create) on B.
  await dbA.put(json02); // invokes localChange event (create) on B.

  // localChange event automatically occurs within 10 or 20 seconds.
  // because remoteOptions.interval is set to 10000(msec).
  // Call trySync() by hand if you cannot wait it!
  await syncA.trySync();
  await syncB.trySync();

  // Update and delete from dbA.
  const json01dash = { _id: '01', name: 'fromA (updated)' };
  await dbA.put(json01dash); // invokes localChange event (update) on B
  await dbA.delete(json02); // invokes localChange event (delete) on B  
  await syncA.trySync();

  // Wait automated synchronization on B
  await sleep(syncB.options().interval + 5);

  // Pause sync
  await syncB.pause();
  // Resume sync
  await syncB.resume();


  /**
   * Automated conflict resolution
   * 
   * Create the same id document on both A and B.
   * The data on the side synchronized later overwrites the another side.
   * It is a default conflict resolution strategy.
   * Set remoteOptions.conflict_resolve_strategy to change it.
   */
  console.log('#### Conflict ####');
  const sameIdFromA = { _id: '03', name: 'fromA' };
  const sameIdFromB = { _id: '03', name: 'fromB' }; 
  await dbA.put(sameIdFromA); 
  await dbB.put(sameIdFromB); 

  // Several synchronizations will run to resolve the conflict.
  let timeout = remoteOptions.interval! * 10;
  while (timeout > 0) {
    const resultA = await dbA.get('03');
    const resultB = await dbB.get('03');
    if(JSON.stringify(resultA) === JSON.stringify(resultB)) {
      console.log('**** Resolved ****');
      console.log('result: ' + JSON.stringify(resultA) + '\n');
      break;
    }
    timeout -= remoteOptions.interval!;
    await sleep(remoteOptions.interval!);
  }

  // Clear the documents on GitHub
  await dbA.delete('01');
  await dbA.delete('03');
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
Listen [other events on B].
----------------------------------------


# push action on A
 - create {"name":"fromA","_id":"01"} on GitHub
 - create {"name":"fromA","_id":"02"} on GitHub


[sync start on B] 01F3XCEQGDB6R97F9NQ9PXFR71, retries: 0

# fast-forward merge action on B
 - create {"name":"fromA","_id":"01"} on B     
 - create {"name":"fromA","_id":"02"} on B     


[sync complete on B] 01F3XCEQGDB6R97F9NQ9PXFR71

# push action on A
 - update {"name":"fromA (updated)","_id":"01"} on GitHub
 - delete {"name":"fromA","_id":"02"} on GitHub


[sync start on B] 01F3XCEY9517Z1ERF67D63SRY8, retries: 0

# fast-forward merge action on B
 - update {"name":"fromA (updated)","_id":"01"} on B
 - delete {"name":"fromA","_id":"02"} on B


[sync complete on B] 01F3XCEY9517Z1ERF67D63SRY8
[paused on B]
[resumed on B]
#### Conflict ####

# push action on A
 - create {"name":"fromA","_id":"03"} on GitHub


[sync start on B] 01F3XCFEYWHNWDKFVCGSS39F70, retries: 0

# resolve conflicts and push action on B
 - update {"name":"fromB","_id":"03"} on GitHub


[sync complete on B] 01F3XCFEYWHNWDKFVCGSS39F70
[sync start on B] 01F3XCFRQW101ND8ZVC30SCK6H, retries: 0
[sync complete on B] 01F3XCFRQW101ND8ZVC30SCK6H

# fast-forward merge action on A
 - update {"name":"fromB","_id":"03"} on A


[sync start on B] 01F3XCG2GQENGCASJQHDTSKQS4, retries: 0
**** Resolved ****
result: {"name":"fromB","_id":"03"}

[sync complete on B] 01F3XCG2GQENGCASJQHDTSKQS4

# push action on A
 - delete {"name":"fromA (updated)","_id":"01"} on GitHub
 - delete {"name":"fromB","_id":"03"} on GitHub


[paused on B]
*/
