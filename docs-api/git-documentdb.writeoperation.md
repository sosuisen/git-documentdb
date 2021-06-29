---
sidebar_label: WriteOperation type
title: WriteOperation type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [WriteOperation](./git-documentdb.writeoperation.md)

## WriteOperation type

Write operation in resolving conflicts

<b>Signature:</b>

```typescript
export declare type WriteOperation = 'insert' | 'update' | 'delete' | 'insert-merge' | 'update-merge';
```

## Remarks

- insert: A document in either 'ours' or 'theirs' is newly inserted.

- update: A document is updated to either 'ours' document or 'theirs' document.

- delete: A document is deleted.

- insert-merge: A merged document of 'ours' and 'theirs' is newly inserted.

- update-merge: A document is updated to a merged document of 'ours' and 'theirs'.

