---
sidebar_label: update()
title: GitDocumentDB.update() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [GitDocumentDB](./git-documentdb.gitdocumentdb.md) &gt; [update](./git-documentdb.gitdocumentdb.update.md)

## GitDocumentDB.update() method

Update a JSON document

<b>Signature:</b>

```typescript
update(jsonDoc: JsonDoc, options?: PutOptions): Promise<PutResultJsonDoc>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  jsonDoc | [JsonDoc](./git-documentdb.jsondoc.md) | JsonDoc whose \_id is shortId. shortId is a file path whose collectionPath and extension are omitted. |
|  options | [PutOptions](./git-documentdb.putoptions.md) |  |

<b>Returns:</b>

Promise&lt;[PutResultJsonDoc](./git-documentdb.putresultjsondoc.md) &gt;

## Remarks

- Throws DocumentNotFoundError if a specified document does not exist. It might be better to use put() instead of update().

- If \_id is undefined, it is automatically generated.

- The saved file path is `${GitDocumentDB#workingDir}/${_id}extension` on the file system.

- This is an alias of GitDocumentDB\#rootCollection.update()

## Exceptions

[Err.InvalidJsonObjectError](./git-documentdb.err.invalidjsonobjecterror.md)

[Err.DatabaseClosingError](./git-documentdb.err.databaseclosingerror.md)

[Err.TaskCancelError](./git-documentdb.err.taskcancelerror.md)

\# Errors from validateDocument, validateId

- [Err.InvalidIdCharacterError](./git-documentdb.err.invalididcharactererror.md)

- [Err.InvalidIdLengthError](./git-documentdb.err.invalididlengtherror.md)

\# Errors from putWorker

- [Err.UndefinedDBError](./git-documentdb.err.undefineddberror.md)

- [Err.CannotCreateDirectoryError](./git-documentdb.err.cannotcreatedirectoryerror.md)

- [Err.CannotWriteDataError](./git-documentdb.err.cannotwritedataerror.md)

- [Err.DocumentNotFoundError](./git-documentdb.err.documentnotfounderror.md)

