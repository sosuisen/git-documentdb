---
sidebar_label: tryPush()
title: Sync.tryPush() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Sync](./git-documentdb.sync.md) &gt; [tryPush](./git-documentdb.sync.trypush.md)

## Sync.tryPush() method

Try to push with retries

<b>Signature:</b>

```typescript
tryPush(): Promise<SyncResultPush | SyncResultCancel>;
```
<b>Returns:</b>

Promise&lt;[SyncResultPush](./git-documentdb.syncresultpush.md) \| [SyncResultCancel](./git-documentdb.syncresultcancel.md) &gt;

## Exceptions

[Err.PushNotAllowedError](./git-documentdb.err.pushnotallowederror.md) (from this and enqueuePushTask)

[Err.PushWorkerError](./git-documentdb.err.pushworkererror.md) (from this and enqueuePushTask)

[Err.UnfetchedCommitExistsError](./git-documentdb.err.unfetchedcommitexistserror.md) (from this and enqueuePushTask)

