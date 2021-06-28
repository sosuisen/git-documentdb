---
sidebar_label: loadAuthor()
title: GitDocumentDB.loadAuthor() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [GitDocumentDB](./git-documentdb.gitdocumentdb.md) &gt; [loadAuthor](./git-documentdb.gitdocumentdb.loadauthor.md)

## GitDocumentDB.loadAuthor() method

Load author from .git/config

<b>Signature:</b>

```typescript
loadAuthor(): Promise<void>;
```
<b>Returns:</b>

Promise&lt;void&gt;

## Remarks

Load user.name and user.email to GitDocumentDB\#author. If not defined in .git/config, do nothing.

