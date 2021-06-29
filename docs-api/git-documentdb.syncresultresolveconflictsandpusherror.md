---
sidebar_label: SyncResultResolveConflictsAndPushError type
title: SyncResultResolveConflictsAndPushError type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [SyncResultResolveConflictsAndPushError](./git-documentdb.syncresultresolveconflictsandpusherror.md)

## SyncResultResolveConflictsAndPushError type

Synchronization resolved conflicts, created a merge commit, and failed to push it.

<b>Signature:</b>

```typescript
export declare type SyncResultResolveConflictsAndPushError = {
    action: 'resolve conflicts and push error';
    changes: {
        local: ChangedFile[];
    };
    conflicts: AcceptedConflict[];
    commits?: {
        local: NormalizedCommit[];
    };
    error: Error;
};
```
<b>References:</b>

[ChangedFile](./git-documentdb.changedfile.md) , [AcceptedConflict](./git-documentdb.acceptedconflict.md) , [NormalizedCommit](./git-documentdb.normalizedcommit.md)

## Remarks

- commits are sorted from old to new.

- commits.local: List of commits that had been pulled to local

