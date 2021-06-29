---
sidebar_label: DeleteResult type
title: DeleteResult type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [DeleteResult](./git-documentdb.deleteresult.md)

## DeleteResult type

Result of delete()

<b>Signature:</b>

```typescript
export declare type DeleteResult = DeleteResultJsonDoc | DeleteResultText | DeleteResultBinary;
```
<b>References:</b>

[DeleteResultJsonDoc](./git-documentdb.deleteresultjsondoc.md) , [DeleteResultText](./git-documentdb.deleteresulttext.md) , [DeleteResultBinary](./git-documentdb.deleteresultbinary.md)

## Remarks

- \_id: \_id of a JSON document. This is a file name without .json extension. PutResult does not have \_id if a document is not [JsonDoc](./git-documentdb.jsondoc.md) type.

- name: A file name in Git. e.g.) "foo.json", "bar/baz.md"

- fileOid: SHA-1 hash of Git object (40 characters)

- commit: Git commit object of this put operation.

