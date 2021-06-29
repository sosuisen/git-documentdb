---
sidebar_label: updateFatDoc()
title: GitDocumentDB.updateFatDoc() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [GitDocumentDB](./git-documentdb.gitdocumentdb.md) &gt; [updateFatDoc](./git-documentdb.gitdocumentdb.updatefatdoc.md)

## GitDocumentDB.updateFatDoc() method

Update a data

<b>Signature:</b>

```typescript
updateFatDoc(name: string | undefined | null, doc: JsonDoc | string | Uint8Array, options?: PutOptions): Promise<PutResult>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  name | string \| undefined \| null | name is a file path. |
|  doc | [JsonDoc](./git-documentdb.jsondoc.md) \| string \| Uint8Array |  |
|  options | [PutOptions](./git-documentdb.putoptions.md) |  |

<b>Returns:</b>

Promise&lt;[PutResult](./git-documentdb.putresult.md) &gt;

## Remarks

- Throws DocumentNotFoundError if a specified data does not exist. It might be better to use put() instead of update().

- The saved file path is `${GitDocumentDB#workingDir}/${name}.json` .

- \_id property of a JsonDoc is automatically set or overwritten by name parameter whose .json extension is omitted.

- An update operation is not skipped even if no change occurred on a specified data.

- This is an alias of GitDocumentDB\#rootCollection.updateFatDoc()

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

