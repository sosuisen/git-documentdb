---
sidebar_label: insert()
title: CRUDInterface.insert() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [CRUDInterface](./git-documentdb.crudinterface.md) &gt; [insert](./git-documentdb.crudinterface.insert_1.md)

## CRUDInterface.insert() method

<b>Signature:</b>

```typescript
insert(_id: string | undefined | null, data: JsonDoc | Uint8Array | string, options?: PutOptions): Promise<PutResultJsonDoc>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  \_id | string \| undefined \| null |  |
|  data | [JsonDoc](./git-documentdb.jsondoc.md) \| Uint8Array \| string |  |
|  options | [PutOptions](./git-documentdb.putoptions.md) |  |

<b>Returns:</b>

Promise&lt;[PutResultJsonDoc](./git-documentdb.putresultjsondoc.md) &gt;

