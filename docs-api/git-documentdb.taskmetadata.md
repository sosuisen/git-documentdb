---
sidebar_label: TaskMetadata type
title: TaskMetadata type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [TaskMetadata](./git-documentdb.taskmetadata.md)

## TaskMetadata type

Metadata of a task

<b>Signature:</b>

```typescript
export declare type TaskMetadata = {
    label: TaskLabel;
    taskId: string;
    shortId?: string;
    shortName?: string;
    collectionPath?: string;
    enqueueTime?: string;
};
```
<b>References:</b>

[TaskLabel](./git-documentdb.tasklabel.md)

