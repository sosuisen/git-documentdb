---
sidebar_label: getOldRevision()
title: GitDocumentDB.getOldRevision() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [GitDocumentDB](./git-documentdb.gitdocumentdb.md) &gt; [getOldRevision](./git-documentdb.gitdocumentdb.getoldrevision.md)

## GitDocumentDB.getOldRevision() method

Get an old revision of a document

<b>Signature:</b>

```typescript
getOldRevision(_id: string, revision: number, historyOptions?: HistoryOptions): Promise<JsonDoc | undefined>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  \_id | string | \_id is a file path whose .json extension is omitted. |
|  revision | number | Specify a number to go back to old revision. Default is 0. See [GitDocumentDB.getHistory()](./git-documentdb.gitdocumentdb.gethistory.md) for the array of revisions. |
|  historyOptions | [HistoryOptions](./git-documentdb.historyoptions.md) | The array of revisions is filtered by HistoryOptions.filter. |

<b>Returns:</b>

Promise&lt;[JsonDoc](./git-documentdb.jsondoc.md) \| undefined&gt;

## Remarks

- undefined if a specified document does not exist or it is deleted.

- This is an alias of GitDocumentDB\#rootCollection.getOldRevision()

## Example


```
db.getOldRevision(_id, 0); // returns the latest document.
db.getOldRevision(_id, 2); // returns a document two revisions older than the latest.

```

## Exceptions

[Err.DatabaseClosingError](./git-documentdb.err.databaseclosingerror.md)

[Err.RepositoryNotOpenError](./git-documentdb.err.repositorynotopenerror.md)

[Err.InvalidJsonObjectError](./git-documentdb.err.invalidjsonobjecterror.md)

