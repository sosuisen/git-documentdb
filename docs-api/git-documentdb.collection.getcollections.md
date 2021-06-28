---
sidebar_label: getCollections()
title: Collection.getCollections() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Collection](./git-documentdb.collection.md) &gt; [getCollections](./git-documentdb.collection.getcollections.md)

## Collection.getCollections() method

Get collections directly under the specified dirPath.

<b>Signature:</b>

```typescript
getCollections(dirPath?: string): Promise<ICollection[]>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  dirPath | string | dirPath is a relative path from collectionPath. Default is ''. |

<b>Returns:</b>

Promise&lt;[ICollection](./git-documentdb.icollection.md) \[\]&gt;

Array of Collections which does not include ''

## Exceptions

[Err.RepositoryNotOpenError](./git-documentdb.err.repositorynotopenerror.md)

