---
sidebar_label: Sync class
title: Sync class
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Sync](./git-documentdb.sync.md)

## Sync class

Synchronizer class

<b>Signature:</b>

```typescript
export declare class Sync implements SyncInterface 
```
<b>Implements:</b>

[SyncInterface](./git-documentdb.syncinterface.md)

## Constructors

|  Constructor | Modifiers | Description |
|  --- | --- | --- |
|  [(constructor)(gitDDB, options)](./git-documentdb.sync._constructor_.md) |  | constructor |

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [engine](./git-documentdb.sync.engine.md) |  | string |  |
|  [jsonDiff](./git-documentdb.sync.jsondiff.md) |  | JsonDiff | JsonDiff |
|  [jsonPatch](./git-documentdb.sync.jsonpatch.md) |  | JsonPatchOT | JsonPatch |
|  [options](./git-documentdb.sync.options.md) |  | Required&lt;[RemoteOptions](./git-documentdb.remoteoptions.md) &gt; | Get a clone of remote options |
|  [remoteName](./git-documentdb.sync.remotename.md) |  | string | remoteName |
|  [remoteRepository](./git-documentdb.sync.remoterepository.md) |  | [RemoteRepository](./git-documentdb.remoterepository.md) | Remote repository |
|  [remoteURL](./git-documentdb.sync.remoteurl.md) |  | string | remoteURL |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [close()](./git-documentdb.sync.close.md) |  | Stop and clear remote connection |
|  [currentRetries()](./git-documentdb.sync.currentretries.md) |  | Return current retry count (incremental) |
|  [enqueueSyncTask(calledAsPeriodicTask)](./git-documentdb.sync.enqueuesynctask.md) |  | Enqueue sync task to TaskQueue |
|  [init()](./git-documentdb.sync.init.md) |  | Initialize remote connection |
|  [off(event, callback)](./git-documentdb.sync.off.md) |  | Remove SyncEvent handler |
|  [on(event, callback, collectionPath)](./git-documentdb.sync.on.md) |  | Add SyncEvent handler |
|  [pause()](./git-documentdb.sync.pause.md) |  | Pause synchronization |
|  [resume(options)](./git-documentdb.sync.resume.md) |  | Resume synchronization |
|  [tryPush()](./git-documentdb.sync.trypush.md) |  | Try to push |
|  [trySync()](./git-documentdb.sync.trysync.md) |  | Try to sync with retries |

