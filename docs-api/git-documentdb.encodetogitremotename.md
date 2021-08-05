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

The first default name of Git remote is "origin".

GitDocumentDB adds an alias of "origin", whose name is generated automatically by this function. The second and subsequent remotes are also named in the same way.

A remote name consists of \[remote address\]\_\[hash\]. Periods are replaced with underscores. e.g.) github\_com\_a0b1c23 It is human-readable.

\[remote address\] is \[hostname + domain name\] or \[ip address\]. \[hash\] is calculated from remoteURL.

\[hash\] is the first seven characters of SHA-1 so that it may collide. Capitalize one of the remote addresses when hashes collide because a hostname and a domain name are not case sensitive.

## Exceptions

[RemoteErr.InvalidURLFormatError](./git-documentdb.remoteerr.invalidurlformaterror.md)

