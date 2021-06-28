/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import { TLogLevelName } from 'tslog';

/**
 * Database Options
 *
 * @remarks
 * localDir and dbName are OS specific options. <b>It is recommended to use ASCII characters and case-insensitive names for cross-platform.</b>
 *
 * ```
 * * localDir: A local directory path that stores repositories of GitDocumentDB.
 *   - Default is './gitddb'.
 *   - A directory name allows Unicode characters excluding OS reserved filenames and following characters: \< \> : " | ? * \0.
 *   - A colon : is generally not allowed, but a Windows drive letter followed by a colon is allowed. e.g.) C: D:
 *   - A directory name cannot end with a period or a white space, but the current directory . and the parent directory .. are allowed.
 *   - A trailing slash / could be omitted.
 *
 * * dbName: A name of a git repository
 *   - dbName allows Unicode characters excluding OS reserved filenames and following characters: \< \> : " ¥ / \ | ? * \0.
 *   - dbName cannot end with a period or a white space.
 *   - dbName does not allow '.' and '..'.
 *
 * * logLevel: Default is 'info'.
 * ```
 *
 * @public
 */
export type DatabaseOptions = {
  localDir?: string;
  dbName: string;
  logLevel?: TLogLevelName;
  schema?: Schema;
};

/**
 * Database open options
 *
 * @remarks
 * - createIfNotExists: Default is true.
 *
 * @public
 */
export type OpenOptions = {
  createIfNotExists?: boolean;
};

/**
 * Schema for specific document type
 *
 * @public
 */
export type Schema = {
  json: JsonDiffOptions;
};

/**
 * JsonDiffOptions
 *
 * @remarks
 *  - plainTextProperties: Only property whose key matches plainTextProperties uses text diff and patch algorithm (google-diff-match-patch).
 * ```
 * e.g.
 * { a: { b: true }, c: true } matches 'b' (whose ancestor is only 'a') and 'c'.
 * { a: { _all: true } } matches all child properties of 'a'.
 * { a: { _regex: /abc/ } } matches child properties of 'a' which match /abc/.
 * ```
 *
 * @public
 */
export type JsonDiffOptions = {
  idOfSubtree?: string[];
  plainTextProperties?: { [key: string]: any };
};

/**
 * Result of opening database
 *
 * @remarks
 * - isNew: Whether a repository is newly created or existing.
 *
 * - isCreatedByGitDDB: Whether a repository is created by GitDocumentDB or other means.
 *
 * - isValidVersion: Whether a repository version equals to the current databaseVersion of GitDocumentDB.
 *
 * @public
 */
export type DatabaseOpenResult = DatabaseInfo & {
  isNew: boolean;
  isCreatedByGitDDB: boolean;
  isValidVersion: boolean;
};

/**
 * Database info
 *
 * @remarks
 * - dbId: ULID of the database. (See https://github.com/ulid/spec for ULID)
 *
 * - creator: Creator of the database. Default is 'GitDocumentDB'. The creator is described in .gitddb/info.json.
 *
 * - version: Version of the GitDocumentDB specification. The version is described in .gitddb/info.json.
 *
 * @public
 */
export type DatabaseInfo = {
  dbId: string;
  creator: string;
  version: string;
};

/**
 * The type for a JSON document that is stored in a database
 *
 * @remarks A JSON document must be an JavaScript object that matches the following conditions:
 *```
 * - It must have an '_id' key that shows the unique identifier of a document
 * - _id allows Unicode characters excluding OS reserved filenames and following characters: \< \> : " | ? * \0
 * - _id is better to be ASCII characters and a case-insensitive name for cross-platform.
 * - _id cannot start or end with a slash.
 * - _id can include paths separated by slashes.
 * - A directory name in paths cannot end with a period or a white space.
 * - A directory name in paths does not allow '.' and '..'.
 *```
 * @example
 * ```
 * {
 *   _id: 'nara/nara_park',
 *   flower: 'double cherry blossoms'
 * }
 * ```
 *
 * @public
 */
