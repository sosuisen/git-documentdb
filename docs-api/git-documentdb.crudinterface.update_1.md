---
sidebar_label: update()
title: CRUDInterface.update() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [CRUDInterface](./git-documentdb.crudinterface.md) &gt; [update](./git-documentdb.crudinterface.update_1.md)

## CRUDInterface.update() method

<b>Signature:</b>

```typescript
update(_id: string | undefined | null, data: JsonDoc | Uint8Array | string, options?: PutOptions): Promise<PutResultJsonDoc>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  \_id | string \| undefined \| null |  |
|  data | [JsonDoc](./git-documentdb.jsondoc.md) \| Uint8Array \| string |  |
|  options | [PutOptions](./git-documentdb.putoptions.md) |  |

<b>Returns:</b>

Promise&lt;[PutResultJsonDoc](./git-documentdb.putresultjsondoc.md) &gt;

