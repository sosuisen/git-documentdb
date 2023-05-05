import { IsSearchIndexCreated, SearchIndexInterface, SearchResult } from '../types_search';
import { GitDDBInterface } from '../types_gitddb';
import { JsonDoc, SearchEngineOptions } from '../types';

/**
 * SearchEngine
 *
 * @public
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const SearchEngine: { [searchEngineName: string]: SearchEngineInterface } = {};

// eslint-disable-next-line @typescript-eslint/naming-convention
const collectionEnginesMap: { [collectionName: string]: string[] } = {};

/**
 * Map collectionName to searchEngine
 * This will be called by SearchEngine plugins
 */
export function addMapFromCollectionToSearchEngine (
  collectionName: string,
  searchEngineName: string
): void {
  if (!collectionEnginesMap[collectionName]) {
    collectionEnginesMap[collectionName] = [];
  }
  collectionEnginesMap[collectionName].push(searchEngineName);
}

/**
 * Wrapper class for search engines
 */
class SearchInterfaceClass implements SearchIndexInterface {
  /**
   * Return search engines
   */
  private _getSearchEngines = (collectionName: string): SearchEngineInterface[] => {
    return collectionEnginesMap[collectionName]?.map(
      engineName => SearchEngine[engineName]
    );
  };

  addIndex (collectionName: string, json: JsonDoc): void {
    this._getSearchEngines(collectionName)?.forEach(engine => {
      engine.addIndex(collectionName, json);
    });
  }

  updateIndex (collectionName: string, oldJson: JsonDoc, newJson: JsonDoc): void {
    this._getSearchEngines(collectionName)?.forEach(engine => {
      engine.updateIndex(collectionName, oldJson, newJson);
    });
  }

  deleteIndex (collectionName: string, json: JsonDoc): void {
    this._getSearchEngines(collectionName)?.forEach(engine => {
      engine.deleteIndex(collectionName, json);
    });
  }

  search (
    collectionName: string,
    indexName: string,
    keyword: string,
    useOr = false
  ): SearchResult[] {
    const result: SearchResult[] = [];
    this._getSearchEngines(collectionName)?.forEach(engine => {
      result.push(...engine.search(collectionName, indexName, keyword, useOr));
    });
    return result;
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

// eslint-disable-next-line @typescript-eslint/naming-convention
export const SearchInterface: SearchIndexInterface = new SearchInterfaceClass();

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
  openOrCreate: (
    collectionName: string,
    options: SearchEngineOptions
  ) => IsSearchIndexCreated;
}
