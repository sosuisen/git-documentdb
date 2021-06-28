---
sidebar_label: testWindowsInvalidFileNameCharacter()
title: Validator.testWindowsInvalidFileNameCharacter() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Validator](./git-documentdb.validator.md) &gt; [testWindowsInvalidFileNameCharacter](./git-documentdb.validator.testwindowsinvalidfilenamecharacter.md)

## Validator.testWindowsInvalidFileNameCharacter() method

Return false if given name includes Windows invalid filename character

<b>Signature:</b>

```typescript
testWindowsInvalidFileNameCharacter(name: string, options?: {
        allowSlash?: boolean;
        allowDriveLetter?: boolean;
        allowDirectoryDot?: boolean;
        allowDot?: boolean;
        allowLastSpace?: boolean;
    }): boolean;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  name | string |  |
|  options | { allowSlash?: boolean; allowDriveLetter?: boolean; allowDirectoryDot?: boolean; allowDot?: boolean; allowLastSpace?: boolean; } |  |

<b>Returns:</b>

boolean

