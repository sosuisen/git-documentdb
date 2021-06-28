---
sidebar_label: getFatDocBackNumber()
title: GitDocumentDB.getFatDocBackNumber() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [GitDocumentDB](./git-documentdb.gitdocumentdb.md) &gt; [getFatDocBackNumber](./git-documentdb.gitdocumentdb.getfatdocbacknumber.md)

## GitDocumentDB.getFatDocBackNumber() method

Get a back number of a data

<b>Signature:</b>

```typescript
getFatDocBackNumber(name: string, backNumber: number, historyOptions?: HistoryOptions, getOptions?: GetOptions): Promise<FatDoc | undefined>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  name | string | name is a file path. |
|  backNumber | number | Specify a number to go back to old revision. Default is 0. When backNumber equals 0, the latest revision is returned. See [GitDocumentDB.getHistory()](./git-documentdb.gitdocumentdb.gethistory.md) for the array of revisions. |
|  historyOptions | [HistoryOptions](./git-documentdb.historyoptions.md) | The array of revisions is filtered by HistoryOptions.filter. |
|  getOptions | [GetOptions](./git-documentdb.getoptions.md) |  |

<b>Returns:</b>

Promise&lt;[FatDoc](./git-documentdb.fatdoc.md) \| undefined&gt;

## Exceptions

[Err.DatabaseClosingError](./git-documentdb.err.databaseclosingerror.md)

[Err.RepositoryNotOpenError](./git-documentdb.err.repositorynotopenerror.md)

[Err.InvalidJsonObjectError](./git-documentdb.err.invalidjsonobjecterror.md)

## Remarks

- undefined if a document does not exists or a document is deleted.

- JsonDoc if the file extension is '.json'. Be careful that JsonDoc may not have \_id property if it was not created by GitDocumentDB.

- FatBinaryDoc if described in .gitattribtues, otherwise FatTextDoc.

- getOptions.forceDocType always overwrite return type.

- This is an alias of GitDocumentDB\#rootCollection.getFatDocBackNumber()

