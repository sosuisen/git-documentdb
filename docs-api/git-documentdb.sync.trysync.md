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

[Err.NoMergeBaseFoundError](./git-documentdb.err.nomergebasefounderror.md) (from syncWorker())

[RemoteErr.InvalidGitRemoteError](./git-documentdb.remoteerr.invalidgitremoteerror.md) (from syncWorker())

[RemoteErr.InvalidURLFormatError](./git-documentdb.remoteerr.invalidurlformaterror.md) (from syncWorker())

[RemoteErr.NetworkError](./git-documentdb.remoteerr.networkerror.md) (from syncWorker())

[RemoteErr.HTTPError401AuthorizationRequired](./git-documentdb.remoteerr.httperror401authorizationrequired.md) (from syncWorker())

[RemoteErr.HTTPError404NotFound](./git-documentdb.remoteerr.httperror404notfound.md) (from syncWorker())

[RemoteErr.CannotConnectError](./git-documentdb.remoteerr.cannotconnecterror.md) (from syncWorker())

 (from syncWorker())

[RemoteErr.InvalidRepositoryURLError](./git-documentdb.remoteerr.invalidrepositoryurlerror.md) (from syncWorker())

[RemoteErr.InvalidSSHKeyPathError](./git-documentdb.remoteerr.invalidsshkeypatherror.md) (from syncWorker())

[RemoteErr.InvalidAuthenticationTypeError](./git-documentdb.remoteerr.invalidauthenticationtypeerror.md) (from syncWorker())

[RemoteErr.HTTPError403Forbidden](./git-documentdb.remoteerr.httperror403forbidden.md) (from syncWorker())

[RemoteErr.UnfetchedCommitExistsError](./git-documentdb.remoteerr.unfetchedcommitexistserror.md) (from syncWorker())

[Err.InvalidConflictStateError](./git-documentdb.err.invalidconflictstateerror.md) (from syncWorker())

[Err.CannotDeleteDataError](./git-documentdb.err.cannotdeletedataerror.md) (from syncWorker())

[Err.InvalidDocTypeError](./git-documentdb.err.invaliddoctypeerror.md) (from syncWorker())

[Err.InvalidConflictResolutionStrategyError](./git-documentdb.err.invalidconflictresolutionstrategyerror.md) (from syncWorker())

[Err.CannotCreateDirectoryError](./git-documentdb.err.cannotcreatedirectoryerror.md) (from syncWorker())

[Err.InvalidJsonObjectError](./git-documentdb.err.invalidjsonobjecterror.md) (from syncWorker())

 (from combineDatabaseWithTheirs())

 (from combineDatabaseWithTheirs())

 (from combineDatabaseWithTheirs())

 (from combineDatabaseWithTheirs())

 (from combineDatabaseWithTheirs())

 (from combineDatabaseWithTheirs())

 (from combineDatabaseWithTheirs())

 (from combineDatabaseWithTheirs())

 (from combineDatabaseWithTheirs())

