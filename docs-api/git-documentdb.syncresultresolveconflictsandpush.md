---
sidebar_label: SyncResultResolveConflictsAndPush type
title: SyncResultResolveConflictsAndPush type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [SyncResultResolveConflictsAndPush](./git-documentdb.syncresultresolveconflictsandpush.md)

## SyncResultResolveConflictsAndPush type

Resolve conflicts and push actions occurred in synchronization.

<b>Signature:</b>

```typescript
export declare type SyncResultResolveConflictsAndPush = {
    action: 'resolve conflicts and push';
    changes: {
        local: ChangedFile[];
        remote: ChangedFile[];
    };
    conflicts: AcceptedConflict[];
    commits?: {
        local: NormalizedCommit[];
        remote: NormalizedCommit[];
    };
};
```
<b>References:</b> [ChangedFile](./git-documentdb.changedfile.md) , [AcceptedConflict](./git-documentdb.acceptedconflict.md) , [NormalizedCommit](./git-documentdb.normalizedcommit.md)

## Remarks

- commits are sorted from old to new.

- commits.local: List of commits which has been pulled to local

- commits.remote: List of commits which has been pushed to remote

