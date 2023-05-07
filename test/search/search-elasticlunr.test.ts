/* eslint-disable @typescript-eslint/naming-convention */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import expect from 'expect';
import fs from 'fs-extra';
import { monotonicFactory } from 'ulid';
import sinon from 'sinon';
import { SearchIndexInterface } from '../../src/types_search';
import { GitDocumentDB } from '../../src/git_documentdb';
import {
  openOrCreate,
  SearchIndexClassInterface,
} from '../../src/plugin/search-elasticlunr';
import { SearchEngineOption } from '../../src/types';

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
    const searchEngineOption: SearchEngineOption = {
      engineName: 'full-text',
      collectionPath: '',
      configs: [
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
    const searchIndex = (openOrCreate(
      gitDDB.rootCollection,
      searchEngineOption
    ) as unknown) as SearchIndexClassInterface;
    // Cannot read property of index directry.
    // Use stringify and parse.
    const indexObj = JSON.parse(JSON.stringify(searchIndex.indexes().title));
    // {"version":"0.9.5","fields":["title"],"ref":"_id","documentStore":{"docs":{},"docInfo":{},"length":0,"save":false},"index":{"title":{"root":{"docs":{},"df":0}}},"pipeline":["lunr-multi-trimmer-en-ja","stopWordFilter-jp","stopWordFilter","stemmer","stemmer-jp"]}
    expect(indexObj.fields).toEqual(['title']);
    expect(indexObj.ref).toBe('_id');
    await gitDDB.destroy();
  });

  it('load index', async () => {
    const dbName = monoId();
    const searchEngineOption: SearchEngineOption = {
      engineName: 'full-text',
      collectionPath: '',
      configs: [
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
    const searchIndex = openOrCreate(gitDDB.rootCollection, searchEngineOption);
    searchIndex.serialize();
    searchIndex.close();

    const searchIndex2 = (openOrCreate(
      gitDDB.rootCollection,
      searchEngineOption
    ) as unknown) as SearchIndexClassInterface;

    // Cannot read property of index directry.
    // Use stringify and parse.
    // console.log(JSON.stringify(indexes));
    const indexObj = JSON.parse(JSON.stringify(searchIndex2.indexes().title));
    // {"version":"0.9.5","fields":["title"],"ref":"_id","documentStore":{"docs":{},"docInfo":{},"length":0,"save":false},"index":{"title":{"root":{"docs":{},"df":0}}},"pipeline":["lunr-multi-trimmer-en-ja","stopWordFilter-jp","stopWordFilter","stemmer","stemmer-jp"]}
    expect(indexObj.fields).toEqual(['title']);
    expect(indexObj.ref).toBe('_id');

    await gitDDB.destroy();
  });

  it('add index to the first level property', async () => {
    const dbName = monoId();
    const searchEngineOption: SearchEngineOption = {
      engineName: 'full-text',
      collectionPath: '',
      configs: [
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
    const searchIndex = (openOrCreate(
      gitDDB.rootCollection,
      searchEngineOption
    ) as unknown) as SearchIndexClassInterface & SearchIndexInterface;

    searchIndex.addIndex({
      _id: '1',
      title: 'x',
    });

    // Cannot read property of index directry.
    // Use stringify and parse.
    const indexObj = JSON.parse(JSON.stringify(searchIndex.indexes().title));
    // {"version":"0.9.5","fields":["title"],"ref":"_id","documentStore":{"docs":{"1":null},"docInfo":{"1":{"title":1}},"length":1,"save":false},"index":{"title":{"root":{"docs":{},"df":0,"x":{"docs":{"1":{"tf":1}},"df":1}}}},"pipeline":["lunr-multi-trimmer-en-ja","stopWordFilter-jp","stopWordFilter","stemmer","stemmer-jp"]}
    expect(indexObj.documentStore.docs).toEqual({ '1': null });
    expect(indexObj.index.title.root.x).toEqual({ docs: { '1': { tf: 1 } }, df: 1 });
    await gitDDB.destroy();
  });

  it('add index to the second level property', async () => {
    const dbName = monoId();
    const searchEngineOption: SearchEngineOption = {
      engineName: 'full-text',
      collectionPath: '',
      configs: [
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
    const searchIndex = (openOrCreate(
      gitDDB.rootCollection,
      searchEngineOption
    ) as unknown) as SearchIndexClassInterface & SearchIndexInterface;

    searchIndex.addIndex({
      _id: '1',
      book: {
        title: 'x',
      },
    });

    // Cannot read property of index directry.
    // Use stringify and parse.
    const indexObj = JSON.parse(JSON.stringify(searchIndex.indexes().title));
    // console.log(JSON.stringify(indexes['']['title']));
    // {"version":"0.9.5","fields":["book.title"],"ref":"_id","documentStore":{"docs":{"1":null},"docInfo":{"1":{"book.title":1}},"length":1,"save":false},"index":{"book.title":{"root":{"docs":{},"df":0,"x":{"docs":{"1":{"tf":1}},"df":1}}}},"pipeline":["lunr-multi-trimmer-en-ja","stopWordFilter-jp","stopWordFilter","stemmer","stemmer-jp"]}
    expect(indexObj.documentStore.docs).toEqual({ '1': null });
    expect(indexObj.index['book.title'].root.x).toEqual({
      docs: { '1': { tf: 1 } },
      df: 1,
    });
    await gitDDB.destroy();
  });

  it('search', async () => {
    const dbName = monoId();
    const searchEngineOption: SearchEngineOption = {
      engineName: 'full-text',
      collectionPath: '',
      configs: [
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
    const searchIndex = (openOrCreate(
      gitDDB.rootCollection,
      searchEngineOption
    ) as unknown) as SearchIndexClassInterface & SearchIndexInterface;

    searchIndex.addIndex({
      _id: '1',
      title: 'hello',
    });

    searchIndex.addIndex({
      _id: '2',
      title: 'world',
    });

    expect(searchIndex.search('title', 'hello')).toEqual([{ ref: '1', score: 1 }]);
    expect(searchIndex.search('title', 'world')).toEqual([{ ref: '2', score: 1 }]);

    await gitDDB.destroy();
  });

  it('boosting search', async () => {
    const dbName = monoId();
    const searchEngineOption: SearchEngineOption = {
      engineName: 'full-text',
      collectionPath: '',
      configs: [
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
    const searchIndex = (openOrCreate(
      gitDDB.rootCollection,
      searchEngineOption
    ) as unknown) as SearchIndexClassInterface & SearchIndexInterface;

    searchIndex.addIndex({
      _id: '1',
      title: 'hello',
      body: 'world',
    });

    searchIndex.addIndex({
      _id: '2',
      title: 'world',
      body: 'hello',
    });

    expect(searchIndex.search('title', 'hello')).toEqual([
      { ref: '1', score: 2 },
      { ref: '2', score: 1 },
    ]);

    await gitDDB.destroy();
  });

  it('search by AND', async () => {
    const dbName = monoId();
    const searchEngineOption: SearchEngineOption = {
      engineName: 'full-text',
      collectionPath: '',
      configs: [
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
    const searchIndex = (openOrCreate(
      gitDDB.rootCollection,
      searchEngineOption
    ) as unknown) as SearchIndexClassInterface & SearchIndexInterface;

    // match
    searchIndex.addIndex({
      _id: '1',
      title: 'hello world',
      body: 'planet',
    });

    // do not match
    searchIndex.addIndex({
      _id: '2',
      title: 'hello',
      body: 'world',
    });

    expect(searchIndex.search('title', 'hello world')).toMatchObject([{ ref: '1' }]);

    await gitDDB.destroy();
  });

  it('search by OR', async () => {
    const dbName = monoId();
    const searchEngineOption: SearchEngineOption = {
      engineName: 'full-text',
      collectionPath: '',
      configs: [
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
    const searchIndex = (openOrCreate(
      gitDDB.rootCollection,
      searchEngineOption
    ) as unknown) as SearchIndexClassInterface & SearchIndexInterface;

    // match
    searchIndex.addIndex({
      _id: '1',
      title: 'hello world',
      body: 'planet',
    });

    // do not match
    searchIndex.addIndex({
      _id: '2',
      title: 'hello',
      body: 'world',
    });

    expect(searchIndex.search('title', 'hello world', true)).toMatchObject([
      { ref: '1' },
      { ref: '2' },
    ]);

    await gitDDB.destroy();
  });

  it('search collection', async () => {
    const dbName = monoId();
    const searchEngineOption: SearchEngineOption = {
      engineName: 'full-text',
      collectionPath: 'book',
      configs: [
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
    const searchIndex = (openOrCreate(
      gitDDB.collection('book'),
      searchEngineOption
    ) as unknown) as SearchIndexClassInterface & SearchIndexInterface;

    searchIndex.addIndex({
      _id: '1',
      title: 'hello world',
      body: 'planet',
    });

    expect(searchIndex.search('title', 'hello world')).toMatchObject([{ ref: '1' }]);

    await gitDDB.destroy();
  });

  it('delete', async () => {
    const dbName = monoId();
    const searchEngineOption: SearchEngineOption = {
      engineName: 'full-text',
      collectionPath: '',
      configs: [
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
    const searchIndex = (openOrCreate(
      gitDDB.rootCollection,
      searchEngineOption
    ) as unknown) as SearchIndexClassInterface & SearchIndexInterface;

    searchIndex.addIndex({
      _id: '1',
      title: 'hello',
    });
    // console.log(JSON.stringify(indexes['']['title']));

    searchIndex.deleteIndex({
      _id: '1',
      title: 'hello',
    });
    //    console.log(JSON.stringify(indexes['']['title']));
    expect(searchIndex.search('title', 'hello')).toEqual([]);

    await gitDDB.destroy();
  });

  it('update', async () => {
    const dbName = monoId();
    const searchEngineOption: SearchEngineOption = {
      engineName: 'full-text',
      collectionPath: '',
      configs: [
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
    const searchIndex = (openOrCreate(
      gitDDB.rootCollection,
      searchEngineOption
    ) as unknown) as SearchIndexClassInterface & SearchIndexInterface;

    searchIndex.addIndex({
      _id: '1',
      title: 'hello',
    });

    searchIndex.updateIndex(
      {
        _id: '1',
        title: 'hello',
      },
      {
        _id: '1',
        title: 'こんにちは',
      }
    );

    // console.log(JSON.stringify(indexes['']['title']));
    expect(searchIndex.search('title', 'hello')).toEqual([]);
    expect(searchIndex.search('title', 'こんにちは')).toMatchObject([{ ref: '1' }]);

    await gitDDB.destroy();
  });

  it('rebuild rootCollection', async () => {
    const dbName = monoId();
    const gitDDB = new GitDocumentDB({
      dbName,
      localDir,
      // no SearchEngineOptions
    });
    await gitDDB.open();
    await gitDDB.put({
      _id: '1',
      title: 'hello',
    });
    await gitDDB.put({
      _id: '2',
      title: 'world',
    });
    await gitDDB.close();

    const gitDDB2 = new GitDocumentDB({
      dbName,
      localDir,
      // no SearchEngineOptions
    });
    await gitDDB2.open();
    const searchEngineOption: SearchEngineOption = {
      engineName: 'full-text',
      collectionPath: '',
      configs: [
        {
          indexName: 'title',
          targetProperties: ['title'],
          indexFilePath: localDir + `/${dbName}_index.zip`,
        },
      ],
    };
    const searchIndex = (openOrCreate(
      gitDDB2.rootCollection,
      searchEngineOption
    ) as unknown) as SearchIndexClassInterface & SearchIndexInterface;

    await searchIndex.rebuild();
    expect(searchIndex.search('title', 'hello')).toMatchObject([{ ref: '1' }]);
    expect(searchIndex.search('title', 'world')).toMatchObject([{ ref: '2' }]);
    await gitDDB2.destroy();
  });

  it('rebuild collection', async () => {
    const dbName = monoId();
    const gitDDB = new GitDocumentDB({
      dbName,
      localDir,
      // no SearchEngineOptions
    });
    await gitDDB.open();
    const bookCol = gitDDB.collection('book');
    await bookCol.put({
      _id: '1',
      title: 'hello',
    });
    await bookCol.put({
      _id: '2',
      title: 'world',
    });
    await gitDDB.close();

    const gitDDB2 = new GitDocumentDB({
      dbName,
      localDir,
      // no SearchEngineOptions
    });
    await gitDDB2.open();
    const searchEngineOption: SearchEngineOption = {
      engineName: 'full-text',
      collectionPath: 'book',
      configs: [
        {
          indexName: 'title',
          targetProperties: ['title'],
          indexFilePath: localDir + `/${dbName}_index.zip`,
        },
      ],
    };
    const searchIndex = (openOrCreate(
      gitDDB2.collection('book'),
      searchEngineOption
    ) as unknown) as SearchIndexClassInterface & SearchIndexInterface;

    await searchIndex.rebuild();
    expect(searchIndex.search('title', 'hello')).toMatchObject([{ ref: '1' }]);
    expect(searchIndex.search('title', 'world')).toMatchObject([{ ref: '2' }]);
    await gitDDB2.destroy();
  });
});

describe('<search/elasticlunr> call through GitDocumentDB', () => {
  it('create index in GitDocumentDB#open', async () => {
    const dbName = monoId();
    const searchEngineOption: SearchEngineOption = {
      // engineName: 'full-text''
      collectionPath: '',
      configs: [
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
      searchEngineOptions: [searchEngineOption],
    });
    // SearchEngine['full-text'].openOrCreate(gitDDB, ', searchEngineOptions) will be called in gitDDB.open()
    await gitDDB.open();
    // Cannot read property of index directry.
    // Use stringify and parse.
    const searchIndex = gitDDB.rootCollection.searchIndex() as SearchIndexClassInterface &
      SearchIndexInterface;
    const indexObj = JSON.parse(JSON.stringify(searchIndex.indexes().title));
    // {"version":"0.9.5","fields":["title"],"ref":"_id","documentStore":{"docs":{},"docInfo":{},"length":0,"save":false},"index":{"title":{"root":{"docs":{},"df":0}}},"pipeline":["lunr-multi-trimmer-en-ja","stopWordFilter-jp","stopWordFilter","stemmer","stemmer-jp"]}
    expect(indexObj.fields).toEqual(['title']);
    expect(indexObj.ref).toBe('_id');

    await gitDDB.destroy();
  });

  it('put', async () => {
    const dbName = monoId();
    const searchEngineOption: SearchEngineOption = {
      // engineName: 'full-text''
      collectionPath: '',
      configs: [
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
      searchEngineOptions: [searchEngineOption],
    });
    await gitDDB.open();
    await gitDDB.put({
      _id: '1',
      title: 'x',
    });

    // Cannot read property of index directry.
    // Use stringify and parse.
    const searchIndex = gitDDB.rootCollection.searchIndex() as SearchIndexClassInterface &
      SearchIndexInterface;
    const indexObj = JSON.parse(JSON.stringify(searchIndex.indexes().title));
    expect(indexObj.documentStore.docs).toEqual({ '1': null });
    expect(indexObj.index.title.root.x).toEqual({ docs: { '1': { tf: 1 } }, df: 1 });

    await gitDDB.destroy();
  });

  it('update', async () => {
    const dbName = monoId();
    const searchEngineOption: SearchEngineOption = {
      // engineName: 'full-text''
      collectionPath: '',
      configs: [
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
      searchEngineOptions: [searchEngineOption],
    });
    await gitDDB.open();
    await gitDDB.put({
      _id: '1',
      title: 'x',
    });

    await gitDDB.put({
      _id: '1',
      title: 'y',
    });

    // Cannot read property of index directry.
    // Use stringify and parse.
    const searchIndex = gitDDB.rootCollection.searchIndex() as SearchIndexClassInterface &
      SearchIndexInterface;
    const indexObj = JSON.parse(JSON.stringify(searchIndex.indexes().title));
    expect(indexObj.index.title.root.x).toEqual({ docs: {}, df: 0 });
    expect(indexObj.index.title.root.y).toEqual({ docs: { '1': { tf: 1 } }, df: 1 });

    await gitDDB.destroy();
  });

  it('delete', async () => {
    const dbName = monoId();
    const searchEngineOption: SearchEngineOption = {
      // engineName: 'full-text''
      collectionPath: '',
      configs: [
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
      searchEngineOptions: [searchEngineOption],
    });
    await gitDDB.open();
    await gitDDB.put({
      _id: '1',
      title: 'x',
    });

    await gitDDB.delete('1');

    // Cannot read property of index directry.
    // Use stringify and parse.
    const searchIndex = gitDDB.rootCollection.searchIndex() as SearchIndexClassInterface &
      SearchIndexInterface;
    const indexObj = JSON.parse(JSON.stringify(searchIndex.indexes().title));
    expect(indexObj.documentStore.docs).toEqual({});
    expect(indexObj.index.title.root.x).toEqual({ docs: {}, df: 0 });

    await gitDDB.destroy();
  });

  it('rebuild collection', async () => {
    const dbName = monoId();
    const searchEngineOption: SearchEngineOption = {
      collectionPath: 'book',
      // engineName: 'full-text''
      configs: [
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
      searchEngineOptions: [searchEngineOption],
    });
    await gitDDB.open();
    const bookCol = gitDDB.collection('book');
    await bookCol.put({
      _id: '1',
      title: 'hello',
    });
    await bookCol.put({
      _id: '2',
      title: 'world',
    });

    await gitDDB.close();

    const gitDDB2 = new GitDocumentDB({
      dbName,
      localDir,
      searchEngineOptions: [searchEngineOption],
    });
    await gitDDB2.open();
    const bookCol2 = gitDDB2.collection('book');
    await bookCol2.rebuildIndex();

    expect(bookCol2.search('title', 'hello')).toMatchObject([{ ref: '1' }]);
    expect(bookCol2.search('title', 'world')).toMatchObject([{ ref: '2' }]);
    await gitDDB2.destroy();
  });

  it('auto serialization before closing', async () => {
    const dbName = monoId();
    const searchEngineOption: SearchEngineOption = {
      engineName: 'full-text',
      collectionPath: '',
      configs: [
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
      searchEngineOptions: [searchEngineOption],
    });
    await gitDDB.open();
    await gitDDB.put({
      _id: '1',
      title: 'hello',
    });
    await gitDDB.put({
      _id: '2',
      title: 'world',
    });
    await gitDDB.close();

    const gitDDB2 = new GitDocumentDB({
      dbName,
      localDir,
      searchEngineOptions: [searchEngineOption],
    });
    await gitDDB2.open();

    expect(gitDDB2.search('title', 'hello')).toMatchObject([{ ref: '1' }]);
    expect(gitDDB2.search('title', 'world')).toMatchObject([{ ref: '2' }]);

    await gitDDB2.destroy();
  });
});

describe('<search/elasticlunr> large db', () => {
  /*
  it('rebuild collection', async () => {
    const dbName = monoId();
    const searchEngineOption: SearchEngineOption = {
      collectionPath: 'card',
      // engineName: 'full-text''
      configs: [
        {
          indexName: '_body',
          targetProperties: ['_body'],
          indexFilePath: '../book001_index.zip',
        },
      ],
    };
    const gitDDB = new GitDocumentDB({
      dbName: 'book001',
      localDir: 'C:\\Users\\hidek\\AppData\\Local\\petasti_data\\',
      searchEngineOptions: [searchEngineOption],
      serialize: 'front-matter',
    });
    await gitDDB.open();
    const bookCol = gitDDB.collection('card');
    console.time('rebuild');
    await bookCol.rebuildIndex();
    console.timeEnd('rebuild');
    const searchResults = bookCol.search('_body', '#journal');
    for (const result of searchResults) {
      // eslint-disable-next-line no-await-in-loop
      const doc = await bookCol.get(result.ref);
      const _body = doc!._body as string;
      console.log('######### ' + result.score);
      console.log(_body.substring(0, 140) + '/n');
    }
    await gitDDB.close();
  });
  */

  it('delete index', async () => {
    const dbName = monoId();
    const searchEngineOption: SearchEngineOption = {
      engineName: 'full-text',
      collectionPath: '',
      configs: [
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
      searchEngineOptions: [searchEngineOption],
    });
    await gitDDB.open();
    await gitDDB.put({
      _id: '1',
      title: 'hello',
    });
    await gitDDB.close();

    const gitDDB2 = new GitDocumentDB({
      dbName,
      localDir,
      searchEngineOptions: [searchEngineOption],
    });
    await gitDDB2.open();
    const result = gitDDB2.search('title', 'hello');
    expect(result[0].ref).toEqual('1');
    expect(fs.existsSync(searchEngineOption.configs[0].indexFilePath)).toBe(true);
    gitDDB2.rootCollection.searchIndex?.destroy();
    expect(fs.existsSync(searchEngineOption.configs[0].indexFilePath)).toBe(false);

    await gitDDB2.destroy();
  });
});
