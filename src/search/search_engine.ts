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
  collectionEnginesMap[collectionPath].push(searchEngineName);
}

/**
 * Wrapper class for search engines
 */
class SearchInterfaceClass implements SearchIndexInterface {
  /**
   * Return search engines
   */
  private _getSearchEngines = (collectionPath: string): SearchEngineInterface[] => {
    return collectionEnginesMap[collectionPath]?.map(
      engineName => SearchEngine[engineName]
    );
  };

  addIndex (collectionPath: string, json: JsonDoc): void {
    this._getSearchEngines(collectionPath)?.forEach(engine => {
      engine.addIndex(collectionPath, json);
    });
  }

  updateIndex (collectionPath: string, oldJson: JsonDoc, newJson: JsonDoc): void {
    this._getSearchEngines(collectionPath)?.forEach(engine => {
      engine.updateIndex(collectionPath, oldJson, newJson);
    });
  }

  deleteIndex (collectionPath: string, json: JsonDoc): void {
    this._getSearchEngines(collectionPath)?.forEach(engine => {
      engine.deleteIndex(collectionPath, json);
    });
  }

  search (
    collectionPath: string,
    indexName: string,
    keyword: string,
    useOr = false
  ): SearchResult[] {
    const result: SearchResult[] = [];
    this._getSearchEngines(collectionPath)?.forEach(engine => {
      result.push(...engine.search(collectionPath, indexName, keyword, useOr));
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
    collectionPath: string,
    options: SearchEngineOptions
  ) => IsSearchIndexCreated;
}
