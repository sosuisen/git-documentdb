---
sidebar_label: get()
title: GitDocumentDB.get() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [GitDocumentDB](./git-documentdb.gitdocumentdb.md) &gt; [get](./git-documentdb.gitdocumentdb.get.md)

## GitDocumentDB.get() method

Get a JSON document

<b>Signature:</b>

```typescript
get(_id: string): Promise<JsonDoc | undefined>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  \_id | string | \_id is a file path whose .json extension is omitted. |

<b>Returns:</b>

Promise&lt;[JsonDoc](./git-documentdb.jsondoc.md) \| undefined&gt;

- undefined if a specified document does not exist.

- JsonDoc may not have \_id property when an app other than GitDocumentDB creates it.

- This is an alias of GitDocumentDB\#rootCollection.get()

## Exceptions

[Err.DatabaseClosingError](./git-documentdb.err.databaseclosingerror.md)

[Err.InvalidJsonObjectError](./git-documentdb.err.invalidjsonobjecterror.md)

