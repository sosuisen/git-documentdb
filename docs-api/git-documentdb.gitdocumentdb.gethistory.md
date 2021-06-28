---
sidebar_label: getHistory()
title: GitDocumentDB.getHistory() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [GitDocumentDB](./git-documentdb.gitdocumentdb.md) &gt; [getHistory](./git-documentdb.gitdocumentdb.gethistory.md)

## GitDocumentDB.getHistory() method

Get revision history of a document

<b>Signature:</b>

```typescript
getHistory(_id: string, historyOptions?: HistoryOptions): Promise<(JsonDoc | undefined)[]>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  \_id | string | \_id is a file path whose .json extension is omitted. |
|  historyOptions | [HistoryOptions](./git-documentdb.historyoptions.md) | The array of revisions is filtered by HistoryOptions.filter. |

<b>Returns:</b>

Promise&lt;([JsonDoc](./git-documentdb.jsondoc.md) \| undefined)\[\]&gt;

Array of FatDoc or undefined. - undefined if the document does not exists or the document is deleted.

- JsonDoc if isJsonDocCollection is true or the file extension is '.json'.

- Uint8Array or string if isJsonDocCollection is false.

- getOptions.forceDocType always overwrite return type.

## Exceptions

[Err.DatabaseClosingError](./git-documentdb.err.databaseclosingerror.md)

[Err.RepositoryNotOpenError](./git-documentdb.err.repositorynotopenerror.md)

[Err.InvalidJsonObjectError](./git-documentdb.err.invalidjsonobjecterror.md)

## Remarks

- By default, revisions are sorted by reverse chronological order. However, keep in mind that Git dates may not be consistent across repositories.

- This is an alias of GitDocumentDB.rootCollection.getHistory().

## Example


```
commit 01 to 07 were committed in order. file_v1 and file_v2 are two revisions of a file.

commit 07: not exists
commit 06: deleted
commit 05: file_v2
commit 04: deleted
commit 03: file_v2
commit 02: file_v1
commit 01: file_v1

file_v1 was newly inserted in 01.
The file was not changed in 02.
The file was updated to file_v2 in 03
The file was deleted in 04.
The same file (file_v2) was inserted again in 05.
The file was deleted again in 06, so the file does not exist in 07.

Here, getHistory() will return [undefined, file_v2, undefined, file_v2, file_v1].
Be careful that consecutive values are combined into one.
(Thus, it will not return [undefined, undefined, file_v2, undefined, file_v2, file_v1, file_v1].)

```

