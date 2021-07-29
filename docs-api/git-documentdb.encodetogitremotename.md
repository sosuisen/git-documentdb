---
sidebar_label: encodeToGitRemoteName() function
title: encodeToGitRemoteName() function
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [encodeToGitRemoteName](./git-documentdb.encodetogitremotename.md)

## encodeToGitRemoteName() function

encodeToRemoteName

<b>Signature:</b>

```typescript
export declare function encodeToGitRemoteName(remoteURL: string): string;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  remoteURL | string |  |

<b>Returns:</b>

string

## Remarks

Remote name consists of host\_name + hash. hash is generated from remoteURL. Capitalize host name of remoteURL manually when hashes collide because host name is not case sensitive.

