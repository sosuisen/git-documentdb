<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [GitDocumentDB](./git-documentdb.gitdocumentdb.md) &gt; [update](./git-documentdb.gitdocumentdb.update_1.md)

## GitDocumentDB.update() method

Update a document

<b>Signature:</b>

```typescript
update(id: string, document: {
        [key: string]: any;
    }, options?: PutOptions): Promise<PutResult>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  id | string | \_id property of a document |
|  document | { \[key: string\]: any; } | This is a [JsonDoc](./git-documentdb.jsondoc.md)<!-- -->, but \_id property is ignored. |
|  options | [PutOptions](./git-documentdb.putoptions.md) |  |

<b>Returns:</b>

Promise&lt;[PutResult](./git-documentdb.putresult.md)<!-- -->&gt;

## Exceptions

[DatabaseClosingError](./git-documentdb.databaseclosingerror.md)

[RepositoryNotOpenError](./git-documentdb.repositorynotopenerror.md)

[UndefinedDocumentIdError](./git-documentdb.undefineddocumentiderror.md)

[InvalidJsonObjectError](./git-documentdb.invalidjsonobjecterror.md)

[CannotWriteDataError](./git-documentdb.cannotwritedataerror.md)


[InvalidIdCharacterError](./git-documentdb.invalididcharactererror.md)

[InvalidIdLengthError](./git-documentdb.invalididlengtherror.md)

[DocumentNotFoundError](./git-documentdb.documentnotfounderror.md)

## Remarks

- Throws DocumentNotFoundError if the document does not exist. It might be better to use put() instead of update().

- update() does not check a write permission of your file system (unlike open()).

- Saved file path is `${workingDir()}/${document._id}.json`<!-- -->. [InvalidIdLengthError](./git-documentdb.invalididlengtherror.md) will be thrown if the path length exceeds the maximum length of a filepath on the device.

- A update operation is not skipped when no change occurred on a specified document.
