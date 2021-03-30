<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [RemoteAuthSSH](./git-documentdb.remoteauthssh.md)

## RemoteAuthSSH type

<b>Signature:</b>

```typescript
export declare type RemoteAuthSSH = {
    type: 'ssh';
    private_key_path: string;
    public_key_path: string;
    pass_phrase?: string;
};
```