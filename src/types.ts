/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import { TLogLevelName } from 'tslog';

/**
 * Database Option
 *
 * @remarks
 * local_dir and db_name are OS specific options. <b>It is recommended to use ASCII characters and case-insensitive names for cross-platform.</b>
 *
 * ```
 * * local_dir: Local directory path that stores repositories of GitDocumentDB.
 *   - Default is './gitddb'.
 *   - A directory name allows Unicode characters excluding OS reserved filenames and following characters: < > : " | ? * \0.
 *   - A colon : is generally not allowed, but a drive letter followed by a colon is allowed. e.g.) C: D:
 *   - A directory name cannot end with a period or a white space, but the current directory . and the parent directory .. are allowed.
 *   - A trailing slash / could be omitted.
 *
 * * db_name: Name of a git repository
 *   - dbName allows Unicode characters excluding OS reserved filenames and following characters: < > : " ¥ / \ | ? * \0.
 *   - dbName cannot end with a period or a white space.
 *   - dbName does not allow '.' and '..'.
 *
 * * log_level: Default is 'info'.
 * ```
 */
export type DatabaseOption = {
  local_dir?: string;
  db_name: string;
  log_level?: TLogLevelName;
  schema?: Schema;
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
 */
export type DatabaseOpenResult = (DatabaseInfo & DatabaseInfoSuccess) | DatabaseInfoError;

/**
 * Database info
 *
 * @remarks
 * - db_id: ULID of the database. (See https://github.com/ulid/spec for ULID)
 *
 * - creator: Creator of the database. Default is 'GitDocumentDB'.
 *
 * - version: Version of the GitDocumentDB specification.
 */
export type DatabaseInfo = {
  db_id: string;
  creator: string;
  version: string;
};

/**
 * Database information (success)
 *
 * @remarks
 * - ok: Boolean which shows if a database is successfully opened.
 *
 * - is_new: Whether a repository is newly created or existing.
 *
 * - is_clone: Whether a repository is cloned from a remote repository or not.
 *
 * - is_created_by_gitddb: Whether a repository is created by GitDocumentDB or other means.
 *
 * - is_valid_version: Whether a repository version equals to the current databaseVersion of GitDocumentDB.
 *   The version is described in .git/description.
 *
 */
export type DatabaseInfoSuccess = {
  ok: true;
  is_new: boolean;
  is_clone: boolean;
  is_created_by_gitddb: boolean;
  is_valid_version: boolean;
};
/**
 * Database information (failure)
 *
 * @remarks
 * - ok: Boolean which shows if a database is successfully opened.
 *
 * - error: Error object is assigned if a database cannot be opened.
 *
 */
export type DatabaseInfoError = {
  ok: false;
  error: Error;
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
 * * It must have an '_id' key that shows id of a document
 *   - _id allows Unicode characters excluding OS reserved filenames and following characters: \< \> : " | ? * \0
 *   - **It is recommended to use ASCII characters and case-insensitive names for cross-platform.**
 *   - _id cannot start with a slash and an underscore _.
 *   - _id cannot end with a slash.
 *   - A directory name cannot end with a period or a white space.
 *   - A directory name does not allow '.' and '..'.
 *
 * * Property name of a document cannot start with an underscore except _id and _deleted.
 *```
 * @example
 * ```
 * {
 *   _id: 'profile01',
 *   location: 'Sapporo',
 *   age: '16'
 * }
 * ```
 */
export type JsonDoc = {
  [key: string]: any;
};

/**
 * CollectionPath
 *
 * - A directory name allows Unicode characters excluding OS reserved filenames and following characters: \< \> : " | ? * \\0
 *
 * - **It is recommended to use ASCII characters and case-insensitive names for cross-platform.**
 *
 * - A directory name cannot end with a period or a white space.
 *
 * - A directory name does not allow '.' and '..'.
 *
 * - collectionPath cannot start with a slash.
 *
 * - Trailing slash could be omitted. e.g.) 'pages' and 'pages/' show the same collection.
 *
 */
export type CollectionPath = string;

/**
 * Options for put()
 *
 * @remarks
 * - commit_message: Internal commit message. default is 'put: path/to/the/file'
 *
 * - insertOrUpdate: Change behavior of put(). Don't use it. Use insert() or update() instead.
 */
export type PutOptions = {
  commit_message?: string;
  insertOrUpdate?: 'insert' | 'update';
  taskId?: string;
  enqueueCallback?: (taskMetadata: TaskMetadata) => void;
};

/**
 * Options for delete()
 *
 * @remarks
 * - commit_message: internal commit message. default is 'delete: path/to/the/file'
 */
export type DeleteOptions = {
  commit_message?: string;
  taskId?: string;
  enqueueCallback?: (taskMetadata: TaskMetadata) => void;
};

/**
 * Options for allDocs()
 *
 * @remarks
 * - include_docs: Include JSON document in each row as 'doc' property. Otherwise you only get 'id' and 'file_sha' properties. Default is false.
 *
 * - descending: Sort results in rows by descendant. Default is false (ascendant).
 *
 * - recursive: Get documents recursively from all sub directories. Default is true.
 *
 * - prefix: Get documents whose IDs start with the prefix.
 *
 */
export type AllDocsOptions = {
  include_docs?: boolean;
  descending?: boolean;
  recursive?: boolean;
  prefix?: string;
};

/**
 * Result of put()
 *
 * @remarks
 * - ok: ok shows always true. Exception is thrown when error occurs.
 *
 * - id: id of a document. (You might be confused. Underscored '_id' is used only in a {@link JsonDoc} type. In other cases, 'id' is used. This is a custom of PouchDB/CouchDB.)
 *
 * - file_sha: SHA-1 hash of Git object (40 characters)
 *
 * - commit_sha: SHA-1 hash of Git commit (40 characters)
 *
 */
export type PutResult = {
  ok: true;
  id: string;
  file_sha: string;
  commit_sha: string;
};

/**
 * Result of remove()
 *
 * @remarks
 * - ok: ok shows always true. Exception is thrown when error occurs.
 *
 * - id: id of a document. (You might be confused. Underscored '_id' is used only in a {@link JsonDoc} type. In other cases, 'id' is used. This is a custom of PouchDB/CouchDB.)
 *
 * - file_sha: SHA-1 hash of Git blob (40 characters)
 *
 * - commit_sha: SHA-1 hash of Git commit (40 characters)
 *
 */
export type DeleteResult = {
  ok: true;
  id: string;
  file_sha: string;
  commit_sha: string;
};

/**
 * Result of allDocs()
 *
 * @remarks
 * - total_rows: number of documents
 *
 * - commit_sha: SHA-1 hash of the last Git commit (40 characters). 'commit_sha' is undefined if total_rows equals 0.
 *
 * - rows: Array of documents. 'rows' is undefined if total_rows equals 0.
 *
 */
export type AllDocsResult = {
  total_rows: number;
  commit_sha?: string;
  rows: JsonDocWithMetadata[];
};

/**
 * Type for a JSON document with metadata
 *
 * @remarks
 * - id: id of a document. (You might be confused. Underscored '_id' is used only in a {@link JsonDoc} type. In other cases, 'id' is used. This is a custom of PouchDB/CouchDB.)
 *
 * - file_sha: SHA-1 hash of Git object (40 characters)
 *
 * - doc: JsonDoc which has a '_id' value. The value of 'id' and 'doc._id' are the same.
 *
 */
export type JsonDocWithMetadata = DocMetadata & {
  doc?: JsonDoc;
};

/**
 * Type for a document metadata
 *
 * @remarks
 * - id: id of a document. (You might be confused. Underscored '_id' is used only in a {@link JsonDoc} type. In other cases, 'id' is used. This is a custom of PouchDB/CouchDB.)
 *
 * - file_sha: SHA-1 hash of Git object (40 characters)
 *
 * - type: Default is 'json'.
 */
export type DocMetadata = {
  id: string;
  file_sha: string;
  type?: 'json' | 'raw';
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
 * - personal_access_token: See https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token
 *
 * - private: Whether automatically created repository is private or not. Default is true.
 */
export type ConnectionSettingsGitHub = {
  type: 'github';
  personal_access_token?: string;
  private?: boolean;
};

/**
 * Connection settings for SSH
 */
export type ConnectionSettingsSSH = {
  type: 'ssh';
  private_key_path: string;
  public_key_path: string;
  pass_phrase?: string;
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
 * - remote_url: Connection destination
 *
 * - sync_direction: Default is 'both'.
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
 * - retry_interval: Retry interval  (milliseconds)
 *
 * [merge]
 *
 * - conflict_resolution_strategy: Default is 'ours'.
 *
 * - combine_db_strategy:
 *
 * [result]
 *
 * - include_commits: (Beta version: It will leak memory if true.) Whether SyncResult includes 'commits' property or not. Default is false.
 */
export type RemoteOptions = {
  /* network */
  remote_url?: string;
  sync_direction?: SyncDirection;
  connection?: ConnectionSettings;

  /* automation */
  live?: boolean;
  interval?: number; // msec
  retry?: number; // Retry does not occurred if retry is 0.
  retry_interval?: number; // msec

  /* merge */
  conflict_resolution_strategy?: ConflictResolutionStrategies;
  combine_db_strategy?: CombineDbStrategies;

  /* results */
  include_commits?: boolean;
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
  | 'paused'
  | 'active'
  | 'start'
  | 'complete'
  | 'error';

export type ChangedFileInsert = {
  operation: 'insert';
  new: JsonDocWithMetadata;
};

export type ChangedFileUpdate = {
  operation: 'update';
  old: JsonDocWithMetadata;
  new: JsonDocWithMetadata;
};

export type ChangedFileDelete = {
  operation: 'delete';
  old: JsonDocWithMetadata;
};

/**
 * Changed file in merge operation
 */
export type ChangedFile = ChangedFileInsert | ChangedFileUpdate | ChangedFileDelete;

/**
 * Commit information
 */
export type CommitInfo = {
  sha: string;
  date: Date;
  author: string;
  message: string;
};

/**
 * Result from sync_worker()
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
    remote: CommitInfo[]; // The list is sorted from old to new.
  };
}
export interface SyncResultFastForwardMerge {
  action: 'fast-forward merge';
  changes: {
    local: ChangedFile[];
  };
  commits?: {
    local: CommitInfo[];
  };
}
export interface SyncResultMergeAndPushError {
  action: 'merge and push error';
  changes: {
    local: ChangedFile[];
  };
  commits?: {
    local: CommitInfo[];
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
    local: CommitInfo[];
    remote: CommitInfo[]; // The list is sorted from old to new.
  };
}
export interface SyncResultResolveConflictsAndPushError {
  action: 'resolve conflicts and push error';
  changes: {
    local: ChangedFile[];
  };
  conflicts: AcceptedConflict[]; // sorted by filename
  commits?: {
    local: CommitInfo[];
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
    local: CommitInfo[];
    remote: CommitInfo[];
  };
}
export interface SyncResultCombineDatabase {
  action: 'combine database';
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
