/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import { Collection, GitDocumentDB } from 'git-documentdb';

const collection_example = async () => {
  const gitDDB = new GitDocumentDB({
    dbName: 'db_collection',
  });
  /**
   * Open a local repository, or create it if it does not exist.
   * (/your/path/to/the/example/git-documentdb/db_collection/.git)
   */
  await gitDDB.open();

  // Use collection  
  const nara = gitDDB.collection('nara'); // collectionPath is 'nara'.
  const yoshino = gitDDB.collection('yoshino'); // collectionPath is 'yoshino'.
  await nara.put({ _id: 'nara_park', flower: 'double cherry blossoms' });
  await nara.put({ _id: 'tsukigase', flower: 'Japanese apricot' });
  await yoshino.put({ _id: 'mt_yoshino', flower: 'awesome cherry blossoms' });

  console.log(`\n$ gitDDB.collection('nara') # Create collection`);
  console.log(`$ gitDDB.collection('yoshino')`);
  console.log(`$ nara.put({ _id: 'nara_park', ... }) # Create into collection`);
  console.log(`$ nara.put({ _id: 'tsukigase', ... })`);
  console.log(`$ yoshino.put({ _id: 'mt_yoshino', ... })`);


  // Read by shortId 'mt_yoshino'
  const flowerInYoshinoCollection = await yoshino.get('mt_yoshino');

  console.log(`$ yoshino.get('mt_yoshino') # Get a document from collection by shortId`);
  console.log(flowerInYoshinoCollection);
  // log: { flower: 'awesome cherry blossoms', _id: 'mt_yoshino' }


  // Read all the documents in nara collection
  const flowersInNaraCollection = await nara.find();

  console.log(`\n$ nara.find() # Search all`);
  console.dir(flowersInNaraCollection, { depth: 3 });
  /* log: 
    [
      { flower: 'double cherry blossoms', _id: 'nara_park' },
      { flower: 'Japanese apricot', _id: 'tsukigase' }
    ]
  */

  // Read by _id 'yoshino/mt_yoshino'    
  const flowerInYoshinoCollectionByPath = await gitDDB.get('yoshino/mt_yoshino');
  
  console.log(`\n$ gitDDB.get('yoshino/mt_yoshino') # Get the same document by _id`)  
  console.log(flowerInYoshinoCollectionByPath); 
  // log: { flower: 'awesome cherry blossoms', _id: 'yoshino/mt_yoshino' }

  /*
   * Actually, using a collection with collectionPath and shortId is a sugar syntax of a long filepath _id.
   * 
   * Both put the same file on the same location in a Git repository.
   * 
   * Notice that API returns different _id values despite the same JSON document in a Git repository.
   * 
   * e.g) gitDDB.get({ _id: 'yoshino/mt_yoshino' }) returns { _id: 'yoshino/mt_yoshino', flower: 'awesome cherry blossoms' }.
   *      gitDDB.collection('yoshino').get({ _id: 'mt_yoshino' }) returns { _id: 'mt_yoshino', flower: 'awesome cherry blossoms' }.
   */

  console.log('\nCollections are');
  const cols = await gitDDB.getCollections();
  cols.forEach(col => {
    console.log(` - ${col.collectionPath}`); 
    // - nara/
    // - yoshino/
  });

  /**
   * Use an auto-generated _id
   */
  const item = gitDDB.collection('item', { namePrefix: 'item_' });
  const pencilResult = await item.put({ name: 'pencil' }); // _id does not exist.
  // '/your/path/to/the/example/git-documentdb/db_collection/item/item_XXXXXXXXXXXXXXXXXXXXXXXXXX.json' is created.
  const pencil = await item.get(pencilResult._id);
  console.log(`\n_id of the JSON document is automatically generated with a specified prefix.`);
  console.log(pencil);
  // log: { name: 'pencil', _id: 'item_XXXXXXXXXXXXXXXXXXXXXXXXXX' }

  // Add a prefix to a new root collection whose collectionPath is ''.
  const myCollection = new Collection(gitDDB, '', undefined, { namePrefix: 'fruit_' });
  // '/your/path/to/the/example/git-documentdb/db_collection/item_XXXXXXXXXXXXXXXXXXXXXXXXXX.json' is created.
  const durianResult = await myCollection.put({ name: 'durian' });
  const durian = await gitDDB.get(durianResult._id);
  console.log(`\nJSON document is created under the working directory with a specified prefix`);
  console.log(durian);
  // log: { name: 'durian', _id: 'fruit_XXXXXXXXXXXXXXXXXXXXXXXXXX' }
   
  await gitDDB.close();
};
collection_example();
