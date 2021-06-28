---
sidebar_label: validateDbName()
title: Validator.validateDbName() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Validator](./git-documentdb.validator.md) &gt; [validateDbName](./git-documentdb.validator.validatedbname.md)

## Validator.validateDbName() method

Validate dbName

<b>Signature:</b>

```typescript
validateDbName(dbName: string): void;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  dbName | string |  |

<b>Returns:</b>

void

## Exceptions

[Err.InvalidDbNameCharacterError](./git-documentdb.err.invaliddbnamecharactererror.md)

## Remarks


```
- dbName allows Unicode characters excluding OS reserved filenames and following characters: \< \> : " ¥ / \\ | ? * \\0
- dbName cannot end with a period or a white space.
- dbName does not allow '.' and '..'.

```

