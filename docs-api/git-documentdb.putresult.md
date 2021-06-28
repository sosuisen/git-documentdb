---
sidebar_label: PutResult type
title: PutResult type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [PutResult](./git-documentdb.putresult.md)

## PutResult type

Result of put APIs (put, update, insert, putFatDoc, updateFatDoc, and insertFatDoc)

<b>Signature:</b>

```typescript
export declare type PutResult = PutResultJsonDoc | PutResultText | PutResultBinary;
```
<b>References:</b> [PutResultJsonDoc](./git-documentdb.putresultjsondoc.md) , [PutResultText](./git-documentdb.putresulttext.md) , [PutResultBinary](./git-documentdb.putresultbinary.md)

## Remarks

- \_id: \_id of a JSON document. This is a file name without .json extension. PutResult does not have \_id if a document is not [JsonDoc](./git-documentdb.jsondoc.md) type.

- name: A file name in Git. e.g.) "foo.json", "bar/baz.md"

- fileOid: SHA-1 hash of Git object (40 characters).

- commit: Git commit object of this put operation.

