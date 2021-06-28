---
sidebar_label: getFatDocHistory()
title: GitDocumentDB.getFatDocHistory() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [GitDocumentDB](./git-documentdb.gitdocumentdb.md) &gt; [getFatDocHistory](./git-documentdb.gitdocumentdb.getfatdochistory.md)

## GitDocumentDB.getFatDocHistory() method

Get revision history of a data

<b>Signature:</b>

```typescript
getFatDocHistory(name: string, historyOptions?: HistoryOptions, getOptions?: GetOptions): Promise<(FatDoc | undefined)[]>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  name | string | name is a file path. |
|  historyOptions | [HistoryOptions](./git-documentdb.historyoptions.md) |  |
|  getOptions | [GetOptions](./git-documentdb.getoptions.md) |  |

<b>Returns:</b>

Promise&lt;([FatDoc](./git-documentdb.fatdoc.md) \| undefined)\[\]&gt;

Array of FatDoc or undefined. - undefined if the document does not exists or the document is deleted.

- Array of FatJsonDoc if isJsonDocCollection is true or the file extension is '.json'. Be careful that JsonDoc may not have \_id property if it was not created by GitDocumentDB.

- Array of FatBinaryDoc if described in .gitattribtues, otherwise array of FatTextDoc.

- getOptions.forceDocType always overwrite return type.

## Exceptions

[Err.DatabaseClosingError](./git-documentdb.err.databaseclosingerror.md)

[Err.RepositoryNotOpenError](./git-documentdb.err.repositorynotopenerror.md)

[Err.InvalidJsonObjectError](./git-documentdb.err.invalidjsonobjecterror.md)

## Remarks

- This is an alias of GitDocumentDB\#rootCollection.getFatDocHistory()

- See [GitDocumentDB.getHistory()](./git-documentdb.gitdocumentdb.gethistory.md) for detailed examples.

