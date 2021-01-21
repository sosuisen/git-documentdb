<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [GitDocumentDB](./git-documentdb.gitdocumentdb.md) &gt; [(constructor)](./git-documentdb.gitdocumentdb._constructor_.md)

## GitDocumentDB.(constructor)

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.
> 

Constructor

<b>Signature:</b>

```typescript
constructor(options: DatabaseOption);
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  options | [DatabaseOption](./git-documentdb.databaseoption.md) | Database location |

## Exceptions

[InvalidWorkingDirectoryPathLengthError](./git-documentdb.invalidworkingdirectorypathlengtherror.md)

## Remarks

- The git working directory will be localDir/dbName.

- The length of the working directory path must be equal to or lesser than MAX\_LENGTH\_OF\_WORKING\_DIRECTORY\_PAT(195).

- GitDocumentDB can load a git repository that is not created by git-documentdb module, however correct behavior is not guaranteed.
