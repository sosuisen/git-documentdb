---
sidebar_label: RemoteEngineInterface interface
title: RemoteEngineInterface interface
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [RemoteEngineInterface](./git-documentdb.remoteengineinterface.md)

## RemoteEngineInterface interface

<b>Signature:</b>

```typescript
export interface RemoteEngineInterface 
```

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [checkFetch](./git-documentdb.remoteengineinterface.checkfetch.md) | (workingDir: string, options: [RemoteOptions](./git-documentdb.remoteoptions.md) , remoteName?: string, logger?: Logger) =&gt; Promise&lt;boolean&gt; |  |
|  [clone](./git-documentdb.remoteengineinterface.clone.md) | (workingDir: string, remoteOptions: [RemoteOptions](./git-documentdb.remoteoptions.md) , remoteName: string, logger?: Logger) =&gt; Promise&lt;void&gt; |  |
|  [fetch](./git-documentdb.remoteengineinterface.fetch.md) | (workingDir: string, remoteOptions: [RemoteOptions](./git-documentdb.remoteoptions.md) , remoteName?: string, logger?: Logger) =&gt; Promise&lt;void&gt; |  |
|  [push](./git-documentdb.remoteengineinterface.push.md) | (workingDir: string, remoteOptions: [RemoteOptions](./git-documentdb.remoteoptions.md) , remoteName?: string, localBranch?: string, remoteBranch?: string, logger?: Logger) =&gt; Promise&lt;void&gt; |  |

