<img alt="GitDocumentDB" src="https://github.com/sosuisen/git-documentdb/blob/main/assets/git-documentdb_icon-128x128.png" width=60 height=60 align="left"> 

# [GitDocumentDB](https://gitddb.com)
 [![npm version](https://img.shields.io/npm/v/git-documentdb)](https://www.npmjs.com/package/git-documentdb)
 [![License: MPL 2.0](https://img.shields.io/github/license/sosuisen/git-documentdb)](LICENSE)
 [![Coverage Status](https://img.shields.io/coveralls/github/sosuisen/git-documentdb)](https://coveralls.io/github/sosuisen/git-documentdb?branch=main)

TypeScript Ready Offline-first Database that Syncs with Git

Use GitDocumentDB to ...

:nut_and_bolt: Develop offline-capable applications using Git.

:green_book: Manage JSON documents in Git repository by CRUD and collection APIs. 

:rocket: Synchronize automatically with remote repositories.

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;*(No need to resolve conflicts manually!)*

:arrows_counterclockwise: Integrate CI/CD pipelines through GitHub.

:dromedary_camel: Get the revision history of a document.

[(More...)](https://gitddb.com/)

# API
https://gitddb.com/docs/api/git-documentdb.gitdocumentdb

# Usage
## Getting started
### **Prerequisite**
Node.js v12 - v16
### **Installation**
```
npm i git-documentdb
```

## Import
```typescript
import { GitDocumentDB } from 'git-documentdb';

const gitDDB = new GitDocumentDB({
  db_name: 'db01', // Git working directory
});
```

## Basic CRUD
```typescript
  /**
   * Open a database
   */
  await gitDDB.open(); 


  /**
   * Create a document
   */ 
  await gitDDB.put({ _id: 'nara', flower: 'cherry blossoms', season: 'spring' });

  console.log(`$ gitDDB.put({ flower: 'cherry blossoms' ... }) # Create`);
  console.log(await gitDDB.get('nara')); 
  // log: { _id: 'nara', flower: 'cherry blossoms', season: 'spring' }

  /**
   * Update a document if it exists.
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
```

## Revisions
```typescript
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
  // log: { _id: 'nara', flower: 'cherry blossoms', season: 'spring' }
```

## Synchronization
```typescript
  await gitDDB.sync({
    live: true,
    remote_url: 'https://github.com/enter_your_accunt_name/git-documentdb-example.git',
    connection: { type: 'github', personal_access_token: 'Enter your personal access token with checked [repo]' },
  });
```
(You can find more examples in [examples/src/sync.ts](https://github.com/sosuisen/git-documentdb/blob/main/examples/src/sync.ts))

## Prefix search
```typescript
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
  await gitDDB.put({ _id: 'yoshino/mt_yoshino', flower: 'cherry blossoms' });

  // Read
  const flowerInYoshino = await gitDDB.get('yoshino/mt_yoshino');
  console.log(flowerInYoshino);
  // log:: { flower: 'cherry blossoms', _id: 'yoshino/mt_yoshino' }

  /**
   * Prefix search
   * 
   * Read all the documents whose IDs start with the prefix.
   */ 
  const flowersInNara = await gitDDB.find({ prefix: 'nara/' });
  console.log(flowersInNara);
  /* log:
    [
      { flower: 'double cherry blossoms', _id: 'nara/nara_park' },
      { flower: 'Japanese apricot', _id: 'nara/tsukigase' }
    ]
  */
 
  // destroy() closes DB and removes
  // both the Git repository and the working directory.
  await gitDDB.destroy();
```

## Collections
```typescript
  // Try sub-directories again by another way.
  await gitDDB.open();
  // Use Collection Class to make them easier.
  const nara = gitDDB.collection('nara');
  const yoshino = gitDDB.collection('yoshino');
  await nara.put({ _id: 'nara_park', flower: 'double cherry blossoms' });
  await nara.put({ _id: 'tsukigase', flower: 'Japanese apricot' });
  await yoshino.put({ _id: 'mt_yoshino', flower: 'cherry blossoms' });

  // Read
  const flowerInYoshinoCollection = await yoshino.get('mt_yoshino');
  console.log(flowerInYoshinoCollection);
  // { flower: 'cherry blossoms', _id: 'mt_yoshino' }

  // Read all the documents in nara collection
  const flowersInNaraCollection = await nara.find();
  console.log(flowersInNaraCollection);
  /* log: 
    [
      { flower: 'double cherry blossoms', _id: 'nara_park' },
      { flower: 'Japanese apricot', _id: 'tsukigase' }
    ]
  */  
  await gitDDB.close();
```
(You can find more examples in [examples/src/collection.ts](https://github.com/sosuisen/git-documentdb/blob/main/examples/src/collection.ts))

# Examples:
See [examples]((https://github.com/sosuisen/git-documentdb/blob/main/examples/)) directory.
```
$ npm run build
$ cd examples
$ npm i
$ npm start
$ npm run sync
$ npm run collection
```

# Continuous Deployment (CD) using GitDocumentDB

https://github.com/sosuisen/sosuisen-my-inventory-gatsby

# App using GitDocumentDB

https://github.com/sosuisen/inventory-manager


# Roadmap

- v0.1 Basic CRUD :feet:
- v0.2 Group and Search :feet:
  - Collections :feet:
  - Prefix search :feet:
- v0.3 Synchronization :feet:
  - Synchronization with GitHub :feet:
  - Revisions :feet:
  - Automated conflict resolution :feet:
  - Automated JSON diff and patch :feet:
  - Automated combining of inconsistent repositories :feet:
- v0.4 Many data types and connection methods
  - API renewal to manage any data types :feet:
  - Remove native module (NodeGit) from default install :feet:
  - Add plugin system for remote connection (isomorphic-git or NodeGit) :feet:
  - Connect with SSH key pair :feet:
  - Add Front-Matter-Markdown format :feet:
- v0.5 Search
  - Indexed Search :dog2:(Next)
- Until v1.0
  - Connect to GitHub with OAuth
  - Work on browser
  - Sync any data types
  - Replication
  - Transaction (bulk)
  
  - GitLab and Bitbucket
  - Push server
  - Migration

(https://github.com/sosuisen/git-documentdb/projects/2)
