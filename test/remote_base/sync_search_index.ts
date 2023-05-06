/* eslint-disable @typescript-eslint/naming-convention */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

/**
 * Test search index in synchronizing
 * by using GitHub Personal Access Token
 * These tests create a new repository on GitHub if not exists.
 */
import git from 'isomorphic-git';
import fs from 'fs-extra';
import expect from 'expect';
import sinon from 'sinon';
import { GitDocumentDB } from '../../src/git_documentdb';
import {
  ConnectionSettings,
  RemoteOptions,
  SearchEngineOption,
  SyncResult,
  SyncResultFastForwardMerge,
  SyncResultMergeAndPush,
  SyncResultPush,
} from '../../src/types';

import {
  compareWorkingDirAndBlobs,
  createClonedDatabases,
  createDatabase,
  destroyDBs,
  getChangedFileDelete,
  getChangedFileInsert,
  getChangedFileUpdate,
  getCommitInfo,
  getWorkingDirDocs,
  removeRemoteRepositories,
  resetRemoteCommonRepository,
} from '../remote_utils';
import { JSON_POSTFIX } from '../../src/const';
import { SearchIndexClassInterface } from '../../src/plugin/search-elasticlunr';

export const syncSearchIndexBase = (
  connection: ConnectionSettings,
  remoteURLBase: string,
  reposPrefix: string,
  localDir: string
) => () => {
  let idCounter = 0;
  const serialId = () => {
    return `${reposPrefix}${idCounter++}`;
  };

  // Use commonId to reduce API calls to GitHub
  const commonId = () => {
    return `${reposPrefix}common`;
  };

  // Use sandbox to restore stub and spy in parallel mocha tests
  let sandbox: sinon.SinonSandbox;
  beforeEach(function () {
    // To avoid secondary rate limit of GitHub
    // await new Promise(resolve => setTimeout(resolve, 3000));

    sandbox = sinon.createSandbox();
  });

  afterEach(function () {
    sandbox.restore();
  });

  before(async () => {
    await removeRemoteRepositories(reposPrefix);
  });

  describe('<remote/sync_search_index> ', () => {
    describe('add index', () => {
      /**
       * before:
       * dbA   :  jsonA1
       * dbB   :
       * after :  jsonA1
       */
      it('FastForwardMerge', async () => {
        await resetRemoteCommonRepository(remoteURLBase, localDir, serialId, commonId);
        const searchEngineOption: SearchEngineOption = {
          engineName: 'full-text',
          collectionPath: 'book',
          configs: [
            {
              indexName: 'title',
              targetProperties: ['title'],
              indexFilePath: '',
            },
          ],
        };
        const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
          remoteURLBase,
          localDir,
          serialId,
          commonId,
          { connection },
          'trace',
          searchEngineOption
        );
        const collectionA = dbA.collection('book');
        // A puts and pushes
        const jsonA1 = { _id: '1', title: 'x' };
        await collectionA.put(jsonA1);

        await syncA.tryPush();

        const collectionB = dbB.collection('book');

        // B syncs
        const syncResult1 = (await syncB.trySync()) as SyncResultFastForwardMerge;
        expect(syncResult1.action).toBe('fast-forward merge');

        const searchIndex = (collectionB.searchIndex() as unknown) as SearchIndexClassInterface;
        // console.log(JSON.stringify(searchIndex.indexes()));
        const indexObj = JSON.parse(JSON.stringify(searchIndex.indexes()));
        expect(indexObj.title.index.title.root.x).toEqual({
          docs: { '1': { tf: 1 } },
          df: 1,
        });

        await destroyDBs([dbA, dbB]);
      });

      /**
       * before:
       * dbA   :  jsonA1
       * dbB   :          jsonB2
       * after :  jsonA1  jsonB2
       */
      it('MergeAndPush', async () => {
        await resetRemoteCommonRepository(remoteURLBase, localDir, serialId, commonId);
        const searchEngineOption: SearchEngineOption = {
          engineName: 'full-text',
          collectionPath: 'book',
          configs: [
            {
              indexName: 'title',
              targetProperties: ['title'],
              indexFilePath: '',
            },
          ],
        };

        const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
          remoteURLBase,
          localDir,
          serialId,
          commonId,
          { connection },
          'trace',
          searchEngineOption
        );

        // A puts and pushes
        const collectionA = dbA.collection('book');
        // A puts and pushes
        const jsonA1 = { _id: '1', title: 'x' };
        await collectionA.put(jsonA1);

        await syncA.tryPush();

        const collectionB = dbB.collection('book');

        // B syncs
        const jsonB2 = { _id: '2', name: 'y' };
        await collectionB.put(jsonB2);

        // Sync dbB
        const syncResult1 = (await syncB.trySync()) as SyncResultMergeAndPush;
        expect(syncResult1.action).toBe('merge and push');

        const searchIndex = (collectionB.searchIndex() as unknown) as SearchIndexClassInterface;
        // console.log(JSON.stringify(searchIndex.indexes()));
        const indexObj = JSON.parse(JSON.stringify(searchIndex.indexes()));
        expect(indexObj.title.index.title.root.x).toEqual({
          docs: { '1': { tf: 1 } },
          df: 1,
        });

        await destroyDBs([dbA, dbB]);
      });
    });

    describe('update index', () => {
      /**
       * before:  jsonA1
       * dbA   : +jsonA1
       * dbB   :  jsonA1
       * after : +jsonA1
       */
      it('FastForwardMerge', async () => {
        await resetRemoteCommonRepository(remoteURLBase, localDir, serialId, commonId);
        const searchEngineOption: SearchEngineOption = {
          engineName: 'full-text',
          collectionPath: 'book',
          configs: [
            {
              indexName: 'title',
              targetProperties: ['title'],
              indexFilePath: '',
            },
          ],
        };
        const [dbA, syncA] = await createDatabase(
          remoteURLBase,
          localDir,
          serialId,
          commonId,
          {
            connection,
          },
          undefined,
          searchEngineOption
        );
        // A puts and pushes
        const collectionA = dbA.collection('book');
        // A puts and pushes
        const jsonA1 = { _id: '1', title: 'x' };
        await collectionA.put(jsonA1);

        await syncA.tryPush();

        // Clone
        const dbNameB = serialId();
        searchEngineOption.configs[0].indexFilePath =
          localDir + `/${dbNameB}_${searchEngineOption.configs[0].indexName}_index.zip`;
        const dbB: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameB,
          localDir,
          searchEngineOptions: [searchEngineOption],
        });
        // Clone dbA
        await dbB.open();

        const collectionB = dbB.collection('book');

        const syncB = await dbB.sync(syncA.options);

        // A updates and pushes
        const jsonA1dash = { _id: '1', title: 'y' };
        await collectionA.put(jsonA1dash);
        await syncA.tryPush();

        const syncResult1 = await syncB.trySync();
        expect(syncResult1.action).toBe('fast-forward merge');

        const searchIndex = (collectionB.searchIndex() as unknown) as SearchIndexClassInterface;
        // console.log(JSON.stringify(searchIndex.indexes()));

        const indexObj = JSON.parse(JSON.stringify(searchIndex.indexes()));
        expect(indexObj.title.index.title.root.x).toEqual({
          docs: {},
          df: 0,
        });
        expect(indexObj.title.index.title.root.y).toEqual({
          docs: { '1': { tf: 1 } },
          df: 1,
        });

        await destroyDBs([dbA, dbB]);
      });
    });

    describe('delete index', () => {
      /**
       * before:  jsonA1
       * dbA   : -jsonA1
       * dbB   :
       * after :
       */
      it('FastForward', async () => {
        await resetRemoteCommonRepository(remoteURLBase, localDir, serialId, commonId);
        const searchEngineOption: SearchEngineOption = {
          engineName: 'full-text',
          collectionPath: 'book',
          configs: [
            {
              indexName: 'title',
              targetProperties: ['title'],
              indexFilePath: '',
            },
          ],
        };
        const [dbA, syncA] = await createDatabase(
          remoteURLBase,
          localDir,
          serialId,
          commonId,
          {
            connection,
          },
          undefined,
          searchEngineOption
        );

        // A puts and pushes
        const collectionA = dbA.collection('book');
        // A puts and pushes
        const jsonA1 = { _id: '1', title: 'x' };
        await collectionA.put(jsonA1);

        await syncA.tryPush();

        const dbNameB = serialId();
        searchEngineOption.configs[0].indexFilePath =
          localDir + `/${dbNameB}_${searchEngineOption.configs[0].indexName}_index.zip`;
        const dbB: GitDocumentDB = new GitDocumentDB({
          dbName: dbNameB,
          localDir,
          searchEngineOptions: [searchEngineOption],
        });
        // Clone dbA
        await dbB.open();
        const collectionB = dbB.collection('book');

        const syncB = await dbB.sync(syncA.options);

        // A deletes and syncs
        await collectionA.delete(jsonA1);
        await syncA.tryPush();

        // B syncs
        const syncResult1 = await syncB.trySync();
        expect(syncResult1.action).toBe('fast-forward merge');

        const searchIndex = (collectionB.searchIndex() as unknown) as SearchIndexClassInterface;
        // console.log(JSON.stringify(searchIndex.indexes()));

        const indexObj = JSON.parse(JSON.stringify(searchIndex.indexes()));
        expect(indexObj.title.index.title.root.x).toEqual({
          docs: {},
          df: 0,
        });

        await destroyDBs([dbA, dbB]);
      });
    });
  });
};
