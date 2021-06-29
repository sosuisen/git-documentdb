---
sidebar_label: DatabaseOpenResult type
title: DatabaseOpenResult type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [DatabaseOpenResult](./git-documentdb.databaseopenresult.md)

## DatabaseOpenResult type

Result of opening database

<b>Signature:</b>

```typescript
export declare type DatabaseOpenResult = DatabaseInfo & {
    isNew: boolean;
    isCreatedByGitDDB: boolean;
    isValidVersion: boolean;
};
```
<b>References:</b>

[DatabaseInfo](./git-documentdb.databaseinfo.md)

## Remarks

- isNew: Whether a repository is newly created or existing.

- isCreatedByGitDDB: Whether a repository is created by GitDocumentDB or other means.

- isValidVersion: Whether a repository version equals to the current databaseVersion of GitDocumentDB.

