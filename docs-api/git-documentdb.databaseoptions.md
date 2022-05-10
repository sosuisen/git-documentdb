---
sidebar_label: DatabaseOptions type
title: DatabaseOptions type
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md) &gt; [DatabaseOptions](./git-documentdb.databaseoptions.md)

## DatabaseOptions type

Database Options

<b>Signature:</b>

```typescript
export declare type DatabaseOptions = {
    localDir?: string;
    dbName: string;
    logLevel?: TLogLevelName;
    schema?: Schema;
    serialize?: SerializeFormatLabel;
    logToTransport?: (logObject: ILogObject) => void;
    logColorEnabled?: boolean;
};
```
<b>References:</b>

[Schema](./git-documentdb.schema.md) , [SerializeFormatLabel](./git-documentdb.serializeformatlabel.md)

## Remarks

localDir and dbName are OS-specific options.

<b>It is recommended to use ASCII characters and case-insensitive names for cross-platform.</b>

localDir - A local directory path that stores repositories of GitDocumentDB.

- Default is './gitddb'.

- A directory name allows Unicode characters except for OS reserved filenames and the following characters: &lt; &gt; : " \| ? \* ¥0.

- A colon : is generally not allowed, but a Windows drive letter followed by a colon is allowed. e.g.) C: D:

- A directory name cannot end with a period or a white space but the current directory . and the parent directory .. are allowed.

- A trailing slash / could be omitted.

dbName - A name of a git repository

- dbName allows Unicode characters except for OS reserved filenames and the following characters: &lt; &gt; : " ¥ / \\ \| ? \* ¥0.

- dbName cannot end with a period or a white space.

- dbName does not allow '.' and '..'.

logLevel - Default is 'info'.

schema - Schema for a specific document type.

serializeFormat - Format for serialization

logToTransport - logToTransport function for all log levels. See https://tslog.js.org/\#/?id=transports

logColorEnabled - Enable color for console log. Default is true. When you write log into a file by logToTransport, false is recommended.

