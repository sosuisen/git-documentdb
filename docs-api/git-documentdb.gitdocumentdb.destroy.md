---
sidebar_label: destroy()
title: GitDocumentDB.destroy() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [GitDocumentDB](./git-documentdb.gitdocumentdb.md) &gt; [destroy](./git-documentdb.gitdocumentdb.destroy.md)

## GitDocumentDB.destroy() method

Destroy a database

<b>Signature:</b>

```typescript
destroy(options?: DatabaseCloseOption): Promise<{
        ok: true;
    }>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  options | [DatabaseCloseOption](./git-documentdb.databasecloseoption.md) | The options specify how to close database. |

<b>Returns:</b>

Promise&lt;{ ok: true; }&gt;

## Exceptions

[Err.DatabaseClosingError](./git-documentdb.err.databaseclosingerror.md)

[Err.DatabaseCloseTimeoutError](./git-documentdb.err.databaseclosetimeouterror.md)

[Err.FileRemoveTimeoutError](./git-documentdb.err.fileremovetimeouterror.md)

## Remarks

- [GitDocumentDB.close()](./git-documentdb.gitdocumentdb.close.md) is called automatically before destroying.

- options.force is true if undefined.

- The Git repository and the working directory are removed from the filesystem.

- localDir (which is specified in constructor) is not removed.

