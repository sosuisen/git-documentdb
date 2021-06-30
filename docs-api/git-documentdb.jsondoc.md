---
sidebar_label: JsonDoc type
title: JsonDoc type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [JsonDoc](./git-documentdb.jsondoc.md)

## JsonDoc type

The type for a JSON document that is stored in a database

<b>Signature:</b>

```typescript
export declare type JsonDoc = {
    [key: string]: any;
};
```

## Remarks

A JSON document must be a JavaScript object that matches the following conditions:

- It must have an '\_id' key that shows the unique identifier of a document

- \_id allows Unicode characters except for OS reserved filenames and the following characters: &lt; &gt; : " \| ? \* ¥0.

- \_id and a filename are linked. So \_id is better to be ASCII characters and a case-insensitive name for cross-platform.

- \_id cannot start or end with a slash.

- \_id can include paths separated by slashes.

- A directory name in paths cannot end with a period or a white space.

- A directory name in paths does not allow '.' and '..'.

## Example


```
{
  _id: 'nara/nara_park',
  flower: 'double cherry blossoms'
}

```

