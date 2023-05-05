import { JsonDoc } from './types';
import { GitDDBInterface } from './types_gitddb';
import { SearchResult } from './types_search_api';

/**
 * SearchIndexInterface
 *
 * @remarks
 *  - Notice that _id in JsonDoc does not include collectionPath
 *
 * @public
 */
export interface SearchIndexInterface {
  addIndex: (collectionPath: string, jsonDoc: JsonDoc) => void;
  updateIndex: (collectionPath: string, oldJsonDoc: JsonDoc, newJsonDoc: JsonDoc) => void;
  deleteIndex: (collectionPath: string, jsonDoc: JsonDoc) => void;
  search: (
    collectionPath: string,
    indexName: string,
    keyword: string,
    useOr: boolean
  ) => SearchResult[];
  serialize: () => void;
  close: () => void;
  destroy: () => void;
  rebuild: (gitDDB: GitDDBInterface) => Promise<void>;
}

/**
 * IsSearchIndexCreated
 *
 * @public
 */
export type IsSearchIndexCreated = boolean[];