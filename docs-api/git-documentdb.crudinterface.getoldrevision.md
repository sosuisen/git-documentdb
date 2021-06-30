---
sidebar_label: getOldRevision()
title: CRUDInterface.getOldRevision() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [CRUDInterface](./git-documentdb.crudinterface.md) &gt; [getOldRevision](./git-documentdb.crudinterface.getoldrevision.md)

## CRUDInterface.getOldRevision() method

<b>Signature:</b>

```typescript
getOldRevision(_id: string, revision: number, historyOptions?: HistoryOptions, getOptions?: GetOptions): Promise<JsonDoc | undefined>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  \_id | string |  |
|  revision | number |  |
|  historyOptions | [HistoryOptions](./git-documentdb.historyoptions.md) |  |
|  getOptions | [GetOptions](./git-documentdb.getoptions.md) |  |

<b>Returns:</b>

Promise&lt;[JsonDoc](./git-documentdb.jsondoc.md) \| undefined&gt;

