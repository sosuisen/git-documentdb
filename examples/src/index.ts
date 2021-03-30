/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import { GitDocumentDB } from 'git-documentdb';

const foo = async () => {
  let gitDDB = new GitDocumentDB({
    db_name: 'db01', // Git working directory
  });
  await gitDDB.destroy(); // (Remove db if exists)

  // Open
  await gitDDB.create(); // Git creates and opens a repository (/your/path/to/the/example/git-documentdb/db01/.git)
  // Create
  await gitDDB.put({ _id: 'nara', flower: 'cherry blossoms', season: 'spring' }); // Git adds 'nara.json' under the working directory and commits it.
  // Update
  await gitDDB.put({ _id: 'nara', flower: 'double cherry blossoms', season: 'spring' }); // Git adds an updated file and commits it.
  // Read
  const doc = await gitDDB.get('nara');
  console.log(doc); // doc = { flower: 'double cherry blossoms', season: 'spring', _id: 'nara' }
  // Delete
  await gitDDB.remove('nara'); // Git removes a file and commits it.

  /* Where is the working directory?
  const workingDir = gitDDB.workingDir();
  console.log(workingDir); // workingDir = '/your/path/to/the/example/git-documentdb/db01'
  */

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
  await gitDDB.put({ _id: 'yoshino/mt_yoshino', flower: 'cherry blossoms' });

  // Read
  const flowerInYoshino = await gitDDB.get('yoshino/mt_yoshino');
  console.log(flowerInYoshino); // flowerInYoshino = { flower: 'cherry blossoms', _id: 'yoshino/mt_yoshino' }

  // Prefix search
  
  // Read all the documents whose IDs start with the prefix.
  const flowersInNara = await gitDDB.allDocs({ prefix: 'nara/', include_docs: true });
  console.dir(flowersInNara, { depth: 3 });
  /* flowersInNara = 
  {
    total_rows: 2,
    commit_sha: 'xxxxx_commit_sha_of_your_head_commit_xxxxx',
    rows: [
      {
        id: 'nara/nara_park',
        file_sha: '7448ca2f7f79d6bb585421c6c29446acb97e4a8c',
        doc: { flower: 'double cherry blossoms', _id: 'nara/nara_park' }
      },
      {
        id: 'nara/tsukigase',
        file_sha: '1241d69c4e9cd7a27f592affce94ec60d3b2207c',
        doc: { flower: 'Japanese apricot', _id: 'nara/tsukigase' }
      }
    ]
  }
  */
  
  // Try them again by another way. 
  gitDDB = new GitDocumentDB({
    db_name: 'db02',
  });
  await gitDDB.destroy(); // destroy() closes db and removes both the Git repository and the working directory if exist.

  await gitDDB.create();
  // Use collections to make it easier
  const nara = gitDDB.collection('nara');
  const yoshino = gitDDB.collection('yoshino');
  await nara.put({ _id: 'nara_park', flower: 'double cherry blossoms' });
  await nara.put({ _id: 'tsukigase', flower: 'Japanese apricot' });
  await yoshino.put({ _id: 'mt_yoshino', flower: 'cherry blossoms' });

  // Read
  const flowerInYoshinoCollection = await yoshino.get('mt_yoshino');
  console.log(flowerInYoshinoCollection); // flowerInYoshinoCollection = { flower: 'cherry blossoms', _id: 'mt_yoshino' }

  // Read all the documents in nara collection
  const flowersInNaraCollection = await nara.allDocs({ include_docs: true });
  console.dir(flowersInNaraCollection, { depth: 3 });
  /* flowersInNaraCollection = 
  {
    total_rows: 2,
    commit_sha: 'xxxxx_commit_sha_of_your_head_commit_xxxxx',
    rows: [
      {
        id: 'nara_park',
        file_sha: '7448ca2f7f79d6bb585421c6c29446acb97e4a8c',
        doc: { flower: 'double cherry blossoms', _id: 'nara_park' }
      },
      {
        id: 'tsukigase',
        file_sha: '1241d69c4e9cd7a27f592affce94ec60d3b2207c',
        doc: { flower: 'Japanese apricot', _id: 'tsukigase' }
      }
    ]
  }
  */

  // Read one by using filepath
  const flowerInYoshinoCollectionByPath = await gitDDB.get('yoshino/mt_yoshino');
  console.log(flowerInYoshinoCollectionByPath); // flowerInYoshinoCollectionByPath = { flower: 'cherry blossoms', _id: 'yoshino/mt_yoshino' }

  /*
   * Actually, the collection is a sugar syntax of filepath.
   * Both filepath (like PouchDB) and collection put the same file on the same location in a Git repository.
   *
   * Please check the generated files under examples/git-documentdb/db01/ and examples/git-documentdb/db02/ are the same.
   * 
   * Notice that API returns different _id values despite the same JSON document in a Git repository.
   * 
   * e.g) gitDDB.get({ _id: 'yoshino/mt_yoshino' }) returns { _id: 'yoshino/mt_yoshino', flower: 'cherry blossoms' }.
   *      gitDDB.collection('yoshino').get({ _id: 'mt_yoshino' }) returns { _id: 'mt_yoshino', flower: 'cherry blossoms' }.
   */

  // Close database
  await gitDDB.close();

};
foo();
