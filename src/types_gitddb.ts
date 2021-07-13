/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import { Logger, TLogLevelName } from 'tslog';
import { TaskQueue } from './task_queue';
import {
  DatabaseCloseOption,
  DatabaseOpenResult,
  NormalizedCommit,
  OpenOptions,
  RemoteOptions,
  Schema,
  SyncResult,
} from './types';
import { ICollection } from './types_collection';
import { SyncInterface } from './types_sync';
import { Validator } from './validator';

/**
 * Interface of GitDocumentDB body
 *
 * @public
 */
export interface GitDDBInterface {
  /***********************************************
   * Public properties (readonly)
   ***********************************************/
  defaultBranch: string;
  localDir: string;
  dbName: string;
  isOpened: boolean;
  workingDir: string;
  dbId: string;
  logger: Logger;
  schema: Schema;
  taskQueue: TaskQueue;
  isClosing: boolean;
  validator: Validator;
  rootCollection: ICollection;

  /***********************************************
   * Public properties
   ***********************************************/
  logLevel: TLogLevelName;

  author: {
    name: string;
    email: string;
  };

  committer: {
    name: string;
    email: string;
  };

  /***********************************************
   * Public methods
   ***********************************************/
  // Lifecycle
  open(options?: OpenOptions): Promise<DatabaseOpenResult>;
  close(options?: DatabaseCloseOption): Promise<void>;
  destroy(options: DatabaseCloseOption): Promise<{ ok: true }>;

  // Sync
  getRemoteURLs(): string[];
  getSync(remoteURL: string): SyncInterface;
  removeSync(remoteURL: string): void;
  sync(
    options: RemoteOptions,
    getSyncResult: boolean
  ): Promise<[SyncInterface, SyncResult]>;
  sync(options: RemoteOptions): Promise<SyncInterface>;

  getCommit(oid: string): Promise<NormalizedCommit>;

  saveAuthor(): Promise<void>;
  loadAuthor(): Promise<void>;

  saveAppInfo(info: { [key: string]: any }): void;
  loadAppInfo(): { [key: string]: any };

  loadDbInfo(): void;
}
