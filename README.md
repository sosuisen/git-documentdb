<img alt="GitDocumentDB" src="https://github.com/sosuisen/git-documentdb/blob/main/assets/git-documentdb_icon-128x128.png" width=60 height=60 align="left"> 

# GitDocumentDB
 [![npm version](https://badge.fury.io/js/git-documentdb.svg)](https://badge.fury.io/js/git-documentdb)
 [![License: MPL 2.0](https://img.shields.io/badge/License-MPL%202.0-brightgreen.svg)](LICENSE)
 [![Coverage Status](https://coveralls.io/repos/github/sosuisen/git-documentdb/badge.svg?branch=main)](https://coveralls.io/github/sosuisen/git-documentdb?branch=main)

Offline-first DocumentDB using Git

Use GitDocumentDB to ...

:green_book: Store JSON documents into Git repository. 

:art: Manage Git repository by PouchDB-like API. 

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
  db_name: 'db01', // Git working directory
});
```

## Basic CRUD
```typescript
  // Open
  await gitDDB.open(); // Git creates a repository (/your/path/to/the/app/gitddb/db01/.git)
  // Create
  await gitDDB.put({ _id: 'profile01', name: 'Yuzuki', age: '15' }); // Git adds 'profile01.json' under the working directory and commits it.
  // Update
  await gitDDB.put({ _id: 'profile01', name: 'Yuzuki', age: '16' }); // Git adds a updated file and commits it.
  // Read
  const doc = await gitDDB.get('profile01');
  console.log(doc); // doc = { _id: 'profile01', name: 'Yuzuki', age: '16' }
  // Delete
  await gitDDB.remove('profile01'); // Git removes a file and commits it.
  // destroy() closes db and removes both the Git repository and the working directory.
  await gitDDB.destroy();
```

## Prefix search
```typescript
  /**
    Create documents under sub-directories

    gitddb
    └── db01
        ├── tatebayashi
        │   ├── tamaki_mari.json
        │   ├── kobuchizawa_shirase.json
        │   ├── miyake_hinata.json
        │   └── tamaki_rin.json
        └── sapporo
            └── shiraishi_yuzuki.json

  */
  await gitDDB.open();
  // Put documents by using filepath representation.
  await gitDDB.put({ _id: 'tatebayashi/tamaki_mari', nickname: 'Kimari', age: '16' });
  await gitDDB.put({ _id: 'tatebayashi/kobuchizawa_shirase', nickname: 'Shirase', age: '17' });
  await gitDDB.put({ _id: 'tatebayashi/miyake_hinata', nickname: 'Hinata', age: '17' });
  await gitDDB.put({ _id: 'tatebayashi/tamaki_rin', nickname: 'Rin' });
  await gitDDB.put({ _id: 'sapporo/shiraishi_yuzuki', nickname: 'Yuzu', age: '16' });

  // Read
  const fromSapporo = await gitDDB.get('sapporo/shiraishi_yuzuki');
  console.log(fromSapporo); // fromSapporo = { _id: 'sapporo/shiraishi_yuzuki', nickname: 'Yuzu', age: '16' }

  // Prefix search

  // Read all the documents whose IDs start with the prefix.
  const fromTatebayashi = await gitDDB.allDocs({ prefix: 'tatebayashi/tamaki', include_docs: true });
  console.dir(fromTatebayashi, { depth: 3 });
  /* fromTatebayashi = 
  {
    total_rows: 2,
    commit_sha: 'xxxxx_commit_sha_of_your_head_commit_xxxxx',
    rows: [
      {
        id: 'tatebayashi/tamaki_mari',
        file_sha: 'cfde86e9d46ff368c418d7d281cf51bcf62f12de',
        doc: { age: '16', nickname: 'Kimari', _id: 'tatebayashi/tamaki_mari' }
      },
      {
        id: 'tatebayashi/tamaki_rin',
        file_sha: 'ed0e428c3b17b888a5c8ba40f2a2e1b0f3490531',
        doc: { nickname: 'Rin', _id: 'tatebayashi/tamaki_rin' }
      }
    ]
  }
  */
  await gitDDB.destroy();
```

## Collections
```typescript
  // Try it again by another way.
  await gitDDB.open();

  // Use collections to make it easier
  const tatebayashi = gitDDB.collection('tatebayashi');
  const sapporo = gitDDB.collection('sapporo');
  await tatebayashi.put({ _id: 'tamaki_mari', nickname: 'Kimari', age: '16' });
  await tatebayashi.put({ _id: 'kobuchizawa_shirase', nickname: 'Shirase', age: '17' });
  await tatebayashi.put({ _id: 'miyake_hinata', nickname: 'Hinata', age: '17' });
  await tatebayashi.put({ _id: 'tamaki_rin', nickname: 'Rin' });  
  await sapporo.put({ _id: 'shiraishi_yuzuki', nickname: 'Yuzu', age: '16' });

  // Read
  const fromSapporoCollection = await sapporo.get('shiraishi_yuzuki');
  console.log(fromSapporoCollection); // fromSapporoCollection = { _id: 'shiraishi_yuzuki', nickname: 'Yuzu', age: '16' }

  // Read all the documents in tatebayashi collection
  const fromCollection = await tatebayashi.allDocs({ include_docs: true });
  console.dir(fromCollection, { depth: 3 });
  /* fromCollection = 
  {
    total_rows: 4,
    commit_sha: 'xxxxx_commit_sha_of_your_head_commit_xxxxx',
    rows: [
      {
        id: 'kobuchizawa_shirase',
        file_sha: 'c65985e6c0e29f8c51d7c36213336b76077bbcb4',
        doc: { age: '17', nickname: 'Shirase', _id: 'kobuchizawa_shirase' }
      },
      {
        id: 'miyake_hinata',
        file_sha: 'efecfc5383ba0393dd22e3b856fc6b67951e924a',
        doc: { age: '17', nickname: 'Hinata', _id: 'miyake_hinata' }
      },
      {
        id: 'tamaki_mari',
        file_sha: '6b1001f4e9ab07300a45d3d332e64c5e7dcfc297',
        doc: { age: '16', nickname: 'Kimari', _id: 'tamaki_mari' }
      },
      {
        id: 'tamaki_rin',
        file_sha: 'ebadad3d8f15dc97f884f25eea74b4a19d4421f7',
        doc: { nickname: 'Rin', _id: 'tamaki_rin' }
      }
    ]
  }
  */
  await gitDDB.destroy();
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
- v0.2 Collections
  - v0.2.8 Prefix search :feet:(Here now)
- v0.3 Automated sync with GitHub or any other remote git repository
- v0.4 Transaction
- v0.5 Grep
- v0.6 Move between snapshots (Undo/Redo)
- v0.7 Binary attachments
- v0.8 Indexed search
- v1.0 Official release

## Not planned to be implemented
- Map/reduce queries
