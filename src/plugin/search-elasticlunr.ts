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
import { GitDDBInterface } from '../types_gitddb';

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
  [collectionPath: string]: { [indexName: string]: SearchIndexConfig };
} = {};
// SearchEngineInterface does not have indexes method.
// Export indexes only for test.
export let indexes: { [collectionPath: string]: { [indexName: string]: any } } = {};

export function openOrCreate (
  collectionPath: string,
  searchEngineOptions: SearchEngineOptions
): IsSearchIndexCreated {
  searchIndexConfigs = {};
  indexes = {};

  const results: IsSearchIndexCreated = [];
  searchEngineOptions.configs.forEach(searchIndexConfig => {
    if (searchIndexConfigs[collectionPath] === undefined) searchIndexConfigs[collectionPath] = {};
    searchIndexConfigs[collectionPath][searchIndexConfig.indexName] = searchIndexConfig;

    if (!fs.existsSync(searchIndexConfig.indexFilePath)) {
      if (indexes[collectionPath] === undefined) indexes[collectionPath] = {};
      indexes[collectionPath][searchIndexConfig.indexName] = elasticlunr(function () {
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
          if (indexes[collectionPath] === undefined) indexes[collectionPath] = {};
          indexes[collectionPath][searchIndexConfig.indexName] = elasticlunr.Index.load(JSON.parse(json));
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
  Object.keys(searchIndexConfigs).forEach(collectionPath => {
    Object.keys(searchIndexConfigs[collectionPath]).forEach(indexName => {
      zip.addFile(
        'index.json',
        Buffer.from(JSON.stringify(indexes[collectionPath][indexName]), 'utf8'),
        'index of lunr'
      );
      zip.writeZip(searchIndexConfigs[collectionPath][indexName].indexFilePath);
    });
  });
}

export function close (): void {
  Object.keys(searchIndexConfigs).forEach(collectionPath => {
    Object.keys(searchIndexConfigs[collectionPath]).forEach(indexName => {
      delete searchIndexConfigs[collectionPath][indexName];
      delete indexes[collectionPath][indexName];
    });
    delete searchIndexConfigs[collectionPath];
    delete indexes[collectionPath];
  });
}

export function destroy (): void {
  Object.keys(searchIndexConfigs).forEach(collectionPath => {
    Object.keys(searchIndexConfigs[collectionPath]).forEach(indexName => {
      fs.removeSync(path.resolve(searchIndexConfigs[collectionPath][indexName].indexFilePath));
    });
  });
  close();
}

export async function rebuild (gitDDB: GitDDBInterface): Promise<void> {
  for (const collectionPath of Object.keys(searchIndexConfigs)) {
    for (const indexName of Object.keys(searchIndexConfigs[collectionPath])) {
      const searchIndexConfig = searchIndexConfigs[collectionPath][indexName];
      if (indexes[collectionPath] === undefined) indexes[collectionPath] = {};
      indexes[collectionPath][indexName] = elasticlunr(function () {
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
      let collection = gitDDB.rootCollection;
      if (collectionPath !== '') {
        collection = collection.collection(collectionPath);
      }
      const docs = await collection.find();
      docs.forEach(doc => {
        indexes[collectionPath][indexName].addDoc(doc);
      });
    }
  }
}

export function addIndex (collectionPath: string, json: JsonDoc): void {
  Object.keys(searchIndexConfigs[collectionPath]).forEach(indexName => {
    const doc: JsonDoc = { _id: json._id };
    searchIndexConfigs[collectionPath][indexName].targetProperties.forEach(propName => {
      doc[propName] = getTargetValue(propName, json);
    });
    indexes[collectionPath][indexName].addDoc(doc);
  });
}

export function updateIndex (collectionPath: string, oldJson: JsonDoc, newJson: JsonDoc): void {
  Object.keys(searchIndexConfigs[collectionPath]).forEach(indexName => {
    const oldDoc: JsonDoc = { _id: oldJson._id };
    searchIndexConfigs[collectionPath][indexName].targetProperties.forEach(propName => {
      oldDoc[propName] = getTargetValue(propName, oldJson);
    });
    indexes[collectionPath][indexName].removeDoc(oldDoc);
    const newDoc: JsonDoc = { _id: newJson._id };
    searchIndexConfigs[collectionPath][indexName].targetProperties.forEach(propName => {
      newDoc[propName] = getTargetValue(propName, newJson);
    });
    indexes[collectionPath][indexName].addDoc(newDoc);
  });
}

export function deleteIndex (collectionPath: string, json: JsonDoc): void {
  Object.keys(searchIndexConfigs[collectionPath]).forEach(indexName => {
    const doc: JsonDoc = { _id: json._id };
    searchIndexConfigs[collectionPath][indexName].targetProperties.forEach(propName => {
      doc[propName] = getTargetValue(propName, json);
    });
    indexes[collectionPath][indexName].removeDoc(doc);
  });
}

export function search (collectionPath: string, indexName: string, keyword: string, useOr = false): SearchResult {
  let bool = "AND";
  if (useOr) bool = "OR";
  const fields: { [propname: string]: { 'boost': number }} = {};
  // The earlier the element is in the array, 
  // the higher the boost priority (boost).
  const props = [...searchIndexConfigs[collectionPath][indexName].targetProperties];
  let boost = 1;
  props.reverse().forEach( propName => {
    fields[propName] = { boost };
    boost++;
  });
  return indexes[collectionPath][indexName].search(keyword, {
    fields,
    expand: true,
    bool,
  });
}
