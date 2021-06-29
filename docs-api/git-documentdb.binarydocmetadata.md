---
sidebar_label: BinaryDocMetadata type
title: BinaryDocMetadata type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [BinaryDocMetadata](./git-documentdb.binarydocmetadata.md)

## BinaryDocMetadata type

Metadata for BinaryDoc

<b>Signature:</b>

```typescript
export declare type BinaryDocMetadata = {
    name: string;
    fileOid: string;
    type: 'binary';
};
```

## Remarks

- name: A file name in Git. e.g.) "foo", "bar/baz.jpg"

- fileOid: SHA-1 hash of Git object (40 characters)

- type: type shows a DocType. The type of BinaryDocMetadata is fixed to 'binary'.

