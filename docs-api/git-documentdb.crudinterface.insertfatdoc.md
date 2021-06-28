---
sidebar_label: insertFatDoc()
title: CRUDInterface.insertFatDoc() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [CRUDInterface](./git-documentdb.crudinterface.md) &gt; [insertFatDoc](./git-documentdb.crudinterface.insertfatdoc.md)

## CRUDInterface.insertFatDoc() method

<b>Signature:</b>

```typescript
insertFatDoc(name: string | undefined | null, data: JsonDoc | Uint8Array | string, options?: PutOptions): Promise<PutResult>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  name | string \| undefined \| null |  |
|  data | [JsonDoc](./git-documentdb.jsondoc.md) \| Uint8Array \| string |  |
|  options | [PutOptions](./git-documentdb.putoptions.md) |  |

<b>Returns:</b>

Promise&lt;[PutResult](./git-documentdb.putresult.md) &gt;

