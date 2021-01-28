<img alt="GitDocumentDB" src="https://github.com/sosuisen/git-documentdb/blob/main/assets/git-documentdb_icon-128x128.png" width=60 height=60 align="left"> 

# GitDocumentDB
 [![License: MPL 2.0](https://img.shields.io/badge/License-MPL%202.0-brightgreen.svg)](LICENSE)
 [![Coverage Status](https://coveralls.io/repos/github/sosuisen/git-documentdb/badge.svg?branch=main)](https://coveralls.io/github/sosuisen/git-documentdb?branch=main)

Offline-first DocumentDB using Git

Use GitDocumentDB to ...

:green_book: Store JSON documents into Git repository. 

:art: Manage Git repository by PouchDB-like offline-first API. 

:rocket: Synchronize JSON documents with a remote Git repository.

# API

https://github.com/sosuisen/git-documentdb/blob/main/docs/git-documentdb.gitdocumentdb.md

# Usage
## Installation:
```
npm i git-documentdb
```
## Getting started:
```typescript
import { GitDocumentDB } from 'git-documentdb';

const gitDDB = new GitDocumentDB({
    localDir: 'gddb_data',
    dbName: 'db01', // Git working directory
  });
```

## Basic CRUD:
```typescript
  // Create repository (gddb_data/db01/.git)
  await gitDDB.open();
  // Create document named 'profile' in gddb_data/db01/
  await gitDDB.put({ _id: 'profile', name: 'Yuzuki', age: '15' });
  // Update
  await gitDDB.put({ _id: 'profile', name: 'Yuzuki', age: '16' });
  // Read
  const doc = await gitDDB.get('profile');
  console.log(doc);  // doc = { _id: 'profile', name: 'Yuzuki', age: '16' }
  // Delete
  await gitDDB.delete('profile');
```

## Advanced:
```typescript
  // Create documents in sub-directories
  //   gddb_data/db01/Gunma/1 
  //   gddb_data/db01/Gunma/2
  //   gddb_data/db01/Gunma/3
  //   gddb_data/db01/Sapporo/4
  await gitDDB.put({ _id: 'Gunma/1', name: 'Kimari', age: '16' });
  await gitDDB.put({ _id: 'Gunma/2', name: 'Shirase', age: '17' });
  await gitDDB.put({ _id: 'Gunma/3', name: 'Hinata', age: '17' });
  await gitDDB.put({ _id: 'Sapporo/4', name: 'Yuzuki', age: '16' });
  
  // Bulk read
  const docs = await gitDDB.allDocs({ directory: 'Gunma', include_docs: true });
  console.dir(docs, { depth: 3 });
  /* docs = 
  {
    total_rows: 3,
    commit_sha: '39b82ee2458a39023fd9cd098ea6a5486593aceb',
    rows: [
      {
        _id: 'Gunma/1',
        file_sha: 'fae60a86958402b424102f16361a501c561be654',
        doc: { name: 'Kimari', age: '16', _id: 'Gunma/1' }
      },
      {
        _id: 'Gunma/2',
        file_sha: '1255eff6d316a73077468dbda2b026e96fdf00e6',
        doc: { name: 'Shirase', age: '17', _id: 'Gunma/2' }
      },
      {
        _id: 'Gunma/3',
        file_sha: '1f1c89b5253c4feab67a31f8bce1443e3d72512f',
        doc: { name: 'Hinata', age: '17', _id: 'Gunma/3' }
      }
    ]
  }
```
## Examples:
See examples directory.
```
$ cd examples
$ npm start
```

# App using GitDocumentDB

https://github.com/sosuisen/inventory-manager
