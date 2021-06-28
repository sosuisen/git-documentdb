---
sidebar_label: (constructor)
title: Collection.(constructor)
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Collection](./git-documentdb.collection.md) &gt; [(constructor)](./git-documentdb.collection._constructor_.md)

## Collection.(constructor)

Constructor

<b>Signature:</b>

```typescript
constructor(gitDDB: GitDDBInterface, collectionPathFromParent?: CollectionPath, parent?: ICollection, options?: CollectionOptions);
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  gitDDB | [GitDDBInterface](./git-documentdb.gitddbinterface.md) |  |
|  collectionPathFromParent | [CollectionPath](./git-documentdb.collectionpath.md) | A relative collectionPath from a parent collection. |
|  parent | [ICollection](./git-documentdb.icollection.md) | A parent collection of this collection. |
|  options | [CollectionOptions](./git-documentdb.collectionoptions.md) |  |

## Exceptions

[Err.InvalidCollectionPathCharacterError](./git-documentdb.err.invalidcollectionpathcharactererror.md)

[Err.InvalidCollectionPathLengthError](./git-documentdb.err.invalidcollectionpathlengtherror.md)

