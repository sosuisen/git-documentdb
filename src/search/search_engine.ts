/* eslint-disable @typescript-eslint/naming-convention */

import { GitDDBInterface } from 'src/types_gitddb';
import { JsonDoc, SearchEngineOptions } from '../types';

/**
 * SearchEngine
 *
 * @public
 */
export const SearchEngine: { [key: string]: SearchEngineInterface } = {};

/**
 * SearchEngineInterface
 *
 * @internal
 */
export interface SearchEngineInterface {
  type: string;
  name: string;
  open: (gitDDB: GitDDBInterface, options: SearchEngineOptions) => void;
  close: () => void;
  add: (json: JsonDoc) => void;
  update: (json: JsonDoc) => void;
  delete: (json: JsonDoc) => void;
  search: (json: JsonDoc) => JsonDoc[];
}
