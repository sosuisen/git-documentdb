---
sidebar_label: GitDocumentDB class
title: GitDocumentDB class
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [GitDocumentDB](./git-documentdb.gitdocumentdb.md)

## GitDocumentDB class

Main class of GitDocumentDB

<b>Signature:</b>

```typescript
export declare class GitDocumentDB implements GitDDBInterface, CRUDInterface, CollectionInterface, SyncEventInterface 
```
<b>Implements:</b>

[GitDDBInterface](./git-documentdb.gitddbinterface.md) , [CRUDInterface](./git-documentdb.crudinterface.md) , [CollectionInterface](./git-documentdb.collectioninterface.md) , [SyncEventInterface](./git-documentdb.synceventinterface.md)

## Remarks

Call open() before using DB.

## Constructors

|  Constructor | Modifiers | Description |
|  --- | --- | --- |
|  [(constructor)(options)](./git-documentdb.gitdocumentdb._constructor_.md) |  | Constructor |

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [author](./git-documentdb.gitdocumentdb.author.md) |  | { name: string; email: string; } | Author name and email for commit |
|  [committer](./git-documentdb.gitdocumentdb.committer.md) |  | { name: string; email: string; } | Committer name and email for commit |
|  [dbId](./git-documentdb.gitdocumentdb.dbid.md) |  | string | Get dbId |
|  [dbName](./git-documentdb.gitdocumentdb.dbname.md) |  | string | A name of a Git repository |
|  [defaultBranch](./git-documentdb.gitdocumentdb.defaultbranch.md) |  | (not declared) | Default Git branch |
|  [isClosing](./git-documentdb.gitdocumentdb.isclosing.md) |  | boolean | DB is going to close |
|  [isOpened](./git-documentdb.gitdocumentdb.isopened.md) |  | boolean | Test if a database is opened |
|  [localDir](./git-documentdb.gitdocumentdb.localdir.md) |  | string | A local directory path that stores repositories of GitDocumentDB |
|  [logger](./git-documentdb.gitdocumentdb.logger.md) |  | Logger | Get logger |
|  [logLevel](./git-documentdb.gitdocumentdb.loglevel.md) |  | TLogLevelName | logLevel ('silly' \| 'trace' \| 'debug' \| 'info' \| 'warn' \| 'error' \| 'fatal') |
|  [rootCollection](./git-documentdb.gitdocumentdb.rootcollection.md) |  | [ICollection](./git-documentdb.icollection.md) | Default collection whose collectionPath is ''. |
|  [schema](./git-documentdb.gitdocumentdb.schema.md) |  | [Schema](./git-documentdb.schema.md) | Schema for specific document type |
|  [taskQueue](./git-documentdb.gitdocumentdb.taskqueue.md) |  | [TaskQueue](./git-documentdb.taskqueue.md) | Task queue |
|  [validator](./git-documentdb.gitdocumentdb.validator.md) |  | [Validator](./git-documentdb.validator.md) | Name validator |
|  [workingDir](./git-documentdb.gitdocumentdb.workingdir.md) |  | string | Get a full path of the current Git working directory |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [close(options)](./git-documentdb.gitdocumentdb.close.md) |  | Close a database |
|  [collection(collectionPath, options)](./git-documentdb.gitdocumentdb.collection.md) |  | Get a collection |
|  [delete(\_id, options)](./git-documentdb.gitdocumentdb.delete.md) |  | Delete a JSON document |
|  [delete(jsonDoc, options)](./git-documentdb.gitdocumentdb.delete_1.md) |  | Delete a document by \_id property in JsonDoc |
|  [deleteFatDoc(name, options)](./git-documentdb.gitdocumentdb.deletefatdoc.md) |  | Delete a data |
|  [destroy(options)](./git-documentdb.gitdocumentdb.destroy.md) |  | Destroy a database |
|  [find(options)](./git-documentdb.gitdocumentdb.find.md) |  | Get all the JSON documents |
|  [findFatDoc(options)](./git-documentdb.gitdocumentdb.findfatdoc.md) |  | Get all the FatDoc data |
|  [get(\_id)](./git-documentdb.gitdocumentdb.get.md) |  | Get a JSON document |
|  [getCollections(dirPath)](./git-documentdb.gitdocumentdb.getcollections.md) |  | Get collections |
|  [getCommit(oid)](./git-documentdb.gitdocumentdb.getcommit.md) |  | Get a commit object |
|  [getDocByOid(fileOid, docType)](./git-documentdb.gitdocumentdb.getdocbyoid.md) |  | Get a Doc which has specified oid |
|  [getFatDoc(name, getOptions)](./git-documentdb.gitdocumentdb.getfatdoc.md) |  | Get a FatDoc data |
|  [getFatDocHistory(name, historyOptions, getOptions)](./git-documentdb.gitdocumentdb.getfatdochistory.md) |  | Get revision history of a FatDoc data |
|  [getFatDocOldRevision(name, revision, historyOptions, getOptions)](./git-documentdb.gitdocumentdb.getfatdocoldrevision.md) |  | Get an old revision of a FatDoc data |
|  [getHistory(\_id, historyOptions)](./git-documentdb.gitdocumentdb.gethistory.md) |  | Get revision history of a document |
|  [getOldRevision(\_id, revision, historyOptions)](./git-documentdb.gitdocumentdb.getoldrevision.md) |  | Get an old revision of a document |
|  [getRemoteURLs()](./git-documentdb.gitdocumentdb.getremoteurls.md) |  | getRemoteURLs |
|  [getSync(remoteURL)](./git-documentdb.gitdocumentdb.getsync.md) |  | Get synchronizer |
|  [insert(jsonDoc, options)](./git-documentdb.gitdocumentdb.insert.md) |  | Insert a JSON document |
|  [insert(\_id, jsonDoc, options)](./git-documentdb.gitdocumentdb.insert_1.md) |  | Insert a JSON document |
|  [insertFatDoc(name, doc, options)](./git-documentdb.gitdocumentdb.insertfatdoc.md) |  | Insert a data |
|  [loadAppInfo()](./git-documentdb.gitdocumentdb.loadappinfo.md) |  | Load app-specific info from .gitddb/app.json |
|  [loadAuthor()](./git-documentdb.gitdocumentdb.loadauthor.md) |  | Load author from .git/config |
|  [offSyncEvent(remoteURL, event, callback)](./git-documentdb.gitdocumentdb.offsyncevent.md) |  | Remove SyncEvent handler |
|  [offSyncEvent(sync, event, callback)](./git-documentdb.gitdocumentdb.offsyncevent_1.md) |  | Remove SyncEvent handler |
|  [onSyncEvent(remoteURL, event, callback)](./git-documentdb.gitdocumentdb.onsyncevent.md) |  | Add SyncEvent handler |
|  [onSyncEvent(sync, event, callback)](./git-documentdb.gitdocumentdb.onsyncevent_1.md) |  | Add SyncEvent handler |
|  [open(openOptions)](./git-documentdb.gitdocumentdb.open.md) |  | Open or create a Git repository |
|  [put(jsonDoc, options)](./git-documentdb.gitdocumentdb.put.md) |  | Insert a JSON document if not exists. Otherwise, update it. |
|  [put(\_id, jsonDoc, options)](./git-documentdb.gitdocumentdb.put_1.md) |  | Insert a JSON document if not exists. Otherwise, update it. |
|  [putFatDoc(name, doc, options)](./git-documentdb.gitdocumentdb.putfatdoc.md) |  | Insert data if not exists. Otherwise, update it. |
|  [removeSync(remoteURL)](./git-documentdb.gitdocumentdb.removesync.md) |  | Stop and unregister remote synchronization |
|  [repository()](./git-documentdb.gitdocumentdb.repository.md) |  | Get a current repository |
|  [saveAppInfo(info)](./git-documentdb.gitdocumentdb.saveappinfo.md) |  | Save app-specific info into .gitddb/app.json |
|  [saveAuthor()](./git-documentdb.gitdocumentdb.saveauthor.md) |  | Save current author to .git/config |
|  [setRepository(repos)](./git-documentdb.gitdocumentdb.setrepository.md) |  | Set repository |
|  [sync(options)](./git-documentdb.gitdocumentdb.sync.md) |  | Synchronize with a remote repository |
|  [sync(options, getSyncResult)](./git-documentdb.gitdocumentdb.sync_1.md) |  | Synchronize with a remote repository |
|  [update(jsonDoc, options)](./git-documentdb.gitdocumentdb.update.md) |  | Update a JSON document |
|  [update(\_id, jsonDoc, options)](./git-documentdb.gitdocumentdb.update_1.md) |  | Update a JSON document |
|  [updateFatDoc(name, doc, options)](./git-documentdb.gitdocumentdb.updatefatdoc.md) |  | Update a data |

