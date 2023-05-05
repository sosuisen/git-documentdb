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
import { IsSearchIndexCreated, JsonDoc, SearchEngineOptions, SearchIndex } from '../types';
import { GitDDBInterface } from '../types_gitddb';

import stemmer from './elasticlunr/lunr.stemmer.support.js';
import lunr_ja from './elasticlunr/lunr.ja.js';
import lunr_multi from './elasticlunr/lunr.multi.js';

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

let _gitDDB: GitDDBInterface;
const searchIndexes: {
  [collectionName: string]: { [indexName: string]: SearchIndex };
} = {};
// SearchEngineInterface does not have indexes method.
// Export indexes only for test.
export const indexes: { [collectionName: string]: { [indexName: string]: any } } = {};

export function openOrCreate (
  gitDDB: GitDDBInterface,
  collectionName: string,
  searchEngineOptions: SearchEngineOptions
): IsSearchIndexCreated {
  _gitDDB = gitDDB;

  const results: IsSearchIndexCreated = [];
  searchEngineOptions.indexes.forEach(searchIndex => {
    if (searchIndexes[collectionName] === undefined) searchIndexes[collectionName] = {};
    searchIndexes[collectionName][searchIndex.indexName] = searchIndex;

    if (!fs.existsSync(searchIndex.indexFilePath)) {
      if (indexes[collectionName] === undefined) indexes[collectionName] = {};
      indexes[collectionName][searchIndex.indexName] = elasticlunr(function () {
        // @ts-ignore
        this.use(elasticlunr.multiLanguage('en', 'ja'));

        searchIndex.targetProperties.forEach(propName => {
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
      const zip = new AdmZip(searchIndex.indexFilePath);
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
          indexes[collectionName][searchIndex.indexName] = elasticlunr.Index.load(JSON.parse(json));
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
  Object.keys(searchIndexes).forEach(collectionName => {
    Object.keys(searchIndexes[collectionName]).forEach(indexName => {
      zip.addFile(
        'index.json',
        Buffer.from(JSON.stringify(indexes[collectionName][indexName]), 'utf8'),
        'index of lunr'
      );
      zip.writeZip(searchIndexes[collectionName][indexName].indexFilePath);
    });
  });
}

export function close (): void {
  Object.keys(searchIndexes).forEach(collectionName => {
    Object.keys(searchIndexes[collectionName]).forEach(indexName => {
      delete searchIndexes[collectionName][indexName];
      delete indexes[collectionName][indexName];
    });
    delete searchIndexes[collectionName];
    delete indexes[collectionName];
  });
}

export function destroy (): void {
  close();
  Object.keys(searchIndexes).forEach(collectionName => {
    Object.keys(searchIndexes[collectionName]).forEach(indexName => {
      fs.removeSync(path.resolve(searchIndexes[collectionName][indexName].indexFilePath));
    });
  });
}

export function addIndex (collectionName: string, json: JsonDoc): void {
  Object.keys(searchIndexes[collectionName]).forEach(indexName => {
    const doc: JsonDoc = { _id: json._id };
    searchIndexes[collectionName][indexName].targetProperties.forEach(propName => {
      doc[propName] = getTargetValue(propName, json);
    });
    indexes[collectionName].addDoc(doc);
  });
}

export function updateIndex (collectionName: string, json: JsonDoc): void {}

export function deleteIndex (collectionName: string, json: JsonDoc): void {}

export function search (collectionName: string, json: JsonDoc): void {}
