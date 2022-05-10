---
sidebar_label: JsonDiffPatchOptions type
title: JsonDiffPatchOptions type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [JsonDiffPatchOptions](./git-documentdb.jsondiffpatchoptions.md)

## JsonDiffPatchOptions type

JsonDiffPatchOptions

<b>Signature:</b>

```typescript
export declare type JsonDiffPatchOptions = {
    keyInArrayedObject?: string[];
    keyOfUniqueArray?: string[];
    plainTextProperties?: {
        [key: string]: any;
    };
};
```

## Remarks

- plainTextProperties: Only property whose key matches plainTextProperties uses text-diff-and-patch algorithm (google-diff-match-patch).

- keyInArrayedObject: To diff between arrays that contain objects as elements, you must specify a key in the object. See https://github.com/benjamine/jsondiffpatch/blob/master/docs/arrays.md\#an-object-hash

- keyOfUniqueArray: Set a key of a unique array. Unique array never include duplicated members after JSON patch.

## Example


```
Example of plainTextProperties:
{ a: { b: true }, c: true } matches 'b' (whose ancestor is only 'a') and 'c'.
{ a: { _all: true } } matches all child properties of 'a'.
{ a: { _regex: /abc/ } } matches child properties of 'a' which match /abc/.

```

