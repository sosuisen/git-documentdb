---
sidebar_label: PutOptions type
title: PutOptions type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [PutOptions](./git-documentdb.putoptions.md)

## PutOptions type

Options for put APIs (put, update, insert, putFatDoc, updateFatDoc, and insertFatDoc)

<b>Signature:</b>

```typescript
export declare type PutOptions = {
    commitMessage?: string;
    insertOrUpdate?: 'insert' | 'update';
    taskId?: string;
    enqueueCallback?: (taskMetadata: TaskMetadata) => void;
    debounceTime?: number;
};
```
<b>References:</b>

[TaskMetadata](./git-documentdb.taskmetadata.md)

## Remarks

- commitMessage: Git commit message. Default is ' &lt; insert or update &gt; : path/to/the/file( &lt; fileOid &gt; )'.

- insertOrUpdate: Change behavior of put and putFatDoc. Don't use this option. Use insert() or update() instead.

- taskId: taskId is used in TaskQueue to distinguish CRUD and synchronization tasks. It is usually generated automatically. Set it if you would like to monitor this put task explicitly.

- enqueueCallback: A callback function called just after this put task is enqueued to TaskQueue.

- debounceTime: put/insert/update operations for the same document are debounced by specified milliseconds. This overwrite the same option in Collection Class. Default is -1 (do not debounce).

