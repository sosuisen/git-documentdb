---
sidebar_label: enqueueSyncTask()
title: Sync.enqueueSyncTask() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Sync](./git-documentdb.sync.md) &gt; [enqueueSyncTask](./git-documentdb.sync.enqueuesynctask.md)

## Sync.enqueueSyncTask() method

Enqueue sync task to TaskQueue

<b>Signature:</b>

```typescript
enqueueSyncTask(): Promise<SyncResult>;
```
<b>Returns:</b>

Promise&lt;[SyncResult](./git-documentdb.syncresult.md) &gt;

## Exceptions

[Err.SyncWorkerError](./git-documentdb.err.syncworkererror.md)

[Err.NoMergeBaseFoundError](./git-documentdb.err.nomergebasefounderror.md)

[Err.UnfetchedCommitExistsError](./git-documentdb.err.unfetchedcommitexistserror.md)

[Err.PushNotAllowedError](./git-documentdb.err.pushnotallowederror.md)

