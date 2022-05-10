---
sidebar_label: getOldRevision()
title: Collection.getOldRevision() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Collection](./git-documentdb.collection.md) &gt; [getOldRevision](./git-documentdb.collection.getoldrevision.md)

## Collection.getOldRevision() method

Get an old revision of a JSON document

<b>Signature:</b>

```typescript
getOldRevision(shortId: string, revision: number, historyOptions?: HistoryOptions): Promise<JsonDoc | undefined>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  shortId | string | shortId is a file path whose collectionPath and extension are omitted. |
|  revision | number | Specify a number to go back to old revision. Default is 0. See [Collection.getHistory()](./git-documentdb.collection.gethistory.md) for the array of revisions. |
|  historyOptions | [HistoryOptions](./git-documentdb.historyoptions.md) | The array of revisions is filtered by HistoryOptions.filter. |

<b>Returns:</b>

Promise&lt;[JsonDoc](./git-documentdb.jsondoc.md) \| undefined&gt;

## Remarks

- undefined if a specified document does not exist or it is deleted.

- If serializeFormat is front-matter, this function can't correctly distinguish files that has the same \_id but different extension. Use getFatDocOldRevision() instead. e.g.) foo.md and foo.yml

## Example


```
collection.getOldRevision(_shortId, 0); // returns the latest document.
collection.getOldRevision(_shortId, 2); // returns a document two revisions older than the latest.

```

## Exceptions

[Err.DatabaseClosingError](./git-documentdb.err.databaseclosingerror.md)

[Err.InvalidJsonObjectError](./git-documentdb.err.invalidjsonobjecterror.md)

