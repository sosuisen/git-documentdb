---
sidebar_label: sync()
title: GitDocumentDB.sync() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [GitDocumentDB](./git-documentdb.gitdocumentdb.md) &gt; [sync](./git-documentdb.gitdocumentdb.sync.md)

## GitDocumentDB.sync() method

Synchronize with a remote repository

<b>Signature:</b>

```typescript
sync(options: RemoteOptions): Promise<Sync>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  options | [RemoteOptions](./git-documentdb.remoteoptions.md) |  |

<b>Returns:</b>

Promise&lt;[Sync](./git-documentdb.sync.md) &gt;

## Exceptions

[Err.UndefinedRemoteURLError](./git-documentdb.err.undefinedremoteurlerror.md) (from Sync\#constructor())

[Err.IntervalTooSmallError](./git-documentdb.err.intervaltoosmallerror.md) (from Sync\#constructor())

[Err.RepositoryNotFoundError](./git-documentdb.err.repositorynotfounderror.md) (from Sync\#syncImpl())

[Err.RemoteRepositoryConnectError](./git-documentdb.err.remoterepositoryconnecterror.md) (from Sync\#init())

[Err.PushWorkerError](./git-documentdb.err.pushworkererror.md) (from Sync\#init())

[Err.SyncWorkerError](./git-documentdb.err.syncworkererror.md) (from Sync\#init())

## Remarks

Register and synchronize with a remote repository. Do not register the same remote repository again. Call unregisterRemote() before register it again.

