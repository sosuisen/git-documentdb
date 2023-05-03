/* eslint-disable @typescript-eslint/naming-convention */

import { GitDDBInterface } from '../types_gitddb';
import { JsonDoc, SearchEngineOptions, SearchIndexInterface } from '../types';

/**
 * SearchEngine
 *
 * @public
 */
export const SearchEngine: { [searchEngineName: string]: SearchEngineInterface } = {};

const collectionEnginesMap: { [collectionName: string]: string[] } = {};

/**
 * Map collectionName to searchEngine
 * This will be called by SearchEngine plugins
 */
export function addMapFromCollectionToSearchEngine(collectionName: string, searchEngineName: string): void {
  if (!collectionEnginesMap[collectionName]){
    collectionEnginesMap[collectionName] = [];
  }
  collectionEnginesMap[collectionName].push(searchEngineName);
}

/**
 * Wrapper class for search engines
 */
class SearchIndexClass implements SearchIndexInterface {
  /**
   * Return search engines
   */
  private getSearchEngines = (collectionName: string) : SearchEngineInterface[] => {
    return collectionEnginesMap[collectionName]?.map(engineName => SearchEngine[engineName]);
  }

  add (collectionName: string, json: JsonDoc): void {
    this.getSearchEngines(collectionName).forEach(engine => {
      engine.add(collectionName, json);
    });
  } 

  update (collectionName: string, json: JsonDoc): void {
    this.getSearchEngines(collectionName).forEach(engine => {
      engine.add(collectionName, json);
    });
  }

  delete (collectionName: string, json: JsonDoc): void {
    this.getSearchEngines(collectionName).forEach(engine => {
      engine.add(collectionName, json);
    });
  }

  search (collectionName: string, json: JsonDoc): JsonDoc[] {
    const jsonDoc: JsonDoc[] = [];
    this.getSearchEngines(collectionName).forEach(engine => {
      jsonDoc.push(...engine.search(collectionName, json));
    });
    return jsonDoc;
  }
}

export const SearchIndex: SearchIndexInterface = new SearchIndexClass();

/**
 * SearchEngineInterface
 *
 * @public
 */
export interface SearchEngineInterface extends SearchIndexInterface {
  type: string;
  name: string;
  open: (gitDDB: GitDDBInterface, options: SearchEngineOptions) => void;
  close: () => void;
}
