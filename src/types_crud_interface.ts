/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import {
  DeleteOptions,
  DeleteResult,
  DeleteResultJsonDoc,
  Doc,
  DocType,
  FatDoc,
  FindOptions,
  GetOptions,
  HistoryOptions,
  JsonDoc,
  PutOptions,
  PutResult,
  PutResultJsonDoc,
} from './types';

/**
 * Interface of GitDocumentDB CRUD
 *
 * @internal
 */
export interface CRUDInterface {
  put(jsonDoc: JsonDoc, options?: PutOptions): Promise<PutResult>;
  put(
    _id: string | undefined | null,
    data: JsonDoc | Uint8Array | string,
    options?: PutOptions
  ): Promise<PutResultJsonDoc>;
  /**
   * @internal
   */
  put(
    shortIdOrDoc: string | undefined | null | JsonDoc,
    jsonDocOrOptions?: JsonDoc | PutOptions,
    options?: PutOptions
  ): Promise<PutResultJsonDoc>;

  insert(jsonDoc: JsonDoc, options?: PutOptions): Promise<PutResult>;
  insert(
    _id: string | undefined | null,
    data: JsonDoc | Uint8Array | string,
    options?: PutOptions
  ): Promise<PutResultJsonDoc>;
  /**
   * @internal
   */
  insert(
    shortIdOrDoc: string | undefined | null | JsonDoc,
    jsonDocOrOptions?: JsonDoc | PutOptions,
    options?: PutOptions
  ): Promise<PutResultJsonDoc>;

  update(jsonDoc: JsonDoc, options?: PutOptions): Promise<PutResult>;
  update(
    _id: string | undefined | null,
    data: JsonDoc | Uint8Array | string,
    options?: PutOptions
  ): Promise<PutResultJsonDoc>;
  /**
   * @internal
   */
  update(
    shortIdOrDoc: string | undefined | null | JsonDoc,
    jsonDocOrOptions?: JsonDoc | PutOptions,
    options?: PutOptions
  ): Promise<PutResultJsonDoc>;

  putFatDoc(
    name: string | undefined | null,
    data: JsonDoc | Uint8Array | string,
    options?: PutOptions
  ): Promise<PutResult>;

  insertFatDoc(
    name: string | undefined | null,
    data: JsonDoc | Uint8Array | string,
    options?: PutOptions
  ): Promise<PutResult>;

  updateFatDoc(
    name: string | undefined | null,
    data: JsonDoc | Uint8Array | string,
    options?: PutOptions
  ): Promise<PutResult>;

  get(_id: string, getOptions?: GetOptions): Promise<JsonDoc | undefined>;

  getBackNumber(
    _id: string,
    backNumber: number,
    historyOptions?: HistoryOptions,
    getOptions?: GetOptions
  ): Promise<JsonDoc | undefined>;

  getHistory(
    _id: string,
    historyOptions?: HistoryOptions
  ): Promise<(JsonDoc | undefined)[]>;

  getFatDoc(name: string, getOptions?: GetOptions): Promise<FatDoc | undefined>;

  getFatDocBackNumber(
    name: string,
    backNumber: number,
    historyOptions?: HistoryOptions,
    getOptions?: GetOptions
  ): Promise<FatDoc | undefined>;

  getFatDocHistory(
    name: string,
    historyOptions?: HistoryOptions,
    getOptions?: GetOptions
  ): Promise<(FatDoc | undefined)[]>;

  getDocByOid(fileOid: string, docType?: DocType): Promise<Doc | undefined>;

  delete(jsonDoc: JsonDoc, options?: DeleteOptions): Promise<DeleteResultJsonDoc>;

  delete(_id: string, options?: DeleteOptions): Promise<DeleteResultJsonDoc>;
  /**
   * @internal
   */
  delete(
    shortIdOrDoc: string | JsonDoc,
    options?: DeleteOptions
  ): Promise<DeleteResultJsonDoc>;

  deleteFatDoc(name: string, options?: DeleteOptions): Promise<DeleteResult>;

  find(options?: FindOptions): Promise<JsonDoc[]>;

  findFatDoc(options?: FindOptions): Promise<FatDoc[]>;
}
