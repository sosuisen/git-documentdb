---
sidebar_label: updateFatDoc()
title: Collection.updateFatDoc() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Collection](./git-documentdb.collection.md) &gt; [updateFatDoc](./git-documentdb.collection.updatefatdoc.md)

## Collection.updateFatDoc() method

Update a data

<b>Signature:</b>

```typescript
updateFatDoc(shortName: string | undefined | null, doc: JsonDoc | string | Uint8Array, options?: PutOptions): Promise<PutResult>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  shortName | string \| undefined \| null | shortName is a file path whose collectionPath is omitted. shortName of JsonDoc must ends with extension. |
|  doc | [JsonDoc](./git-documentdb.jsondoc.md) \| string \| Uint8Array |  |
|  options | [PutOptions](./git-documentdb.putoptions.md) |  |

<b>Returns:</b>

Promise&lt;[PutResult](./git-documentdb.putresult.md) &gt;

## Remarks

- Throws DocumentNotFoundError if a specified data does not exist. It might be better to use put() instead of update().

- The saved file path is `${GitDocumentDB#workingDir}/${Collection#collectionPath}/${shortName}${extension}` .

- \_id property of a JsonDoc is automatically set or overwritten by shortName parameter whose extension is omitted.

- An update operation is not skipped even if no change occurred on a specified data.

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

