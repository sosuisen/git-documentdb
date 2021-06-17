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
 * * localDir: Local directory path that stores repositories of GitDocumentDB.
 *   - Default is './gitddb'.
 *   - A directory name allows Unicode characters excluding OS reserved filenames and following characters: < > : " | ? * \0.
 *   - A colon : is generally not allowed, but a drive letter followed by a colon is allowed. e.g.) C: D:
 *   - A directory name cannot end with a period or a white space, but the current directory . and the parent directory .. are allowed.
 *   - A trailing slash / could be omitted.
 *
 * * dbName: Name of a git repository
 *   - dbName allows Unicode characters excluding OS reserved filenames and following characters: < > : " ¥ / \ | ? * \0.
 *   - dbName cannot end with a period or a white space.
 *   - dbName does not allow '.' and '..'.
 *
 * * logLevel: Default is 'info'.
 * ```
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
 * createIfNotExists: Default is true.
 */
export type OpenOptions = {
  createIfNotExists?: boolean;
};

/**
 * Schema
 *
 * @remarks
 *  - plainTextProperties: Only property whose key matches plainTextProperties uses text diff algorithm: google-diff-match-patch.
 *
 * e.g.
 * { a: { b: true }, c: true } matches 'b' (whose ancestor is only 'a') and 'c'.
 * { a: { _all: true } } matches all child properties of 'a'.
 * { a: { _regex: /abc/ } } matches child properties of 'a' which match /abc/.
 */
export type Schema = {
  json: JsonDiffOptions;
};
/**
 * JsonDiffOptions
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
 * - isCreatedByGitddb: Whether a repository is created by GitDocumentDB or other means.
 *
 * - isValidVersion: Whether a repository version equals to the current databaseVersion of GitDocumentDB.
 *   The version is described in .git/description.
 *
 */
export type DatabaseOpenResult = DatabaseInfo & {
  isNew: boolean;
  isCreatedByGitddb: boolean;
  isValidVersion: boolean;
};

/**
 * Database info
 *
 * @remarks
 * - dbId: ULID of the database. (See https://github.com/ulid/spec for ULID)
 *
 * - creator: Creator of the database. Default is 'GitDocumentDB'.
 *
 * - version: Version of the GitDocumentDB specification.
 */
export type DatabaseInfo = {
  dbId: string;
  creator: string;
  version: string;
};

/**
 * Task Statistics
 */
export type TaskStatistics = {
  // A property name equals a member of TaskLabel type
  put: number;
  insert: number;
  update: number;
  delete: number;
  push: number;
  sync: number;
  cancel: number;
};

/**
 * Type for a JSON document that is stored in a database
 *
 * @remarks A document must be a JSON Object that matches the following conditions:
 *```
 * * It must have an '_id' key that shows the unique identifier of a document
 *   - _id allows Unicode characters excluding OS reserved filenames and following characters: \< \> : " | ? * \0
 *   - **It is recommended to use ASCII characters and case-insensitive names for cross-platform.**
 *   - _id cannot start or end with a slash.
 *   - _id can include paths separated by slashes.
 *   - A directory name in paths cannot end with a period or a white space.
 *   - A directory name in paths does not allow '.' and '..'.
 *```
 * @example
 * ```
 * {
 *   _id: 'nara/nara_park',
 *   flower: 'double cherry blossoms'
 * }
 * ```
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
 */
export type DocType = 'json' | 'text' | 'binary';

/**
 * Doc
 */
export type Doc = JsonDoc | string | Uint8Array;

/**
 * Type for a document with a metadata
 */
export type FatDoc = FatJsonDoc | FatTextDoc | FatBinaryDoc;
export type FatJsonDoc = JsonDocMetadata & {
  doc: JsonDoc;
};
export type FatTextDoc = TextDocMetadata & {
  doc: string;
};
export type FatBinaryDoc = BinaryDocMetadata & {
  doc: Uint8Array;
};

/**
 * Document metadata
 *
 * @remarks
 * - _id: _id of a document.
 *
 * - fileOid: SHA-1 hash of Git object (40 characters)
 *
 * - type: DocMetadataType
 */
export type DocMetadata = JsonDocMetadata | TextDocMetadata | BinaryDocMetadata;
export type JsonDocMetadata = {
  _id: string;
  fileOid: string;
  type: 'json';
};
export type TextDocMetadata = {
  _id: string;
  fileOid: string;
  type: 'text';
};
export type BinaryDocMetadata = {
  _id: string;
  fileOid: string;
  type: 'binary';
};

/**
 * CollectionPath
 *
 * @remarks CollectionPath must be paths that match the following conditions:
 *```
 * - CollectionPath can include paths separated by slashes.
 * - A directory name in paths allows Unicode characters excluding OS reserved filenames and following characters: \< \> : " | ? * \\0
 * - **It is recommended to use ASCII characters and case-insensitive names for cross-platform.**
 * - A directory name in paths cannot end with a period or a white space.
 * - A directory name in paths does not allow '.' and '..'.
 * - CollectionPath cannot start with a slash.
 * - Trailing slash could be omitted. e.g.) 'pages' and 'pages/' show the same CollectionPath.
 *```
 */
export type CollectionPath = string;

/**
 * Options for put()
 *
 * @remarks
 * - commitMessage: Internal commit message. default is 'put: path/to/the/file'
 *
 * - insertOrUpdate: Change behavior of put(). Don't use it. Use insert() or update() instead.
 */
export type PutOptions = {
  commitMessage?: string;
  insertOrUpdate?: 'insert' | 'update';
  taskId?: string;
  enqueueCallback?: (taskMetadata: TaskMetadata) => void;
};

/**
 * Internal options for get-like methods.
 *
 * @remarks
 * backNumber and oid are mutually exclusive options. oid has priority.
 * @internal
 */
export type GetInternalOptions = {
  backNumber?: number;
  oid?: string;
  withMetadata?: boolean;
};

/**
 * GetOptions
 *
 * @remarks
 * - forceDocType: Force return type.
 */
export type GetOptions = {
  forceDocType?: DocType;
};

/**
 * HistoryOptions
 *
 * @remarks
 * - filter: Tha array of revisions is filtered by multiple HistoryFilters in OR condition.
 */
export type HistoryOptions = {
  filter?: HistoryFilter[];
};

/**
 * HistoryFilter
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
 * Options for delete()
 *
 * @remarks
 * - commitMessage: internal commit message. default is 'delete: path/to/the/file'
 */
export type DeleteOptions = {
  commitMessage?: string;
  taskId?: string;
  enqueueCallback?: (taskMetadata: TaskMetadata) => void;
};

/**
 * Options for find()
 *
 * @remarks
 * - descending: Sort _id by descendant. Default is false (ascendant).
 *
 * - recursive: Get documents recursively from all sub directories. Default is true.
 *
 * - prefix: Get documents whose _ids start with the prefix.
 *
 * - forceDocType: Force return type.
 */
export type FindOptions = {
  descending?: boolean;
  recursive?: boolean;
  prefix?: string;
  forceDocType?: DocType;
};

/**
 * Result of put()
 *
 * @remarks
 * - _id: _id of a document.
 *
 * - fileOid: SHA-1 hash of Git object (40 characters)
 *
 * - commitOid: SHA-1 hash of Git commit (40 characters)
 *
 */
export type PutResult = {
  _id: string;
  fileOid: string;
  commitOid: string;
  commitMessage: string;
};

/**
 * Result of remove()
 *
 * @remarks
 * - _id: _id of a document.
 *
 * - fileOid: SHA-1 hash of Git blob (40 characters)
 *
 * - commitOid: SHA-1 hash of Git commit (40 characters)
 *
 */
export type DeleteResult = {
  _id: string;
  fileOid: string;
  commitOid: string;
  commitMessage: string;
};

/**
 * How to close database
 *
 * @remarks
 * - force: Clear queued tasks immediately.
 *
 * - timeout: Clear queued tasks after timeout(msec). Default is 10000.
 *
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
 */
export type SyncDirection = 'pull' | 'push' | 'both';

/**
 * Connection settings for GitHub
 *
 * @remarks
 * - personalAccessToken: See https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token
 *
 * - private: Whether automatically created repository is private or not. Default is true.
 */
export type ConnectionSettingsGitHub = {
  type: 'github';
  personalAccessToken?: string;
  private?: boolean;
};

/**
 * Connection settings for SSH
 */
export type ConnectionSettingsSSH = {
  type: 'ssh';
  privateKeyPath: string;
  publicKeyPath: string;
  passPhrase?: string;
};

/**
 * Connection settings do not exist.
 */
export type ConnectionSettingsNone = {
  type: 'none';
};

/**
 * Connection settings for RemoteOptions
 */
export type ConnectionSettings =
  | ConnectionSettingsNone
  | ConnectionSettingsGitHub
  | ConnectionSettingsSSH;

/**
 * Behavior when combine inconsistent DBs
 *
 * Default is 'combine-head-with-theirs'.
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
 * - 'ours-diff': (Default) Accept ours per property. Properties in both local and remote documents are compared and merged. When a remote change is conflicted with a local change, the local change is accepted.
 *
 * - 'theirs-diff': Accept theirs per property. Properties in both local and remote documents are compared and merged. When a remote change is conflicted with a local change, the remote change is accepted.
 *
 * - 'ours': Accept ours per document. Documents in both local and remote commits are compared and merged per document. When a remote change is conflicted with a local change, the local change is accepted.
 *
 * - 'theirs': Accept theirs per document. Documents in both local and remote commits are compared and merged per document. When a remote change is conflicted with a local change, the remote change is accepted.
 *
 * - Compare function that returns one of the strategies ('ours-diff', 'theirs-diff', 'ours', and 'theirs') can be given. Each argument will be undefined when a document is removed.
 */
export type ConflictResolutionStrategies =
  | ConflictResolutionStrategyLabels
  | ((ours?: JsonDoc, theirs?: JsonDoc) => ConflictResolutionStrategyLabels);

export type ConflictResolutionStrategyLabels =
  | 'ours-diff'
  | 'theirs-diff'
  | 'ours'
  | 'theirs';

/**
 * Write operation
 */
export type WriteOperation =
  | 'insert'
  | 'update'
  | 'delete'
  | 'insert-merge'
  | 'update-merge';

/**
 * Accepted Conflict
 *
 * @remarks
 * - target: Conflicted target
 *
 * - strategy: Applied strategy
 *
 * - operation: Applied operation on an applied strategy side (ours or theirs)
 */
export type AcceptedConflict = {
  target: DocMetadata;
  strategy: ConflictResolutionStrategyLabels;
  operation: WriteOperation;
};

/**
 * Options for Sync class
 *
 * @remarks
 * [network]
 *
 * - remoteUrl: Connection destination
 *
 * - syncDirection: Default is 'both'.
 *
 * - connection: Authentication and other settings on remote site
 *
 * [automation]
 *
 * - live: Synchronization repeats automatically if true.
 *
 * - interval: Synchronization interval (milliseconds)
 *
 * - retry: Number of network retries
 *
 * - retryInterval: Retry interval  (milliseconds)
 *
 * [merge]
 *
 * - conflictResolutionStrategy: Default is 'ours'.
 *
 * - combineDbStrategy:
 *
 * [result]
 *
 * - includeCommits: Whether SyncResult includes 'commits' property or not. Default is false.
 */
export type RemoteOptions = {
  /* network */
  remoteUrl?: string;
  syncDirection?: SyncDirection;
  connection?: ConnectionSettings;

  /* automation */
  live?: boolean;
  interval?: number; // msec
  retry?: number; // Retry does not occurred if retry is 0.
  retryInterval?: number; // msec

  /* merge */
  conflictResolutionStrategy?: ConflictResolutionStrategies;
  combineDbStrategy?: CombineDbStrategies;

  /* results */
  includeCommits?: boolean;
};

/**
 * TaskEvent
 */
export type TaskEvent = 'enqueue';

export type TaskEnqueueCallback = (taskMetadata: TaskMetadata) => void;
export type TaskCallback = TaskEnqueueCallback;

/**
 * TaskLabel
 * DatabaseStatistics.taskCount must have the same members.
 */
export type TaskLabel = 'put' | 'insert' | 'update' | 'delete' | 'sync' | 'push';

/**
 * TaskMetadata
 */
export type TaskMetadata = {
  label: TaskLabel;
  taskId: string;
  targetId?: string;
  enqueueTime?: string;
};

/**
 * Task for taskQueue
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
 * SyncEvent
 */
export type SyncEvent =
  | 'change'
  | 'localChange'
  | 'remoteChange'
  | 'combine'
  | 'paused'
  | 'active'
  | 'start'
  | 'complete'
  | 'error';

export type ChangedFileInsert = {
  operation: 'insert';
  new: FatDoc;
};

export type ChangedFileUpdate = {
  operation: 'update';
  old: FatDoc;
  new: FatDoc;
};

export type ChangedFileDelete = {
  operation: 'delete';
  old: FatDoc;
};

/**
 * Changed file in merge operation
 */
export type ChangedFile = ChangedFileInsert | ChangedFileUpdate | ChangedFileDelete;

/**
 * Duplicated file in combine operation
 */
export type DuplicatedFile = {
  original: DocMetadata;
  duplicate: DocMetadata;
};

/**
 * Normalized Commit
 */
export type NormalizedCommit = {
  oid: string;
  message: string;
  parent: string[];
  author: {
    name: string;
    email: string;
    timestamp: Date;
  };
  committer: {
    name: string;
    email: string;
    timestamp: Date;
  };
  gpgsig?: string;
};

/**
 * Result from syncWorker()
 *
 * @remarks
 * - commits are sorted from old to new.
 *
 * - commits.local: List of commits which has been pulled to local
 *
 * - commits.remote: List of commits which has been pushed to remote
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

export interface SyncResultNop {
  action: 'nop';
}
export interface SyncResultPush {
  action: 'push';
  changes: {
    remote: ChangedFile[];
  };
  commits?: {
    remote: NormalizedCommit[]; // The list is sorted from old to new.
  };
}
export interface SyncResultFastForwardMerge {
  action: 'fast-forward merge';
  changes: {
    local: ChangedFile[];
  };
  commits?: {
    local: NormalizedCommit[];
  };
}
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
 * Combine databases (no push)
 */
export interface SyncResultCombineDatabase {
  action: 'combine database';
  duplicates: DuplicatedFile[];
}
export interface SyncResultCancel {
  action: 'canceled';
}

/**
 * SyncEventCallbacks
 */
export type SyncChangeCallback = (
  syncResult: SyncResult,
  taskMetadata: TaskMetadata
) => void;
export type SyncLocalChangeCallback = (
  changedFiles: ChangedFile[],
  taskMetadata: TaskMetadata
) => void;
export type SyncRemoteChangeCallback = (
  changedFiles: ChangedFile[],
  taskMetadata: TaskMetadata
) => void;
export type SyncCombineDatabaseCallback = (duplicates: DuplicatedFile[]) => void;
export type SyncPausedCallback = () => void;
export type SyncActiveCallback = () => void;
export type SyncStartCallback = (
  taskMetadata: TaskMetadata,
  currentRetries: number
) => void;
export type SyncCompleteCallback = (taskMetadata: TaskMetadata) => void;
export type SyncErrorCallback = (error: Error, taskMetadata: TaskMetadata) => void;
export type SyncCallback =
  | SyncChangeCallback
  | SyncLocalChangeCallback
  | SyncRemoteChangeCallback
  | SyncCombineDatabaseCallback
  | SyncPausedCallback
  | SyncActiveCallback
  | SyncStartCallback
  | SyncCompleteCallback
  | SyncErrorCallback;

export interface IJsonPatch {
  patch(
    docOurs: JsonDoc,
    docTheirs: JsonDoc,
    diffOurs: { [key: string]: any },
    diffTheirs?: { [key: string]: any } | undefined,
    strategy?: ConflictResolutionStrategyLabels
  ): JsonDoc;
}
