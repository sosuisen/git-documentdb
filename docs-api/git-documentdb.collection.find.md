---
sidebar_label: find()
title: Collection.find() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Collection](./git-documentdb.collection.md) &gt; [find](./git-documentdb.collection.find.md)

## Collection.find() method

Get all the JSON documents

<b>Signature:</b>

```typescript
find(options?: FindOptions): Promise<JsonDoc[]>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  options | [FindOptions](./git-documentdb.findoptions.md) |  |

<b>Returns:</b>

Promise&lt;[JsonDoc](./git-documentdb.jsondoc.md) \[\]&gt;

## Exceptions

[Err.DatabaseClosingError](./git-documentdb.err.databaseclosingerror.md)

[Err.InvalidJsonObjectError](./git-documentdb.err.invalidjsonobjecterror.md)

