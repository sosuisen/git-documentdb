import { JsonDoc, SearchIndexConfig } from './types';
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
  config: (indexName: string) => SearchIndexConfig;
  indexes: (indexName: string) => any;
  addIndex: (
    collectionPath: string,
    jsonDoc: JsonDoc,
    configs: { [indexName: string]: SearchIndexConfig },
    indexes: { [indexName: string]: any }
  ) => void;
  updateIndex: (
    collectionPath: string,
    oldJsonDoc: JsonDoc,
    newJsonDoc: JsonDoc,
    configs: { [indexName: string]: SearchIndexConfig },
    indexes: { [indexName: string]: any }
  ) => void;
  deleteIndex: (
    collectionPath: string,
    jsonDoc: JsonDoc,
    configs: { [indexName: string]: SearchIndexConfig },
    indexes: { [indexName: string]: any }
  ) => void;
  search: (
    collectionPath: string,
    indexName: string,
    keyword: string,
    useOr: boolean,
    configs: { [indexName: string]: SearchIndexConfig },
    indexes: { [indexName: string]: any }
  ) => SearchResult[];
  serialize: () => void;
  close: () => void;
  destroy: () => void;
  rebuild: (gitDDB: GitDDBInterface) => Promise<void>;
}
