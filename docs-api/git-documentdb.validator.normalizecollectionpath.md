---
sidebar_label: normalizeCollectionPath()
title: Validator.normalizeCollectionPath() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Validator](./git-documentdb.validator.md) &gt; [normalizeCollectionPath](./git-documentdb.validator.normalizecollectionpath.md)

## Validator.normalizeCollectionPath() method

Normalized collectionPath is '' or path strings that have a trailing slash and no heading slash. Root ('/') is not allowed. Backslash \\ or yen ¥ is replaced with slash /.

<b>Signature:</b>

```typescript
static normalizeCollectionPath(collectionPath: CollectionPath | undefined): CollectionPath;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  collectionPath | [CollectionPath](./git-documentdb.collectionpath.md) \| undefined |  |

<b>Returns:</b>

[CollectionPath](./git-documentdb.collectionpath.md)

