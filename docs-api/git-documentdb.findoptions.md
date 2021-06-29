---
sidebar_label: FindOptions type
title: FindOptions type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [FindOptions](./git-documentdb.findoptions.md)

## FindOptions type

Options for find and findFatDoc

<b>Signature:</b>

```typescript
export declare type FindOptions = {
    descending?: boolean;
    recursive?: boolean;
    prefix?: string;
    forceDocType?: DocType;
};
```
<b>References:</b>

[DocType](./git-documentdb.doctype.md)

## Remarks

- descending: Sort \_ids or names in descendant order. Default is false (ascending).

- recursive: Get documents recursively from all subdirectories. Default is true.

- prefix: Get documents whose \_ids or names start with the prefix.

- forceDocType: Force return DocType.

