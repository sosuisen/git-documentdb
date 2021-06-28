---
sidebar_label: validateLocalDir()
title: Validator.validateLocalDir() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Validator](./git-documentdb.validator.md) &gt; [validateLocalDir](./git-documentdb.validator.validatelocaldir.md)

## Validator.validateLocalDir() method

Validate localDir

<b>Signature:</b>

```typescript
validateLocalDir(localDir: string): void;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  localDir | string |  |

<b>Returns:</b>

void

## Exceptions

[Err.InvalidLocalDirCharacterError](./git-documentdb.err.invalidlocaldircharactererror.md)

## Remarks


```
- A directory name allows Unicode characters excluding OS reserved filenames and following characters: \< \> : " | ? * \\0
- A colon is generally disallowed, but a drive letter followed by a colon is allowed.
- A directory name cannot end with a period or a white space, but the current directory . and the parent directory .. are allowed.
- A trailing slash could be omitted.

```

