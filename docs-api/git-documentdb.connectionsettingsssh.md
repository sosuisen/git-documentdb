---
sidebar_label: ConnectionSettingsSSH type
title: ConnectionSettingsSSH type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [ConnectionSettingsSSH](./git-documentdb.connectionsettingsssh.md)

## ConnectionSettingsSSH type

Connection settings for SSH

<b>Signature:</b>

```typescript
export declare type ConnectionSettingsSSH = {
    type: 'ssh';
    engine?: string;
    privateKeyPath: string;
    publicKeyPath: string;
    passPhrase?: string;
};
```
