---
sidebar_label: getFatDocOldRevision()
title: GitDocumentDB.getFatDocOldRevision() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [GitDocumentDB](./git-documentdb.gitdocumentdb.md) &gt; [getFatDocOldRevision](./git-documentdb.gitdocumentdb.getfatdocoldrevision.md)

## GitDocumentDB.getFatDocOldRevision() method

Get an old revision of a FatDoc data

<b>Signature:</b>

```typescript
getFatDocOldRevision(name: string, revision: number, historyOptions?: HistoryOptions, getOptions?: GetOptions): Promise<FatDoc | undefined>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  name | string | name is a file path. |
|  revision | number | Specify a number to go back to old revision. Default is 0. See [GitDocumentDB.getHistory()](./git-documentdb.gitdocumentdb.gethistory.md) for the array of revisions. |
|  historyOptions | [HistoryOptions](./git-documentdb.historyoptions.md) | The array of revisions is filtered by HistoryOptions.filter. |
|  getOptions | [GetOptions](./git-documentdb.getoptions.md) |  |

<b>Returns:</b>

Promise&lt;[FatDoc](./git-documentdb.fatdoc.md) \| undefined&gt;

## Remarks

- undefined if a specified data does not exist or it is deleted.

- JsonDoc if the file extension is SerializeFormat.extension. Be careful that JsonDoc may not have \_id property when an app other than GitDocumentDB creates it.

- FatBinaryDoc if described in .gitattribtues, otherwise FatTextDoc.

- getOptions.forceDocType always overwrite return type.

- This is an alias of GitDocumentDB\#rootCollection.getFatDocOldRevision()

## Example


```
db.getFatDocOldRevision(name, 0); // returns the latest FatDoc.
db.getFatDocOldRevision(name, 2); // returns a FatDoc two revisions older than the latest.

```

## Exceptions

[Err.DatabaseClosingError](./git-documentdb.err.databaseclosingerror.md)

[Err.InvalidJsonObjectError](./git-documentdb.err.invalidjsonobjecterror.md)

