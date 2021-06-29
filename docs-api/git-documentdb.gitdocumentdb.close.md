---
sidebar_label: close()
title: GitDocumentDB.close() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [GitDocumentDB](./git-documentdb.gitdocumentdb.md) &gt; [close](./git-documentdb.gitdocumentdb.close.md)

## GitDocumentDB.close() method

Close a database

<b>Signature:</b>

```typescript
close(options?: DatabaseCloseOption): Promise<void>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  options | [DatabaseCloseOption](./git-documentdb.databasecloseoption.md) | The options specify how to close database. |

<b>Returns:</b>

Promise&lt;void&gt;

## Remarks

- New CRUD operations are not available while closing.

- Queued operations are executed before the database is closed unless it times out.

## Exceptions

[Err.DatabaseClosingError](./git-documentdb.err.databaseclosingerror.md)

[Err.DatabaseCloseTimeoutError](./git-documentdb.err.databaseclosetimeouterror.md)

