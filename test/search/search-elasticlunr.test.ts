/* eslint-disable @typescript-eslint/naming-convention */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import expect from 'expect';
import path from 'path';
import fs from 'fs-extra';
import { monotonicFactory } from 'ulid';
import sinon from 'sinon';
import { GitDocumentDB } from '../../src/git_documentdb';
import { SearchEngineOptions } from '../../src/types';
import { SearchEngine } from '../../src/search/search_engine';
import { indexes, openOrCreate, serialize, close, destroy, addIndex, updateIndex, deleteIndex, search } from '../../src/plugin/search-elasticlunr';

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
    openOrCreate('', searchEngineOptions);
    // Cannot read property of index directry.
    // Use stringify and parse.
    const indexObj = JSON.parse(JSON.stringify(indexes['']['title']));
    // {"version":"0.9.5","fields":["title"],"ref":"_id","documentStore":{"docs":{},"docInfo":{},"length":0,"save":false},"index":{"title":{"root":{"docs":{},"df":0}}},"pipeline":["lunr-multi-trimmer-en-ja","stopWordFilter-jp","stopWordFilter","stemmer","stemmer-jp"]}
    expect(indexObj.fields).toEqual(['title']);
    expect(indexObj.ref).toBe("_id");
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
    let isCreated = openOrCreate('', searchEngineOptions);
    expect(isCreated).toEqual([true]);
    serialize();
    close();

    isCreated = openOrCreate('', searchEngineOptions);
    expect(isCreated).toEqual([false]);
    // Cannot read property of index directry.
    // Use stringify and parse.
    // console.log(JSON.stringify(indexes));
    const indexObj = JSON.parse(JSON.stringify(indexes['']['title']));
    // {"version":"0.9.5","fields":["title"],"ref":"_id","documentStore":{"docs":{},"docInfo":{},"length":0,"save":false},"index":{"title":{"root":{"docs":{},"df":0}}},"pipeline":["lunr-multi-trimmer-en-ja","stopWordFilter-jp","stopWordFilter","stemmer","stemmer-jp"]}
    expect(indexObj.fields).toEqual(['title']);
    expect(indexObj.ref).toBe("_id");

    await gitDDB.destroy();
  });

  it('add index to the first level property', async () => {
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
    openOrCreate('', searchEngineOptions);

    addIndex('', {
      _id: '1',
      title: 'x',
    });

    // Cannot read property of index directry.
    // Use stringify and parse.
    const indexObj = JSON.parse(JSON.stringify(indexes['']['title']));
    // {"version":"0.9.5","fields":["title"],"ref":"_id","documentStore":{"docs":{"1":null},"docInfo":{"1":{"title":1}},"length":1,"save":false},"index":{"title":{"root":{"docs":{},"df":0,"x":{"docs":{"1":{"tf":1}},"df":1}}}},"pipeline":["lunr-multi-trimmer-en-ja","stopWordFilter-jp","stopWordFilter","stemmer","stemmer-jp"]}
    expect(indexObj.documentStore.docs).toEqual({ "1": null });
    expect(indexObj.index['title'].root["x"]).toEqual(
      { "docs": { "1": { "tf": 1 } }, "df": 1 }
    );
    await gitDDB.destroy();
  });

  it('add index to the second level property', async () => {
    const dbName = monoId();
    const searchEngineOptions: SearchEngineOptions = {
      name: 'full-text',
      indexes: [
        {
          indexName: 'title',
          targetProperties: ['book.title'],
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
    openOrCreate('', searchEngineOptions);

    addIndex('', {
      _id: '1',
      book: {
        title: 'x',
      },
    });

    // Cannot read property of index directry.
    // Use stringify and parse.
    const indexObj = JSON.parse(JSON.stringify(indexes['']['title']));
    // console.log(JSON.stringify(indexes['']['title']));
    // {"version":"0.9.5","fields":["book.title"],"ref":"_id","documentStore":{"docs":{"1":null},"docInfo":{"1":{"book.title":1}},"length":1,"save":false},"index":{"book.title":{"root":{"docs":{},"df":0,"x":{"docs":{"1":{"tf":1}},"df":1}}}},"pipeline":["lunr-multi-trimmer-en-ja","stopWordFilter-jp","stopWordFilter","stemmer","stemmer-jp"]}
    expect(indexObj.documentStore.docs).toEqual({ "1": null });
    expect(indexObj.index['book.title'].root["x"]).toEqual(
      { "docs": { "1": { "tf": 1 } }, "df": 1 }
    );
    await gitDDB.destroy();
  });

  it('search', async () => {
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
    openOrCreate('', searchEngineOptions);

    addIndex('', {
      _id: '1',
      title: 'hello',
    });

    addIndex('', {
      _id: '2',
      title: 'world',
    });

    expect(search('', 'title', 'hello')).toEqual([{ ref: '1', score: 1 }]);
    expect(search('', 'title', 'world')).toEqual([{ ref: '2', score: 1 }]);

    await gitDDB.destroy();
  });

  it('boosting search', async () => {
    const dbName = monoId();
    const searchEngineOptions: SearchEngineOptions = {
      name: 'full-text',
      indexes: [
        {
          indexName: 'title',
          targetProperties: ['title', 'body'],
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
    openOrCreate('', searchEngineOptions);

    addIndex('', {
      _id: '1',
      title: 'hello',
      body: 'world',
    });

    addIndex('', {
      _id: '2',
      title: 'world',
      body: 'hello',
    });

    expect(search('', 'title', 'hello')).toEqual([{ ref: '1', score: 2 }, { ref: '2', score: 1 }]);

    await gitDDB.destroy();
  });
  
  it('search by AND', async () => {
    const dbName = monoId();
    const searchEngineOptions: SearchEngineOptions = {
      name: 'full-text',
      indexes: [
        {
          indexName: 'title',
          targetProperties: ['title', 'body'],
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
    openOrCreate('', searchEngineOptions);

    // match
    addIndex('', {
      _id: '1',
      title: 'hello world',
      body: 'planet',
    });

    // do not match
    addIndex('', {
      _id: '2',
      title: 'hello',
      body: 'world',
    });

    expect(search('', 'title', 'hello world')).toMatchObject([{ ref: '1' }]);

    await gitDDB.destroy();
  });

 it('search by OR', async () => {
    const dbName = monoId();
    const searchEngineOptions: SearchEngineOptions = {
      name: 'full-text',
      indexes: [
        {
          indexName: 'title',
          targetProperties: ['title', 'body'],
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
    openOrCreate('', searchEngineOptions);

    // match
    addIndex('', {
      _id: '1',
      title: 'hello world',
      body: 'planet',
    });

    // do not match
    addIndex('', {
      _id: '2',
      title: 'hello',
      body: 'world',
    });

    expect(search('', 'title', 'hello world', true)).toMatchObject([{ ref: '1' }, { ref: '2' }]);

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
    // Cannot read property of index directry.
    // Use stringify and parse.
    const indexObj = JSON.parse(JSON.stringify(indexes['']['title']));
    // {"version":"0.9.5","fields":["title"],"ref":"_id","documentStore":{"docs":{},"docInfo":{},"length":0,"save":false},"index":{"title":{"root":{"docs":{},"df":0}}},"pipeline":["lunr-multi-trimmer-en-ja","stopWordFilter-jp","stopWordFilter","stemmer","stemmer-jp"]}
    expect(indexObj.fields).toEqual(['title']);
    expect(indexObj.ref).toBe("_id");

    await gitDDB.destroy();
  });
});
