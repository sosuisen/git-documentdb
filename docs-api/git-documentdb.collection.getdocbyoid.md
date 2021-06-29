---
sidebar_label: getDocByOid()
title: Collection.getDocByOid() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Collection](./git-documentdb.collection.md) &gt; [getDocByOid](./git-documentdb.collection.getdocbyoid.md)

## Collection.getDocByOid() method

Get a Doc which has specified oid

<b>Signature:</b>

```typescript
getDocByOid(fileOid: string, docType?: DocType): Promise<Doc | undefined>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  fileOid | string | Object ID (SHA-1 hash) that represents a Git object. (See https://git-scm.com/docs/git-hash-object ) |
|  docType | [DocType](./git-documentdb.doctype.md) |  |

<b>Returns:</b>

Promise&lt;[Doc](./git-documentdb.doc.md) \| undefined&gt;

## Remarks

- undefined if a specified oid does not exist.

## Exceptions

[Err.DatabaseClosingError](./git-documentdb.err.databaseclosingerror.md)

[Err.RepositoryNotOpenError](./git-documentdb.err.repositorynotopenerror.md)

[Err.InvalidJsonObjectError](./git-documentdb.err.invalidjsonobjecterror.md)

