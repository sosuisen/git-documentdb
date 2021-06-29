---
sidebar_label: getFatDocBackNumber()
title: Collection.getFatDocBackNumber() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Collection](./git-documentdb.collection.md) &gt; [getFatDocBackNumber](./git-documentdb.collection.getfatdocbacknumber.md)

## Collection.getFatDocBackNumber() method

Get a back number of a data

<b>Signature:</b>

```typescript
getFatDocBackNumber(shortName: string, backNumber: number, historyOptions?: HistoryOptions, getOptions?: GetOptions): Promise<FatDoc | undefined>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  shortName | string | shortName is a file path whose collectionPath is omitted. |
|  backNumber | number | Specify a number to go back to old revision. Default is 0. When backNumber equals 0, the latest revision is returned. |
|  historyOptions | [HistoryOptions](./git-documentdb.historyoptions.md) | The array of revisions is filtered by HistoryOptions.filter. |
|  getOptions | [GetOptions](./git-documentdb.getoptions.md) |  |

<b>Returns:</b>

Promise&lt;[FatDoc](./git-documentdb.fatdoc.md) \| undefined&gt;

## Exceptions

[Err.DatabaseClosingError](./git-documentdb.err.databaseclosingerror.md)

[Err.RepositoryNotOpenError](./git-documentdb.err.repositorynotopenerror.md)

[Err.InvalidJsonObjectError](./git-documentdb.err.invalidjsonobjecterror.md)

## Remarks

- undefined if a specified document does not exist or it is deleted.

- JsonDoc if the file extension is '.json'. Be careful that JsonDoc may not have \_id property when an app other than GitDocumentDB creates it.

- FatBinaryDoc if described in .gitattribtues, otherwise FatTextDoc.

- getOptions.forceDocType always overwrite return type.

- See [GitDocumentDB.getHistory()](./git-documentdb.gitdocumentdb.gethistory.md) for the array of revisions.

