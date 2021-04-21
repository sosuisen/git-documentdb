<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [RemoveResult](./git-documentdb.removeresult.md)

## RemoveResult type

Result of remove()

<b>Signature:</b>

```typescript
export declare type RemoveResult = {
    ok: true;
    id: string;
    file_sha: string;
    commit_sha: string;
};
```

## Remarks

- ok: ok shows always true. Exception is thrown when error occurs.

- id: id of a document. (You might be confused. Underscored '\_id' is used only in a [JsonDoc](./git-documentdb.jsondoc.md) type. In other cases, 'id' is used. This is a custom of PouchDB/CouchDB.)

- file\_sha: SHA-1 hash of Git blob (40 characters)

- commit\_sha: SHA-1 hash of Git commit (40 characters)
