---
sidebar_label: connect()
title: RemoteRepository.connect() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [RemoteRepository](./git-documentdb.remoterepository.md) &gt; [connect](./git-documentdb.remoterepository.connect.md)

## RemoteRepository.connect() method

Set a remote repository and connect to the remote repository. A remote repository will be created if not exists.

<b>Signature:</b>

```typescript
connect(repos: nodegit.Repository, credentialCallbacks: {
        [key: string]: any;
    }, onlyFetch?: boolean): Promise<[GitRemoteAction, 'exist' | 'create']>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  repos | nodegit.Repository |  |
|  credentialCallbacks | { \[key: string\]: any; } |  |
|  onlyFetch | boolean |  |

<b>Returns:</b>

Promise&lt;\[GitRemoteAction, 'exist' \| 'create'\]&gt;

## Exceptions

[Err.UndefinedPersonalAccessTokenError](./git-documentdb.err.undefinedpersonalaccesstokenerror.md) (from RemoteRepository\#create())

[Err.PersonalAccessTokenForAnotherAccountError](./git-documentdb.err.personalaccesstokenforanotheraccounterror.md) (from RemoteRepository\#create())

[Err.CannotConnectError](./git-documentdb.err.cannotconnecterror.md) (from RemoteRepository\#create())

[Err.AuthenticationTypeNotAllowCreateRepositoryError](./git-documentdb.err.authenticationtypenotallowcreaterepositoryerror.md) (from RemoteRepository\#create())

[Err.FetchConnectionFailedError](./git-documentdb.err.fetchconnectionfailederror.md)

[Err.CannotCreateRemoteRepositoryError](./git-documentdb.err.cannotcreateremoterepositoryerror.md)

[Err.PushConnectionFailedError](./git-documentdb.err.pushconnectionfailederror.md)

