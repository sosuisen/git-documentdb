/* eslint-disable @typescript-eslint/naming-convention */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import fs from 'fs-extra';
import elasticlunr from 'elasticlunr';
import AdmZip from 'adm-zip';
import { Logger } from 'tslog';
import { JsonDoc, SearchEngineOptions, SearchIndexConfig } from '../types';

import stemmer from './elasticlunr/lunr.stemmer.support.js';
import lunr_ja from './elasticlunr/lunr.ja.js';
import lunr_multi from './elasticlunr/lunr.multi.js';
import { SearchIndexInterface, SearchResult } from '../types_search';
import { ICollection } from '../types_collection';

stemmer(elasticlunr);
lunr_ja(elasticlunr);
lunr_multi(elasticlunr);

const logger = new Logger({
  name: 'plugin-nodegit',
  minLevel: 'trace',
  displayDateTime: false,
  displayFunctionName: false,
  displayFilePath: 'hidden',
});

/*
 * @public
 */
export const type = 'search';

/**
 * @public
 */
export const name = 'full-text';

/**
 * openOrCreatre
 * @param collection
 * @param searchEngineOptions
 * @returns SearchIndexInterface
 */
export function openOrCreate (
  collection: ICollection,
  searchEngineOptions: SearchEngineOptions
): SearchIndexInterface {
  const searchIndexConfigs: { [indexName: string]: SearchIndexConfig } = {};
  const indexes: { [indexName: string]: any } = {};

  searchEngineOptions.configs.forEach(searchIndexConfig => {
    searchIndexConfigs[searchIndexConfig.indexName] = searchIndexConfig;

    if (!fs.existsSync(searchIndexConfig.indexFilePath)) {
      indexes[searchIndexConfig.indexName] = elasticlunr(function () {
        // @ts-ignore
        this.use(elasticlunr.multiLanguage('en', 'ja'));

        searchIndexConfig.targetProperties.forEach(propName => {
          // @ts-ignore
          this.addField(propName);
        });
        // @ts-ignore
        this.setRef('_id');
        this.saveDocument(false);
      });
    }
    else {
      const zip = new AdmZip(searchIndexConfig.indexFilePath);
      const zipEntries = zip.getEntries();
      zipEntries.forEach(function (zipEntry) {
        if (zipEntry.entryName === 'index.json') {
          const json = zipEntry.getData().toString('utf8');
          elasticlunr(function () {
            // @ts-ignore
            this.use(elasticlunr.multiLanguage('en', 'ja'));
            this.saveDocument(false);
          });
          indexes[searchIndexConfig.indexName] = elasticlunr.Index.load(JSON.parse(json));
        }
      });
    }
  });
  return new SearchIndexClass(collection, searchIndexConfigs, indexes);
}

/**
 * Wrapper class for search indexes
 */
class SearchIndexClass implements SearchIndexInterface {
  private _configs: { [indexName: string]: SearchIndexConfig } = {};
  private _indexes: { [indexName: string]: any } = {};

  private _collection: ICollection;

  constructor (
    collection: ICollection,
    configs: { [indexName: string]: SearchIndexConfig },
    indexes: { [indexName: string]: any }
  ) {
    this._collection = collection;
    this._configs = configs;
    this._indexes = indexes;
  }

  addIndex (json: JsonDoc): void {
    addIndexImpl(json, this._configs, this._indexes);
  }

  updateIndex (oldJson: JsonDoc, newJson: JsonDoc): void {
    updateIndexImpl(oldJson, newJson, this._configs, this._indexes);
  }

  deleteIndex (json: JsonDoc): void {
    deleteIndexImpl(json, this._configs, this._indexes);
  }

  search (indexName: string, keyword: string, useOr = false): SearchResult[] {
    return searchImpl(indexName, keyword, this._configs, this._indexes, useOr);
  }

  serialize (): Promise<void> {
    return serializeImpl(this._configs, this._indexes);
  }

  close (): void {
    closeImpl(this._configs, this._indexes);
  }

  destroy (): void {
    destroyImpl(this._configs, this._indexes);
  }

  async rebuild (): Promise<void> {
    await rebuild(this._collection, this._configs, this._indexes);
  }
}

/**
 * Implementations
 */

const getTargetValue = (propName: string, jsonDoc: JsonDoc) => {
  let val = '';
  try {
    val = (propName
      .split('.')
      .reduce((prevVal, curVal) => prevVal[curVal], jsonDoc) as unknown) as string;
  } catch {
    logger.error(`search-elasticlunr: property does not exist: ${propName}`);
  }
  return val;
};