export type JsonDoc = {
  [key: string]: any;
};

/**
 * Doc type
 *
 * @remarks
 * - json: JsonDoc
 *
 * - text: utf8 string
 *
 * - binary: Uint8Array
 *
 * @public
 */
export type DocType = 'json' | 'text' | 'binary';

/**
 * Union type of Doc types
 *
 * @public
 */
export type Doc = JsonDoc | string | Uint8Array;

/**
 * Metadata for JsonDoc
 *
 * @remarks
 * - _id: _id of a JSON document. This is a file name without .json extension.
 *
 * - name: A file name in Git. e.g.) "foo.json", "bar/baz.json"
 *
 * - fileOid: SHA-1 hash of Git object (40 characters)
 *
 * - type: type shows a DocType. type of JsonDocMetadata is fixed to 'json'.
 *
 * @public
 */
export type JsonDocMetadata = {
  _id: string;
  name: string;
  fileOid: string;
  type: 'json';
};

/**
 * Metadata for TextDoc
 *
 * @remarks
 * - name: A file name in Git. e.g.) "foo", "bar/baz.md"
 *
 * - fileOid: SHA-1 hash of Git object (40 characters)
 *
 * - type: type shows a DocType. type of TextDocMetadata is fixed to 'text'.
 *
 * @public
 */
export type TextDocMetadata = {
  name: string;
  fileOid: string;
  type: 'text';
};

/**
 * Metadata for BinaryDoc
 *
 * @remarks
 * - name: A file name in Git. e.g.) "foo", "bar/baz.jpg"
 *
 * - fileOid: SHA-1 hash of Git object (40 characters)
 *
 * - type: type shows a DocType. type of BinaryDocMetadata is fixed to 'binary'.
 *
 * @public
 */
export type BinaryDocMetadata = {
  name: string;
  fileOid: string;
  type: 'binary';
};

/**
 * Union type of Document metadata
 *
 * @public
 */
export type DocMetadata = JsonDocMetadata | TextDocMetadata | BinaryDocMetadata;

/**
 * JsonDoc with metadata
 *
 * @public
 */
export type FatJsonDoc = JsonDocMetadata & {
  doc: JsonDoc;
};

/**
 * Text (string) with metadata
 *
 * @public
 */
export type FatTextDoc = TextDocMetadata & {
  doc: string;
};

/**
 * Binary (Uint8Array) with metadata
 *
 * @public
 */
export type FatBinaryDoc = BinaryDocMetadata & {
  doc: Uint8Array;
};

/**
 * Union type of documents with a metadata
 *
 * @public
 */
export type FatDoc = FatJsonDoc | FatTextDoc | FatBinaryDoc;

/**
 * CollectionPath
 *
 * @remarks CollectionPath must be paths that match the following conditions:
 *```
 * - CollectionPath can include paths separated by slashes.
 * - A directory name in paths allows Unicode characters excluding OS reserved filenames and following characters: \< \> : " | ? * \\0
 * - CollectionPath is better to be ASCII characters and a case-insensitive names for cross-platform.
 * - A directory name in paths cannot end with a period or a white space.
 * - A directory name in paths does not allow '.' and '..'.
 * - CollectionPath cannot start with a slash.
 * - Trailing slash could be omitted. e.g.) 'pages' and 'pages/' show the same CollectionPath.
 *```
 *
 * @public
 */
export type CollectionPath = string;

/**
 * Options for Collection constructor
 *
 * @public
 */
export type CollectionOptions = {
  namePrefix?: string;
};

