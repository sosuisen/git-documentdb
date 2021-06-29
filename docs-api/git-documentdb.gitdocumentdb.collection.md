---
sidebar_label: collection()
title: GitDocumentDB.collection() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [GitDocumentDB](./git-documentdb.gitdocumentdb.md) &gt; [collection](./git-documentdb.gitdocumentdb.collection.md)

## GitDocumentDB.collection() method

Get a collection

<b>Signature:</b>

```typescript
collection(collectionPath: CollectionPath, options?: CollectionOptions): Collection;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  collectionPath | [CollectionPath](./git-documentdb.collectionpath.md) | relative path from localDir. Sub-directories are also permitted. e.g. 'pages', 'pages/works'. |
|  options | [CollectionOptions](./git-documentdb.collectionoptions.md) |  |

<b>Returns:</b>

[Collection](./git-documentdb.collection.md)

A child collection of [GitDocumentDB.rootCollection](./git-documentdb.gitdocumentdb.rootcollection.md)

## Remarks

- Notice that this function just read an existing directory. It does not make a new sub-directory.

