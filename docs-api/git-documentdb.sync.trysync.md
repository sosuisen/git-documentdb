---
sidebar_label: trySync()
title: Sync.trySync() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Sync](./git-documentdb.sync.md) &gt; [trySync](./git-documentdb.sync.trysync.md)

## Sync.trySync() method

Try to sync with retries

<b>Signature:</b>

```typescript
trySync(): Promise<SyncResult>;
```
<b>Returns:</b>

Promise&lt;[SyncResult](./git-documentdb.syncresult.md) &gt;

## Exceptions

[Err.PushNotAllowedError](./git-documentdb.err.pushnotallowederror.md) (from this and enqueueSyncTask)

[Err.SyncWorkerError](./git-documentdb.err.syncworkererror.md) (from enqueueSyncTask)

[Err.NoMergeBaseFoundError](./git-documentdb.err.nomergebasefounderror.md) (from enqueueSyncTask)

[Err.UnfetchedCommitExistsError](./git-documentdb.err.unfetchedcommitexistserror.md) (from enqueueSyncTask)

