---
sidebar_label: find()
title: GitDocumentDB.find() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [GitDocumentDB](./git-documentdb.gitdocumentdb.md) &gt; [find](./git-documentdb.gitdocumentdb.find.md)

## GitDocumentDB.find() method

Get all the JSON documents

<b>Signature:</b>

```typescript
find(options?: FindOptions): Promise<JsonDoc[]>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  options | [FindOptions](./git-documentdb.findoptions.md) | The options specify how to get documents. |

<b>Returns:</b>

Promise&lt;[JsonDoc](./git-documentdb.jsondoc.md) \[\]&gt;

## Remarks

- This is an alias of GitDocumentDB\#rootCollection.find()

## Exceptions

[Err.DatabaseClosingError](./git-documentdb.err.databaseclosingerror.md)

[Err.InvalidJsonObjectError](./git-documentdb.err.invalidjsonobjecterror.md)

