<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [ISync](./git-documentdb.isync.md)

## ISync interface

Interface of Sync

<b>Signature:</b>

```typescript
export interface ISync 
```

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [author](./git-documentdb.isync.author.md) | nodegit.Signature |  |
|  [committer](./git-documentdb.isync.committer.md) | nodegit.Signature |  |
|  [credential\_callbacks](./git-documentdb.isync.credential_callbacks.md) | { \[key: string\]: any; } |  |
|  [currentRetries](./git-documentdb.isync.currentretries.md) | () =&gt; number |  |
|  [eventHandlers](./git-documentdb.isync.eventhandlers.md) | { change: ((syncResult: [SyncResult](./git-documentdb.syncresult.md)<!-- -->) =&gt; void)\[\]; localChange: ((changedFiles: [ChangedFile](./git-documentdb.changedfile.md)<!-- -->\[\]) =&gt; void)\[\]; remoteChange: ((changedFiles: [ChangedFile](./git-documentdb.changedfile.md)<!-- -->\[\]) =&gt; void)\[\]; paused: (() =&gt; void)\[\]; active: (() =&gt; void)\[\]; start: ((taskId: string, currentRetries: number) =&gt; void)\[\]; complete: ((taskId: string) =&gt; void)\[\]; error: ((error: Error) =&gt; void)\[\]; } |  |
|  [upstream\_branch](./git-documentdb.isync.upstream_branch.md) | string |  |

## Methods

|  Method | Description |
|  --- | --- |
|  [cancel()](./git-documentdb.isync.cancel.md) |  |
|  [enqueuePushTask()](./git-documentdb.isync.enqueuepushtask.md) |  |
|  [enqueueSyncTask()](./git-documentdb.isync.enqueuesynctask.md) |  |
|  [off(event, callback)](./git-documentdb.isync.off.md) |  |
|  [on(event, callback)](./git-documentdb.isync.on.md) |  |
|  [options()](./git-documentdb.isync.options.md) |  |
|  [pause()](./git-documentdb.isync.pause.md) |  |
|  [remoteURL()](./git-documentdb.isync.remoteurl.md) |  |
|  [resume(options)](./git-documentdb.isync.resume.md) |  |
|  [tryPush()](./git-documentdb.isync.trypush.md) |  |
|  [trySync()](./git-documentdb.isync.trysync.md) |  |
