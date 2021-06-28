---
sidebar_label: SyncResultMergeAndPush type
title: SyncResultMergeAndPush type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [SyncResultMergeAndPush](./git-documentdb.syncresultmergeandpush.md)

## SyncResultMergeAndPush type

Merge and push actions occurred in synchronization.

<b>Signature:</b>

```typescript
export declare type SyncResultMergeAndPush = {
    action: 'merge and push';
    changes: {
        local: ChangedFile[];
        remote: ChangedFile[];
    };
    commits?: {
        local: NormalizedCommit[];
        remote: NormalizedCommit[];
    };
};
```
<b>References:</b> [ChangedFile](./git-documentdb.changedfile.md) , [NormalizedCommit](./git-documentdb.normalizedcommit.md)

## Remarks

- commits are sorted from old to new.

- commits.local: List of commits which has been pulled to local

- commits.remote: List of commits which has been pushed to remote

