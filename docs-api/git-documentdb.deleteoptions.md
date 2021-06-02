<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [DeleteOptions](./git-documentdb.deleteoptions.md)

## DeleteOptions type

Options for delete()

<b>Signature:</b>

```typescript
export declare type DeleteOptions = {
    commit_message?: string;
    taskId?: string;
    enqueueCallback?: (taskMetadata: TaskMetadata) => void;
};
```
<b>References:</b> [TaskMetadata](./git-documentdb.taskmetadata.md)

## Remarks

- commit\_message: internal commit message. default is 'delete: path/to/the/file'
