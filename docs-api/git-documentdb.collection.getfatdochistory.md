---
sidebar_label: getFatDocHistory()
title: Collection.getFatDocHistory() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Collection](./git-documentdb.collection.md) &gt; [getFatDocHistory](./git-documentdb.collection.getfatdochistory.md)

## Collection.getFatDocHistory() method

Get revision history of a FatDoc data

<b>Signature:</b>

```typescript
getFatDocHistory(shortName: string, historyOptions?: HistoryOptions, getOptions?: GetOptions): Promise<(FatDoc | undefined)[]>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  shortName | string | shortName is a file path whose collectionPath is omitted. |
|  historyOptions | [HistoryOptions](./git-documentdb.historyoptions.md) |  |
|  getOptions | [GetOptions](./git-documentdb.getoptions.md) |  |

<b>Returns:</b>

Promise&lt;([FatDoc](./git-documentdb.fatdoc.md) \| undefined)\[\]&gt;

Array of FatDoc or undefined. - undefined if a specified data does not exist or it is deleted.

- Array of FatJsonDoc if isJsonDocCollection is true or the file extension is SerializeFormat.extension. Be careful that JsonDoc may not have \_id property when an app other than GitDocumentDB creates it.

- Array of FatBinaryDoc if described in .gitattribtues, otherwise array of FatTextDoc.

- getOptions.forceDocType always overwrite return type.

## Remarks

See [GitDocumentDB.getHistory()](./git-documentdb.gitdocumentdb.gethistory.md) for detailed examples.

## Exceptions

[Err.DatabaseClosingError](./git-documentdb.err.databaseclosingerror.md)

[Err.InvalidJsonObjectError](./git-documentdb.err.invalidjsonobjecterror.md)

