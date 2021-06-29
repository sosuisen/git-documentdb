---
sidebar_label: create()
title: RemoteRepository.create() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [RemoteRepository](./git-documentdb.remoterepository.md) &gt; [create](./git-documentdb.remoterepository.create.md)

## RemoteRepository.create() method

Create a repository on a remote site

<b>Signature:</b>

```typescript
create(): Promise<void>;
```
<b>Returns:</b>

Promise&lt;void&gt;

## Remarks

connection.type must be 'github'

## Exceptions

[Err.UndefinedPersonalAccessTokenError](./git-documentdb.err.undefinedpersonalaccesstokenerror.md)

[Err.PersonalAccessTokenForAnotherAccountError](./git-documentdb.err.personalaccesstokenforanotheraccounterror.md)

[Err.CannotConnectError](./git-documentdb.err.cannotconnecterror.md)

may include the following errors:

- HttpError

- Authentication error

- Permission error

- Other network errors

[Err.AuthenticationTypeNotAllowCreateRepositoryError](./git-documentdb.err.authenticationtypenotallowcreaterepositoryerror.md)

