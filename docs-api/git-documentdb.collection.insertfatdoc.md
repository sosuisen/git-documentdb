---
sidebar_label: insertFatDoc()
title: Collection.insertFatDoc() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Collection](./git-documentdb.collection.md) &gt; [insertFatDoc](./git-documentdb.collection.insertfatdoc.md)

## Collection.insertFatDoc() method

Insert a data

<b>Signature:</b>

```typescript
insertFatDoc(shortName: string | undefined | null, doc: JsonDoc | string | Uint8Array, options?: PutOptions): Promise<PutResult>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  shortName | string \| undefined \| null | shortName is a file path whose collectionPath is omitted. shortName of JsonDoc must ends with .json extension. |
|  doc | [JsonDoc](./git-documentdb.jsondoc.md) \| string \| Uint8Array |  |
|  options | [PutOptions](./git-documentdb.putoptions.md) |  |

<b>Returns:</b>

Promise&lt;[PutResult](./git-documentdb.putresult.md) &gt;

## Remarks

- Throws SameIdExistsError when data that has the same \_id exists. It might be better to use put() instead of insert().

- The saved file path is `${GitDocumentDB#workingDir}/${Collection#collectionPath}/${shortName}.json` .

- If shortName is undefined, it is automatically generated.

- \_id property of a JsonDoc is automatically set or overwritten by shortName parameter whose .json extension is omitted.

## Exceptions

[Err.InvalidJsonObjectError](./git-documentdb.err.invalidjsonobjecterror.md)

\# from validateDocument, validateId

[Err.InvalidIdCharacterError](./git-documentdb.err.invalididcharactererror.md)

[Err.InvalidIdLengthError](./git-documentdb.err.invalididlengtherror.md)

\# fromm putImpl

[Err.DatabaseClosingError](./git-documentdb.err.databaseclosingerror.md)

[Err.TaskCancelError](./git-documentdb.err.taskcancelerror.md)

\# from putWorker

[Err.UndefinedDBError](./git-documentdb.err.undefineddberror.md)

[Err.CannotCreateDirectoryError](./git-documentdb.err.cannotcreatedirectoryerror.md)

[Err.CannotWriteDataError](./git-documentdb.err.cannotwritedataerror.md)

[Err.SameIdExistsError](./git-documentdb.err.sameidexistserror.md)

