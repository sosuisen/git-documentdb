---
sidebar_label: getBackNumber()
title: GitDocumentDB.getBackNumber() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [GitDocumentDB](./git-documentdb.gitdocumentdb.md) &gt; [getBackNumber](./git-documentdb.gitdocumentdb.getbacknumber.md)

## GitDocumentDB.getBackNumber() method

Get a back number of a document

<b>Signature:</b>

```typescript
getBackNumber(_id: string, backNumber: number, historyOptions?: HistoryOptions): Promise<JsonDoc | undefined>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  \_id | string | \_id is a file path whose .json extension is omitted. |
|  backNumber | number | Specify a number to go back to old revision. Default is 0. When backNumber equals 0, the latest revision is returned. See [GitDocumentDB.getHistory()](./git-documentdb.gitdocumentdb.gethistory.md) for the array of revisions. |
|  historyOptions | [HistoryOptions](./git-documentdb.historyoptions.md) | The array of revisions is filtered by HistoryOptions.filter. |

<b>Returns:</b>

Promise&lt;[JsonDoc](./git-documentdb.jsondoc.md) \| undefined&gt;

## Remarks

- undefined if a specified document does not exist or it is deleted.

- This is an alias of GitDocumentDB\#rootCollection.getBackNumber()

## Exceptions

[Err.DatabaseClosingError](./git-documentdb.err.databaseclosingerror.md)

[Err.RepositoryNotOpenError](./git-documentdb.err.repositorynotopenerror.md)

[Err.InvalidJsonObjectError](./git-documentdb.err.invalidjsonobjecterror.md)

