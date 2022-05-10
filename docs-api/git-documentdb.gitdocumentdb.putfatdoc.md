---
sidebar_label: putFatDoc()
title: GitDocumentDB.putFatDoc() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [GitDocumentDB](./git-documentdb.gitdocumentdb.md) &gt; [putFatDoc](./git-documentdb.gitdocumentdb.putfatdoc.md)

## GitDocumentDB.putFatDoc() method

Insert data if not exists. Otherwise, update it.

<b>Signature:</b>

```typescript
putFatDoc(name: string | undefined | null, doc: JsonDoc | Uint8Array | string, options?: PutOptions): Promise<PutResult>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  name | string \| undefined \| null | name is a file path. |
|  doc | [JsonDoc](./git-documentdb.jsondoc.md) \| Uint8Array \| string |  |
|  options | [PutOptions](./git-documentdb.putoptions.md) |  |

<b>Returns:</b>

Promise&lt;[PutResult](./git-documentdb.putresult.md) &gt;

## Remarks

- The saved file path is `${GitDocumentDB#workingDir}/${name}extension` .

- If a name parameter is undefined, it is automatically generated.

- \_id property of a JsonDoc is automatically set or overwritten by name parameter whose extension is removed.

- An update operation is not skipped even if no change occurred on a specified data.

- This is an alias of GitDocumentDB\#rootCollection.putFatDoc()

## Exceptions

[Err.InvalidJsonFileExtensionError](./git-documentdb.err.invalidjsonfileextensionerror.md)

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

