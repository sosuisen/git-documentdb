---
sidebar_label: ConflictResolutionStrategies type
title: ConflictResolutionStrategies type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [ConflictResolutionStrategies](./git-documentdb.conflictresolutionstrategies.md)

## ConflictResolutionStrategies type

Strategy for resolving conflicts

<b>Signature:</b>

```typescript
export declare type ConflictResolutionStrategies = ConflictResolutionStrategyLabels | ((ours?: FatDoc, theirs?: FatDoc) => ConflictResolutionStrategyLabels);
```
<b>References:</b>

[ConflictResolutionStrategyLabels](./git-documentdb.conflictresolutionstrategylabels.md) , [FatDoc](./git-documentdb.fatdoc.md)

## Remarks

'ours' and 'theirs' are borrowed terms from Git (https://git-scm.com/docs/merge-strategies)

- 'ours-diff': (Default) Accept ours per JSON property. The merging process compares and merges properties in local and remote documents. When a remote property is conflicted with a local property in a document, the local property is accepted. If a document is not JSON, 'ours' strategy is applied.

- 'theirs-diff': Accept theirs per JSON property. The merging process compares and merges properties in local and remote documents. When a remote property is conflicted with a local property in a document, the remote property is accepted. If a document is not JSON, 'theirs' strategy is applied.

- 'ours': Accept ours. The merging process compares and merges per document. When a remote document is conflicted with a local document, the local document is accepted.

- 'theirs': Accept theirs. The merging process compares and merges per document. When a remote document is conflicted with a local document, the remote document is accepted.

- Compare function that returns one of the strategies ('ours-diff', 'theirs-diff', 'ours', and 'theirs') can be given. Each parameter is undefined when a document is deleted or does not exist.

