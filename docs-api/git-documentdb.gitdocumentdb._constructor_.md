---
sidebar_label: (constructor)
title: GitDocumentDB.(constructor)
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [GitDocumentDB](./git-documentdb.gitdocumentdb.md) &gt; [(constructor)](./git-documentdb.gitdocumentdb._constructor_.md)

## GitDocumentDB.(constructor)

Constructor

<b>Signature:</b>

```typescript
constructor(options: DatabaseOptions & CollectionOptions);
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  options | [DatabaseOptions](./git-documentdb.databaseoptions.md) &amp; [CollectionOptions](./git-documentdb.collectionoptions.md) |  |

## Remarks

- The Git working directory will be `${options.localDir}/${options.dbName}` .

## Exceptions

[Err.InvalidWorkingDirectoryPathLengthError](./git-documentdb.err.invalidworkingdirectorypathlengtherror.md)

[Err.UndefinedDatabaseNameError](./git-documentdb.err.undefineddatabasenameerror.md)

