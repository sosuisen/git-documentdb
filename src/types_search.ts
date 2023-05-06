/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import { JsonDoc } from './types';

/**
 * SearchIndexInterface
 *
 * @remarks
 *  - Notice that _id in JsonDoc does not include collectionPath
 *
 *  - destroy: Close indexes and delete serialized index files.
 *
 * @public
 */
export interface SearchIndexInterface {
  addIndex: (jsonDoc: JsonDoc) => void;
  updateIndex: (oldJsonDoc: JsonDoc, newJsonDoc: JsonDoc) => void;
  deleteIndex: (jsonDoc: JsonDoc) => void;
  search: (indexName: string, keyword: string, useOr?: boolean) => SearchResult[];
  serialize: () => Promise<void>;
  close: () => void;
  destroy: () => void;
  rebuild: () => Promise<void>;
}

/**
 * SearchResult
 *
 * @remarks
 *  - ref is shortId. Notice that shortId does not include collectionPath.
 */
export type SearchResult = {
  ref: string;
  score: number;
};

/**
 * SearchAPI
 */
export interface SearchAPI {
  search: (indexName: string, keyword: string, useOr?: boolean) => SearchResult[];
  searchIndex: () => SearchIndexInterface | undefined;
  rebuildIndex: () => Promise<void>;
  serializeIndex: () => Promise<void>;
}
