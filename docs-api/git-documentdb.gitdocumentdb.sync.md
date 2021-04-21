<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [GitDocumentDB](./git-documentdb.gitdocumentdb.md) &gt; [sync](./git-documentdb.gitdocumentdb.sync.md)

## GitDocumentDB.sync() method

Synchronize with a remote repository

<b>Signature:</b>

```typescript
sync(remoteURL: string, options?: RemoteOptions): Promise<Sync>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  remoteURL | string |  |
|  options | [RemoteOptions](./git-documentdb.remoteoptions.md) |  |

<b>Returns:</b>

Promise&lt;[Sync](./git-documentdb.sync.md)<!-- -->&gt;

## Exceptions

[UndefinedRemoteURLError](./git-documentdb.undefinedremoteurlerror.md) (from Sync\#constructor())

[IntervalTooSmallError](./git-documentdb.intervaltoosmallerror.md) (from Sync\#constructor())

[RemoteRepositoryConnectError](./git-documentdb.remoterepositoryconnecterror.md) (from Sync\#init())

[PushWorkerError](./git-documentdb.pushworkererror.md) (from Sync\#init())

[SyncWorkerError](./git-documentdb.syncworkererror.md) (from Sync\#init())

## Remarks

Register and synchronize with a remote repository. Do not register the same remote repository again. Call removeRemote() before register it again.
