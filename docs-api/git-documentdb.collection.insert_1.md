---
sidebar_label: insert()
title: Collection.insert() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Collection](./git-documentdb.collection.md) &gt; [insert](./git-documentdb.collection.insert_1.md)

## Collection.insert() method

Insert a JSON document

<b>Signature:</b>

```typescript
insert(shortId: string | undefined | null, jsonDoc: JsonDoc, options?: PutOptions): Promise<PutResultJsonDoc>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  shortId | string \| undefined \| null | shortId is a file path whose collectionPath and .json extension are omitted. |
|  jsonDoc | [JsonDoc](./git-documentdb.jsondoc.md) |  |
|  options | [PutOptions](./git-documentdb.putoptions.md) |  |

<b>Returns:</b>

Promise&lt;[PutResultJsonDoc](./git-documentdb.putresultjsondoc.md) &gt;

## Remarks

- Throws SameIdExistsError when a document that has the same \_id exists. It might be better to use put() instead of insert().

- The saved file path is `${GitDocumentDB#workingDir}/${Collection#collectionPath}/${shortId}.json` .

- If shortId is undefined, it is automatically generated.

- \_id property of a JsonDoc is automatically set or overwritten by shortId parameter.

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

- [Err.SameIdExistsError](./git-documentdb.err.sameidexistserror.md)

