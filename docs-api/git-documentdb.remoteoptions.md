---
sidebar_label: RemoteOptions type
title: RemoteOptions type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [RemoteOptions](./git-documentdb.remoteoptions.md)

## RemoteOptions type

Options for Sync class

<b>Signature:</b>

```typescript
export declare type RemoteOptions = {
    remoteUrl?: string;
    syncDirection?: SyncDirection;
    connection?: ConnectionSettings;
    live?: boolean;
    interval?: number;
    retry?: number;
    retryInterval?: number;
    conflictResolutionStrategy?: ConflictResolutionStrategies;
    combineDbStrategy?: CombineDbStrategies;
    includeCommits?: boolean;
};
```
<b>References:</b>

[SyncDirection](./git-documentdb.syncdirection.md) , [ConnectionSettings](./git-documentdb.connectionsettings.md) , [ConflictResolutionStrategies](./git-documentdb.conflictresolutionstrategies.md) , [CombineDbStrategies](./git-documentdb.combinedbstrategies.md)

## Remarks

(network)

- remoteUrl: Connection destination

- syncDirection: Default is 'both'.

- connection: Authentication and other settings on remote site

(automation)

- live: Synchronization repeats automatically if true. Default is false.

- interval: Synchronization interval (milliseconds). This must be greater than MINIMUM\_SYNC\_INTERVAL(3000). Default is DEFAULT\_SYNC\_INTERVAL(30000).

- retry: Number of network retries. Retry does not occur if retry is 0. Default is NETWORK\_RETRY(3).

- retryInterval: Retry interval (milliseconds). Default is NETWORK\_RETRY\_INTERVAL(2000).

(merge)

- conflictResolutionStrategy: Default is 'ours-diff'.

- combineDbStrategy: Default is 'combine-head-with-theirs'.

(result)

- includeCommits: Whether SyncResult includes 'commits' property or not. Default is false.

