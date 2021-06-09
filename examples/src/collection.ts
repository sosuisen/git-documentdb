/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import { GitDocumentDB } from 'git-documentdb';

const collection_example = async () => {
  const gitDDB = new GitDocumentDB({
    dbName: 'db_collection',
  });
  // Open
  const result = await gitDDB.open(); // Open a repository if exists. (/your/path/to/the/example/git-documentdb/db_collection/.git)
  if (!result.ok) await gitDDB.createDB(); // Git creates and opens a repository if not exits.

  // Use collection
  const nara = gitDDB.collection('nara');
  const yoshino = gitDDB.collection('yoshino');
  await nara.put({ _id: 'nara_park', flower: 'double cherry blossoms' });
  await nara.put({ _id: 'tsukigase', flower: 'Japanese apricot' });
  await yoshino.put({ _id: 'mt_yoshino', flower: 'awesome cherry blossoms' });

  console.log(`\n$ gitDDB.collection('nara') # Create collection`);
  console.log(`$ gitDDB.collection('yoshino')`);
  console.log(`$ nara.put({ _id: 'nara_park', ... }) # Create into collection`);
  console.log(`$ nara.put({ _id: 'tsukigase', ... })`);
  console.log(`$ yoshino.put({ _id: 'mt_yoshino', ... })`);


  // Read
  const flowerInYoshinoCollection = await yoshino.get('mt_yoshino');

  console.log(`$ yoshino.get('mt_yoshino') # Get from collection`);
  console.log(flowerInYoshinoCollection); // { flower: 'awesome cherry blossoms', _id: 'mt_yoshino' }


  // Read all the documents in nara collection
  const flowersInNaraCollection = await nara.allDocs();

  console.log(`\n$ nara.allDocs() # Search all from collection`);
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
  
  console.log(`\n$ gitDDB.get('yoshino/mt_yoshino') # Get doc in yoshino collection by filepath`)  
  console.log(flowerInYoshinoCollectionByPath); // { flower: 'awesome cherry blossoms', _id: 'yoshino/mt_yoshino' }

  /*
   * Actually, the collection is a sugar syntax of filepath.
   * Both filepath and collection put the same file on the same location in a Git repository.
   *
   * Please check the generated files under examples/git-documentdb/db01/ and examples/git-documentdb/db02/ are the same.
   * 
   * Notice that API returns different _id values despite the same JSON document in a Git repository.
   * 
   * e.g) gitDDB.get({ _id: 'yoshino/mt_yoshino' }) returns { _id: 'yoshino/mt_yoshino', flower: 'awesome cherry blossoms' }.
   *      gitDDB.collection('yoshino').get({ _id: 'mt_yoshino' }) returns { _id: 'mt_yoshino', flower: 'awesome cherry blossoms' }.
   */

  console.log('\nCollections are');
  const cols = await gitDDB.getCollections();
  cols.forEach(col => {
    console.log(` - ${col.collectionPath()}`); 
    // - nara/
    // - yoshino/
  });

  await gitDDB.close();
};
collection_example();
