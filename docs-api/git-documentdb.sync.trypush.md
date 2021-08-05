---
sidebar_label: tryPush()
title: Sync.tryPush() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Sync](./git-documentdb.sync.md) &gt; [tryPush](./git-documentdb.sync.trypush.md)

## Sync.tryPush() method

Try to push

<b>Signature:</b>

```typescript
tryPush(): Promise<SyncResultPush | SyncResultCancel | SyncResultNop>;
```
<b>Returns:</b>

Promise&lt;[SyncResultPush](./git-documentdb.syncresultpush.md) \| [SyncResultCancel](./git-documentdb.syncresultcancel.md) \| [SyncResultNop](./git-documentdb.syncresultnop.md) &gt;

## Exceptions

[Err.PushNotAllowedError](./git-documentdb.err.pushnotallowederror.md)

\# Errors from push

- [RemoteErr.InvalidGitRemoteError](./git-documentdb.remoteerr.invalidgitremoteerror.md)

- [RemoteErr.UnfetchedCommitExistsError](./git-documentdb.remoteerr.unfetchedcommitexistserror.md)

- [RemoteErr.InvalidURLFormatError](./git-documentdb.remoteerr.invalidurlformaterror.md)

- [RemoteErr.NetworkError](./git-documentdb.remoteerr.networkerror.md)

- [RemoteErr.HTTPError401AuthorizationRequired](./git-documentdb.remoteerr.httperror401authorizationrequired.md)

- [RemoteErr.HTTPError404NotFound](./git-documentdb.remoteerr.httperror404notfound.md)

- [RemoteErr.HTTPError403Forbidden](./git-documentdb.remoteerr.httperror403forbidden.md)

- [RemoteErr.CannotConnectError](./git-documentdb.remoteerr.cannotconnecterror.md)

- [RemoteErr.UnfetchedCommitExistsError](./git-documentdb.remoteerr.unfetchedcommitexistserror.md)

- [RemoteErr.CannotConnectError](./git-documentdb.remoteerr.cannotconnecterror.md)

- [RemoteErr.InvalidURLFormatError](./git-documentdb.remoteerr.invalidurlformaterror.md)

- [RemoteErr.InvalidRepositoryURLError](./git-documentdb.remoteerr.invalidrepositoryurlerror.md)

- [RemoteErr.InvalidSSHKeyPathError](./git-documentdb.remoteerr.invalidsshkeypatherror.md)

- [RemoteErr.InvalidAuthenticationTypeError](./git-documentdb.remoteerr.invalidauthenticationtypeerror.md)

\# Errors from getChanges

- [Err.InvalidJsonObjectError](./git-documentdb.err.invalidjsonobjecterror.md)

