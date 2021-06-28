---
sidebar_label: DeleteOptions type
title: DeleteOptions type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [DeleteOptions](./git-documentdb.deleteoptions.md)

## DeleteOptions type

Options for delete

<b>Signature:</b>

```typescript
export declare type DeleteOptions = {
    commitMessage?: string;
    taskId?: string;
    enqueueCallback?: (taskMetadata: TaskMetadata) => void;
};
```
<b>References:</b> [TaskMetadata](./git-documentdb.taskmetadata.md)

## Remarks

- commitMessage: Git commit message. Default is 'delete: path/to/the/file( &lt; fileOid &gt; )'.

- taskId: taskId is used in TaskQueue to distinguish CRUD and synchronization tasks. It is usually generated automatically. Set it if you would like to monitor this delete task explicitly.

- enqueueCallback: A callback function called just after this delete task is enqueued to TaskQueue.

