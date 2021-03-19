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
};
/**
 * Database information
 *
 * @remarks
 * - is_new: Whether a repository is newly created or existing.
 *
 * - is_clone: Whether a repository is cloned from a remote repository or not.
 *
 * - is_created_by_gitddb: Whether a repository is created by GitDocumentDB or other means.
 *
 * - is_valid_version: Whether a repository version equals to the current databaseVersion of GitDocumentDB.
 *   The version is described in .git/description.
 *
 * @beta
 */
export type DatabaseInfo = {
  is_new: boolean;
  is_clone: boolean;
  is_created_by_gitddb: boolean;
  is_valid_version: boolean;
};
/**
 * Database Statistics
 */
export type DatabaseStatistics = {
  taskCount: {
    // A property name equals a member of TaskLabel type
    put: number;
    remove: number;
    push: number;
    sync: number;
  };
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
 * @public
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
 * @public
 */
export type CollectionPath = string;

/**
 * Options for put()
 *
 * @remarks
 * - commit_message: internal commit message. default is 'put: path/to/the/file'
 * @public
 */
export type PutOptions = {
  commit_message?: string;
};

/**
 * Options for remove()
 *
 * @remarks
 * - commit_message: internal commit message. default is 'remove: path/to/the/file'
 * @public
 */
export type RemoveOptions = {
  commit_message?: string;
};

/**
 * Options for allDocs()
 *
 * @remarks
 * - include_docs: Include the document itself in each row in the doc property. Otherwise you only get the _id and file_sha properties. Default is false.
 *
 * - descending: Sort results in rows by descendant. Default is false (ascendant).
 *
 * - recursive: Get documents recursively from all sub directories. Default is false.
 *
 * - collection_path: Get the documents only under a specified sub directory. If set, the directory names are omitted from the a filepath in a document id. See {@link Collection}.
 *
 * @public
 */
export type AllDocsOptions = {
  include_docs?: boolean;
  descending?: boolean;
  recursive?: boolean;
  collection_path?: string;
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
 * @public
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
 * @public
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
 * @public
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
 * @public
 */
export type JsonDocWithMetadata = {
  id: string;
  file_sha: string;
  doc?: JsonDoc;
};

/**
 * How to close database
 *
 * @remarks
 * - force: Clear queued operations immediately.
 *
 * - timeout: Clear queued operation after timeout(msec). Default is 10000.
 *
 * @public
 */
export type DatabaseCloseOption = {
  force?: boolean;
  timeout?: number;
};

export type SyncDirection = 'pull' | 'push' | 'both';
export type RemoteAuthGitHub = {
  type: 'github';
  personal_access_token?: string;
};
export type RemoteAuthSSH = {
  type: 'ssh';
  private_key_path: string;
  public_key_path: string;
  pass_phrase?: string;
};
export type RemoteAuthNone = {
  type: 'none';
};

export type RemoteAuth = RemoteAuthNone | RemoteAuthGitHub | RemoteAuthSSH;

/**
 * Behavior when no merge base
 * nop: (default)
 * theirs: remove local repository and git clone <remote repository>
 * ours: git merge -s ours <remote branch>
 */
export type BehaviorForNoMergeBase = 'nop' | 'ours' | 'theirs';
/**
 * Options for RemoteAccess class
 */
export type RemoteOptions = {
  remote_url?: string;
  live?: boolean;
  sync_direction?: SyncDirection;
  interval?: number; // msec
  retry?: number; // Retry does not occurred if retry is 0.
  retry_interval?: number; // msec
  auth?: RemoteAuth;
  behavior_for_no_merge_base?: BehaviorForNoMergeBase;
};

/**
 * Result from sync_worker()
 */
export type SyncResult =
  | 'nop'
  | 'push'
  | 'fast-forward merge'
  | 'merge and push'
  | 'resolve conflicts and push'
  | 'canceled';

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
  func: () => Promise<void>;
};

/**
 * Interface of RemoteAccess
 */
export interface IRemoteAccess {
  upstream_branch: string;
  callbacks: { [key: string]: any };
  author: nodegit.Signature;
  committer: nodegit.Signature;
  remoteURL(): string;
  options(): RemoteOptions;
}
