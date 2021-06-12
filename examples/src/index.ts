/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import { GitDocumentDB, Sync } from 'git-documentdb';

const gitddb_example = async () => {
  let gitDDB = new GitDocumentDB({
    dbName: 'db01', // Git working directory
  });

  // Open a repository at /your/path/to/the/example/git-documentdb/db01/.git
  const result = await gitDDB.open(); 
  // Create and open the repository if not exits.
  if (!result.ok) await gitDDB.createDB(); 
  // Create
  await gitDDB.put({ _id: 'nara', flower: 'cherry blossoms', season: 'spring' });
  // Git adds 'nara.json' under the working directory and commits it.

  console.log(`$ gitDDB.put({ _id: 'nara' ... }) # Create`);
  console.log(await gitDDB.get('nara')); // { _id: 'nara', flower: 'cherry blossoms', season: 'spring' }
  

  // Update document if exists.
  await gitDDB.put({ _id: 'nara', flower: 'double cherry blossoms', season: 'spring' }); 
  // Git adds an updated file and commits it.


  // Read
  const doc = await gitDDB.get('nara');

  console.log(`\n$ gitDDB.put({ _id: 'nara' ... }) # Update`);
  console.log(doc);
  // { flower: 'double cherry blossoms', season: 'spring', _id: 'nara' }


  // Delete
  await gitDDB.delete('nara');
  // Git deletes a file and commits it.

  console.log(`\n$ gitDDB.delete('nara') # Delete`);
  console.log(await gitDDB.get('nara')); // undefined
  

  // Revisions 
  // get(id, 2) returns two revisions before.
  //  rev 0(current): deleted
  //  rev 1: double cherry blossoms
  //  rev 2: cherry blossoms
  const oldDoc = await gitDDB.get('nara', 2); 

  console.log(`\n$ gitDDB.get('nara', 2) # Get two revisions before`);
  console.log(oldDoc);
   // { _id: 'nara', flower: 'cherry blossoms', season: 'spring' }
  
  /* Where is the working directory?
  const workingDir = gitDDB.workingDir();
  console.log(workingDir); // '/your/path/to/the/example/git-documentdb/db01'
  */

  /**
   * Synchronization
   */
  // Please enter your GitHub account name.
  let github_repository = 'https://github.com/enter_your_account_name/git-documentdb-example.git'; 
  // See https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token
  let your_github_personal_access_token = 'Enter your personal access token with checked [repo]';
  // You can also set them from environment variables:
  //  - GITDDB_GITHUB_USER_URL: URL of your GitHub account
  //    e.g.) https://github.com/foo/
  //  - GITDDB_PERSONAL_ACCESS_TOKEN: A personal access token of your GitHub account
  if (process.env.GITDDB_GITHUB_USER_URL) github_repository = process.env.GITDDB_GITHUB_USER_URL + 'git-documentdb-example.git';
  if (process.env.GITDDB_PERSONAL_ACCESS_TOKEN) your_github_personal_access_token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN;

  let sync: Sync | undefined;
  if (your_github_personal_access_token !== 'Enter your personal access token with checked [repo]') {
    console.log('\n# Initialize sync..');
    sync = await gitDDB.sync({
      live: true,
      remoteUrl: github_repository,
      connection: { type: 'github', personalAccessToken: your_github_personal_access_token },
    });
    // git-documentdb-example.git is automatically created in your GitHub account.
    // The data will be synchronized every 30 seconds(default).
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
  // Put documents by using filepath.
  await gitDDB.put({ _id: 'nara/nara_park', flower: 'double cherry blossoms' });
  await gitDDB.put({ _id: 'nara/tsukigase', flower: 'Japanese apricot' });
  await gitDDB.put({ _id: 'yoshino/mt_yoshino', flower: 'awesome cherry blossoms' });

  console.log(`\n$ gitDDB.put({ _id: 'nara/nara_park' ... }) # Put into subdirectory`);
  console.log(`$ gitDDB.put({ _id: 'nara/tsukigase' ... })`);
  console.log(`$ gitDDB.put({ _id: 'yoshino/mt_yoshino' ... })`);


  // Read
  const flowerInYoshino = await gitDDB.get('yoshino/mt_yoshino');

  console.log(`$ gitDDB.get('yoshino/mt_yoshino') # Get from subdirectory`);
  console.log(flowerInYoshino);
  // { flower: 'awesome cherry blossoms', _id: 'yoshino/mt_yoshino' }


  // Prefix search
  
  // Read all the documents whose IDs start with the prefix.
  const flowersInNara = await gitDDB.allDocs({ prefix: 'nara/' });

  console.log(`\n$ gitDDB.allDocs({ prefix: 'nara/' }) # Prefix search`);
  console.dir(flowersInNara, { depth: 3 });
  /* flowersInNara = 
  {
    total_rows: 2,
    commitOid: 'xxxxx_commitOid_of_your_head_commit_xxxxx',
    rows: [
      {
        id: 'nara/nara_park',
        fileOid: '7448ca2f7f79d6bb585421c6c29446acb97e4a8c',
        doc: { flower: 'double cherry blossoms', _id: 'nara/nara_park' }
      },
      {
        id: 'nara/tsukigase',
        fileOid: '1241d69c4e9cd7a27f592affce94ec60d3b2207c',
        doc: { flower: 'Japanese apricot', _id: 'nara/tsukigase' }
      }
    ]
  }
  */

  if (sync) {
    console.log('\n# Sync immediately..');
    await sync.trySync(); 
  }

  // Close database
  await gitDDB.close();
};
gitddb_example();
