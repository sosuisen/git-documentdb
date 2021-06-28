---
sidebar_label: SyncResultPush type
title: SyncResultPush type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [SyncResultPush](./git-documentdb.syncresultpush.md)

## SyncResultPush type

Push action occurred in synchronization.

<b>Signature:</b>

```typescript
export declare type SyncResultPush = {
    action: 'push';
    changes: {
        remote: ChangedFile[];
    };
    commits?: {
        remote: NormalizedCommit[];
    };
};
```
<b>References:</b> [ChangedFile](./git-documentdb.changedfile.md) , [NormalizedCommit](./git-documentdb.normalizedcommit.md)

## Remarks

- commits are sorted from old to new.

- commits.remote: List of commits which has been pushed to remote

