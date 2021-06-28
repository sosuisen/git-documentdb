---
sidebar_label: SyncDirection type
title: SyncDirection type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [SyncDirection](./git-documentdb.syncdirection.md)

## SyncDirection type

Synchronization direction

<b>Signature:</b>

```typescript
export declare type SyncDirection = 'pull' | 'push' | 'both';
```

## Remarks

- pull: Only download from remote to local (currently not implemented)

- push: Only upload from local to remote

- both: Both download and upload between remote and local

