---
sidebar_label: JsonDiffPatchOptions type
title: JsonDiffPatchOptions type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [JsonDiffPatchOptions](./git-documentdb.JsonDiffPatchOptions.md)

## JsonDiffPatchOptions type

JsonDiffPatchOptions

<b>Signature:</b>

```typescript
export declare type JsonDiffPatchOptions = {
    keyInArrayedObject?: string[];
    plainTextProperties?: {
        [key: string]: any;
    };
};
```

## Remarks

- plainTextProperties: Only property whose key matches plainTextProperties uses text diff and patch algorithm (google-diff-match-patch).

## Example


```
e.g.
{ a: { b: true }, c: true } matches 'b' (whose ancestor is only 'a') and 'c'.
{ a: { _all: true } } matches all child properties of 'a'.
{ a: { _regex: /abc/ } } matches child properties of 'a' which match /abc/.

```