function serializeImpl (
  configs: { [indexName: string]: SearchIndexConfig },
  indexes: { [indexName: string]: any }
): Promise<void> {
  const zip = new AdmZip();
  Object.keys(configs).forEach(indexName => {
    zip.addFile(
      'index.json',
      Buffer.from(JSON.stringify(indexes[indexName]), 'utf8'),
      'index of lunr'
    );
    zip.writeZip(configs[indexName].indexFilePath);
  });
  return Promise.resolve();
}

function closeImpl (
  configs: { [indexName: string]: SearchIndexConfig },
  indexes: { [indexName: string]: any }
): void {
  Object.keys(configs).forEach(indexName => {
    delete configs[indexName];
    delete indexes[indexName];
  });
  configs = {};
  indexes = {};
}

function destroyImpl (
  configs: { [indexName: string]: SearchIndexConfig },
  indexes: { [indexName: string]: any }
): void {
  Object.keys(configs).forEach(indexName => {
    fs.removeSync(path.resolve(configs[indexName].indexFilePath));
  });
  closeImpl(configs, indexes);
}

async function rebuild (
  collection: ICollection,
  configs: { [indexName: string]: SearchIndexConfig },
  indexes: { [indexName: string]: any }
): Promise<void> {
  for (const indexName of Object.keys(configs)) {
    const searchIndexConfig = configs[indexName];
    indexes[indexName] = elasticlunr(function () {
      // @ts-ignore
      this.use(elasticlunr.multiLanguage('en', 'ja'));

      searchIndexConfig.targetProperties.forEach(propName => {
        // @ts-ignore
        this.addField(propName);
      });
      // @ts-ignore
      this.setRef('_id');
      this.saveDocument(false);
    });
    // コレクションにドキュメント追加
    // eslint-disable-next-line no-await-in-loop
    const docs = await collection.find();
    // eslint-disable-next-line no-loop-func
    docs.forEach(doc => {
      indexes[indexName].addDoc(doc);
    });
  }
}

function addIndexImpl (
  json: JsonDoc,
  configs: { [indexName: string]: SearchIndexConfig },
  indexes: { [indexName: string]: any }
): void {
  Object.keys(indexes).forEach(indexName => {
    const doc: JsonDoc = { _id: json._id };
    configs[indexName].targetProperties.forEach(propName => {
      doc[propName] = getTargetValue(propName, json);
    });
    indexes[indexName].addDoc(doc);
  });
}

function updateIndexImpl (
  oldJson: JsonDoc,
  newJson: JsonDoc,
  configs: { [indexName: string]: SearchIndexConfig },
  indexes: { [indexName: string]: any }
): void {
  Object.keys(configs).forEach(indexName => {
    const oldDoc: JsonDoc = { _id: oldJson._id };
    configs[indexName].targetProperties.forEach(propName => {
      oldDoc[propName] = getTargetValue(propName, oldJson);
    });
    indexes[indexName].removeDoc(oldDoc);
    const newDoc: JsonDoc = { _id: newJson._id };
    configs[indexName].targetProperties.forEach(propName => {
      newDoc[propName] = getTargetValue(propName, newJson);
    });
    indexes[indexName].addDoc(newDoc);
  });
}

function deleteIndexImpl (
  json: JsonDoc,
  configs: { [indexName: string]: SearchIndexConfig },
  indexes: { [indexName: string]: any }
): void {
  Object.keys(configs).forEach(indexName => {
    const doc: JsonDoc = { _id: json._id };
    configs[indexName].targetProperties.forEach(propName => {
      doc[propName] = getTargetValue(propName, json);
    });
    indexes[indexName].removeDoc(doc);
  });
}

function searchImpl (
  indexName: string,
  keyword: string,
  configs: { [indexName: string]: SearchIndexConfig },
  indexes: { [indexName: string]: any },
  useOr = false
): SearchResult[] {
  let bool = 'AND';
  if (useOr) bool = 'OR';
  const fields: { [propname: string]: { boost: number } } = {};
  // The earlier the element is in the array,
  // the higher the boost priority (boost).
  const props = [...configs[indexName].targetProperties];
  let boost = 1;
  props.reverse().forEach(propName => {
    fields[propName] = { boost };
    boost++;
  });
  const results = indexes[indexName].search(keyword, {
    fields,
    expand: true,
    bool,
  }) as SearchResult[];

  return results;
}
