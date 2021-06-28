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
<b>References:</b> [ConflictResolutionStrategyLabels](./git-documentdb.conflictresolutionstrategylabels.md) , [FatDoc](./git-documentdb.fatdoc.md)

## Remarks

'ours' and 'theirs' are borrowed terms from Git (https://git-scm.com/docs/merge-strategies)

- 'ours-diff': (Default) Accept ours per JSON property. Properties in both local and remote documents are compared and merged. When a remote change is conflicted with a local change, the local change is accepted. If a document is not JSON, 'ours' strategy is applied.

- 'theirs-diff': Accept theirs per JSON property. Properties in both local and remote documents are compared and merged. When a remote change is conflicted with a local change, the remote change is accepted. If a document is not JSON, 'theirs' strategy is applied.

- 'ours': Accept ours per document. Documents in both local and remote commits are compared and merged per document. When a remote change is conflicted with a local change, the local change is accepted.

- 'theirs': Accept theirs per document. Documents in both local and remote commits are compared and merged per document. When a remote change is conflicted with a local change, the remote change is accepted.

- Compare function that returns one of the strategies ('ours-diff', 'theirs-diff', 'ours', and 'theirs') can be given. Each parameter will be undefined when a document is removed or does not exist.

