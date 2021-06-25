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
import git from 'isomorphic-git';
import expect from 'expect';
import { monotonicFactory } from 'ulid';
import { Collection } from '../src/collection';
import { JSON_EXT, SHORT_SHA_LENGTH } from '../src/const';
import { toSortedJSONString } from '../src/utils';
import { GitDocumentDB } from '../src/git_documentdb';
import { InvalidJsonObjectError, SameIdExistsError } from '../src/error';
import { addOneData } from './utils';

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = `./test/database_collection_find`;

beforeEach(function () {
  // @ts-ignore
  console.log(`... ${this.currentTest.fullTitle()}`);
});

after(() => {
  fs.removeSync(path.resolve(localDir));
});

describe('<collection>', () => {
  const _id_1 = '1';
  const name_1 = 'one';
  const _id_a = 'apple';
  const name_a = 'Apple woman';
  const _id_b = 'banana';
  const name_b = 'Banana man';
  const _id_c = 'cherry';
  const name_c = 'Cherry cat';

  const _id_c000 = 'citrus_carrot';
  const name_c000 = 'Citrus and carrot';
  const _id_c001 = 'citrus_celery';
  const name_c001 = 'Citrus and celery';

  const _id_c01 = 'citrus/amanatsu';
  const name_c01 = 'Amanatsu boy';
  const _id_c02 = 'citrus/yuzu';
  const name_c02 = 'Yuzu girl';
  const _id_d = 'durio/durian';
  const name_d = 'Durian girls';
  const _id_p = 'pear/Japan/21st';
  const name_p = '21st century pear';

  describe('find()', () => {
    it('throws InvalidJsonObjectError', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const col = new Collection(gitDDB, 'col01');
      await addOneData(
        gitDDB,
        col.collectionPath + 'invalidJSON' + JSON_EXT,
        'invalidJSON'
      );

      await expect(col.find()).rejects.toThrowError(InvalidJsonObjectError);

      await gitDDB.destroy();
    });

    it('returns empty', async () => {
      const dbName = monoId();

      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });

      await gitDDB.open();
      const col = new Collection(gitDDB, 'col01');
      await expect(col.find()).resolves.toEqual([]);

      await gitDDB.destroy();
    });

    it('returns docs by breadth-first search (recursive)', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const col = new Collection(gitDDB, 'col01');

      const json_b = { _id: col.collectionPath + _id_b, name: name_b };
      const json_a = { _id: col.collectionPath + _id_a, name: name_a };
      const json_d = { _id: col.collectionPath + _id_d, name: name_d };
      const json_c01 = { _id: col.collectionPath + _id_c01, name: name_c01 };
      const json_c02 = { _id: col.collectionPath + _id_c02, name: name_c02 };

      const json_b_ = { _id: _id_b, name: name_b };
      const json_a_ = { _id: _id_a, name: name_a };
      const json_d_ = { _id: _id_d, name: name_d };
      const json_c01_ = { _id: _id_c01, name: name_c01 };
      const json_c02_ = { _id: _id_c02, name: name_c02 };

      await addOneData(
        gitDDB,
        col.collectionPath + _id_b + JSON_EXT,
        toSortedJSONString(json_b)
      );
      await addOneData(
        gitDDB,
        col.collectionPath + _id_a + JSON_EXT,
        toSortedJSONString(json_a)
      );
      await addOneData(
        gitDDB,
        col.collectionPath + _id_d + JSON_EXT,
        toSortedJSONString(json_d)
      );
      await addOneData(
        gitDDB,
        col.collectionPath + _id_c01 + JSON_EXT,
        toSortedJSONString(json_c01)
      );
      await addOneData(
        gitDDB,
        col.collectionPath + _id_c02 + JSON_EXT,
        toSortedJSONString(json_c02)
      );

      await expect(col.find()).resolves.toEqual([
        json_a_,
        json_b_,
        json_c01_,
        json_c02_,
        json_d_,
      ]);

      await gitDDB.destroy();
    });

    describe('Prefix search', () => {
      it('gets from directory', async () => {
        const dbName = monoId();
        const gitDDB: GitDocumentDB = new GitDocumentDB({
          dbName,
          localDir,
        });
        await gitDDB.open();
        const col = new Collection(gitDDB, 'col01');

        const json_b = { _id: col.collectionPath + _id_b, name: name_b };
        const json_a = { _id: col.collectionPath + _id_a, name: name_a };
        const json_d = { _id: col.collectionPath + _id_d, name: name_d };
        const json_c000 = { _id: col.collectionPath + _id_c000, name: name_c000 };
        const json_c001 = { _id: col.collectionPath + _id_c001, name: name_c001 };
        const json_c01 = { _id: col.collectionPath + _id_c01, name: name_c01 };
        const json_c02 = { _id: col.collectionPath + _id_c02, name: name_c02 };

        const json_b_ = { _id: _id_b, name: name_b };
        const json_a_ = { _id: _id_a, name: name_a };
        const json_d_ = { _id: _id_d, name: name_d };
        const json_c000_ = { _id: _id_c000, name: name_c000 };
        const json_c001_ = { _id: _id_c001, name: name_c001 };
        const json_c01_ = { _id: _id_c01, name: name_c01 };
        const json_c02_ = { _id: _id_c02, name: name_c02 };

        await addOneData(
          gitDDB,
          col.collectionPath + _id_b + JSON_EXT,
          toSortedJSONString(json_b)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_a + JSON_EXT,
          toSortedJSONString(json_a)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_d + JSON_EXT,
          toSortedJSONString(json_d)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_c000 + JSON_EXT,
          toSortedJSONString(json_c000)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_c001 + JSON_EXT,
          toSortedJSONString(json_c001)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_c01 + JSON_EXT,
          toSortedJSONString(json_c01)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_c02 + JSON_EXT,
          toSortedJSONString(json_c02)
        );

        const prefix = 'citrus/';

        await expect(col.find({ prefix })).resolves.toEqual([json_c01_, json_c02_]);

        await gitDDB.destroy();
      });

      it('gets only from top directory', async () => {
        const dbName = monoId();
        const gitDDB: GitDocumentDB = new GitDocumentDB({
          dbName,
          localDir,
        });
        await gitDDB.open();
        const col = new Collection(gitDDB, 'col01');

        const json_b = { _id: col.collectionPath + _id_b, name: name_b };
        const json_a = { _id: col.collectionPath + _id_a, name: name_a };
        const json_d = { _id: col.collectionPath + _id_d, name: name_d };
        const json_c000 = { _id: col.collectionPath + _id_c000, name: name_c000 };
        const json_c001 = { _id: col.collectionPath + _id_c001, name: name_c001 };
        const json_c01 = { _id: col.collectionPath + _id_c01, name: name_c01 };
        const json_c02 = { _id: col.collectionPath + _id_c02, name: name_c02 };

        const json_b_ = { _id: _id_b, name: name_b };
        const json_a_ = { _id: _id_a, name: name_a };
        const json_d_ = { _id: _id_d, name: name_d };
        const json_c000_ = { _id: _id_c000, name: name_c000 };
        const json_c001_ = { _id: _id_c001, name: name_c001 };
        const json_c01_ = { _id: _id_c01, name: name_c01 };
        const json_c02_ = { _id: _id_c02, name: name_c02 };

        await addOneData(
          gitDDB,
          col.collectionPath + _id_b + JSON_EXT,
          toSortedJSONString(json_b)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_a + JSON_EXT,
          toSortedJSONString(json_a)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_d + JSON_EXT,
          toSortedJSONString(json_d)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_c000 + JSON_EXT,
          toSortedJSONString(json_c000)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_c001 + JSON_EXT,
          toSortedJSONString(json_c001)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_c01 + JSON_EXT,
          toSortedJSONString(json_c01)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_c02 + JSON_EXT,
          toSortedJSONString(json_c02)
        );

        const prefix = 'cit';

        await expect(col.find({ prefix, recursive: false })).resolves.toEqual([
          json_c000_,
          json_c001_,
        ]);

        await gitDDB.destroy();
      });

      it('gets from parent directory and child directory', async () => {
        const dbName = monoId();
        const gitDDB: GitDocumentDB = new GitDocumentDB({
          dbName,
          localDir,
        });
        await gitDDB.open();
        const col = new Collection(gitDDB, 'col01');

        const json_b = { _id: col.collectionPath + _id_b, name: name_b };
        const json_a = { _id: col.collectionPath + _id_a, name: name_a };
        const json_d = { _id: col.collectionPath + _id_d, name: name_d };
        const json_c000 = { _id: col.collectionPath + _id_c000, name: name_c000 };
        const json_c001 = { _id: col.collectionPath + _id_c001, name: name_c001 };
        const json_c01 = { _id: col.collectionPath + _id_c01, name: name_c01 };
        const json_c02 = { _id: col.collectionPath + _id_c02, name: name_c02 };

        const json_b_ = { _id: _id_b, name: name_b };
        const json_a_ = { _id: _id_a, name: name_a };
        const json_d_ = { _id: _id_d, name: name_d };
        const json_c000_ = { _id: _id_c000, name: name_c000 };
        const json_c001_ = { _id: _id_c001, name: name_c001 };
        const json_c01_ = { _id: _id_c01, name: name_c01 };
        const json_c02_ = { _id: _id_c02, name: name_c02 };

        await addOneData(
          gitDDB,
          col.collectionPath + _id_b + JSON_EXT,
          toSortedJSONString(json_b)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_a + JSON_EXT,
          toSortedJSONString(json_a)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_d + JSON_EXT,
          toSortedJSONString(json_d)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_c000 + JSON_EXT,
          toSortedJSONString(json_c000)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_c001 + JSON_EXT,
          toSortedJSONString(json_c001)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_c01 + JSON_EXT,
          toSortedJSONString(json_c01)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_c02 + JSON_EXT,
          toSortedJSONString(json_c02)
        );

        const prefix = 'citrus';

        await expect(col.find({ prefix })).resolves.toEqual([
          json_c000_,
          json_c001_,
          json_c01_,
          json_c02_,
        ]);

        await gitDDB.destroy();
      });

      it('gets from a sub directory', async () => {
        const dbName = monoId();
        const gitDDB: GitDocumentDB = new GitDocumentDB({
          dbName,
          localDir,
        });
        await gitDDB.open();
        const col = new Collection(gitDDB, 'col01');

        const json_b = { _id: col.collectionPath + _id_b, name: name_b };
        const json_a = { _id: col.collectionPath + _id_a, name: name_a };
        const json_d = { _id: col.collectionPath + _id_d, name: name_d };
        const json_c000 = { _id: col.collectionPath + _id_c000, name: name_c000 };
        const json_c001 = { _id: col.collectionPath + _id_c001, name: name_c001 };
        const json_c01 = { _id: col.collectionPath + _id_c01, name: name_c01 };
        const json_c02 = { _id: col.collectionPath + _id_c02, name: name_c02 };

        const json_b_ = { _id: _id_b, name: name_b };
        const json_a_ = { _id: _id_a, name: name_a };
        const json_d_ = { _id: _id_d, name: name_d };
        const json_c000_ = { _id: _id_c000, name: name_c000 };
        const json_c001_ = { _id: _id_c001, name: name_c001 };
        const json_c01_ = { _id: _id_c01, name: name_c01 };
        const json_c02_ = { _id: _id_c02, name: name_c02 };

        await addOneData(
          gitDDB,
          col.collectionPath + _id_b + JSON_EXT,
          toSortedJSONString(json_b)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_a + JSON_EXT,
          toSortedJSONString(json_a)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_d + JSON_EXT,
          toSortedJSONString(json_d)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_c000 + JSON_EXT,
          toSortedJSONString(json_c000)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_c001 + JSON_EXT,
          toSortedJSONString(json_c001)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_c01 + JSON_EXT,
          toSortedJSONString(json_c01)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_c02 + JSON_EXT,
          toSortedJSONString(json_c02)
        );

        const prefix = 'citrus/y';

        await expect(col.find({ prefix })).resolves.toEqual([json_c02_]);

        await gitDDB.destroy();
      });

      it('returns no entry when prefix does not match', async () => {
        const dbName = monoId();
        const gitDDB: GitDocumentDB = new GitDocumentDB({
          dbName,
          localDir,
        });
        await gitDDB.open();
        const col = new Collection(gitDDB, 'col01');

        const json_b = { _id: col.collectionPath + _id_b, name: name_b };
        const json_a = { _id: col.collectionPath + _id_a, name: name_a };
        const json_d = { _id: col.collectionPath + _id_d, name: name_d };
        const json_c000 = { _id: col.collectionPath + _id_c000, name: name_c000 };
        const json_c001 = { _id: col.collectionPath + _id_c001, name: name_c001 };
        const json_c01 = { _id: col.collectionPath + _id_c01, name: name_c01 };
        const json_c02 = { _id: col.collectionPath + _id_c02, name: name_c02 };

        const json_b_ = { _id: _id_b, name: name_b };
        const json_a_ = { _id: _id_a, name: name_a };
        const json_d_ = { _id: _id_d, name: name_d };
        const json_c000_ = { _id: _id_c000, name: name_c000 };
        const json_c001_ = { _id: _id_c001, name: name_c001 };
        const json_c01_ = { _id: _id_c01, name: name_c01 };
        const json_c02_ = { _id: _id_c02, name: name_c02 };

        await addOneData(
          gitDDB,
          col.collectionPath + _id_b + JSON_EXT,
          toSortedJSONString(json_b)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_a + JSON_EXT,
          toSortedJSONString(json_a)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_d + JSON_EXT,
          toSortedJSONString(json_d)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_c000 + JSON_EXT,
          toSortedJSONString(json_c000)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_c001 + JSON_EXT,
          toSortedJSONString(json_c001)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_c01 + JSON_EXT,
          toSortedJSONString(json_c01)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_c02 + JSON_EXT,
          toSortedJSONString(json_c02)
        );

        const prefix = 'not_exist/';

        await expect(col.find({ prefix })).resolves.toEqual([]);

        await gitDDB.destroy();
      });

      it('gets from deep directory', async () => {
        const dbName = monoId();
        const gitDDB: GitDocumentDB = new GitDocumentDB({
          dbName,
          localDir,
        });
        await gitDDB.open();
        const col = new Collection(gitDDB, 'col01');

        const json_p = { _id: col.collectionPath + _id_p, name: name_p };

        const json_b = { _id: col.collectionPath + _id_b, name: name_b };
        const json_a = { _id: col.collectionPath + _id_a, name: name_a };
        const json_d = { _id: col.collectionPath + _id_d, name: name_d };
        const json_c000 = { _id: col.collectionPath + _id_c000, name: name_c000 };
        const json_c001 = { _id: col.collectionPath + _id_c001, name: name_c001 };
        const json_c01 = { _id: col.collectionPath + _id_c01, name: name_c01 };
        const json_c02 = { _id: col.collectionPath + _id_c02, name: name_c02 };

        const json_p_ = { _id: _id_p, name: name_p };
        const json_b_ = { _id: _id_b, name: name_b };
        const json_a_ = { _id: _id_a, name: name_a };
        const json_d_ = { _id: _id_d, name: name_d };
        const json_c000_ = { _id: _id_c000, name: name_c000 };
        const json_c001_ = { _id: _id_c001, name: name_c001 };
        const json_c01_ = { _id: _id_c01, name: name_c01 };
        const json_c02_ = { _id: _id_c02, name: name_c02 };

        await addOneData(
          gitDDB,
          col.collectionPath + _id_p + JSON_EXT,
          toSortedJSONString(json_p)
        );

        await addOneData(
          gitDDB,
          col.collectionPath + _id_b + JSON_EXT,
          toSortedJSONString(json_b)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_a + JSON_EXT,
          toSortedJSONString(json_a)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_d + JSON_EXT,
          toSortedJSONString(json_d)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_c000 + JSON_EXT,
          toSortedJSONString(json_c000)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_c001 + JSON_EXT,
          toSortedJSONString(json_c001)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_c01 + JSON_EXT,
          toSortedJSONString(json_c01)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_c02 + JSON_EXT,
          toSortedJSONString(json_c02)
        );

        await expect(col.find({ prefix: 'pear/Japan' })).resolves.toEqual([json_p_]);

        await expect(col.find({ prefix: 'pear' })).resolves.toEqual([json_p_]);

        await gitDDB.destroy();
      });

      it('gets from deep directory under deep collection', async () => {
        const dbName = monoId();
        const gitDDB: GitDocumentDB = new GitDocumentDB({
          dbName,
          localDir,
        });
        await gitDDB.open();
        const col = new Collection(gitDDB, 'col01/col02/col03');

        const json_p = { _id: col.collectionPath + _id_p, name: name_p };

        const json_b = { _id: col.collectionPath + _id_b, name: name_b };
        const json_a = { _id: col.collectionPath + _id_a, name: name_a };
        const json_d = { _id: col.collectionPath + _id_d, name: name_d };
        const json_c000 = { _id: col.collectionPath + _id_c000, name: name_c000 };
        const json_c001 = { _id: col.collectionPath + _id_c001, name: name_c001 };
        const json_c01 = { _id: col.collectionPath + _id_c01, name: name_c01 };
        const json_c02 = { _id: col.collectionPath + _id_c02, name: name_c02 };

        const json_p_ = { _id: _id_p, name: name_p };
        const json_b_ = { _id: _id_b, name: name_b };
        const json_a_ = { _id: _id_a, name: name_a };
        const json_d_ = { _id: _id_d, name: name_d };
        const json_c000_ = { _id: _id_c000, name: name_c000 };
        const json_c001_ = { _id: _id_c001, name: name_c001 };
        const json_c01_ = { _id: _id_c01, name: name_c01 };
        const json_c02_ = { _id: _id_c02, name: name_c02 };

        await addOneData(
          gitDDB,
          col.collectionPath + _id_p + JSON_EXT,
          toSortedJSONString(json_p)
        );

        await addOneData(
          gitDDB,
          col.collectionPath + _id_b + JSON_EXT,
          toSortedJSONString(json_b)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_a + JSON_EXT,
          toSortedJSONString(json_a)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_d + JSON_EXT,
          toSortedJSONString(json_d)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_c000 + JSON_EXT,
          toSortedJSONString(json_c000)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_c001 + JSON_EXT,
          toSortedJSONString(json_c001)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_c01 + JSON_EXT,
          toSortedJSONString(json_c01)
        );
        await addOneData(
          gitDDB,
          col.collectionPath + _id_c02 + JSON_EXT,
          toSortedJSONString(json_c02)
        );

        await expect(col.find({ prefix: 'pear/Japan' })).resolves.toEqual([json_p_]);

        await expect(col.find({ prefix: 'pear' })).resolves.toEqual([json_p_]);

        await gitDDB.destroy();
      });
    });
  });

  describe('findFatDoc()', () => {
    it('returns docs by breadth-first search (recursive)', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const col = new Collection(gitDDB, 'col01');

      const json_b = { _id: col.collectionPath + _id_b, name: name_b };
      const json_a = { _id: col.collectionPath + _id_a, name: name_a };
      const json_d = { _id: col.collectionPath + _id_d, name: name_d };
      const json_c01 = { _id: col.collectionPath + _id_c01, name: name_c01 };
      const json_c02 = { _id: col.collectionPath + _id_c02, name: name_c02 };

      const json_b_ = { _id: _id_b, name: name_b };
      const json_a_ = { _id: _id_a, name: name_a };
      const json_d_ = { _id: _id_d, name: name_d };
      const json_c01_ = { _id: _id_c01, name: name_c01 };
      const json_c02_ = { _id: _id_c02, name: name_c02 };

      await addOneData(
        gitDDB,
        col.collectionPath + _id_b + JSON_EXT,
        toSortedJSONString(json_b)
      );
      await addOneData(
        gitDDB,
        col.collectionPath + _id_a + JSON_EXT,
        toSortedJSONString(json_a)
      );
      await addOneData(
        gitDDB,
        col.collectionPath + _id_d + JSON_EXT,
        toSortedJSONString(json_d)
      );
      await addOneData(
        gitDDB,
        col.collectionPath + _id_c01 + JSON_EXT,
        toSortedJSONString(json_c01)
      );
      await addOneData(
        gitDDB,
        col.collectionPath + _id_c02 + JSON_EXT,
        toSortedJSONString(json_c02)
      );

      await expect(col.findFatDoc()).resolves.toEqual([
        {
          _id: _id_a,
          name: _id_a + JSON_EXT,
          fileOid: (await git.hashBlob({ object: toSortedJSONString(json_a) })).oid,
          type: 'json',
          doc: json_a_,
        },
        {
          _id: _id_b,
          name: _id_b + JSON_EXT,
          fileOid: (await git.hashBlob({ object: toSortedJSONString(json_b) })).oid,
          type: 'json',
          doc: json_b_,
        },
        {
          _id: _id_c01,
          name: _id_c01 + JSON_EXT,
          fileOid: (await git.hashBlob({ object: toSortedJSONString(json_c01) })).oid,
          type: 'json',
          doc: json_c01_,
        },
        {
          _id: _id_c02,
          name: _id_c02 + JSON_EXT,
          fileOid: (await git.hashBlob({ object: toSortedJSONString(json_c02) })).oid,
          type: 'json',
          doc: json_c02_,
        },
        {
          _id: _id_d,
          name: _id_d + JSON_EXT,
          fileOid: (await git.hashBlob({ object: toSortedJSONString(json_d) })).oid,
          type: 'json',
          doc: json_d_,
        },
      ]);

      await gitDDB.destroy();
    });
  });
});
