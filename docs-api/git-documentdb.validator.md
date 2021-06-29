---
sidebar_label: Validator class
title: Validator class
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Validator](./git-documentdb.validator.md)

## Validator class

Validator Class

<b>Signature:</b>

```typescript
export declare class Validator 
```

## Constructors

|  Constructor | Modifiers | Description |
|  --- | --- | --- |
|  [(constructor)(workingDir)](./git-documentdb.validator._constructor_.md) |  | Constructs a new instance of the <code>Validator</code> class |

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [byteLengthOf](./git-documentdb.validator.bytelengthof.md) | <code>static</code> | (str: string) =&gt; number |  |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [maxCollectionPathLength()](./git-documentdb.validator.maxcollectionpathlength.md) |  | Return the max length of collectionPath |
|  [maxIdLength()](./git-documentdb.validator.maxidlength.md) |  | Return the max length of \_id |
|  [maxWorkingDirectoryLength()](./git-documentdb.validator.maxworkingdirectorylength.md) | <code>static</code> | Return the max length of working directory path |
|  [normalizeCollectionPath(collectionPath)](./git-documentdb.validator.normalizecollectionpath.md) | <code>static</code> | Normalized collectionPath is '' or path strings that have a trailing slash and no heading slash. Root ('/') is not allowed. Backslash \\ or yen ¥ is replaced with slash /. |
|  [testWindowsInvalidFileNameCharacter(name, options)](./git-documentdb.validator.testwindowsinvalidfilenamecharacter.md) |  | Return false if the given name includes Windows invalid filename character |
|  [testWindowsReservedFileName(name, options)](./git-documentdb.validator.testwindowsreservedfilename.md) |  | Return false if the given name equals Windows reserved filename |
|  [validateCollectionPath(collectionPath)](./git-documentdb.validator.validatecollectionpath.md) |  | Validate collectionPath |
|  [validateDbName(dbName)](./git-documentdb.validator.validatedbname.md) |  | Validate dbName |
|  [validateDocument(doc)](./git-documentdb.validator.validatedocument.md) |  | Validate document |
|  [validateId(\_id)](./git-documentdb.validator.validateid.md) |  | Validate \_id \_id = collectionPath + shortId (not including postfix '.json') |
|  [validateLocalDir(localDir)](./git-documentdb.validator.validatelocaldir.md) |  | Validate localDir |

