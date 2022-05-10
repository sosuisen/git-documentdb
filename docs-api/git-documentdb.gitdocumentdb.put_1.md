---
sidebar_label: put()
title: GitDocumentDB.put() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [GitDocumentDB](./git-documentdb.gitdocumentdb.md) &gt; [put](./git-documentdb.gitdocumentdb.put_1.md)

## GitDocumentDB.put() method

Insert a JSON document if not exists. Otherwise, update it.

<b>Signature:</b>

```typescript
put(_id: string | undefined | null, jsonDoc: JsonDoc, options?: PutOptions): Promise<PutResultJsonDoc>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  \_id | string \| undefined \| null | \_id is a file path whose extension is omitted. |
|  jsonDoc | [JsonDoc](./git-documentdb.jsondoc.md) |  |
|  options | [PutOptions](./git-documentdb.putoptions.md) |  |

<b>Returns:</b>

Promise&lt;[PutResultJsonDoc](./git-documentdb.putresultjsondoc.md) &gt;

## Remarks

- The saved file path is `${GitDocumentDB#workingDir}/${_id}${extension}` on the file system.

- If \_id is undefined, it is automatically generated.

- \_id property of a JsonDoc is automatically set or overwritten by \_id parameter.

- An update operation is not skipped even if no change occurred on a specified document.

- This is an alias of GitDocumentDB\#rootCollection.put()

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

