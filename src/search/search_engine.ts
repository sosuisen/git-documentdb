import { IsSearchIndexCreated, SearchIndexInterface } from '../types_search';
import { GitDDBInterface } from '../types_gitddb';
import { JsonDoc, SearchEngineOptions, SearchIndexConfig } from '../types';
import { SearchResult } from '../types_search_api';

/**
 * SearchEngine
 *
 * @public
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const SearchEngine: { [searchEngineName: string]: SearchEngineInterface } = {};

// eslint-disable-next-line @typescript-eslint/naming-convention
const collectionEnginesMap: { [collectionPath: string]: string[] } = {};

/**
 * Map collectionPath to searchEngine
 * This will be called by SearchEngine plugins
 */
export function addMapFromCollectionToSearchEngine (
  collectionPath: string,
  searchEngineName: string
): void {
  if (!collectionEnginesMap[collectionPath]) {
    collectionEnginesMap[collectionPath] = [];
  }
  if (!collectionEnginesMap[collectionPath].includes(searchEngineName)) {
    collectionEnginesMap[collectionPath].push(searchEngineName);
  }
}

/**
 * Wrapper class for search engines
 */
export class SearchIndexClass implements SearchIndexInterface {
  private _configs: { [indexName: string]: SearchIndexConfig } = {};
  private _indexes: { [indexName: string]: any } = {};

  private _engineName = '';

  config (indexName: string): SearchIndexConfig {
    return this._configs[indexName];
  }

  indexes (indexName: string): any {
    return this._indexes[indexName];
  }

  constructor (
    engineName: string,
    configs: { [indexName: string]: SearchIndexConfig },
    indexes: { [indexName: string]: any }
  ) {
    this._engineName = engineName;
    this._configs = configs;
    this._indexes = indexes;
  }

  addIndex (collectionPath: string, json: JsonDoc): void {
    SearchEngine[this._engineName].addIndex(
      collectionPath,
      json,
      this._configs,
      this._indexes
    );
  }

  updateIndex (collectionPath: string, oldJson: JsonDoc, newJson: JsonDoc): void {
    SearchEngine[this._engineName].updateIndex(
      collectionPath,
      oldJson,
      newJson,
      this._configs,
      this._indexes
    );
  }

  deleteIndex (collectionPath: string, json: JsonDoc): void {
    SearchEngine[this._engineName].deleteIndex(
      collectionPath,
      json,
      this._configs,
      this._indexes
    );
  }

  search (
    collectionPath: string,
    indexName: string,
    keyword: string,
    useOr = false
  ): SearchResult[] {
    return SearchEngine[this._engineName].search(
      collectionPath,
      indexName,
      keyword,
      useOr,
      this._configs,
      this._indexes
    );
  }

  serialize (): void {
    Object.values(SearchEngine).forEach(engine => {
      engine.serialize();
    });
  }

  close (): void {
    Object.values(SearchEngine).forEach(engine => {
      engine.close();
    });
  }

  destroy (): void {
    Object.values(SearchEngine).forEach(engine => {
      engine.destroy();
    });
  }

  async rebuild (gitDDB: GitDDBInterface): Promise<void> {
    for (const engine of Object.values(SearchEngine)) {
      // eslint-disable-next-line no-await-in-loop
      await engine.rebuild(gitDDB);
    }
  }
}

/**
 * SearchEngineInterface
 *
 * @remarks
 *  - destroy: Close indexes and delete serialized index files.
 *
 * @public
 */
export interface SearchEngineInterface extends SearchIndexInterface {
  type: string;
  name: string;
  openOrCreate: (collectionPath: string, options: SearchEngineOptions) => SearchIndexClass;
}
