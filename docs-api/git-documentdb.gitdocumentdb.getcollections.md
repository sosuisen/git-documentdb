---
sidebar_label: getCollections()
title: GitDocumentDB.getCollections() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [GitDocumentDB](./git-documentdb.gitdocumentdb.md) &gt; [getCollections](./git-documentdb.gitdocumentdb.getcollections.md)

## GitDocumentDB.getCollections() method

Get collections

<b>Signature:</b>

```typescript
getCollections(dirPath?: string): Promise<ICollection[]>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  dirPath | string | Get collections directly under the dirPath. dirPath is a relative path from localDir. Default is ''. |

<b>Returns:</b>

Promise&lt;[ICollection](./git-documentdb.icollection.md) \[\]&gt;

Promise &lt; Collection\[\] &gt;

