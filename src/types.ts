/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import nodegit from '@sosuisen/nodegit';

/**
 * Database location
 *
 * @remarks
 * OS specific options. <b>It is recommended to use ASCII characters and case-insensitive names for cross-platform.</b>
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
 * ```
 * @beta
 */
export type DatabaseOption = {
  local_dir?: string;
  db_name: string;
  log_level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  diffOptions?: JsonDiffOptions;
};
/**
 * Database information
 *
 */
export type DatabaseInfo = DatabaseInfoSuccess | DatabaseInfoError;
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
  remove: number;
  push: number;
  sync: number;
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
 * - commit_message: internal commit message. default is 'put: path/to/the/file'
 */
export type PutOptions = {
  commit_message?: string;
};

/**
 * Options for remove()
 *
 * @remarks
 * - commit_message: internal commit message. default is 'remove: path/to/the/file'
 */
export type RemoveOptions = {
  commit_message?: string;
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
export type RemoveResult = {
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
  rows?: JsonDocWithMetadata[];
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
  | 'resolve-by-ours'
  | 'resolve-by-their'
  | 'replace-with-ours'
  | 'replace-with-theirs';

/**
 * Strategy for resolving conflicts
 *
 * @remarks
 * 'ours' and 'theirs' are borrowed terms from Git (https://git-scm.com/docs/merge-strategies)
 *
 * - 'ours-prop': Accept ours per property (Default). Properties in both local and remote documents are compared and merged. When a remote change is conflicted with a local change, the local change is accepted.
 *
 * - 'theirs-prop': Accept theirs per property. Properties in both local and remote documents are compared and merged. When a remote change is conflicted with a local change, the remote change is accepted.
 *
 * - 'ours': Accept ours per document. Documents in both local and remote commits are compared and merged per document. When a remote change is conflicted with a local change, the local change is accepted.
 *
 * - 'theirs': Accept theirs per document. Documents in both local and remote commits are compared and merged per document. When a remote change is conflicted with a local change, the remote change is accepted.
 *
 * - Compare function that returns one of the strategies ('ours-prop', 'theirs-prop', 'ours', and 'theirs') can be given. Each argument will be undefined when a document is removed.
 */
export type ConflictResolveStrategies =
  | ConflictResolveStrategyLabels
  | ((ours?: JsonDoc, theirs?: JsonDoc) => ConflictResolveStrategyLabels);

export type ConflictResolveStrategyLabels = 'ours-prop' | 'theirs-prop' | 'ours' | 'theirs';

/**
 * Write operation
 */
export type WriteOperation =
  | 'create'
  | 'update'
  | 'delete'
  | 'create-merge'
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
  strategy: ConflictResolveStrategyLabels;
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
 * - conflict_resolve_strategy: Default is 'ours'.
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
  conflict_resolve_strategy?: ConflictResolveStrategies;
  combine_db_strategy?: CombineDbStrategies;

  /* results */
  include_commits?: boolean;
};

/**
 * TaskLabel
 * DatabaseStatistics.taskCount must have the same members.
 */
export type TaskLabel = 'put' | 'remove' | 'sync' | 'push';

/**
 * Task for taskQueue
 */
export type Task = {
  label: TaskLabel;
  taskId: string;
  targetId?: string;
  func: (beforeResolve: () => void, beforeReject: () => void) => Promise<void>;
  cancel: () => void;
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

/**
 * Changed file in merge operation
 */
export type ChangedFile = {
  operation: WriteOperation;
  data: JsonDocWithMetadata;
};

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
  | SyncResultMergeAndPush
  | SyncResultResolveConflictsAndPush
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
export interface SyncResultCancel {
  action: 'canceled';
}

/**
 * SyncEventCallbacks
 */
export type SyncChangeCallback = (syncResult: SyncResult) => void;
export type SyncLocalChangeCallback = (changedFiles: ChangedFile[]) => void;
export type SyncRemoteChangeCallback = (changedFiles: ChangedFile[]) => void;
export type SyncPausedCallback = () => void;
export type SyncActiveCallback = () => void;
export type SyncStartCallback = (taskId: string, currentRetries: number) => void;
export type SyncCompleteCallback = (taskId: string) => void;
export type SyncErrorCallback = (error: Error) => void;
export type SyncCallback =
  | SyncChangeCallback
  | SyncLocalChangeCallback
  | SyncRemoteChangeCallback
  | SyncPausedCallback
  | SyncActiveCallback
  | SyncStartCallback
  | SyncCompleteCallback
  | SyncErrorCallback;
/**
 * Interface of Sync
 */
export interface ISync {
  currentRetries(): number;
  eventHandlers: {
    change: SyncChangeCallback[];
    localChange: SyncLocalChangeCallback[];
    remoteChange: SyncRemoteChangeCallback[];
    paused: SyncPausedCallback[];
    active: SyncActiveCallback[];
    start: SyncStartCallback[];
    complete: SyncCompleteCallback[];
    error: SyncErrorCallback[];
  };
  upstream_branch: string;
  credential_callbacks: { [key: string]: any };
  author: nodegit.Signature;
  committer: nodegit.Signature;
  remoteURL(): string;
  options(): RemoteOptions;
  tryPush(): Promise<SyncResultPush | SyncResultCancel>;
  trySync(): Promise<SyncResult>;
  enqueuePushTask(): Promise<SyncResultPush | SyncResultCancel>;
  enqueueSyncTask(): Promise<SyncResult>;
  on(event: SyncEvent, callback: SyncCallback): void;
  off(event: SyncEvent, callback: SyncCallback): void;
  pause(): void;
  cancel(): void;
  resume(options?: { interval?: number; retry?: number }): void;
}

export type JsonDiffOptions = {
  idOfSubtree?: string[];
  minTextLength?: number;
};

export interface IJsonPatch {
  patch(
    docOurs: JsonDoc,
    diffOurs: { [key: string]: any },
    diffTheirs?: { [key: string]: any } | undefined,
    strategy?: ConflictResolveStrategyLabels
  ): JsonDoc;
}
