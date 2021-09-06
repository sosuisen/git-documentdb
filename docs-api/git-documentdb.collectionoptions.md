---
sidebar_label: CollectionOptions type
title: CollectionOptions type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [CollectionOptions](./git-documentdb.collectionoptions.md)

## CollectionOptions type

Options for Collection constructor

<b>Signature:</b>

```typescript
export declare type CollectionOptions = {
    namePrefix?: string;
    debounceTime?: number;
};
```

## Remarks

- namePrefix: Automatically generated \_id has a specified prefix in the collection.

- debounceTime: put/insert/update operations for the same document are debounced by specified milliseconds in the collection. Default is -1 (do not debounce).

