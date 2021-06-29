---
sidebar_label: ICollection type
title: ICollection type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [ICollection](./git-documentdb.icollection.md)

## ICollection type

Type for Collection Class

<b>Signature:</b>

```typescript
export declare type ICollection = CollectionInterface & CRUDInterface & SyncEventInterface & {
    options: CollectionOptions;
    collectionPath: string;
    parent: ICollection | undefined;
    generateId(): string;
};
```
<b>References:</b>

[CollectionInterface](./git-documentdb.collectioninterface.md) , [CRUDInterface](./git-documentdb.crudinterface.md) , [SyncEventInterface](./git-documentdb.synceventinterface.md) , [CollectionOptions](./git-documentdb.collectionoptions.md) , [ICollection](./git-documentdb.icollection.md)

