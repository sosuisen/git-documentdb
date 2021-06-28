---
sidebar_label: validateCollectionPath()
title: Validator.validateCollectionPath() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Validator](./git-documentdb.validator.md) &gt; [validateCollectionPath](./git-documentdb.validator.validatecollectionpath.md)

## Validator.validateCollectionPath() method

Validate collectionPath

<b>Signature:</b>

```typescript
validateCollectionPath(collectionPath: string): void;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  collectionPath | string |  |

<b>Returns:</b>

void

## Exceptions

[Err.InvalidCollectionPathCharacterError](./git-documentdb.err.invalidcollectionpathcharactererror.md)

[Err.InvalidCollectionPathLengthError](./git-documentdb.err.invalidcollectionpathlengtherror.md)

## Remarks

CollectionPath must be NULL string or paths that match the following conditions:

```
- CollectionPath can include paths separated by slashes.
- A directory name in paths allows Unicode characters excluding OS reserved filenames and following characters: \< \> : " | ? * \\0
- **It is recommended to use ASCII characters and case-insensitive names for cross-platform.**
- A directory name in paths cannot end with a period or a white space.
- A directory name in paths does not allow '.' and '..'.
- CollectionPath cannot start with a slash.
- Trailing slash could be omitted. e.g.) 'pages' and 'pages/' show the same CollectionPath.

```

