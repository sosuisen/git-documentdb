---
sidebar_label: TaskStatistics type
title: TaskStatistics type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [TaskStatistics](./git-documentdb.taskstatistics.md)

## TaskStatistics type

Task statistics after opening database

<b>Signature:</b>

```typescript
export declare type TaskStatistics = {
    put: number;
    insert: number;
    update: number;
    delete: number;
    push: number;
    sync: number;
    cancel: number;
};
```

## Remarks

The statistics are on memory and not persistent. They are cleared by GitDocumentDB\#close().

