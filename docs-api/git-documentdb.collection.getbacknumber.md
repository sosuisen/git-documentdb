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
getBackNumber(_id: string, backNumber: number, historyOptions?: HistoryOptions): Promise<JsonDoc | undefined>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  \_id | string |  |
|  backNumber | number | Specify a number to go back to old revision. Default is 0. When backNumber equals 0, the latest revision is returned. |
|  historyOptions | [HistoryOptions](./git-documentdb.historyoptions.md) | The array of revisions is filtered by HistoryOptions.filter. |

<b>Returns:</b>

Promise&lt;[JsonDoc](./git-documentdb.jsondoc.md) \| undefined&gt;

## Remarks

- undefined if a specified document does not exist or it is deleted. - See [GitDocumentDB.getHistory()](./git-documentdb.gitdocumentdb.gethistory.md) for the array of revisions.

## Exceptions

[Err.DatabaseClosingError](./git-documentdb.err.databaseclosingerror.md)

[Err.RepositoryNotOpenError](./git-documentdb.err.repositorynotopenerror.md)

[Err.InvalidJsonObjectError](./git-documentdb.err.invalidjsonobjecterror.md)

