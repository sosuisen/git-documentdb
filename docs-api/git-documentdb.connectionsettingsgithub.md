---
sidebar_label: ConnectionSettingsGitHub type
title: ConnectionSettingsGitHub type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [ConnectionSettingsGitHub](./git-documentdb.connectionsettingsgithub.md)

## ConnectionSettingsGitHub type

Connection settings for GitHub

<b>Signature:</b>

```typescript
export declare type ConnectionSettingsGitHub = {
    type: 'github';
    personalAccessToken?: string;
    private?: boolean;
};
```

## Remarks

- personalAccessToken: See https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token

- private: Whether the automatically created repository is private or not. Default is true.

