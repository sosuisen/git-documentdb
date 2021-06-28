---
sidebar_label: GetOptions type
title: GetOptions type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [GetOptions](./git-documentdb.getoptions.md)

## GetOptions type

Options for get APIs (get, getFatDoc, getBackNumber, getFatDocBackNumber, getHistory, getFatDocHistory)

<b>Signature:</b>

```typescript
export declare type GetOptions = {
    forceDocType?: DocType;
};
```
<b>References:</b> [DocType](./git-documentdb.doctype.md)

## Remarks

- forceDocType: Force return type.

- getDocByOid does not have this option.

