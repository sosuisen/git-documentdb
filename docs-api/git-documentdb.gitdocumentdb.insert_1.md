---
sidebar_label: insert()
title: GitDocumentDB.insert() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [GitDocumentDB](./git-documentdb.gitdocumentdb.md) &gt; [insert](./git-documentdb.gitdocumentdb.insert_1.md)

## GitDocumentDB.insert() method

Insert a JSON document

<b>Signature:</b>

```typescript
insert(_id: string | undefined | null, jsonDoc: JsonDoc, options?: PutOptions): Promise<PutResultJsonDoc>;
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

- Throws SameIdExistsError when a document that has the same id exists. It might be better to use put() instead of insert().

- The saved file path is `${GitDocumentDB#workingDir}/${_id}.json` on the file system.

- If \_id is undefined, it is automatically generated.

- \_id property of a JsonDoc is automatically set or overwritten by \_id parameter.

- This is an alias of GitDocumentDB\#rootCollection.insert()

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

[Err.SameIdExistsError](./git-documentdb.err.sameidexistserror.md) (from putWorker)

