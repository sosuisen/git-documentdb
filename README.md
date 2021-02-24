<img alt="GitDocumentDB" src="https://github.com/sosuisen/git-documentdb/blob/main/assets/git-documentdb_icon-128x128.png" width=60 height=60 align="left"> 

# GitDocumentDB
 [![npm version](https://badge.fury.io/js/git-documentdb.svg)](https://badge.fury.io/js/git-documentdb)
 [![License: MPL 2.0](https://img.shields.io/badge/License-MPL%202.0-brightgreen.svg)](LICENSE)
 [![Coverage Status](https://coveralls.io/repos/github/sosuisen/git-documentdb/badge.svg?branch=main)](https://coveralls.io/github/sosuisen/git-documentdb?branch=main)

Offline-first DocumentDB using Git

Use GitDocumentDB to ...

:green_book: Store JSON documents into Git repository. 

:art: Manage Git repository by PouchDB-like offline-first API. 

:rocket: Synchronize JSON documents with a remote Git repository.

:arrows_counterclockwise: CI/CD through GitHub.

:dromedary_camel: Travel history of database snapshots.

You do not need knowledge of Git to start, however you make the most of GitDocumentDB if you understand Git.

# API

https://github.com/sosuisen/git-documentdb/blob/main/docs/git-documentdb.gitdocumentdb.md

# Usage
## Getting started
### **Prerequisite**
Node.js 10 or later
### **Installation**
```
npm i git-documentdb
```
**NOTE:**<br>
GitDocumentDB uses native addon (libgit2).<br>
If you receive errors about install you probably miss build tools and libraries.<br>
**In Ubuntu 18:**<br>
```
sudo apt update
sudo apt install build-essential libssl-dev libkrb5-dev libc++-dev 
```
**In Windows 10:**<br>
Typical environment is shown below.
- Node.js 12, Python 2.7.x and Visual Studio 2017 Community (with Desktop development with C++).
- npm config set msvs_version 2017

If you are still encountering install problems, documents about [NodeGit](https://github.com/nodegit/nodegit#getting-started) and [Building NodeGit from source](https://www.nodegit.org/guides/install/from-source/) may also help you.

## Import
```typescript
import { GitDocumentDB } from 'git-documentdb';

const gitDDB = new GitDocumentDB({
  local_dir: 'gddb_data', // Parent directory of Git working directories (relative or absolute path)
  db_name: 'db01', // Git working directory
});
```

## Basic CRUD
```typescript
  // Open a database
  await gitDDB.open(); // Git creates a repository (/your/path/to/the/app/gddb_data/db01/.git)
  // Create a document
  await gitDDB.put({ _id: 'profile01', name: 'Yuzuki', age: '15' }); // Git adds 'profile01.json' under the working directory and commit it.
  // Update it
  await gitDDB.put({ _id: 'profile01', name: 'Yuzuki', age: '16' }); // Git adds a updated file and commit it.
  // Read it
  const doc = await gitDDB.get('profile01');
  console.log(doc); // doc = { _id: 'profile01', name: 'Yuzuki', age: '16' }
  // Delete it
  await gitDDB.remove('profile01'); // Git removes a file and commit it.
```

## Collections
```typescript
  /**
    Collect documents under sub-directories

    gddb_data
    └── db01
        ├── Gunma
        │   ├── 1.json
        │   ├── 2.json
        │   └── 3.json
        └── Sapporo
            └── 1.json

  */
  const Gunma = gitDDB.collection('Gunma');
  const Sapporo = gitDDB.collection('Sapporo');
  await Gunma.put({ _id: '1', name: 'Kimari', age: '16' });
  await Gunma.put({ _id: '2', name: 'Shirase', age: '17' });
  await Gunma.put({ _id: '3', name: 'Hinata', age: '17' });
  await Sapporo.put({ _id: '1', name: 'Yuzuki', age: '16' });

  // Read one
  const docFromSapporoCollection = await Sapporo.get('1');
  console.log(docFromSapporoCollection); // docFromSapporoCollection = { _id: '1', name: 'Yuzuki', age: '16' }

  // Read all the documents in Gunma collection
  const docsFromCollection = await Gunma.allDocs({ include_docs: true });
  console.dir(docsFromCollection, { depth: 3 });
  /* docsFromGunmaCollection = 
  {
    total_rows: 3,
    commit_sha: '39b82ee2458a39023fd9cd098ea6a5486593aceb',
    rows: [
      {
        id: '1',
        file_sha: 'fae60a86958402b424102f16361a501c561be654',
        doc: { _id: '1', name: 'Kimari', age: '16' }
      },
      {
        id: '2',
        file_sha: '1255eff6d316a73077468dbda2b026e96fdf00e6',
        doc: { _id: '2', name: 'Shirase', age: '17' }
      },
      {
        id: '3',
        file_sha: '1f1c89b5253c4feab67a31f8bce1443e3d72512f',
        doc: { _id: '3', name: 'Hinata', age: '17' }
      }
    ]
  }
  */

  // Read one by using filepath representation
  const docFromSapporoCollectionByUsingPath = await gitDDB.get('Sapporo/1');
  console.log(docFromSapporoCollectionByUsingPath); // docFromSapporoCollectionByUsingPath = { _id: 'Sapporo/1', name: 'Yuzuki', age: '16' }

  /*
   * Actually, collection is a sugar syntax of filepath representation.
   * Both filepath representation (like PouchDB) and collection put the same file on the same location in a Git repository.
   * e.g) Both gitDDB.put({ _id: 'Sapporo/1', name: 'Yuzuki' }) and gitDDB.collection('Sapporo').put({ _id: '1', name: 'Yuzuki' }) put 'gddb_data/db01/Sapporo/1.json' in which JSON document has { _id: '1', name: 'Yuzuki' }.
   * 
   * Notice that APIs return different _id values in spite of the same source file.
   * gitDDB.get({ _id: 'Sapporo/1' }) returns { _id: 'Sapporo/1', name: 'Yuzuki' }.
   * gitDDB.collection('Sapporo').get({ _id: '1' }) returns { _id: '1', name: 'Yuzuki' }.
   */

  // Close database
  await gitDDB.close();
```

# Examples:
See examples directory.
```
$ cd examples
$ npm i
$ npm start
```

# Continuous Deployment (CD) using GitDocumentDB

https://github.com/sosuisen/sosuisen-my-inventory-gatsby

# App using GitDocumentDB

https://github.com/sosuisen/inventory-manager


# Roadmap

- v0.1 Basic CRUD
- v0.2 Collections :feet:(Here now)
- v0.3 Automated sync with GitHub or any other remote git repository
- v0.4 Transaction
- v0.5 Grep
- v0.6 Move between snapshots (Undo/Redo)
- v0.7 Binary attachments
- v0.8 Indexed search
- v1.0 Official release

## Not planned to be implemented
- Map/reduce queries
