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
import { GitDocumentDB } from '../../src/git_documentdb';
import { SearchEngineOptions } from '../../src/types';
import {
  addIndex,
  close,
  deleteIndex,
  destroy,
  indexes,
  openOrCreate,
  rebuild,
  search,
  serialize,
  updateIndex,
} from '../../src/plugin/search-elasticlunr';

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
    openOrCreate('', searchEngineOptions);
    // Cannot read property of index directry.
    // Use stringify and parse.
    const indexObj = JSON.parse(JSON.stringify(indexes[''].title));
    // {"version":"0.9.5","fields":["title"],"ref":"_id","documentStore":{"docs":{},"docInfo":{},"length":0,"save":false},"index":{"title":{"root":{"docs":{},"df":0}}},"pipeline":["lunr-multi-trimmer-en-ja","stopWordFilter-jp","stopWordFilter","stemmer","stemmer-jp"]}
    expect(indexObj.fields).toEqual(['title']);
    expect(indexObj.ref).toBe('_id');
    await gitDDB.destroy();
  });

  it('load index', async () => {
    const dbName = monoId();
    const searchEngineOptions: SearchEngineOptions = {
      name: 'full-text',
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
    let isCreated = openOrCreate('', searchEngineOptions);
    expect(isCreated).toEqual([true]);
    serialize();
    close();

    isCreated = openOrCreate('', searchEngineOptions);
    expect(isCreated).toEqual([false]);
    // Cannot read property of index directry.
    // Use stringify and parse.
    // console.log(JSON.stringify(indexes));
    const indexObj = JSON.parse(JSON.stringify(indexes[''].title));
    // {"version":"0.9.5","fields":["title"],"ref":"_id","documentStore":{"docs":{},"docInfo":{},"length":0,"save":false},"index":{"title":{"root":{"docs":{},"df":0}}},"pipeline":["lunr-multi-trimmer-en-ja","stopWordFilter-jp","stopWordFilter","stemmer","stemmer-jp"]}
    expect(indexObj.fields).toEqual(['title']);
    expect(indexObj.ref).toBe('_id');

    await gitDDB.destroy();
  });

  it('add index to the first level property', async () => {
    const dbName = monoId();
    const searchEngineOptions: SearchEngineOptions = {
      name: 'full-text',
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
    openOrCreate('', searchEngineOptions);

    addIndex('', {
      _id: '1',
      title: 'x',
    });

    // Cannot read property of index directry.
    // Use stringify and parse.
    const indexObj = JSON.parse(JSON.stringify(indexes[''].title));
    // {"version":"0.9.5","fields":["title"],"ref":"_id","documentStore":{"docs":{"1":null},"docInfo":{"1":{"title":1}},"length":1,"save":false},"index":{"title":{"root":{"docs":{},"df":0,"x":{"docs":{"1":{"tf":1}},"df":1}}}},"pipeline":["lunr-multi-trimmer-en-ja","stopWordFilter-jp","stopWordFilter","stemmer","stemmer-jp"]}
    expect(indexObj.documentStore.docs).toEqual({ '1': null });
    expect(indexObj.index.title.root.x).toEqual({ docs: { '1': { tf: 1 } }, df: 1 });
    await gitDDB.destroy();
  });

  it('add index to the second level property', async () => {
    const dbName = monoId();
    const searchEngineOptions: SearchEngineOptions = {
      name: 'full-text',
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
    openOrCreate('', searchEngineOptions);

    addIndex('', {
      _id: '1',
      book: {
        title: 'x',
      },
    });

    // Cannot read property of index directry.
    // Use stringify and parse.
    const indexObj = JSON.parse(JSON.stringify(indexes[''].title));
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
    const searchEngineOptions: SearchEngineOptions = {
      name: 'full-text',
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

    expect(search('', 'title', 'hello')).toEqual([
      { ref: '1', score: 2 },
      { ref: '2', score: 1 },
    ]);

    await gitDDB.destroy();
  });

  it('search by AND', async () => {
    const dbName = monoId();
    const searchEngineOptions: SearchEngineOptions = {
      name: 'full-text',
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

    expect(search('', 'title', 'hello world', true)).toMatchObject([
      { ref: '1' },
      { ref: '2' },
    ]);

    await gitDDB.destroy();
  });

  it('search collection', async () => {
    const dbName = monoId();
    const searchEngineOptions: SearchEngineOptions = {
      name: 'full-text',
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
    openOrCreate('book', searchEngineOptions);

    addIndex('book', {
      _id: '1',
      title: 'hello world',
      body: 'planet',
    });

    expect(search('book', 'title', 'hello world')).toMatchObject([{ ref: '1' }]);

    await gitDDB.destroy();
  });

  it('delete', async () => {
    const dbName = monoId();
    const searchEngineOptions: SearchEngineOptions = {
      name: 'full-text',
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
    openOrCreate('', searchEngineOptions);

    addIndex('', {
      _id: '1',
      title: 'hello',
    });
    // console.log(JSON.stringify(indexes['']['title']));

    deleteIndex('', {
      _id: '1',
      title: 'hello',
    });
    //    console.log(JSON.stringify(indexes['']['title']));
    expect(search('', 'title', 'hello')).toEqual([]);

    await gitDDB.destroy();
  });

  it('update', async () => {
    const dbName = monoId();
    const searchEngineOptions: SearchEngineOptions = {
      name: 'full-text',
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
    openOrCreate('', searchEngineOptions);

    addIndex('', {
      _id: '1',
      title: 'hello',
    });

    updateIndex(
      '',
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
    expect(search('', 'title', 'hello')).toEqual([]);
    expect(search('', 'title', 'こんにちは')).toMatchObject([{ ref: '1' }]);

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
    const searchEngineOptions: SearchEngineOptions = {
      name: 'full-text',
      configs: [
        {
          indexName: 'title',
          targetProperties: ['title'],
          indexFilePath: localDir + `/${dbName}_index.zip`,
        },
      ],
    };
    openOrCreate('', searchEngineOptions);
    await rebuild(gitDDB2);
    expect(search('', 'title', 'hello')).toMatchObject([{ ref: '1' }]);
    expect(search('', 'title', 'world')).toMatchObject([{ ref: '2' }]);
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
    const searchEngineOptions: SearchEngineOptions = {
      name: 'full-text',
      configs: [
        {
          indexName: 'title',
          targetProperties: ['title'],
          indexFilePath: localDir + `/${dbName}_index.zip`,
        },
      ],
    };
    openOrCreate('book', searchEngineOptions);
    await rebuild(gitDDB2);
    expect(search('book', 'title', 'hello')).toMatchObject([{ ref: '1' }]);
    expect(search('book', 'title', 'world')).toMatchObject([{ ref: '2' }]);
    await gitDDB2.destroy();
  });
});

describe('<search/elasticlunr> call through GitDocumentDB', () => {
  it('create index in GitDocumentDB#open', async () => {
    const dbName = monoId();
    const searchEngineOptions: SearchEngineOptions = {
      // name: 'full-text'
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
      searchEngineOptions,
    });
    // SearchEngine['full-text'].openOrCreate(gitDDB, '', searchEngineOptions) will be called in gitDDB.open()
    await gitDDB.open();
    // Cannot read property of index directry.
    // Use stringify and parse.
    const indexObj = JSON.parse(JSON.stringify(indexes[''].title));
    // {"version":"0.9.5","fields":["title"],"ref":"_id","documentStore":{"docs":{},"docInfo":{},"length":0,"save":false},"index":{"title":{"root":{"docs":{},"df":0}}},"pipeline":["lunr-multi-trimmer-en-ja","stopWordFilter-jp","stopWordFilter","stemmer","stemmer-jp"]}
    expect(indexObj.fields).toEqual(['title']);
    expect(indexObj.ref).toBe('_id');

    await gitDDB.destroy();
  });

  it('put', async () => {
    const dbName = monoId();
    const searchEngineOptions: SearchEngineOptions = {
      // name: 'full-text'
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
      searchEngineOptions,
    });
    await gitDDB.open();
    await gitDDB.put({
      _id: '1',
      title: 'x',
    });

    // Cannot read property of index directry.
    // Use stringify and parse.
    const indexObj = JSON.parse(JSON.stringify(indexes[''].title));
    expect(indexObj.documentStore.docs).toEqual({ '1': null });
    expect(indexObj.index.title.root.x).toEqual({ docs: { '1': { tf: 1 } }, df: 1 });

    await gitDDB.destroy();
  });

  it('update', async () => {
    const dbName = monoId();
    const searchEngineOptions: SearchEngineOptions = {
      // name: 'full-text'
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
      searchEngineOptions,
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
    const indexObj = JSON.parse(JSON.stringify(indexes[''].title));
    expect(indexObj.index.title.root.x).toEqual({ docs: {}, df: 0 });
    expect(indexObj.index.title.root.y).toEqual({ docs: { '1': { tf: 1 } }, df: 1 });

    await gitDDB.destroy();
  });

  it('delete', async () => {
    const dbName = monoId();
    const searchEngineOptions: SearchEngineOptions = {
      // name: 'full-text'
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
      searchEngineOptions,
    });
    await gitDDB.open();
    await gitDDB.put({
      _id: '1',
      title: 'x',
    });

    await gitDDB.delete('1');

    // Cannot read property of index directry.
    // Use stringify and parse.
    const indexObj = JSON.parse(JSON.stringify(indexes[''].title));
    expect(indexObj.documentStore.docs).toEqual({});
    expect(indexObj.index.title.root.x).toEqual({ docs: {}, df: 0 });

    await gitDDB.destroy();
  });
});
