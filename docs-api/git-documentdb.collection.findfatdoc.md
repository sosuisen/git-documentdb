---
sidebar_label: findFatDoc()
title: Collection.findFatDoc() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Collection](./git-documentdb.collection.md) &gt; [findFatDoc](./git-documentdb.collection.findfatdoc.md)

## Collection.findFatDoc() method

Get all the data

<b>Signature:</b>

```typescript
findFatDoc(options?: FindOptions): Promise<FatDoc[]>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  options | [FindOptions](./git-documentdb.findoptions.md) |  |

<b>Returns:</b>

Promise&lt;[FatDoc](./git-documentdb.fatdoc.md) \[\]&gt;

## Exceptions

[Err.DatabaseClosingError](./git-documentdb.err.databaseclosingerror.md)

[Err.RepositoryNotOpenError](./git-documentdb.err.repositorynotopenerror.md)

[Err.InvalidJsonObjectError](./git-documentdb.err.invalidjsonobjecterror.md)

