<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [DatabaseInfoError](./git-documentdb.databaseinfoerror.md)

## DatabaseInfoError type

Database information (failure)

<b>Signature:</b>

```typescript
export declare type DatabaseInfoError = {
    ok: false;
    error: Error;
};
```

## Remarks

- ok: Boolean which shows if a database is successfully opened.

- error: Error object is assigned if a database cannot be opened.
