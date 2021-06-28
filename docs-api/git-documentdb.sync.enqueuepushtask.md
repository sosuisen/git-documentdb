---
sidebar_label: enqueuePushTask()
title: Sync.enqueuePushTask() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Sync](./git-documentdb.sync.md) &gt; [enqueuePushTask](./git-documentdb.sync.enqueuepushtask.md)

## Sync.enqueuePushTask() method

Enqueue push task to TaskQueue

<b>Signature:</b>

```typescript
enqueuePushTask(): Promise<SyncResultPush | SyncResultCancel>;
```
<b>Returns:</b>

Promise&lt;[SyncResultPush](./git-documentdb.syncresultpush.md) \| [SyncResultCancel](./git-documentdb.syncresultcancel.md) &gt;

## Exceptions

[Err.PushWorkerError](./git-documentdb.err.pushworkererror.md)

[Err.UnfetchedCommitExistsError](./git-documentdb.err.unfetchedcommitexistserror.md)

[Err.PushNotAllowedError](./git-documentdb.err.pushnotallowederror.md)

