/* eslint-disable @typescript-eslint/naming-convention */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import fs from 'fs-extra';
import path from 'path';
import elasticlunr from 'elasticlunr';
import AdmZip from 'adm-zip';
import { Logger } from 'tslog';
import { IsSearchIndexCreated, JsonDoc, SearchEngineOptions, SearchIndexConfig, SearchResult } from '../types';

import stemmer from './elasticlunr/lunr.stemmer.support.js';
import lunr_ja from './elasticlunr/lunr.ja.js';
import lunr_multi from './elasticlunr/lunr.multi.js';
import { CollectionInterface } from '../types_collection';

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

let searchIndexConfigs: {
  [collectionName: string]: { [indexName: string]: SearchIndexConfig };
} = {};
// SearchEngineInterface does not have indexes method.
// Export indexes only for test.
export let indexes: { [collectionName: string]: { [indexName: string]: any } } = {};

export function openOrCreate (
  collectionName: string,
  searchEngineOptions: SearchEngineOptions
): IsSearchIndexCreated {
  searchIndexConfigs = {};
  indexes = {};

  const results: IsSearchIndexCreated = [];
  searchEngineOptions.configs.forEach(searchIndexConfig => {
    if (searchIndexConfigs[collectionName] === undefined) searchIndexConfigs[collectionName] = {};
    searchIndexConfigs[collectionName][searchIndexConfig.indexName] = searchIndexConfig;

    if (!fs.existsSync(searchIndexConfig.indexFilePath)) {
      if (indexes[collectionName] === undefined) indexes[collectionName] = {};
      indexes[collectionName][searchIndexConfig.indexName] = elasticlunr(function () {
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
      results.push(true);
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
          if (indexes[collectionName] === undefined) indexes[collectionName] = {};
          indexes[collectionName][searchIndexConfig.indexName] = elasticlunr.Index.load(JSON.parse(json));
        }
      });
      results.push(false);
    }
  });
  return results;
}

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

export function serialize (): void {
  const zip = new AdmZip();
  Object.keys(searchIndexConfigs).forEach(collectionName => {
    Object.keys(searchIndexConfigs[collectionName]).forEach(indexName => {
      zip.addFile(
        'index.json',
        Buffer.from(JSON.stringify(indexes[collectionName][indexName]), 'utf8'),
        'index of lunr'
      );
      zip.writeZip(searchIndexConfigs[collectionName][indexName].indexFilePath);
    });
  });
}

export function close (): void {
  Object.keys(searchIndexConfigs).forEach(collectionName => {
    Object.keys(searchIndexConfigs[collectionName]).forEach(indexName => {
      delete searchIndexConfigs[collectionName][indexName];
      delete indexes[collectionName][indexName];
    });
    delete searchIndexConfigs[collectionName];
    delete indexes[collectionName];
  });
}

export function destroy (): void {
  Object.keys(searchIndexConfigs).forEach(collectionName => {
    Object.keys(searchIndexConfigs[collectionName]).forEach(indexName => {
      fs.removeSync(path.resolve(searchIndexConfigs[collectionName][indexName].indexFilePath));
    });
  });
  close();
}

export async function rebuild (gitDDB: CollectionInterface): Promise<void> {
  for (const collectionName of Object.keys(searchIndexConfigs)) {
    for (const indexName of Object.keys(searchIndexConfigs[collectionName])) {
      const searchIndexConfig = searchIndexConfigs[collectionName][indexName];
      if (indexes[collectionName] === undefined) indexes[collectionName] = {};
      indexes[collectionName][indexName] = elasticlunr(function () {
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
      const collection = gitDDB.collection(collectionName);
      const docs = await collection.find();
      docs.forEach(doc => {
        indexes[collectionName][indexName].addDoc(doc);
      });
    }
  }
}

export function addIndex (collectionName: string, json: JsonDoc): void {
  Object.keys(searchIndexConfigs[collectionName]).forEach(indexName => {
    const doc: JsonDoc = { _id: json._id };
    searchIndexConfigs[collectionName][indexName].targetProperties.forEach(propName => {
      doc[propName] = getTargetValue(propName, json);
    });
    indexes[collectionName][indexName].addDoc(doc);
  });
}

export function updateIndex (collectionName: string, oldJson: JsonDoc, newJson: JsonDoc): void {
  Object.keys(searchIndexConfigs[collectionName]).forEach(indexName => {
    const oldDoc: JsonDoc = { _id: oldJson._id };
    searchIndexConfigs[collectionName][indexName].targetProperties.forEach(propName => {
      oldDoc[propName] = getTargetValue(propName, oldJson);
    });
    indexes[collectionName][indexName].removeDoc(oldDoc);
    const newDoc: JsonDoc = { _id: newJson._id };
    searchIndexConfigs[collectionName][indexName].targetProperties.forEach(propName => {
      newDoc[propName] = getTargetValue(propName, newJson);
    });
    indexes[collectionName][indexName].addDoc(newDoc);
  });
}

export function deleteIndex (collectionName: string, json: JsonDoc): void {
  Object.keys(searchIndexConfigs[collectionName]).forEach(indexName => {
    const doc: JsonDoc = { _id: json._id };
    searchIndexConfigs[collectionName][indexName].targetProperties.forEach(propName => {
      doc[propName] = getTargetValue(propName, json);
    });
    indexes[collectionName][indexName].removeDoc(doc);
  });
}

export function search (collectionName: string, indexName: string, keyword: string, useOr = false): SearchResult {
  let bool = "AND";
  if (useOr) bool = "OR";
  const fields: { [propname: string]: { 'boost': number }} = {};
  // The earlier the element is in the array, 
  // the higher the boost priority (boost).
  const props = [...searchIndexConfigs[collectionName][indexName].targetProperties];
  let boost = 1;
  props.reverse().forEach( propName => {
    fields[propName] = { boost };
    boost++;
  });
  return indexes[collectionName][indexName].search(keyword, {
    fields,
    expand: true,
    bool,
  });
}
