---
sidebar_label: insertFatDoc()
title: GitDocumentDB.insertFatDoc() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [GitDocumentDB](./git-documentdb.gitdocumentdb.md) &gt; [insertFatDoc](./git-documentdb.gitdocumentdb.insertfatdoc.md)

## GitDocumentDB.insertFatDoc() method

Insert a data

<b>Signature:</b>

```typescript
insertFatDoc(name: string | undefined | null, doc: JsonDoc | string | Uint8Array, options?: PutOptions): Promise<PutResult>;
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

- Throws SameIdExistsError when data that has the same \_id exists. It might be better to use put() instead of insert().

- The saved file path is `${GitDocumentDB#workingDir}/${name}.json` .

- If a name parameter is undefined, it is automatically generated.

- \_id property of a JsonDoc is automatically set or overwritten by name parameter whose .json extension is omitted.

- This is an alias of GitDocumentDB\#rootCollection.insertFatDoc()

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

