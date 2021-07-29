---
sidebar_label: sync()
title: GitDocumentDB.sync() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [GitDocumentDB](./git-documentdb.gitdocumentdb.md) &gt; [sync](./git-documentdb.gitdocumentdb.sync_1.md)

## GitDocumentDB.sync() method

Synchronize with a remote repository

<b>Signature:</b>

```typescript
sync(options: RemoteOptions, getSyncResult: boolean): Promise<[Sync, SyncResult]>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  options | [RemoteOptions](./git-documentdb.remoteoptions.md) |  |
|  getSyncResult | boolean |  |

<b>Returns:</b>

Promise&lt;\[[Sync](./git-documentdb.sync.md) , [SyncResult](./git-documentdb.syncresult.md) \]&gt;

## Remarks

Register and synchronize with a remote repository. Do not register the same remote repository again. Call unregisterRemote() before register it again.

## Exceptions

[Err.RemoteAlreadyRegisteredError](./git-documentdb.err.remotealreadyregisterederror.md)

[Err.DatabaseClosingError](./git-documentdb.err.databaseclosingerror.md)

[Err.RepositoryNotOpenError](./git-documentdb.err.repositorynotopenerror.md)

Errors from constructor of [Sync](./git-documentdb.sync.md) class.

Errors from [Sync.init()](./git-documentdb.sync.init.md)

