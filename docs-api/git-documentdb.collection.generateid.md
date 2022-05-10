---
sidebar_label: generateId()
title: Collection.generateId() method
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [Collection](./git-documentdb.collection.md) &gt; [generateId](./git-documentdb.collection.generateid.md)

## Collection.generateId() method

Generate new \_id as monotonic ULID

<b>Signature:</b>

```typescript
generateId(seedTime?: number): string;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  seedTime | number |  |

<b>Returns:</b>

string

26 Base32 alphabets

## Remarks

See https://github.com/ulid/javascript

