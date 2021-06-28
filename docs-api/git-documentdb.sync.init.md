---
sidebar_label: init()
title: Sync.init() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Sync](./git-documentdb.sync.md) &gt; [init](./git-documentdb.sync.init.md)

## Sync.init() method

Create remote connection

<b>Signature:</b>

```typescript
init(repos: nodegit.Repository): Promise<SyncResult>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  repos | nodegit.Repository |  |

<b>Returns:</b>

Promise&lt;[SyncResult](./git-documentdb.syncresult.md) &gt;

## Exceptions

[Err.RemoteRepositoryConnectError](./git-documentdb.err.remoterepositoryconnecterror.md)

[Err.PushWorkerError](./git-documentdb.err.pushworkererror.md)

[Err.NoMergeBaseFoundError](./git-documentdb.err.nomergebasefounderror.md)

[Err.SyncWorkerError](./git-documentdb.err.syncworkererror.md)

## Remarks

Call init() once just after creating instance.

