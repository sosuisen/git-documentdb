---
sidebar_label: findFatDoc()
title: GitDocumentDB.findFatDoc() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [GitDocumentDB](./git-documentdb.gitdocumentdb.md) &gt; [findFatDoc](./git-documentdb.gitdocumentdb.findfatdoc.md)

## GitDocumentDB.findFatDoc() method

Get all the FatDoc data

<b>Signature:</b>

```typescript
findFatDoc(options?: FindOptions): Promise<FatDoc[]>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  options | [FindOptions](./git-documentdb.findoptions.md) | The options specify how to get documents. |

<b>Returns:</b>

Promise&lt;[FatDoc](./git-documentdb.fatdoc.md) \[\]&gt;

## Remarks

- This is an alias of GitDocumentDB\#rootCollection.findFatDoc()

## Exceptions

[Err.DatabaseClosingError](./git-documentdb.err.databaseclosingerror.md)

[Err.RepositoryNotOpenError](./git-documentdb.err.repositorynotopenerror.md)

[Err.InvalidJsonObjectError](./git-documentdb.err.invalidjsonobjecterror.md)

