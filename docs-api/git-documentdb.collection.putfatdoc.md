---
sidebar_label: putFatDoc()
title: Collection.putFatDoc() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Collection](./git-documentdb.collection.md) &gt; [putFatDoc](./git-documentdb.collection.putfatdoc.md)

## Collection.putFatDoc() method

Insert a data if not exists. Otherwise, update it.

<b>Signature:</b>

```typescript
putFatDoc(shortName: string | undefined | null, doc: JsonDoc | Uint8Array | string, options?: PutOptions): Promise<PutResult>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  shortName | string \| undefined \| null | shortName is a file path whose collectionPath is omitted. shortName of JsonDoc must ends with .json extension. |
|  doc | [JsonDoc](./git-documentdb.jsondoc.md) \| Uint8Array \| string |  |
|  options | [PutOptions](./git-documentdb.putoptions.md) |  |

<b>Returns:</b>

Promise&lt;[PutResult](./git-documentdb.putresult.md) &gt;

## Exceptions

[Err.InvalidJsonFileExtensionError](./git-documentdb.err.invalidjsonfileextensionerror.md)

[Err.InvalidJsonObjectError](./git-documentdb.err.invalidjsonobjecterror.md)

[Err.InvalidIdCharacterError](./git-documentdb.err.invalididcharactererror.md) (from validateDocument, validateId)

[Err.InvalidIdLengthError](./git-documentdb.err.invalididlengtherror.md) (from validateDocument, validateId)

[Err.DatabaseClosingError](./git-documentdb.err.databaseclosingerror.md) (fromm putImpl)

[Err.TaskCancelError](./git-documentdb.err.taskcancelerror.md) (from putImpl)

[Err.UndefinedDBError](./git-documentdb.err.undefineddberror.md) (fromm putWorker)

[Err.RepositoryNotOpenError](./git-documentdb.err.repositorynotopenerror.md) (fromm putWorker)

[Err.CannotCreateDirectoryError](./git-documentdb.err.cannotcreatedirectoryerror.md) (from putWorker)

[Err.CannotWriteDataError](./git-documentdb.err.cannotwritedataerror.md) (from putWorker)

## Remarks

- The saved file path is `${GitDocumentDB#workingDir}/${Collection#collectionPath}/${shortName}.json` .

- If shortName is undefined, it is automatically generated.

- \_id property of a JsonDoc is automatically set or overwritten by shortName parameter whose .json extension is omitted.

- An update operation is not skipped even if no change occurred on a specified data.

