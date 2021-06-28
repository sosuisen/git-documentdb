---
sidebar_label: Collection class
title: Collection class
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Collection](./git-documentdb.collection.md)

## Collection class

Documents under a collectionPath are gathered together in a collection.

<b>Signature:</b>

```typescript
export declare class Collection implements ICollection 
```
<b>Implements:</b> [ICollection](./git-documentdb.icollection.md)

## Remarks

In a collection API, shortId (shortName) is used instead of \_id (name).

- shortId is a file path whose collectionPath and .json extension are omitted. (\_id = collectionPath + shortId)

- shortName is a file path whose collectionPath is omitted. (name = collectionPath + shortName)

## Example


```
const gitDDB = new GitDocumentDB({ db_name: 'db01' });

// Both put git_documentdb/db01/Nara/flower.json: { _id: 'Nara/flower', name: 'cherry blossoms' }.
gitDDB.put({ _id: 'Nara/flower', name: 'cherry blossoms' });
gitDDB.collection('Nara').put({ _id: 'flower', name: 'cherry blossoms' })

// Notice that APIs return different _id values in spite of the same source file.
gitDDB.get({ _id: 'Nara/flower' }); // returns { _id: 'Nara/flower', name: 'cherry blossoms' }.
gitDDB.collection('Nara').get({ _id: 'flower' }); // returns { _id: 'flower', name: 'cherry blossoms' }.

```

## Constructors

|  Constructor | Modifiers | Description |
|  --- | --- | --- |
|  [(constructor)(gitDDB, collectionPathFromParent, parent, options)](./git-documentdb.collection._constructor_.md) |  | Constructor |

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [collectionPath](./git-documentdb.collection.collectionpath.md) |  | string | Normalized path of collection |
|  [options](./git-documentdb.collection.options.md) |  | [CollectionOptions](./git-documentdb.collectionoptions.md) | Get clone of collection options |
|  [parent](./git-documentdb.collection.parent.md) |  | [ICollection](./git-documentdb.icollection.md) \| undefined | Parent collection |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [collection(collectionPath, options)](./git-documentdb.collection.collection.md) |  | Get a collection |
|  [delete(\_id, options)](./git-documentdb.collection.delete.md) |  | Delete a JSON document |
|  [delete(jsonDoc, options)](./git-documentdb.collection.delete_1.md) |  | Delete a document by \_id property in JsonDoc |
|  [deleteFatDoc(shortName, options)](./git-documentdb.collection.deletefatdoc.md) |  | Delete a data |
|  [find(options)](./git-documentdb.collection.find.md) |  | Get all the JSON documents |
|  [findFatDoc(options)](./git-documentdb.collection.findfatdoc.md) |  | Get all the data |
|  [generateId()](./git-documentdb.collection.generateid.md) |  | Generate new \_id as monotonic ULID |
|  [get(\_id)](./git-documentdb.collection.get.md) |  | Get a JSON document |
|  [getBackNumber(\_id, backNumber, historyOptions)](./git-documentdb.collection.getbacknumber.md) |  | Get a back number of a JSON document |
|  [getCollections(dirPath)](./git-documentdb.collection.getcollections.md) |  | Get collections directly under the specified dirPath. |
|  [getDocByOid(fileOid, docType)](./git-documentdb.collection.getdocbyoid.md) |  | Get a Doc which has specified oid |
|  [getFatDoc(shortName, getOptions)](./git-documentdb.collection.getfatdoc.md) |  | Get a FatDoc |
|  [getFatDocBackNumber(shortName, backNumber, historyOptions, getOptions)](./git-documentdb.collection.getfatdocbacknumber.md) |  | Get a back number of a data |
|  [getFatDocHistory(shortName, historyOptions, getOptions)](./git-documentdb.collection.getfatdochistory.md) |  | Get revision history of a data |
|  [getHistory(\_id, historyOptions)](./git-documentdb.collection.gethistory.md) |  | Get revision history of a JSON document |
|  [insert(jsonDoc, options)](./git-documentdb.collection.insert.md) |  | Insert a JSON document |
|  [insert(shortId, jsonDoc, options)](./git-documentdb.collection.insert_1.md) |  | Insert a JSON document |
|  [insertFatDoc(shortName, doc, options)](./git-documentdb.collection.insertfatdoc.md) |  | Insert a data |
|  [offSyncEvent(remoteURL, event, callback)](./git-documentdb.collection.offsyncevent.md) |  | Remove SyncEvent handler |
|  [offSyncEvent(sync, event, callback)](./git-documentdb.collection.offsyncevent_1.md) |  | Remove SyncEvent handler |
|  [onSyncEvent(remoteURL, event, callback)](./git-documentdb.collection.onsyncevent.md) |  | Add SyncEvent handler |
|  [onSyncEvent(sync, event, callback)](./git-documentdb.collection.onsyncevent_1.md) |  | Add SyncEvent handler |
|  [put(jsonDoc, options)](./git-documentdb.collection.put.md) |  | Insert a JSON document if not exists. Otherwise, update it. |
|  [put(shortId, jsonDoc, options)](./git-documentdb.collection.put_1.md) |  | Insert a JSON document if not exists. Otherwise, update it. |
|  [putFatDoc(shortName, doc, options)](./git-documentdb.collection.putfatdoc.md) |  | Insert a data if not exists. Otherwise, update it. |
|  [update(jsonDoc, options)](./git-documentdb.collection.update.md) |  | Update a JSON document |
|  [update(\_id, jsonDoc, options)](./git-documentdb.collection.update_1.md) |  | Update a JSON document |
|  [updateFatDoc(shortName, doc, options)](./git-documentdb.collection.updatefatdoc.md) |  | Update a data |

