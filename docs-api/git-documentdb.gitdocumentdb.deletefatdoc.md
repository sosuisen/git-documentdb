---
sidebar_label: deleteFatDoc()
title: GitDocumentDB.deleteFatDoc() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [GitDocumentDB](./git-documentdb.gitdocumentdb.md) &gt; [deleteFatDoc](./git-documentdb.gitdocumentdb.deletefatdoc.md)

## GitDocumentDB.deleteFatDoc() method

Delete a data

<b>Signature:</b>

```typescript
deleteFatDoc(name: string, options?: DeleteOptions): Promise<DeleteResult>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  name | string | name is a file path |
|  options | [DeleteOptions](./git-documentdb.deleteoptions.md) |  |

<b>Returns:</b>

Promise&lt;[DeleteResult](./git-documentdb.deleteresult.md) &gt;

## Remarks

- This is an alias of GitDocumentDB\#rootCollection.deleteFatDoc()

## Exceptions

[Err.UndefinedDocumentIdError](./git-documentdb.err.undefineddocumentiderror.md)

[Err.DatabaseClosingError](./git-documentdb.err.databaseclosingerror.md) (from deleteImpl)

[Err.TaskCancelError](./git-documentdb.err.taskcancelerror.md) (from deleteImpl)

[Err.RepositoryNotOpenError](./git-documentdb.err.repositorynotopenerror.md) (from deleteWorker)

[Err.UndefinedDBError](./git-documentdb.err.undefineddberror.md) (from deleteWorker)

[Err.DocumentNotFoundError](./git-documentdb.err.documentnotfounderror.md) (from deleteWorker)

[Err.CannotDeleteDataError](./git-documentdb.err.cannotdeletedataerror.md) (from deleteWorker)

