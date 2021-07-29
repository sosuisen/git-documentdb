---
sidebar_label: sync()
title: GitDocumentDB.sync() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [GitDocumentDB](./git-documentdb.gitdocumentdb.md) &gt; [sync](./git-documentdb.gitdocumentdb.sync_1.md)

## GitDocumentDB.sync() method

Synchronize with a remote repository

<b>Signature:</b>

```typescript
sync(options: RemoteOptions, getSyncResult: boolean): Promise<[Sync, SyncResult]>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  options | [RemoteOptions](./git-documentdb.remoteoptions.md) |  |
|  getSyncResult | boolean |  |

<b>Returns:</b>

Promise&lt;\[[Sync](./git-documentdb.sync.md) , [SyncResult](./git-documentdb.syncresult.md) \]&gt;

## Remarks

Register and synchronize with a remote repository. Do not register the same remote repository again. Call unregisterRemote() before register it again.

## Exceptions

[Err.RemoteAlreadyRegisteredError](./git-documentdb.err.remotealreadyregisterederror.md)

\# from Sync\#syncAndGetResultImpl

[Err.DatabaseClosingError](./git-documentdb.err.databaseclosingerror.md)

[Err.RepositoryNotOpenError](./git-documentdb.err.repositorynotopenerror.md)

[Err.UndefinedRemoteURLError](./git-documentdb.err.undefinedremoteurlerror.md)

[Err.IntervalTooSmallError](./git-documentdb.err.intervaltoosmallerror.md)

[Err.SyncIntervalLessThanOrEqualToRetryIntervalError](./git-documentdb.err.syncintervallessthanorequaltoretryintervalerror.md)

[Err.CannotCreateRemoteRepositoryError](./git-documentdb.err.cannotcreateremoterepositoryerror.md)

[RemoteErr.InvalidGitRemoteError](./git-documentdb.remoteerr.invalidgitremoteerror.md)

[RemoteErr.InvalidURLFormatError](./git-documentdb.remoteerr.invalidurlformaterror.md)

[RemoteErr.NetworkError](./git-documentdb.remoteerr.networkerror.md)

[RemoteErr.HTTPError401AuthorizationRequired](./git-documentdb.remoteerr.httperror401authorizationrequired.md)

[RemoteErr.HTTPError404NotFound](./git-documentdb.remoteerr.httperror404notfound.md)

[RemoteErr.CannotConnectError](./git-documentdb.remoteerr.cannotconnecterror.md)


[RemoteErr.InvalidRepositoryURLError](./git-documentdb.remoteerr.invalidrepositoryurlerror.md)

[RemoteErr.InvalidSSHKeyPathError](./git-documentdb.remoteerr.invalidsshkeypatherror.md)

[RemoteErr.InvalidAuthenticationTypeError](./git-documentdb.remoteerr.invalidauthenticationtypeerror.md)

[RemoteErr.UnfetchedCommitExistsError](./git-documentdb.remoteerr.unfetchedcommitexistserror.md)

[RemoteErr.HTTPError403Forbidden](./git-documentdb.remoteerr.httperror403forbidden.md)

[Err.NoMergeBaseFoundError](./git-documentdb.err.nomergebasefounderror.md)

[Err.ThreeWayMergeError](./git-documentdb.err.threewaymergeerror.md)

[Err.CannotDeleteDataError](./git-documentdb.err.cannotdeletedataerror.md)

[Err.InvalidJsonObjectError](./git-documentdb.err.invalidjsonobjecterror.md)

