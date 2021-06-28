---
sidebar_label: getHistory()
title: CRUDInterface.getHistory() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [CRUDInterface](./git-documentdb.crudinterface.md) &gt; [getHistory](./git-documentdb.crudinterface.gethistory.md)

## CRUDInterface.getHistory() method

<b>Signature:</b>

```typescript
getHistory(_id: string, historyOptions?: HistoryOptions): Promise<(JsonDoc | undefined)[]>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  \_id | string |  |
|  historyOptions | [HistoryOptions](./git-documentdb.historyoptions.md) |  |

<b>Returns:</b>

Promise&lt;([JsonDoc](./git-documentdb.jsondoc.md) \| undefined)\[\]&gt;

