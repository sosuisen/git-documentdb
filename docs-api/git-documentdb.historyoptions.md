---
sidebar_label: HistoryOptions type
title: HistoryOptions type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [HistoryOptions](./git-documentdb.historyoptions.md)

## HistoryOptions type

Options for getHistory() and getFatDocHistory()

<b>Signature:</b>

```typescript
export declare type HistoryOptions = {
    filter?: HistoryFilter[];
};
```
<b>References:</b>

[HistoryFilter](./git-documentdb.historyfilter.md)

## Remarks

- filter: This filters an array of revisions by matching multiple HistoryFilters in OR condition.

