---
sidebar_label: delete()
title: GitDocumentDB.delete() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [GitDocumentDB](./git-documentdb.gitdocumentdb.md) &gt; [delete](./git-documentdb.gitdocumentdb.delete.md)

## GitDocumentDB.delete() method

Delete a JSON document

<b>Signature:</b>

```typescript
delete(_id: string, options?: DeleteOptions): Promise<DeleteResultJsonDoc>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  \_id | string | \_id is a file path whose .json extension is omitted. |
|  options | [DeleteOptions](./git-documentdb.deleteoptions.md) |  |

<b>Returns:</b>

Promise&lt;[DeleteResultJsonDoc](./git-documentdb.deleteresultjsondoc.md) &gt;

## Remarks

- This is an alias of GitDocumentDB\#rootCollection.delete()

## Exceptions

[Err.UndefinedDocumentIdError](./git-documentdb.err.undefineddocumentiderror.md)

[Err.DatabaseClosingError](./git-documentdb.err.databaseclosingerror.md)

[Err.TaskCancelError](./git-documentdb.err.taskcancelerror.md)

\# Errors from deleteWorker

- [Err.UndefinedDBError](./git-documentdb.err.undefineddberror.md)

- [Err.DocumentNotFoundError](./git-documentdb.err.documentnotfounderror.md)

- [Err.CannotDeleteDataError](./git-documentdb.err.cannotdeletedataerror.md)

