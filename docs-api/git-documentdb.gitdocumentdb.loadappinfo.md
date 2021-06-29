---
sidebar_label: loadAppInfo()
title: GitDocumentDB.loadAppInfo() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [GitDocumentDB](./git-documentdb.gitdocumentdb.md) &gt; [loadAppInfo](./git-documentdb.gitdocumentdb.loadappinfo.md)

## GitDocumentDB.loadAppInfo() method

Load app-specific info from .gitddb/app.json

<b>Signature:</b>

```typescript
loadAppInfo(): Promise<JsonDoc | undefined>;
```
<b>Returns:</b>

Promise&lt;[JsonDoc](./git-documentdb.jsondoc.md) \| undefined&gt;

JSON object. It returns undefined if app.json does not exist.

