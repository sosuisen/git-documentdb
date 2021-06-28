---
sidebar_label: setRepository()
title: GitDocumentDB.setRepository() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [GitDocumentDB](./git-documentdb.gitdocumentdb.md) &gt; [setRepository](./git-documentdb.gitdocumentdb.setrepository.md)

## GitDocumentDB.setRepository() method

> Warning: This API is now obsolete.
> 
> This will be removed when NodeGit is replaced with isomorphic-git.
> 

Set repository

<b>Signature:</b>

```typescript
setRepository(repos: nodegit.Repository): void;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  repos | nodegit.Repository |  |

<b>Returns:</b>

void

## Remarks

Be aware that it can corrupt the database.

