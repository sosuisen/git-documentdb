---
sidebar_label: collectionPath
title: Collection.collectionPath property
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Collection](./git-documentdb.collection.md) &gt; [collectionPath](./git-documentdb.collection.collectionpath.md)

## Collection.collectionPath property

Normalized path of a collection

<b>Signature:</b>

```typescript
get collectionPath(): string;
```

## Remarks

collectionPath is '' or path strings that have a trailing slash and no heading slash. '/' is not allowed. Backslash \\ or yen ¥ is replaced with slash /.

