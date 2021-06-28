---
sidebar_label: DatabaseInfo type
title: DatabaseInfo type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [DatabaseInfo](./git-documentdb.databaseinfo.md)

## DatabaseInfo type

Database info

<b>Signature:</b>

```typescript
export declare type DatabaseInfo = {
    dbId: string;
    creator: string;
    version: string;
};
```

## Remarks

- dbId: ULID of the database. (See https://github.com/ulid/spec for ULID)

- creator: Creator of the database. Default is 'GitDocumentDB'. The creator is described in .gitddb/info.json.

- version: Version of the GitDocumentDB specification. The version is described in .gitddb/info.json.

