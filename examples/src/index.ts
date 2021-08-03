/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import { DEFAULT_SYNC_INTERVAL, GitDocumentDB, Err, Sync, Collection } from 'git-documentdb';

const gitddb_example = async () => {
  const gitDDB = new GitDocumentDB({
    dbName: 'db01', // Git working directory
  });

  /**
   * Open a database
   * 
   * Open or create a Git repository.
   * Git working directory is '/your/path/to/the/example/git-documentdb/db01/.git'.
   */
  await gitDDB.open();

  /**
   * Create a document
   * 
   * Git adds 'nara.json' under the working directory and commits it.
   */ 
  await gitDDB.put({ _id: 'nara', flower: 'cherry blossoms', season: 'spring' });

  console.log(`$ gitDDB.put({ flower: 'cherry blossoms' ... }) # Create`);
  console.log(await gitDDB.get('nara')); 
  // log: { flower: 'cherry blossoms', season: 'spring', _id: 'nara' }

  // Note that _id and a filename are linked.
  // So _id is better to be ASCII characters and a case-insensitive name for cross-platform.

  /**
   * Update a document if it exists.
   * 
   * Git adds an updated file and commits it.
   */
  await gitDDB.put({ _id: 'nara', flower: 'double cherry blossoms', season: 'spring' }); 

  /**
   * Read a document
   */
  const doc = await gitDDB.get('nara');

  console.log(`\n$ gitDDB.put({ flower: 'double cherry blossoms' ... }) # Update`);
  console.log(doc);
  // log: { flower: 'double cherry blossoms', season: 'spring', _id: 'nara' }

  /**
   * Delete a document
   * 
   * Git removes a file and commits it.
   */
  await gitDDB.delete('nara');

  console.log(`\n$ gitDDB.delete('nara') # Delete`);
  console.log(await gitDDB.get('nara'));
  // log: undefined
  
  /**
   * Use an auto-generated _id
   */
  const appleResult = await gitDDB.put({ name: 'apple' }); // _id does not exist.
  const apple = await gitDDB.get(appleResult._id);
  console.log(`\n_id of the JSON document is automatically generated`);
  console.log(apple);
  // log: { name: 'apple', _id: 'XXXXXXXXXXXXXXXXXXXXXXXXXX' }

  /**
   * Set namePrefix to add a prefix to an auto-generated _id
   */
  const gitDDBPrefix = new GitDocumentDB({
    dbName: 'db_prefix',
    namePrefix: 'fruit_',
  });
  await gitDDBPrefix.open();
  const fruitAppleResult = await gitDDBPrefix.put({ name: 'apple' });
  const fruitApple = await gitDDBPrefix.get(fruitAppleResult._id);
  console.log(fruitApple);
  // log: { name: 'apple', _id: 'fruit_XXXXXXXXXXXXXXXXXXXXXXXXXX' }


  /**
   * Revisions 
   * 
   * getOldRevision(id, 2) returns a document two revisions older than the latest.
   * 
   * #0 (latest): undefined (deleted)
   * #1: 'double cherry blossoms'
   * #2: 'cherry blossoms'
   */
  const oldDoc = await gitDDB.getOldRevision('nara', 2);

  console.log(`\n$ gitDDB.get('nara', 2) # Get a document two revisions older than the latest.`);
  console.log(oldDoc);
  // log: { flower: 'cherry blossoms', season: 'spring', _id: 'nara' }

  /**
   * Synchronization
   * 
   * Please enter your GitHub account name and personal access token.
   * See https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token
   */
  let github_repository = 'https://github.com/enter_your_account_name/git-documentdb-example.git'; 
  let your_github_personal_access_token = 'Enter your personal access token with checked [repo]';
  /**
   * You can also set them from environment variables:
   *  - GITDDB_GITHUB_USER_URL
   *      URL of your GitHub account
   *      e.g.) https://github.com/foo/
   *  - GITDDB_PERSONAL_ACCESS_TOKEN
   *      A personal access token of your GitHub account
   */
  if (process.env.GITDDB_GITHUB_USER_URL) github_repository = process.env.GITDDB_GITHUB_USER_URL + 'git-documentdb-example.git';
  if (process.env.GITDDB_PERSONAL_ACCESS_TOKEN) your_github_personal_access_token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN;

  let sync: Sync | undefined;
  if (your_github_personal_access_token !== 'Enter your personal access token with checked [repo]') {
    sync = await gitDDB.sync({
      live: true,
      remoteUrl: github_repository,
      connection: { type: 'github', personalAccessToken: your_github_personal_access_token },
      interval: DEFAULT_SYNC_INTERVAL,
    });
    // Private git-documentdb-example.git is automatically created (if not exists) in your GitHub account.
    console.log('\n# Start to synchronize with your private remote repository');
    console.log(`    (${sync.options.remoteUrl})`);
    console.log(`    every ${sync.options.interval} milliseconds.`);
    // The data will be synchronized every 30,000 milliseconds(DEFAULT_SYNC_INTERVAL).
  }

  /**
    Create documents under sub-directories

    git-documentdb
    └── db01
        ├── nara
        │   ├── nara_park.json
        │   └── tsukigase.json
        └── yoshino
            └── mt_yoshino.json

  */
  await gitDDB.put({ _id: 'nara/nara_park', flower: 'double cherry blossoms' });
  await gitDDB.put({ _id: 'nara/tsukigase', flower: 'Japanese apricot' });
  await gitDDB.put({ _id: 'yoshino/mt_yoshino', flower: 'awesome cherry blossoms' });

  console.log(`\n$ gitDDB.put({ _id: 'nara/nara_park' ... }) # Put into sub-directory`);
  console.log(`$ gitDDB.put({ _id: 'nara/tsukigase' ... })`);
  console.log(`$ gitDDB.put({ _id: 'yoshino/mt_yoshino' ... })`);

  // Read
  const flowerInYoshino = await gitDDB.get('yoshino/mt_yoshino');

  console.log(`$ gitDDB.get('yoshino/mt_yoshino') # Get from subdirectory`);
  console.log(flowerInYoshino);
  // log: { flower: 'awesome cherry blossoms', _id: 'yoshino/mt_yoshino' }


  /**
   * Prefix search
   * 
   * Read all the documents whose IDs start with the prefix.
   */ 
  const flowersInNara = await gitDDB.find({ prefix: 'nara/' });

  console.log(`\n$ gitDDB.find({ prefix: 'nara/' }) # Prefix search`);
  console.dir(flowersInNara, { depth: 3 });
  /* log:
    [
      { flower: 'double cherry blossoms', _id: 'nara/nara_park' },
      { flower: 'Japanese apricot', _id: 'nara/tsukigase' }
    ]
  */

  if (sync !== undefined) {
    console.log('\n# Sync immediately..');
    await sync.trySync();
  }
  console.log('\n# All the local documents are pushed to the remote repository.');

  // Close database
  await gitDDB.close();
  await gitDDBPrefix.close();
};
gitddb_example();
