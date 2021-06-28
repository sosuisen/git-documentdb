---
sidebar_label: saveAuthor()
title: GitDocumentDB.saveAuthor() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [GitDocumentDB](./git-documentdb.gitdocumentdb.md) &gt; [saveAuthor](./git-documentdb.gitdocumentdb.saveauthor.md)

## GitDocumentDB.saveAuthor() method

Save current author to .git/config

<b>Signature:</b>

```typescript
saveAuthor(): Promise<void>;
```
<b>Returns:</b>

Promise&lt;void&gt;

## Remarks

Save GitDocumentDB\#author. to user.name and user.email in .git/config