/**
 * Options for put APIs (put, update, insert, putFatDoc, updateFatDoc, and insertFatDoc)
 *
 * @remarks
 * - commitMessage: Git commit message. Default is '\<insert or update\>: path/to/the/file(\<fileOid\>)'.
 *
 * - insertOrUpdate: Change behavior of put and putFatDoc. Don't use this option. Use insert() or update() instead.
 *
 * - taskId: taskId is used in TaskQueue to distinguish CRUD and synchronization tasks. It is usually generated automatically. Set it if you would like to monitor this put task explicitly.
 *
 * - enqueueCallback: A callback function called just after this put task is enqueued to TaskQueue.
 *
 * @public
 */
export type PutOptions = {
  commitMessage?: string;
  insertOrUpdate?: 'insert' | 'update';
  taskId?: string;
  enqueueCallback?: (taskMetadata: TaskMetadata) => void;
};

/**
 * Internal options for get APIs
 *
 * @remarks
 * backNumber and oid are mutually exclusive options. oid has priority.
 *
 * @internal
 */
export type GetInternalOptions = {
  backNumber?: number;
  oid?: string;
  withMetadata?: boolean;
};

/**
 * Options for get APIs (get, getFatDoc, getBackNumber, getFatDocBackNumber, getHistory, getFatDocHistory)
 *
 * @remarks
 * - forceDocType: Force return type.
 *
 * - getDocByOid does not have this option.
 *
 * @public
 */
export type GetOptions = {
  forceDocType?: DocType;
};

/**
 * Options for getHistory and getFatDocHistory
 *
 * @remarks
 * - filter: Tha array of revisions is filtered by matching multiple HistoryFilters in OR condition.
 *
 * @public
 */
export type HistoryOptions = {
  filter?: HistoryFilter[];
};

/**
 * HistoryFilter
 *
 * @public
 */
export type HistoryFilter = {
  author?: {
    name?: string;
    email?: string;
  };
  committer?: {
    name?: string;
    email?: string;
  };
};

/**
 * Options for delete
 *
 * @remarks
 * - commitMessage:  Git commit message. Default is 'delete: path/to/the/file(\<fileOid\>)'.
 *
 * - taskId: taskId is used in TaskQueue to distinguish CRUD and synchronization tasks. It is usually generated automatically. Set it if you would like to monitor this delete task explicitly.
 *
 * - enqueueCallback: A callback function called just after this delete task is enqueued to TaskQueue.
 *
 * @public
 */
export type DeleteOptions = {
  commitMessage?: string;
  taskId?: string;
  enqueueCallback?: (taskMetadata: TaskMetadata) => void;
};

/**
 * Options for find and findFatDoc
 *
 * @remarks
 * - descending: Sort _id or name by descendant. Default is false (ascendant).
 *
 * - recursive: Get documents recursively from all sub directories. Default is true.
 *
 * - prefix: Get documents whose _ids or names start with the prefix.
 *
 * - forceDocType: Force return DocType.
 *
 * @public
 */
export type FindOptions = {
  descending?: boolean;
  recursive?: boolean;
  prefix?: string;
  forceDocType?: DocType;
};

/**
 * Result of put APIs (put, update, insert, putFatDoc, updateFatDoc, and insertFatDoc)
 *
 * @remarks
 * - _id: _id of a JSON document. This is a file name without .json extension. PutResult does not have _id if a document is not {@link JsonDoc} type.
 *
 * - name: A file name in Git. e.g.) "foo.json", "bar/baz.md"
 *
 * - fileOid: SHA-1 hash of Git object (40 characters).
 *
 * - commit: Git commit object of this put operation.
 *
 * @public
 */
export type PutResult = PutResultJsonDoc | PutResultText | PutResultBinary;

/**
 * @public
 */
export type PutResultJsonDoc = {
  _id: string;
  name: string;
  fileOid: string;
  commit: NormalizedCommit;
  type: 'json';
};

/**
 * @public
 */
export type PutResultText = {
  name: string;
  fileOid: string;
  commit: NormalizedCommit;
  type: 'text';
};

/**
 * @public
 */
export type PutResultBinary = {
  name: string;
  fileOid: string;
  commit: NormalizedCommit;
  type: 'binary';
};

