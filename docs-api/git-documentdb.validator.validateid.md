---
sidebar_label: validateId()
title: Validator.validateId() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Validator](./git-documentdb.validator.md) &gt; [validateId](./git-documentdb.validator.validateid.md)

## Validator.validateId() method

Validate \_id

\_id = collectionPath + shortId (not including postfix '.json')

<b>Signature:</b>

```typescript
validateId(_id: string): void;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  \_id | string |  |

<b>Returns:</b>

void

## Exceptions

[Err.InvalidIdCharacterError](./git-documentdb.err.invalididcharactererror.md)

[Err.InvalidCollectionPathCharacterError](./git-documentdb.err.invalidcollectionpathcharactererror.md)

[Err.InvalidCollectionPathLengthError](./git-documentdb.err.invalidcollectionpathlengtherror.md)

[Err.InvalidIdLengthError](./git-documentdb.err.invalididlengtherror.md)

## Remarks

Spec of \_id is described at [JsonDoc](./git-documentdb.jsondoc.md) .

