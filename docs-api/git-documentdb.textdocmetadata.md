---
sidebar_label: TextDocMetadata type
title: TextDocMetadata type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [TextDocMetadata](./git-documentdb.textdocmetadata.md)

## TextDocMetadata type

Metadata for TextDoc

<b>Signature:</b>

```typescript
export declare type TextDocMetadata = {
    name: string;
    fileOid: string;
    type: 'text';
};
```

## Remarks

- name: A file name in Git. e.g.) "foo", "bar/baz.md"

- fileOid: SHA-1 hash of Git object (40 characters)

- type: type shows a DocType. type of TextDocMetadata is fixed to 'text'.

