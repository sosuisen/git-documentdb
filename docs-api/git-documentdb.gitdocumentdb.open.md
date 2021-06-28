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

Database information

## Exceptions

[Err.DatabaseClosingError](./git-documentdb.err.databaseclosingerror.md)

[Err.CannotCreateDirectoryError](./git-documentdb.err.cannotcreatedirectoryerror.md)

[Err.CannotOpenRepositoryError](./git-documentdb.err.cannotopenrepositoryerror.md)

[Err.RepositoryNotFoundError](./git-documentdb.err.repositorynotfounderror.md) may occurs when openOptions.createIfNotExists is false.

## Remarks

- GitDocumentDB can load a git repository that is not created by the git-documentdb module. However, correct behavior is not guaranteed.

