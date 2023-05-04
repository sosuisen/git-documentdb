/* eslint-disable @typescript-eslint/naming-convention */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import fs from 'fs-extra';
import elasticlunr from 'elasticlunr';
import AdmZip from 'adm-zip';
import { Logger } from 'tslog';
import { JsonDoc, SearchEngineOptions, SearchTarget } from '../types';
import { GitDDBInterface } from '../types_gitddb';

import stemmer from './lunr.stemmer.support.js';
import lunr_ja from './lunr.ja.js';
import lunr_multi from './lunr.multi.js';
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
let searchTargets: { [key: string]: SearchTarget };
let indexes: { [key: string]: any };

export function openOrCreate (
  gitDDB: GitDDBInterface,
  collectionName: string,
  searchEngineOptions: SearchEngineOptions
): void {
  _gitDDB = gitDDB;

  searchEngineOptions.targets.forEach(searchTarget => {
    searchTargets[collectionName] = searchTarget;
    if (!fs.existsSync(searchTarget.indexFilePath)) {
      indexes[collectionName] = elasticlunr(function () {
        // @ts-ignore
        this.use(elasticlunr.multiLanguage('en', 'ja'));

        searchTarget.targetProperties.forEach(propName => {
          // @ts-ignore
          this.addField(propName);
        });
        // @ts-ignore
        this.setRef('_id');
        this.saveDocument(false);
      });
    }
    else {
      const zip = new AdmZip(searchTarget.indexFilePath);
      const zipEntries = zip.getEntries();
      zipEntries.forEach(function (zipEntry) {
        if (zipEntry.entryName === 'index.txt') {
          const json = zipEntry.getData().toString('utf8');
          indexes[collectionName] = elasticlunr.Index.load(JSON.parse(json));
        }
      });
    }
  });
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

export function close () {
  const zip = new AdmZip();
  Object.keys(searchTargets).forEach(collectionName => {
    zip.addFile(
      'index.txt',
      Buffer.from(JSON.stringify(indexes[collectionName]), 'utf8'),
      'index of lunr'
    );
    zip.writeZip(searchTargets[collectionName].indexFilePath);
  });
}

export function addIndex (collectionName: string, json: JsonDoc): void {
  const doc: JsonDoc = { _id: json._id };
  searchTargets[collectionName].targetProperties.forEach(propName => {
    doc[propName] = getTargetValue(propName, json);
  });
  indexes[collectionName].addDoc(doc);
}

export function updateIndex (collectionName: string, json: JsonDoc): void {}

export function deleteIndex (collectionName: string, json: JsonDoc): void {}

export function search (collectionName: string, json: JsonDoc): void {}
