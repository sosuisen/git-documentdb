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
  rebuildIndex: () => Promise<void>;
}
