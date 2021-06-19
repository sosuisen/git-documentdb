/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import nodegit from '@sosuisen/nodegit';
import { Logger } from 'tslog';
import { TaskQueue } from './task_queue';
import {
  DatabaseCloseOption,
  DatabaseOpenResult,
  DeleteOptions,
  DeleteResult,
  Doc,
  FatDoc,
  FindOptions,
  GetOptions,
  HistoryOptions,
  JsonDoc,
  OpenOptions,
  PutOptions,
  PutResult,
  RemoteOptions,
  Schema,
  SyncResult,
} from './types';
import { ISync } from './types_sync';
import { Validator } from './validator';

/**
 * Interface for GitDocumentDB CRUD
 *
 * @internal
 */
export interface CRUDInterface {
  put(jsonDoc: JsonDoc, options?: PutOptions): Promise<PutResult>;
  put(
    _id: string,
    data: JsonDoc | Uint8Array | string,
    options?: PutOptions
  ): Promise<PutResult>;

  insert(jsonDoc: JsonDoc, options?: PutOptions): Promise<PutResult>;
  insert(
    _id: string,
    data: JsonDoc | Uint8Array | string,
    options?: PutOptions
  ): Promise<PutResult>;

  update(jsonDoc: JsonDoc, options?: PutOptions): Promise<PutResult>;
  update(
    _id: string,
    data: JsonDoc | Uint8Array | string,
    options?: PutOptions
  ): Promise<PutResult>;

  get(_id: string, getOptions?: GetOptions): Promise<JsonDoc | undefined>;
  getFatDoc(_id: string, getOptions?: GetOptions): Promise<FatDoc | undefined>;

  getDocByOid(fileOid: string, getOptions?: GetOptions): Promise<Doc | undefined>;

  getBackNumber(
    _id: string,
    backNumber: number,
    historyOptions?: HistoryOptions,
    getOptions?: GetOptions
  ): Promise<JsonDoc | undefined>;

  getFatDocBackNumber(
    _id: string,
    backNumber: number,
    historyOptions?: HistoryOptions,
    getOptions?: GetOptions
  ): Promise<FatDoc | undefined>;

  getHistory(
    _id: string,
    historyOptions?: HistoryOptions
  ): Promise<(JsonDoc | undefined)[]>;

  getFatDocHistory(
    _id: string,
    historyOptions?: HistoryOptions,
    getOptions?: GetOptions
  ): Promise<(FatDoc | undefined)[]>;

  delete(_id: string, options?: DeleteOptions): Promise<DeleteResult>;
  delete(jsonDoc: JsonDoc, options?: DeleteOptions): Promise<DeleteResult>;

  find(options?: FindOptions): Promise<Doc[]>;
  findFatDoc(options?: FindOptions): Promise<FatDoc[]>;
}

/**
 * Abstract class for GitDocumentDB body
 *
 * @internal
 */
export interface IDocumentDB {
  author: {
    name: string;
    email: string;
  };
  committer: {
    name: string;
    email: string;
  };
  schema: Schema;
  defaultBranch: string;
  isClosing: boolean;
  validator: Validator;
  taskQueue: TaskQueue;
  isOpened(): boolean;
  dbName(): string;
  dbId(): string;
  workingDir(): string;
  repository(): nodegit.Repository | undefined;
  setRepository(repos: nodegit.Repository): void;
  getLogger(): Logger;
  loadDbInfo(): void;
  open(options?: OpenOptions): Promise<DatabaseOpenResult>;
  close(options?: DatabaseCloseOption): Promise<void>;
  sync(options: RemoteOptions, getSyncResult: boolean): Promise<[ISync, SyncResult]>;
  sync(options: RemoteOptions): Promise<ISync>;
}
