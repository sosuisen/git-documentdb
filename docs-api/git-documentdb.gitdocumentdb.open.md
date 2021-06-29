---
sidebar_label: open()
title: GitDocumentDB.open() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [GitDocumentDB](./git-documentdb.gitdocumentdb.md) &gt; [open](./git-documentdb.gitdocumentdb.open.md)

## GitDocumentDB.open() method

Open or create a Git repository

<b>Signature:</b>

```typescript
open(openOptions?: OpenOptions): Promise<DatabaseOpenResult>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  openOptions | [OpenOptions](./git-documentdb.openoptions.md) |  |

<b>Returns:</b>

Promise&lt;[DatabaseOpenResult](./git-documentdb.databaseopenresult.md) &gt;

## Remarks

- Create a new Git repository if a dbName specified in the constructor does not exist.

- GitDocumentDB creates a legitimate Git repository and unique metadata under '.gitddb/'.

- '.gitddb/' keeps [DatabaseInfo](./git-documentdb.databaseinfo.md) for combining databases, checking schema and migration.

- GitDocumentDB can also load a Git repository that is created by other apps. It almost works; however, correct behavior is not guaranteed if it does not have a valid '.gitddb/'.

## Exceptions

[Err.DatabaseClosingError](./git-documentdb.err.databaseclosingerror.md)

[Err.CannotCreateDirectoryError](./git-documentdb.err.cannotcreatedirectoryerror.md)

[Err.CannotOpenRepositoryError](./git-documentdb.err.cannotopenrepositoryerror.md)

[Err.RepositoryNotFoundError](./git-documentdb.err.repositorynotfounderror.md) may occurs when openOptions.createIfNotExists is false.

