import { JsonDoc } from './types';
import { GitDDBInterface } from './types_gitddb';

/**
 * SearchIndexInterface
 *
 * @remarks
 *  - Notice that _id in JsonDoc includes collectionPath
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
