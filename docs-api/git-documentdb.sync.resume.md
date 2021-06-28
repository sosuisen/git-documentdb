---
sidebar_label: resume()
title: Sync.resume() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Sync](./git-documentdb.sync.md) &gt; [resume](./git-documentdb.sync.resume.md)

## Sync.resume() method

Resume synchronization

<b>Signature:</b>

```typescript
resume(options?: {
        interval?: number;
        retry?: number;
    }): boolean;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  options | { interval?: number; retry?: number; } |  |

<b>Returns:</b>

boolean

## Exceptions

[Err.IntervalTooSmallError](./git-documentdb.err.intervaltoosmallerror.md)

## Remarks

Give new settings if needed.

