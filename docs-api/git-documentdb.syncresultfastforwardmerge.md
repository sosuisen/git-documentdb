---
sidebar_label: SyncResultFastForwardMerge type
title: SyncResultFastForwardMerge type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [SyncResultFastForwardMerge](./git-documentdb.syncresultfastforwardmerge.md)

## SyncResultFastForwardMerge type

Fast-forward action occurred in synchronization.

<b>Signature:</b>

```typescript
export declare type SyncResultFastForwardMerge = {
    action: 'fast-forward merge';
    changes: {
        local: ChangedFile[];
    };
    commits?: {
        local: NormalizedCommit[];
    };
};
```
<b>References:</b> [ChangedFile](./git-documentdb.changedfile.md) , [NormalizedCommit](./git-documentdb.normalizedcommit.md)

## Remarks

- commits are sorted from old to new.

- commits.local: List of commits which has been pulled to local

