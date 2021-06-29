---
sidebar_label: update()
title: GitDocumentDB.update() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [GitDocumentDB](./git-documentdb.gitdocumentdb.md) &gt; [update](./git-documentdb.gitdocumentdb.update_1.md)

## GitDocumentDB.update() method

Update a JSON document

<b>Signature:</b>

```typescript
update(_id: string | undefined | null, jsonDoc: JsonDoc, options?: PutOptions): Promise<PutResultJsonDoc>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  \_id | string \| undefined \| null | \_id is a file path whose .json extension is omitted. |
|  jsonDoc | [JsonDoc](./git-documentdb.jsondoc.md) |  |
|  options | [PutOptions](./git-documentdb.putoptions.md) |  |

<b>Returns:</b>

Promise&lt;[PutResultJsonDoc](./git-documentdb.putresultjsondoc.md) &gt;

## Remarks

- Throws DocumentNotFoundError if a specified document does not exist. It might be better to use put() instead of update().

- The saved file path is `${GitDocumentDB#workingDir}/${_id}.json` on the file system.

- An update operation is not skipped even if no change occurred on a specified document.

- This is an alias of GitDocumentDB\#rootCollection.update()

## Exceptions

[Err.InvalidJsonObjectError](./git-documentdb.err.invalidjsonobjecterror.md)

[Err.InvalidIdCharacterError](./git-documentdb.err.invalididcharactererror.md) (from validateDocument, validateId)

[Err.InvalidIdLengthError](./git-documentdb.err.invalididlengtherror.md) (from validateDocument, validateId)

[Err.DatabaseClosingError](./git-documentdb.err.databaseclosingerror.md) (fromm putImpl)

[Err.TaskCancelError](./git-documentdb.err.taskcancelerror.md) (from putImpl)

[Err.UndefinedDBError](./git-documentdb.err.undefineddberror.md) (fromm putWorker)

[Err.RepositoryNotOpenError](./git-documentdb.err.repositorynotopenerror.md) (fromm putWorker)

[Err.CannotCreateDirectoryError](./git-documentdb.err.cannotcreatedirectoryerror.md) (from putWorker)

[Err.CannotWriteDataError](./git-documentdb.err.cannotwritedataerror.md) (from putWorker)

[Err.DocumentNotFoundError](./git-documentdb.err.documentnotfounderror.md)

