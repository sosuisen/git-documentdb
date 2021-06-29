---
sidebar_label: SyncResultMergeAndPush type
title: SyncResultMergeAndPush type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [SyncResultMergeAndPush](./git-documentdb.syncresultmergeandpush.md)

## SyncResultMergeAndPush type

Synchronization created a merge commit and pushed it.

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
<b>References:</b>

[ChangedFile](./git-documentdb.changedfile.md) , [NormalizedCommit](./git-documentdb.normalizedcommit.md)

## Remarks

- commits are sorted from old to new.

- commits.local: List of commits that had been pulled to local

- commits.remote: List of commits that had been pushed to remote

