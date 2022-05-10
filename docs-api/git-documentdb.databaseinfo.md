---
sidebar_label: DatabaseInfo type
title: DatabaseInfo type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [DatabaseInfo](./git-documentdb.databaseinfo.md)

## DatabaseInfo type

Database information

<b>Signature:</b>

```typescript
export declare type DatabaseInfo = {
    dbId: string;
    creator: string;
    version: string;
    serialize: SerializeFormatLabel;
};
```
<b>References:</b>

[SerializeFormatLabel](./git-documentdb.serializeformatlabel.md)

## Remarks

- This is metadata unique to GitDocumentDB.

- This metadata is saved to '.gitddb/info.json' in JSON format.

- dbId: ULID of the database. (See https://github.com/ulid/spec for ULID.) The dbId is used for combining databases.

- creator: A creator of the database. Default is 'GitDocumentDB'. 'GitDocumentDB' ensures that the repository is created according to the GitDocumentDB scheme.

- version: A version of the GitDocumentDB specification. The version can be used for database migration.

- serialize: Serialize format of the database.

