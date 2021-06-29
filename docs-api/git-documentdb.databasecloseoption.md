---
sidebar_label: DatabaseCloseOption type
title: DatabaseCloseOption type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [DatabaseCloseOption](./git-documentdb.databasecloseoption.md)

## DatabaseCloseOption type

How to close a database

<b>Signature:</b>

```typescript
export declare type DatabaseCloseOption = {
    force?: boolean;
    timeout?: number;
};
```

## Remarks

- force: Clear queued tasks immediately.

- timeout: Clear queued tasks after timeout(msec). Default is 10000.