/**
 * Result of delete()
 *
 * @remarks
 * - _id: _id of a JSON document. This is a file name without .json extension. PutResult does not have _id if a document is not {@link JsonDoc} type.
 *
 * - name: A file name in Git. e.g.) "foo.json", "bar/baz.md"
 *
 * - fileOid: SHA-1 hash of Git object (40 characters)
 *
 * - commit: Git commit object of this put operation.
 *
 * @public
 */
export type DeleteResult = DeleteResultJsonDoc | DeleteResultText | DeleteResultBinary;

/**
 * @public
 */
export type DeleteResultJsonDoc = {
  _id: string;
  name: string;
  fileOid: string;
  commit: NormalizedCommit;
  type: 'json';
};

/**
 * @public
 */
export type DeleteResultText = {
  name: string;
  fileOid: string;
  commit: NormalizedCommit;
  type: 'text';
};

/**
 * @public
 */
export type DeleteResultBinary = {
  name: string;
  fileOid: string;
  commit: NormalizedCommit;
  type: 'binary';
};

/**
 * How to close database
 *
 * @remarks
 * - force: Clear queued tasks immediately.
 *
 * - timeout: Clear queued tasks after timeout(msec). Default is 10000.
 *
 * @public
 */
export type DatabaseCloseOption = {
  force?: boolean;
  timeout?: number;
};

/**
 * Synchronization direction
 *
 * @remarks
 *
 * - pull: Only download from remote to local (currently not implemented)
 *
 * - push: Only upload from local to remote
 *
 * - both: Both download and upload between remote and local
 *
 * @public
 */
export type SyncDirection = 'pull' | 'push' | 'both';

/**
 * Connection settings for GitHub
 *
 * @remarks
 * - personalAccessToken: See https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token
 *
 * - private: Whether automatically created repository is private or not. Default is true.
 *
 * @public
 */
export type ConnectionSettingsGitHub = {
  type: 'github';
  personalAccessToken?: string;
  private?: boolean;
};

/**
 * Connection settings for SSH
 *
 * @public
 */
export type ConnectionSettingsSSH = {
  type: 'ssh';
  privateKeyPath: string;
  publicKeyPath: string;
  passPhrase?: string;
};

/**
 * Connection settings do not exist.
 *
 * @public
 */
export type ConnectionSettingsNone = {
  type: 'none';
};

/**
 * Connection settings for RemoteOptions
 *
 * @public
 */
export type ConnectionSettings =
  | ConnectionSettingsNone
  | ConnectionSettingsGitHub
  | ConnectionSettingsSSH;

/**
 * Behavior when combine inconsistent DBs
 *
 * Default is 'combine-head-with-theirs'.
 *
 * @public
 */
export type CombineDbStrategies =
  | 'throw-error'
  | 'combine-head-with-ours'
  | 'combine-head-with-theirs'
  | 'combine-history-with-ours'
  | 'combine-history-with-theirs'
  | 'replace-with-ours'
  | 'replace-with-theirs';

/**
 * Strategy for resolving conflicts
 *
 * @remarks
 * 'ours' and 'theirs' are borrowed terms from Git (https://git-scm.com/docs/merge-strategies)
 *
 * - 'ours-diff': (Default) Accept ours per JSON property. Properties in both local and remote documents are compared and merged. When a remote change is conflicted with a local change, the local change is accepted. If a document is not JSON, 'ours' strategy is applied.
 *
 * - 'theirs-diff': Accept theirs per JSON property. Properties in both local and remote documents are compared and merged. When a remote change is conflicted with a local change, the remote change is accepted. If a document is not JSON, 'theirs' strategy is applied.
 *
 * - 'ours': Accept ours per document. Documents in both local and remote commits are compared and merged per document. When a remote change is conflicted with a local change, the local change is accepted.
 *
 * - 'theirs': Accept theirs per document. Documents in both local and remote commits are compared and merged per document. When a remote change is conflicted with a local change, the remote change is accepted.
 *
 * - Compare function that returns one of the strategies ('ours-diff', 'theirs-diff', 'ours', and 'theirs') can be given. Each parameter will be undefined when a document is removed or does not exist.
 *
 * @public
 */
