---
sidebar_label: destroy()
title: RemoteRepository.destroy() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [RemoteRepository](./git-documentdb.remoterepository.md) &gt; [destroy](./git-documentdb.remoterepository.destroy.md)

## RemoteRepository.destroy() method

Delete a repository on a remote site

<b>Signature:</b>

```typescript
destroy(): Promise<void>;
```
<b>Returns:</b>

Promise&lt;void&gt;

## Remarks

connection.type must be 'github'

## Exceptions

[Err.UndefinedPersonalAccessTokenError](./git-documentdb.err.undefinedpersonalaccesstokenerror.md)

[Err.CannotConnectError](./git-documentdb.err.cannotconnecterror.md)

may include the following errors:

- HttpError

- Authentication error

- Permission for private repository error

- Other network errors

[Err.AuthenticationTypeNotAllowCreateRepositoryError](./git-documentdb.err.authenticationtypenotallowcreaterepositoryerror.md)

