---
sidebar_label: SyncResultCombineDatabase type
title: SyncResultCombineDatabase type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [SyncResultCombineDatabase](./git-documentdb.syncresultcombinedatabase.md)

## SyncResultCombineDatabase type

Synchronization combined databases.

<b>Signature:</b>

```typescript
export declare type SyncResultCombineDatabase = {
    action: 'combine database';
    duplicates: DuplicatedFile[];
};
```
<b>References:</b>

[DuplicatedFile](./git-documentdb.duplicatedfile.md)

## Remarks

Push action does not occur after combine action.