export type ConflictResolutionStrategies =
  | ConflictResolutionStrategyLabels
  | ((ours?: FatDoc, theirs?: FatDoc) => ConflictResolutionStrategyLabels);

/**
 * @public
 */
export type ConflictResolutionStrategyLabels =
  | 'ours-diff'
  | 'theirs-diff'
  | 'ours'
  | 'theirs';

/**
 * Write operation in resolving conflicts
 *
 * @remarks
 * - insert: A document in either ours or theirs is newly inserted.
 *
 * - update: A document is updated to either ours document or theirs document.
 *
 * - delete: A document is deleted.
 *
 * - insert-merge: A merged document of ours and theirs is newly inserted.
 *
 * - update-merge: A document is updated to a merged document of ours and theirs.
 *
 * @public
 */
export type WriteOperation =
  | 'insert'
  | 'update'
  | 'delete'
  | 'insert-merge'
  | 'update-merge';

/**
 * Accepted conflict
 *
 * @remarks
 * - doc: Conflicted document (metadata only)
 *
 * - strategy: Applied strategy on the target
 *
 * - operation: Applied write operation on the target
 *
 * @public
 */
export type AcceptedConflict = {
  fatDoc: FatDoc;
  strategy: ConflictResolutionStrategyLabels;
  operation: WriteOperation;
};

/**
 * Options for Sync class
 *
 * @remarks
 * (network)
 *
 * - remoteUrl: Connection destination
 *
 * - syncDirection: Default is 'both'.
 *
 * - connection: Authentication and other settings on remote site
 *
 * (automation)
 *
 * - live: Synchronization repeats automatically if true.
 *
 * - interval: Synchronization interval (milliseconds)
 *
 * - retry: Number of network retries. Retry does not occurred if retry is 0.
 *
 * - retryInterval: Retry interval  (milliseconds)
 *
 * (merge)
 *
 * - conflictResolutionStrategy: Default is 'ours-diff'.
 *
 * - combineDbStrategy: Default is 'combine-head-with-theirs'.
 *
 * (result)
 *
 * - includeCommits: Whether SyncResult includes 'commits' property or not. Default is false.
 *
 * @public
 */
export type RemoteOptions = {
  /* network */
  remoteUrl?: string;
  syncDirection?: SyncDirection;
  connection?: ConnectionSettings;

  /* automation */
  live?: boolean;
  interval?: number; // msec
  retry?: number;
  retryInterval?: number; // msec

  /* merge */
  conflictResolutionStrategy?: ConflictResolutionStrategies;
  combineDbStrategy?: CombineDbStrategies;

  /* result */
  includeCommits?: boolean;
};

/**
 * Union type of properties of TaskStatistics
 *
 * @public
 */
export type TaskLabel = 'put' | 'insert' | 'update' | 'delete' | 'sync' | 'push';

/**
 * Task statistics after opening database
 *
 * @remarks
 * The statistics is on memory and not persistent. It is cleared by GitDocumentDB#close().
 *
 * @public
 */
export type TaskStatistics = {
  put: number;
  insert: number;
  update: number;
  delete: number;
  push: number;
  sync: number;
  cancel: number;
};

/**
 * Metadata of a task
 *
 * @public
 */
export type TaskMetadata = {
  label: TaskLabel;
  taskId: string;
  shortId?: string;
  shortName?: string;
  collectionPath?: string;
  enqueueTime?: string;
};

/**
 * Task in TaskQueue
 *
 * @internal
 */
