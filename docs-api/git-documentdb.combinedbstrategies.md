---
sidebar_label: CombineDbStrategies type
title: CombineDbStrategies type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [CombineDbStrategies](./git-documentdb.combinedbstrategies.md)

## CombineDbStrategies type

Behavior when combine inconsistent DBs

Default is 'combine-head-with-theirs'.

<b>Signature:</b>

```typescript
export declare type CombineDbStrategies = 'throw-error' | 'combine-head-with-ours' | 'combine-head-with-theirs' | 'combine-history-with-ours' | 'combine-history-with-theirs' | 'replace-with-ours' | 'replace-with-theirs';
```
