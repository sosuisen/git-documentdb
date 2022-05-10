---
sidebar_label: JsonDocMetadata type
title: JsonDocMetadata type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [JsonDocMetadata](./git-documentdb.jsondocmetadata.md)

## JsonDocMetadata type

Metadata for JsonDoc

<b>Signature:</b>

```typescript
export declare type JsonDocMetadata = {
    _id: string;
    name: string;
    fileOid: string;
    type: 'json';
};
```

## Remarks

- \_id: \_id of a JSON document. This is a file name without extension.

- name: A file name in Git. e.g.) "foo.json", "bar/baz.md"

- fileOid: SHA-1 hash of Git object (40 characters)

- type: type shows a DocType. type of JsonDocMetadata is fixed to 'json'.

