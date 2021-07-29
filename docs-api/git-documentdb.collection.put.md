---
sidebar_label: put()
title: Collection.put() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Collection](./git-documentdb.collection.md) &gt; [put](./git-documentdb.collection.put.md)

## Collection.put() method

Insert a JSON document if not exists. Otherwise, update it.

<b>Signature:</b>

```typescript
put(jsonDoc: JsonDoc, options?: PutOptions): Promise<PutResultJsonDoc>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  jsonDoc | [JsonDoc](./git-documentdb.jsondoc.md) | JsonDoc whose \_id is shortId. shortId is a file path whose collectionPath and .json extension are omitted. |
|  options | [PutOptions](./git-documentdb.putoptions.md) |  |

<b>Returns:</b>

Promise&lt;[PutResultJsonDoc](./git-documentdb.putresultjsondoc.md) &gt;

## Remarks

- The saved file path is `${GitDocumentDB#workingDir}/${Collection#collectionPath}${jsonDoc._id}.json` .

- If \_id is undefined, it is automatically generated.

## Exceptions

[Err.InvalidJsonObjectError](./git-documentdb.err.invalidjsonobjecterror.md)

\# from validateDocument, validateId

[Err.InvalidIdCharacterError](./git-documentdb.err.invalididcharactererror.md)

[Err.InvalidIdLengthError](./git-documentdb.err.invalididlengtherror.md)

\# from putImpl

[Err.DatabaseClosingError](./git-documentdb.err.databaseclosingerror.md)

[Err.TaskCancelError](./git-documentdb.err.taskcancelerror.md)

\# from putWorker

[Err.UndefinedDBError](./git-documentdb.err.undefineddberror.md)

[Err.CannotCreateDirectoryError](./git-documentdb.err.cannotcreatedirectoryerror.md)

[Err.CannotWriteDataError](./git-documentdb.err.cannotwritedataerror.md)

