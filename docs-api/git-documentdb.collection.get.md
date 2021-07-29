---
sidebar_label: get()
title: Collection.get() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Collection](./git-documentdb.collection.md) &gt; [get](./git-documentdb.collection.get.md)

## Collection.get() method

Get a JSON document

<b>Signature:</b>

```typescript
get(_id: string): Promise<JsonDoc | undefined>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  \_id | string |  |

<b>Returns:</b>

Promise&lt;[JsonDoc](./git-documentdb.jsondoc.md) \| undefined&gt;

- undefined if a specified document does not exist.

- JsonDoc may not have \_id property when an app other than GitDocumentDB creates it.

## Exceptions

[Err.DatabaseClosingError](./git-documentdb.err.databaseclosingerror.md)

[Err.InvalidJsonObjectError](./git-documentdb.err.invalidjsonobjecterror.md)

