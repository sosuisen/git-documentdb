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
  AllDocsOptions,
  AllDocsResult,
  DeleteOptions,
  JsonDoc,
  PutOptions,
  PutResult,
  RemoveResult,
  Schema,
} from './types';
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
    document: { [key: string]: any },
    options?: PutOptions
  ): Promise<PutResult>;

  insert(jsonDoc: JsonDoc, options?: PutOptions): Promise<PutResult>;
  insert(
    _id: string,
    document: { [key: string]: any },
    options?: PutOptions
  ): Promise<PutResult>;

  update(jsonDoc: JsonDoc, options?: PutOptions): Promise<PutResult>;
  update(
    _id: string,
    document: { [key: string]: any },
    options?: PutOptions
  ): Promise<PutResult>;

  get(docId: string, backNumber?: number): Promise<JsonDoc | undefined>;

  delete(id: string, options?: DeleteOptions): Promise<RemoveResult>;
  delete(jsonDoc: JsonDoc, options?: DeleteOptions): Promise<RemoveResult>;

  remove(id: string, options?: DeleteOptions): Promise<RemoveResult>;
  remove(jsonDoc: JsonDoc, options?: DeleteOptions): Promise<RemoveResult>;

  allDocs(options?: AllDocsOptions): Promise<AllDocsResult>;
}

/**
 * Abstract class for GitDocumentDB body
 *
 * @internal
 */
export interface IDocumentDB {
  fileExt: string;
  gitAuthor: {
    name: string;
    email: string;
  };
  schema: Schema;
  defaultBranch: string;
  dbName(): string;
  workingDir(): string;
  isClosing: boolean;
  repository(): nodegit.Repository | undefined;
  validator: Validator;
  logger: Logger;
  taskQueue: TaskQueue;
}
