---
sidebar_label: SyncInterface interface
title: SyncInterface interface
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [SyncInterface](./git-documentdb.syncinterface.md)

## SyncInterface interface

Interface of Sync

<b>Signature:</b>

```typescript
export interface SyncInterface 
```

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [engine](./git-documentdb.syncinterface.engine.md) | string |  |
|  [jsonDiff](./git-documentdb.syncinterface.jsondiff.md) | JsonDiff |  |
|  [jsonPatch](./git-documentdb.syncinterface.jsonpatch.md) | IJsonPatch |  |
|  [options](./git-documentdb.syncinterface.options.md) | [RemoteOptions](./git-documentdb.remoteoptions.md) |  |
|  [remoteName](./git-documentdb.syncinterface.remotename.md) | string |  |
|  [remoteRepository](./git-documentdb.syncinterface.remoterepository.md) | [RemoteRepository](./git-documentdb.remoterepository.md) |  |
|  [remoteURL](./git-documentdb.syncinterface.remoteurl.md) | string | \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* Public properties (readonly) \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* |
|  [runBeforeLiveSync](./git-documentdb.syncinterface.runbeforelivesync.md) | (() =&gt; void) \| undefined | \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* Public properties \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* |

## Methods

|  Method | Description |
|  --- | --- |
|  [close()](./git-documentdb.syncinterface.close.md) |  |
|  [currentRetries()](./git-documentdb.syncinterface.currentretries.md) |  |
|  [init()](./git-documentdb.syncinterface.init.md) | \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* Public methods \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* |
|  [off(event, callback)](./git-documentdb.syncinterface.off.md) |  |
|  [on(event, callback, collectionPath)](./git-documentdb.syncinterface.on.md) |  |
|  [pause()](./git-documentdb.syncinterface.pause.md) |  |
|  [resume(options)](./git-documentdb.syncinterface.resume.md) |  |
|  [tryPush()](./git-documentdb.syncinterface.trypush.md) |  |
|  [trySync()](./git-documentdb.syncinterface.trysync.md) |  |

