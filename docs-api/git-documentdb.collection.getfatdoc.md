---
sidebar_label: getFatDoc()
title: Collection.getFatDoc() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Collection](./git-documentdb.collection.md) &gt; [getFatDoc](./git-documentdb.collection.getfatdoc.md)

## Collection.getFatDoc() method

Get a FatDoc data

<b>Signature:</b>

```typescript
getFatDoc(shortName: string, getOptions?: GetOptions): Promise<FatDoc | undefined>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  shortName | string | shortName is a file path whose collectionPath is omitted. |
|  getOptions | [GetOptions](./git-documentdb.getoptions.md) |  |

<b>Returns:</b>

Promise&lt;[FatDoc](./git-documentdb.fatdoc.md) \| undefined&gt;

- undefined if a specified data does not exist.

- FatJsonDoc if the file extension is '.json'. Be careful that JsonDoc may not have \_id property when an app other than GitDocumentDB creates it.

- FatBinaryDoc if described in .gitattribtues, otherwise FatTextDoc.

- getOptions.forceDocType always overwrite return type.

## Exceptions

[Err.DatabaseClosingError](./git-documentdb.err.databaseclosingerror.md)

[Err.RepositoryNotOpenError](./git-documentdb.err.repositorynotopenerror.md)

[Err.InvalidJsonObjectError](./git-documentdb.err.invalidjsonobjecterror.md)

