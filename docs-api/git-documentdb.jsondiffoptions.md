---
sidebar_label: JsonDiffOptions type
title: JsonDiffOptions type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [JsonDiffOptions](./git-documentdb.jsondiffoptions.md)

## JsonDiffOptions type

JsonDiffOptions

<b>Signature:</b>

```typescript
export declare type JsonDiffOptions = {
    idOfSubtree?: string[];
    plainTextProperties?: {
        [key: string]: any;
    };
};
```

## Remarks

- plainTextProperties: Only property whose key matches plainTextProperties uses text diff and patch algorithm (google-diff-match-patch).

```
e.g.
{ a: { b: true }, c: true } matches 'b' (whose ancestor is only 'a') and 'c'.
{ a: { _all: true } } matches all child properties of 'a'.
{ a: { _regex: /abc/ } } matches child properties of 'a' which match /abc/.

```

