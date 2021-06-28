---
sidebar_label: AcceptedConflict type
title: AcceptedConflict type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [AcceptedConflict](./git-documentdb.acceptedconflict.md)

## AcceptedConflict type

Accepted conflict

<b>Signature:</b>

```typescript
export declare type AcceptedConflict = {
    fatDoc: FatDoc;
    strategy: ConflictResolutionStrategyLabels;
    operation: WriteOperation;
};
```
<b>References:</b> [FatDoc](./git-documentdb.fatdoc.md) , [ConflictResolutionStrategyLabels](./git-documentdb.conflictresolutionstrategylabels.md) , [WriteOperation](./git-documentdb.writeoperation.md)

## Remarks

- doc: Conflicted document (metadata only)

- strategy: Applied strategy on the target

- operation: Applied write operation on the target

