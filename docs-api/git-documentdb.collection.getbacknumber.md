---
sidebar_label: getBackNumber()
title: Collection.getBackNumber() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Collection](./git-documentdb.collection.md) &gt; [getBackNumber](./git-documentdb.collection.getbacknumber.md)

## Collection.getBackNumber() method

Get a back number of a JSON document

<b>Signature:</b>

```typescript
getBackNumber(shortId: string, backNumber: number, historyOptions?: HistoryOptions): Promise<JsonDoc | undefined>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  shortId | string | shortId is a file path whose collectionPath and .json extension are omitted. |
|  backNumber | number | Specify a number to go back to old revision. Default is 0. See [Collection.getHistory()](./git-documentdb.collection.gethistory.md) for the array of revisions. |
|  historyOptions | [HistoryOptions](./git-documentdb.historyoptions.md) | The array of revisions is filtered by HistoryOptions.filter. |

<b>Returns:</b>

Promise&lt;[JsonDoc](./git-documentdb.jsondoc.md) \| undefined&gt;

## Remarks

- undefined if a specified document does not exist or it is deleted.

## Example


```
collection.getBackNumber(_shortId, 0); // returns the latest document.
collection.getBackNumber(_shortId, 2); // returns a document two revisions older than the latest.

```

## Exceptions

[Err.DatabaseClosingError](./git-documentdb.err.databaseclosingerror.md)

[Err.RepositoryNotOpenError](./git-documentdb.err.repositorynotopenerror.md)

[Err.InvalidJsonObjectError](./git-documentdb.err.invalidjsonobjecterror.md)

