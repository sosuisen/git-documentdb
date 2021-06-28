---
sidebar_label: collection()
title: Collection.collection() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Collection](./git-documentdb.collection.md) &gt; [collection](./git-documentdb.collection.collection.md)

## Collection.collection() method

Get a collection

<b>Signature:</b>

```typescript
collection(collectionPath: CollectionPath, options?: CollectionOptions): ICollection;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  collectionPath | [CollectionPath](./git-documentdb.collectionpath.md) | relative path from this.collectionPath. Sub-directories are also permitted. e.g. 'pages', 'pages/works'. |
|  options | [CollectionOptions](./git-documentdb.collectionoptions.md) |  |

<b>Returns:</b>

[ICollection](./git-documentdb.icollection.md)

A child collection of this collection.

## Remarks

- Notice that this function just read existing directory. It does not make a new sub-directory.

