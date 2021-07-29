---
sidebar_label: init()
title: Sync.init() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Sync](./git-documentdb.sync.md) &gt; [init](./git-documentdb.sync.init.md)

## Sync.init() method

Initialize remote connection

<b>Signature:</b>

```typescript
init(): Promise<SyncResult>;
```
<b>Returns:</b>

Promise&lt;[SyncResult](./git-documentdb.syncresult.md) &gt;

## Remarks

Call init() once just after creating an instance.

## Exceptions

[Err.CannotCreateRemoteRepositoryError](./git-documentdb.err.cannotcreateremoterepositoryerror.md)

[RemoteErr.InvalidGitRemoteError](./git-documentdb.remoteerr.invalidgitremoteerror.md) (from checkFetch(), trySync(), tryPush())

[RemoteErr.InvalidURLFormatError](./git-documentdb.remoteerr.invalidurlformaterror.md) (from checkFetch(), trySync(), tryPush())

[RemoteErr.NetworkError](./git-documentdb.remoteerr.networkerror.md) (from checkFetch(), trySync(), tryPush())

[RemoteErr.HTTPError401AuthorizationRequired](./git-documentdb.remoteerr.httperror401authorizationrequired.md) (from checkFetch(), trySync(), tryPush())

[RemoteErr.HTTPError404NotFound](./git-documentdb.remoteerr.httperror404notfound.md) (from checkFetch(), trySync(), tryPush())

[RemoteErr.CannotConnectError](./git-documentdb.remoteerr.cannotconnecterror.md) (from checkFetch(), trySync(), tryPush())

 (from checkFetch(), trySync(), tryPush())

[RemoteErr.InvalidRepositoryURLError](./git-documentdb.remoteerr.invalidrepositoryurlerror.md) (from checkFetch(), trySync(), tryPush())

[RemoteErr.InvalidSSHKeyPathError](./git-documentdb.remoteerr.invalidsshkeypatherror.md) (from checkFetch, trySync(), tryPush())

[RemoteErr.InvalidAuthenticationTypeError](./git-documentdb.remoteerr.invalidauthenticationtypeerror.md) (from checkFetch(), trySync(), tryPush())

[RemoteErr.UnfetchedCommitExistsError](./git-documentdb.remoteerr.unfetchedcommitexistserror.md) (from tryPush())

[RemoteErr.HTTPError403Forbidden](./git-documentdb.remoteerr.httperror403forbidden.md) (from tryPush())

[Err.NoMergeBaseFoundError](./git-documentdb.err.nomergebasefounderror.md) (from trySync())

[Err.ThreeWayMergeError](./git-documentdb.err.threewaymergeerror.md) (from trySync())

[Err.CannotDeleteDataError](./git-documentdb.err.cannotdeletedataerror.md) (from trySync())

[Err.InvalidJsonObjectError](./git-documentdb.err.invalidjsonobjecterror.md) (from trySync(), tryPush())

