---
sidebar_label: SyncResultMergeAndPushError type
title: SyncResultMergeAndPushError type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [SyncResultMergeAndPushError](./git-documentdb.syncresultmergeandpusherror.md)

## SyncResultMergeAndPushError type

Synchronization created a merge commit and failed to push it.

<b>Signature:</b>

```typescript
export declare type SyncResultMergeAndPushError = {
    action: 'merge and push error';
    changes: {
        local: ChangedFile[];
    };
    commits?: {
        local: NormalizedCommit[];
    };
    error: Error;
};
```
<b>References:</b>

[ChangedFile](./git-documentdb.changedfile.md) , [NormalizedCommit](./git-documentdb.normalizedcommit.md)

## Remarks

- commits are sorted from old to new.

- commits.local: List of commits that had been pulled to local

