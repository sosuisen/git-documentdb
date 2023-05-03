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
import { JsonDoc, SearchEngineOptions, SearchTarget } from '../types';
import { GitDDBInterface } from '../types_gitddb';

import stemmer from './lunr.stemmer.support.js';
import lunr_ja from './lunr.ja.js';
import lunr_multi from './lunr.multi.js';
stemmer(elasticlunr);
lunr_ja(elasticlunr);
lunr_multi(elasticlunr);

/*
 * @public
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const type = 'search';

/**
 * @public
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const name = 'full-text';

// eslint-disable-next-line @typescript-eslint/naming-convention
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

        /**
         * @TODO
         * ここで対象のプロパティを設定すること
         */

        // @ts-ignore
        this.addField('title');
        // @ts-ignore
        this.addField('body');
        // @ts-ignore
        this.setRef('id');
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

export function addIndex (json: JsonDoc): void {}

export function updateIndex (json: JsonDoc): void {}

export function deleteIndex (json: JsonDoc): void {}

export function search (json: JsonDoc): void {}
