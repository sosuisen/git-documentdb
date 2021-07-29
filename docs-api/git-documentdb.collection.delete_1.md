---
sidebar_label: delete()
title: Collection.delete() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Collection](./git-documentdb.collection.md) &gt; [delete](./git-documentdb.collection.delete_1.md)

## Collection.delete() method

Delete a document by \_id property in JsonDoc

<b>Signature:</b>

```typescript
delete(jsonDoc: JsonDoc, options?: DeleteOptions): Promise<DeleteResultJsonDoc>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  jsonDoc | [JsonDoc](./git-documentdb.jsondoc.md) | JsonDoc whose \_id is shortId. Only the \_id property is referenced. shortId is a file path whose collectionPath and .json extension are omitted. |
|  options | [DeleteOptions](./git-documentdb.deleteoptions.md) |  |

<b>Returns:</b>

Promise&lt;[DeleteResultJsonDoc](./git-documentdb.deleteresultjsondoc.md) &gt;

## Exceptions

[Err.UndefinedDocumentIdError](./git-documentdb.err.undefineddocumentiderror.md)

[Err.DatabaseClosingError](./git-documentdb.err.databaseclosingerror.md)

[Err.TaskCancelError](./git-documentdb.err.taskcancelerror.md)

\# Errors from deleteWorker

- [Err.UndefinedDBError](./git-documentdb.err.undefineddberror.md)

- [Err.DocumentNotFoundError](./git-documentdb.err.documentnotfounderror.md)

- [Err.CannotDeleteDataError](./git-documentdb.err.cannotdeletedataerror.md)

