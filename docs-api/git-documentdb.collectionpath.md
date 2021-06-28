---
sidebar_label: CollectionPath type
title: CollectionPath type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [CollectionPath](./git-documentdb.collectionpath.md)

## CollectionPath type

CollectionPath

<b>Signature:</b>

```typescript
export declare type CollectionPath = string;
```

## Remarks

CollectionPath must be paths that match the following conditions:

```
- CollectionPath can include paths separated by slashes.
- A directory name in paths allows Unicode characters excluding OS reserved filenames and following characters: \< \> : " | ? * \\0
- CollectionPath is better to be ASCII characters and a case-insensitive names for cross-platform.
- A directory name in paths cannot end with a period or a white space.
- A directory name in paths does not allow '.' and '..'.
- CollectionPath cannot start with a slash.
- Trailing slash could be omitted. e.g.) 'pages' and 'pages/' show the same CollectionPath.

```

