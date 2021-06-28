---
sidebar_label: getHistory()
title: Collection.getHistory() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Collection](./git-documentdb.collection.md) &gt; [getHistory](./git-documentdb.collection.gethistory.md)

## Collection.getHistory() method

Get revision history of a JSON document

<b>Signature:</b>

```typescript
getHistory(_id: string, historyOptions?: HistoryOptions): Promise<(JsonDoc | undefined)[]>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  \_id | string |  |
|  historyOptions | [HistoryOptions](./git-documentdb.historyoptions.md) | The array of revisions is filtered by HistoryOptions.filter. |

<b>Returns:</b>

Promise&lt;([JsonDoc](./git-documentdb.jsondoc.md) \| undefined)\[\]&gt;

Array of JsonDoc or undefined. - undefined if the document does not exists or the document is deleted.

## Exceptions

[Err.DatabaseClosingError](./git-documentdb.err.databaseclosingerror.md)

[Err.RepositoryNotOpenError](./git-documentdb.err.repositorynotopenerror.md)

[Err.InvalidJsonObjectError](./git-documentdb.err.invalidjsonobjecterror.md)

## Remarks

- By default, revisions are sorted by reverse chronological order. However, keep in mind that Git dates may not be consistent across repositories.

## Example


```
commit 01 to 08 were committed in order. file_v1 and file_v2 are two revisions of a file.

commit 08: not exists
commit 07: deleted
commit 06: file_v2
commit 05: deleted
commit 04: file_v2
commit 03: file_v1
commit 02: file_v1
commit 01: not exists

file_v1 was newly inserted in commit 02.
The file was not changed in commit 03.
The file was updated to file_v2 in commit 04
The file was deleted in commit 05.
The same file (file_v2) was inserted again in commit 06.
The file was deleted again in commit 07, so the file does not exist in commit 08.

Here, getHistory() will return [undefined, file_v2, undefined, file_v2, file_v1].

NOTE:
- Consecutive values are combined into one.
- Commits before the first insert are ignored.
Thus, the history is not [undefined, undefined, file_v2, undefined, file_v2, file_v1, file_v1, undefined].

```

