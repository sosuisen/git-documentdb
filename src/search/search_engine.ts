/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import { ICollection } from '../types_collection';
import { SearchIndexInterface } from '../types_search';
import { SearchEngineOption } from '../types';

/**
 * SearchEngine
 *
 * @public
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const SearchEngine: { [searchEngineName: string]: SearchEngineInterface } = {};

/**
 * SearchEngineInterface
 *
 * @public
 */
export interface SearchEngineInterface {
  type: string;
  name: string;
  openOrCreate: (
    collection: ICollection,
    options: SearchEngineOption
  ) => SearchIndexInterface;
}
