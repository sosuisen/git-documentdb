<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Validator](./git-documentdb.validator.md) &gt; [validateId](./git-documentdb.validator.validateid.md)

## Validator.validateId() method

Validate \_id

\_id = collectionPath + fileName

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

[InvalidIdCharacterError](./git-documentdb.invalididcharactererror.md)

[InvalidCollectionPathCharacterError](./git-documentdb.invalidcollectionpathcharactererror.md)

[InvalidCollectionPathLengthError](./git-documentdb.invalidcollectionpathlengtherror.md)

[InvalidIdLengthError](./git-documentdb.invalididlengtherror.md)

## Remarks

- \_id allows Unicode characters excluding OS reserved filenames and following characters: &lt; &gt; : " \| ? \* \\<!-- -->0

- \_id cannot start with a slash and an underscore \_.

- A directory name cannot end with a period or a white space.

- A directory name does not allow '.' and '..'.