export type Task = TaskMetadata & {
  func: (
    beforeResolve: () => void,
    beforeReject: () => void,
    taskMetadata: TaskMetadata
  ) => Promise<void>;
  cancel: () => void;
  enqueueCallback?: (taskMetadata: TaskMetadata) => void;
};

/**
 * Inserted file in merge operation
 *
 * @public
 */
export type ChangedFileInsert = {
  operation: 'insert';
  new: FatDoc;
};

/**
 * Updated file in merge operation
 *
 * @public
 */
export type ChangedFileUpdate = {
  operation: 'update';
  old: FatDoc;
  new: FatDoc;
};

/**
 * Deleted file in merge operation
 *
 * @public
 */
export type ChangedFileDelete = {
  operation: 'delete';
  old: FatDoc;
};

/**
 * Union type of changed files in merge operation
 *
 * @public
 */
export type ChangedFile = ChangedFileInsert | ChangedFileUpdate | ChangedFileDelete;

/**
 * Duplicated file in combine operation
 *
 * @public
 */
export type DuplicatedFile = {
  original: DocMetadata;
  duplicate: DocMetadata;
};

/**
 * Normalized Commit
 *
 * @public
 */
export type NormalizedCommit = {
  oid: string;
  message: string;
  parent: string[];
  author: {
    name: string;
    email: string;
    timestamp: number; // Unix timestamp (milliseconds)
  };
  committer: {
    name: string;
    email: string;
    timestamp: number; // Unix timestamp (milliseconds)
  };
  gpgsig?: string;
};

/**
 * No action occurs in synchronization.
 *
 * @public
 */
export interface SyncResultNop {
  action: 'nop';
}

/**
 * Push action occurred in synchronization.
 *
 * @remarks
 * - commits are sorted from old to new.
 *
 * - commits.remote: List of commits which has been pushed to remote
 *
 * @public
 */
export interface SyncResultPush {
  action: 'push';
  changes: {
    remote: ChangedFile[];
  };
  commits?: {
    remote: NormalizedCommit[]; // The list is sorted from old to new.
  };
}

/**
 * Fast-forward action occurred in synchronization.
 *
 * @remarks
 * - commits are sorted from old to new.
 *
 * - commits.local: List of commits which has been pulled to local
 *
 * @public
 */
export interface SyncResultFastForwardMerge {
  action: 'fast-forward merge';
  changes: {
    local: ChangedFile[];
  };
  commits?: {
    local: NormalizedCommit[];
  };
}

/**
 * Merge and push actions occurred and push failed in synchronization.
 *
 * @remarks
 * - commits are sorted from old to new.
 *
 * - commits.local: List of commits which has been pulled to local
 *
 * @public
 */
export interface SyncResultMergeAndPushError {
  action: 'merge and push error';
  changes: {
    local: ChangedFile[];
  };
  commits?: {
    local: NormalizedCommit[];
  };
  error: Error;
}

/**
 * Merge and push actions occurred in synchronization.
 *
 * @remarks
 * - commits are sorted from old to new.
 *
 * - commits.local: List of commits which has been pulled to local
 *
 * - commits.remote: List of commits which has been pushed to remote
 *
 * @public
 */
export interface SyncResultMergeAndPush {
  action: 'merge and push';
  changes: {
    local: ChangedFile[];
    remote: ChangedFile[];
  };
  commits?: {
    local: NormalizedCommit[];
    remote: NormalizedCommit[]; // The list is sorted from old to new.
  };
}

/**
 * Resolve conflicts and push actions occurred and push failed in synchronization.
 *
 * @remarks
 * - commits are sorted from old to new.
 *
 * - commits.local: List of commits which has been pulled to local
 *
 * @public
 */
export interface SyncResultResolveConflictsAndPushError {
  action: 'resolve conflicts and push error';
  changes: {
    local: ChangedFile[];
  };
  conflicts: AcceptedConflict[]; // sorted by filename
  commits?: {
    local: NormalizedCommit[];
  };
  error: Error;
}

