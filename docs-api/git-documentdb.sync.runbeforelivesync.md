---
sidebar_label: runBeforeLiveSync
title: Sync.runBeforeLiveSync property
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Sync](./git-documentdb.sync.md) &gt; [runBeforeLiveSync](./git-documentdb.sync.runbeforelivesync.md)

## Sync.runBeforeLiveSync property

runBeforeLiveSync

This function is executed just before each automated(live) synchronization event is queued. Set undefined to stop it.

<b>Signature:</b>

```typescript
runBeforeLiveSync: (() => void) | undefined;
```
