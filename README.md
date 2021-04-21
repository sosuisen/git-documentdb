<img alt="GitDocumentDB" src="https://github.com/sosuisen/git-documentdb/blob/main/assets/git-documentdb_icon-128x128.png" width=60 height=60 align="left"> 

# GitDocumentDB
 [![npm version](https://badge.fury.io/js/git-documentdb.svg)](https://badge.fury.io/js/git-documentdb)
 [![License: MPL 2.0](https://img.shields.io/badge/License-MPL%202.0-brightgreen.svg)](LICENSE)
 [![Coverage Status](https://coveralls.io/repos/github/sosuisen/git-documentdb/badge.svg?branch=main)](https://coveralls.io/github/sosuisen/git-documentdb?branch=main)

> NOTICE: This is a document for GitDocumentDB v0.3.0-alpha


Offline-first DocumentDB using Git

Use GitDocumentDB to ...

:green_book: Store JSON documents into Git repository. 

:art: Manage Git repository by PouchDB-like API. 

:rocket: Auto synchronization and conflict resolution with a remote Git repository.

:arrows_counterclockwise: CI/CD through GitHub.

:dromedary_camel: Travel history of database snapshots.

You do not need knowledge of Git to start. However, you make the most of GitDocumentDB if you understand Git.

# API
https://github.com/sosuisen/git-documentdb/blob/main/docs-api/git-documentdb.gitdocumentdb.md

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
If you receive errors about installation, you probably miss building tools and libraries.<br>
**In Ubuntu 18:**<br>
```
sudo apt update
sudo apt install build-essential libssl-dev libkrb5-dev libc++-dev 
```
**In Windows 10:**<br>
The list below shows typical environments.
- Node.js 12, Python 2.7.x, and Visual Studio 2017 Community (with Desktop development with C++).
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
```

## Synchronization
```typescript
  const github_repository = 'https://github.com/enter_your_accunt_name/git-documentdb-example.git'; // Please enter your GitHub account name.
  const your_github_personal_access_token = 'Enter your personal access token with checked [repo]'; // See https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token
  await gitDDB.sync({
    live: true,
    remote_url: github_repository,
    auth: { type: 'github', personal_access_token: your_github_personal_access_token },
  });
```

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
 
  // destroy() closes DB and removes both the Git repository and the working directory if they exist.
  await gitDDB.destroy();
```

## Collections
```typescript
  // Try it again by another way.
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
- v0.2
  - Collections
  - Prefix search
- v0.3
  - Synchronization with GitHub
  - Revisions :feet:(Here now)
- v0.4 Work on both Node.js and browser
- v0.5 Grep
- v0.6 Miscellaneous
  - Replication
  - Transaction (bulk)
  - Tag (Redo/Undo)
- v0.7 Binary attachments
- v0.8 Authentication
  - GitHub with OAuth
  - GitHub with SSH key pair
- v0.9 Indexed Search

**First official release**
- v1.0

**Future releases**
- Git server
- GitLab and Bitbucket
- Push server
- Migration
- Plugins
