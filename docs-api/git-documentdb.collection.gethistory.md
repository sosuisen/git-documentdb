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

Array of JsonDoc or undefined if a specified document does not exist or it is deleted.

## Remarks

- By default, revisions are sorted by reverse chronological order. However, keep in mind that Git dates may not be consistent across repositories.

- If serializeFormat is front-matter, this function can't work for .yml files. Use getFatDocHistory() instead. e.g.) foo.yml

## Example


```
Commit-01 to 08 were committed in order. file_v1 and file_v2 are two revisions of a file.

- Commit-08: Not exists
- Commit-07: deleted
- Commit-06: file_v2
- Commit-05: deleted
- Commit-04: file_v2
- Commit-03: file_v1
- Commit-02: file_v1
- Commit-01: Not exists

Commit-02 newly inserted a file (file_v1).
Commit-03 did not change about the file.
Commit-04 updated the file from file_v1 to file_v2.
Commit-05 deleted the file.
Commit-06 inserted the deleted file (file_v2) again.
Commit-07 deleted the file again.
Commit-08 did not change about the file.

Here, getHistory() will return [undefined, file_v2, undefined, file_v2, file_v1] as a history.

NOTE:
- Consecutive same values (commit-02 and commit-03) are combined into one.
- getHistory() ignores commit-01 because it was committed before the first insert.
Thus, a history is not [undefined, undefined, file_v2, undefined, file_v2, file_v1, file_v1, undefined].

```

## Exceptions

[Err.DatabaseClosingError](./git-documentdb.err.databaseclosingerror.md)

[Err.InvalidJsonObjectError](./git-documentdb.err.invalidjsonobjecterror.md)

