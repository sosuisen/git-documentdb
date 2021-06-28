---
sidebar_label: NormalizedCommit type
title: NormalizedCommit type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [NormalizedCommit](./git-documentdb.normalizedcommit.md)

## NormalizedCommit type

Normalized Commit

<b>Signature:</b>

```typescript
export declare type NormalizedCommit = {
    oid: string;
    message: string;
    parent: string[];
    author: {
        name: string;
        email: string;
        timestamp: number;
    };
    committer: {
        name: string;
        email: string;
        timestamp: number;
    };
    gpgsig?: string;
};
```
