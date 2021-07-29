---
sidebar_label: trySync()
title: Sync.trySync() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Sync](./git-documentdb.sync.md) &gt; [trySync](./git-documentdb.sync.trysync.md)

## Sync.trySync() method

Try to sync with retries

<b>Signature:</b>

```typescript
trySync(): Promise<SyncResult>;
```
<b>Returns:</b>

Promise&lt;[SyncResult](./git-documentdb.syncresult.md) &gt;

## Exceptions

[Err.PushNotAllowedError](./git-documentdb.err.pushnotallowederror.md)

[Err.CombineDatabaseError](./git-documentdb.err.combinedatabaseerror.md)

\# Errors from syncWorker

- [Err.NoMergeBaseFoundError](./git-documentdb.err.nomergebasefounderror.md)

- [Err.ThreeWayMergeError](./git-documentdb.err.threewaymergeerror.md)

- [Err.CannotDeleteDataError](./git-documentdb.err.cannotdeletedataerror.md)

\# Errors from fetch, pushWorker

- [RemoteErr.InvalidGitRemoteError](./git-documentdb.remoteerr.invalidgitremoteerror.md)

- [RemoteErr.InvalidURLFormatError](./git-documentdb.remoteerr.invalidurlformaterror.md)

- [RemoteErr.NetworkError](./git-documentdb.remoteerr.networkerror.md)

- [RemoteErr.HTTPError401AuthorizationRequired](./git-documentdb.remoteerr.httperror401authorizationrequired.md)

- [RemoteErr.HTTPError404NotFound](./git-documentdb.remoteerr.httperror404notfound.md)

- [RemoteErr.CannotConnectError](./git-documentdb.remoteerr.cannotconnecterror.md)

- [RemoteErr.InvalidURLFormatError](./git-documentdb.remoteerr.invalidurlformaterror.md)

- [RemoteErr.InvalidRepositoryURLError](./git-documentdb.remoteerr.invalidrepositoryurlerror.md)

- [RemoteErr.InvalidSSHKeyPathError](./git-documentdb.remoteerr.invalidsshkeypatherror.md)

- [RemoteErr.InvalidAuthenticationTypeError](./git-documentdb.remoteerr.invalidauthenticationtypeerror.md)

\# Errors from pushWorker

- [RemoteErr.HTTPError403Forbidden](./git-documentdb.remoteerr.httperror403forbidden.md)

- [RemoteErr.UnfetchedCommitExistsError](./git-documentdb.remoteerr.unfetchedcommitexistserror.md)

\# Errors from merge

- [Err.InvalidConflictStateError](./git-documentdb.err.invalidconflictstateerror.md)

- [Err.CannotDeleteDataError](./git-documentdb.err.cannotdeletedataerror.md)

- [Err.InvalidDocTypeError](./git-documentdb.err.invaliddoctypeerror.md)

- [Err.InvalidConflictResolutionStrategyError](./git-documentdb.err.invalidconflictresolutionstrategyerror.md)

- [Err.CannotCreateDirectoryError](./git-documentdb.err.cannotcreatedirectoryerror.md)

- [Err.InvalidJsonObjectError](./git-documentdb.err.invalidjsonobjecterror.md)

\# Errors from getChanges

- [Err.InvalidJsonObjectError](./git-documentdb.err.invalidjsonobjecterror.md)

