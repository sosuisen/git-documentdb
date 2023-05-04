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
import { monotonicFactory } from 'ulid';
import sinon from 'sinon';
import { GitDocumentDB } from '../../src/git_documentdb';
import { SearchEngineOptions } from '../../src/types';
import { SearchEngine } from '../../src/search/search_engine';

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = './test/database_search_elasticlunr';

// Use sandbox to restore stub and spy in parallel mocha tests
let sandbox: sinon.SinonSandbox;
beforeEach(function () {
  // @ts-ignore
  console.log(`... ${this.currentTest.fullTitle()}`);
  sandbox = sinon.createSandbox();
});

afterEach(function () {
  sandbox.restore();
});

before(() => {
  fs.removeSync(path.resolve(localDir));
});

after(() => {
  fs.removeSync(path.resolve(localDir));
});

describe('<search/elasticlunr> call search-elasticlunr directly', () => {
  it('create index', async () => {
    const dbName = monoId();
    const searchEngineOptions: SearchEngineOptions = {
      name: 'full-text',
      indexes: [
        {
          indexName: 'title',
          targetProperties: ['title'],
          indexFilePath: localDir + `/${dbName}_index.zip`,
        },
      ],
    };
    const gitDDB = new GitDocumentDB({
      dbName,
      localDir,
      // no SearchEngineOptions
    });
    await gitDDB.open();
    SearchEngine['full-text'].openOrCreate(gitDDB, '', searchEngineOptions);
    SearchEngine['full-text'].serialize();
    await gitDDB.destroy();
  });

  it('load index', async () => {
    const dbName = monoId();
    const searchEngineOptions: SearchEngineOptions = {
      name: 'full-text',
      indexes: [
        {
          indexName: 'title',
          targetProperties: ['title'],
          indexFilePath: localDir + `/${dbName}_index.zip`,
        },
      ],
    };
    const gitDDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    SearchEngine['full-text'].openOrCreate(gitDDB, '', searchEngineOptions);
    SearchEngine['full-text'].serialize();
    SearchEngine['full-text'].openOrCreate(gitDDB, '', searchEngineOptions);

    await gitDDB.destroy();
  });
});

describe('<search/elasticlunr> call through GitDocumentDB', () => {
  it('create index in GitDocumentDB#open', async () => {
    const dbName = monoId();
    const searchEngineOptions: SearchEngineOptions = {
      // name: 'full-text'
      indexes: [
        {
          indexName: 'title',
          targetProperties: ['title'],
          indexFilePath: localDir + `/${dbName}_index.zip`,
        },
      ],
    };
    const gitDDB = new GitDocumentDB({
      dbName,
      localDir,
      searchEngineOptions,
    });
    // SearchEngine['full-text'].openOrCreate(gitDDB, '', searchEngineOptions) will be called in gitDDB.open()
    await gitDDB.open();
    SearchEngine['full-text'].serialize();

    await gitDDB.destroy();
  });
});
