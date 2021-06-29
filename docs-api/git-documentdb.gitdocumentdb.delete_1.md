---
sidebar_label: delete()
title: GitDocumentDB.delete() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [GitDocumentDB](./git-documentdb.gitdocumentdb.md) &gt; [delete](./git-documentdb.gitdocumentdb.delete_1.md)

## GitDocumentDB.delete() method

Delete a document by \_id property in JsonDoc

<b>Signature:</b>

```typescript
delete(jsonDoc: JsonDoc, options?: DeleteOptions): Promise<DeleteResultJsonDoc>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  jsonDoc | [JsonDoc](./git-documentdb.jsondoc.md) | Only the \_id property of the JsonDoc is referenced. \_id is a file path whose .json extension is omitted. |
|  options | [DeleteOptions](./git-documentdb.deleteoptions.md) |  |

<b>Returns:</b>

Promise&lt;[DeleteResultJsonDoc](./git-documentdb.deleteresultjsondoc.md) &gt;

## Remarks

- This is an alias of GitDocumentDB\#rootCollection.delete()

## Exceptions

[Err.UndefinedDocumentIdError](./git-documentdb.err.undefineddocumentiderror.md) (from Collection\#delete)

[Err.DatabaseClosingError](./git-documentdb.err.databaseclosingerror.md) (from deleteImpl)

[Err.TaskCancelError](./git-documentdb.err.taskcancelerror.md) (from deleteImpl)

[Err.RepositoryNotOpenError](./git-documentdb.err.repositorynotopenerror.md) (from deleteWorker)

[Err.UndefinedDBError](./git-documentdb.err.undefineddberror.md) (from deleteWorker)

[Err.DocumentNotFoundError](./git-documentdb.err.documentnotfounderror.md) (from deleteWorker)

[Err.CannotDeleteDataError](./git-documentdb.err.cannotdeletedataerror.md) (from deleteWorker)

