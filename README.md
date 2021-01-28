<img alt="GitDocumentDB" src="https://github.com/sosuisen/git-documentdb/blob/main/assets/git-documentdb_icon-128x128.png" width=60 height=60 align="left"> 

# GitDocumentDB
 [![License: MPL 2.0](https://img.shields.io/badge/License-MPL%202.0-brightgreen.svg)](LICENSE)
 [![Coverage Status](https://coveralls.io/repos/github/sosuisen/git-documentdb/badge.svg?branch=main)](https://coveralls.io/github/sosuisen/git-documentdb?branch=main)

Offline-first DocumentDB using Git

Use GitDocumentDB to ...

:green_book: Store JSON documents into Git repository. 

:art: Manage Git repository by PouchDB-like offline-first API. 

:rocket: Synchronize JSON documents with a remote Git repository.

# Usage
See examples directory.
```
$ cd examples
$ npm start
```
```typescript
import { GitDocumentDB } from 'git-documentdb';

const gitDDB = new GitDocumentDB({
    localDir: 'gddb_data',
    dbName: 'db01',
  });
const setAndGetProf = async () => {
  // Create or open repository
  await gitDDB.open();
  // Create document
  await gitDDB.put({ _id: '4', name: 'Yuzuki', age: '15' });
  // Update
  await gitDDB.put({ _id: '4', name: 'Yuzuki', age: '16' });
  // Read
  const prof = await gitDDB.get('4');
  console.log(prof);  // { _id: '4', name: 'Yuzuki', age: '16' }
  // Delete
  await gitDDB.delete('4');
  await gitDDB.close();
  // destroy() removes repository
  // await gitDDB.destroy(); 
}
setAndGetProf();
```

# API

https://github.com/sosuisen/git-documentdb/blob/main/docs/git-documentdb.gitdocumentdb.md

# App using GitDocumentDB

https://github.com/sosuisen/inventory-manager