/**
 * Resolve conflicts and push actions occurred in synchronization.
 *
 * @remarks
 * - commits are sorted from old to new.
 *
 * - commits.local: List of commits which has been pulled to local
 *
 * - commits.remote: List of commits which has been pushed to remote
 *
 * @public
 */
export interface SyncResultResolveConflictsAndPush {
  action: 'resolve conflicts and push';
  changes: {
    local: ChangedFile[];
    remote: ChangedFile[];
  };
  conflicts: AcceptedConflict[]; // sorted by filename
  commits?: {
    local: NormalizedCommit[];
    remote: NormalizedCommit[];
  };
}

/**
 * Combine action occurred in synchronization.
 *
 * @remarks
 * Push action does not occur after combine action.
 *
 * @public
 */
export interface SyncResultCombineDatabase {
  action: 'combine database';
  duplicates: DuplicatedFile[];
}

/**
 * Synchronization was canceled.
 *
 * @public
 */
export interface SyncResultCancel {
  action: 'canceled';
}

/**
 * Union type of results from trySync and tryPush
 *
 * @public
 */
export type SyncResult =
  | SyncResultNop
  | SyncResultPush
  | SyncResultFastForwardMerge
  | SyncResultMergeAndPushError
  | SyncResultMergeAndPush
  | SyncResultResolveConflictsAndPushError
  | SyncResultResolveConflictsAndPush
  | SyncResultCombineDatabase
  | SyncResultCancel;

/**
 * Union type of SyncEvents
 *
 * @public
 */
export type SyncEvent =
  | 'change'
  | 'localChange'
  | 'remoteChange'
  | 'combine'
  | 'pause'
  | 'resume'
  | 'start'
  | 'complete'
  | 'error';

/**
 * Callback of change event
 *
 * @public
 */
export type SyncChangeCallback = (
  syncResult: SyncResult,
  taskMetadata: TaskMetadata
) => void;

/**
 * Callback of localChange event
 *
 * @public
 */
export type SyncLocalChangeCallback = (
  changedFiles: ChangedFile[],
  taskMetadata: TaskMetadata
) => void;

/**
 * Callback of remoteChange event
 *
 * @public
 */
export type SyncRemoteChangeCallback = (
  changedFiles: ChangedFile[],
  taskMetadata: TaskMetadata
) => void;

/**
 * Callback of combine event
 *
 * @public
 */
export type SyncCombineDatabaseCallback = (duplicates: DuplicatedFile[]) => void;

/**
 * Callback of pause event
 *
 * @public
 */
export type SyncPauseCallback = () => void;

/**
 * Callback of resume event
 *
 * @public
 */
export type SyncResumeCallback = () => void;

/**
 * Callback of start event
 *
 * @public
 */
export type SyncStartCallback = (
  taskMetadata: TaskMetadata,
  currentRetries: number
) => void;

/**
 * Callback of compete event
 *
 * @public
 */
export type SyncCompleteCallback = (taskMetadata: TaskMetadata) => void;

/**
 * Callback of error event
 *
 * @public
 */
export type SyncErrorCallback = (error: Error, taskMetadata: TaskMetadata) => void;

/**
 * Union type of SyncEventCallbacks
 *
 * @public
 */
export type SyncCallback =
  | SyncChangeCallback
  | SyncLocalChangeCallback
  | SyncRemoteChangeCallback
  | SyncCombineDatabaseCallback
  | SyncPauseCallback
  | SyncResumeCallback
  | SyncStartCallback
  | SyncCompleteCallback
  | SyncErrorCallback;

/**
 * Interface of JsonPatch
 *
 * @internal
 */
export interface IJsonPatch {
  patch(
    docOurs: JsonDoc,
    docTheirs: JsonDoc,
    diffOurs: { [key: string]: any },
    diffTheirs?: { [key: string]: any } | undefined,
    strategy?: ConflictResolutionStrategyLabels
  ): JsonDoc;
}
