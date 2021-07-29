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

\# Errors from RemoteEngine\[engineName\].checkFetch

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

Errors from [Sync.trySync()](./git-documentdb.sync.trysync.md)

Errors from [Sync.tryPush()](./git-documentdb.sync.trypush.md)

