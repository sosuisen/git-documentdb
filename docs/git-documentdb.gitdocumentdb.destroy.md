<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [GitDocumentDB](./git-documentdb.gitdocumentdb.md) &gt; [destroy](./git-documentdb.gitdocumentdb.destroy.md)

## GitDocumentDB.destroy() method

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.
> 

Destroy database

<b>Signature:</b>

```typescript
destroy(): Promise<boolean>;
```
<b>Returns:</b>

Promise&lt;boolean&gt;

## Exceptions

[DatabaseClosingError](./git-documentdb.databaseclosingerror.md)

## Remarks

- The database is closed automatically before destroying.

- The Git repository is removed from the filesystem.
