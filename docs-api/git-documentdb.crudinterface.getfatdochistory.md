---
sidebar_label: getFatDocHistory()
title: CRUDInterface.getFatDocHistory() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [CRUDInterface](./git-documentdb.crudinterface.md) &gt; [getFatDocHistory](./git-documentdb.crudinterface.getfatdochistory.md)

## CRUDInterface.getFatDocHistory() method

<b>Signature:</b>

```typescript
getFatDocHistory(name: string, historyOptions?: HistoryOptions, getOptions?: GetOptions): Promise<(FatDoc | undefined)[]>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  name | string |  |
|  historyOptions | [HistoryOptions](./git-documentdb.historyoptions.md) |  |
|  getOptions | [GetOptions](./git-documentdb.getoptions.md) |  |

<b>Returns:</b>

Promise&lt;([FatDoc](./git-documentdb.fatdoc.md) \| undefined)\[\]&gt;

