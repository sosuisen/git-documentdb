---
sidebar_label: ChangedFileUpdate type
title: ChangedFileUpdate type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [ChangedFileUpdate](./git-documentdb.changedfileupdate.md)

## ChangedFileUpdate type

Updated file in a merge operation

<b>Signature:</b>

```typescript
export declare type ChangedFileUpdate = {
    operation: 'update';
    old: FatDoc;
    new: FatDoc;
};
```
<b>References:</b>

[FatDoc](./git-documentdb.fatdoc.md)

