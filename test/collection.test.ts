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
import { GitDocumentDB } from '../src/git_documentdb';
import { InvalidCollectionPathCharacterError } from '../src/error';
import { Collection } from '../src/collection';

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = './test/database_collection';

beforeEach(function () {
  // @ts-ignore
  console.log(`... ${this.currentTest.fullTitle()}`);
});

before(() => {
  fs.removeSync(path.resolve(localDir));
});

after(() => {
  fs.removeSync(path.resolve(localDir));
});

describe('<collection>', () => {
  it('throws InvalidCollectionPathCharacterError', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    expect(() => gitDDB.collection('users./')).toThrowError(
      InvalidCollectionPathCharacterError
    );
    await gitDDB.destroy();
  });

  it('creates root collection', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = new Collection(gitDDB); // default
    const col2 = new Collection(gitDDB, '');
    expect(col.collectionPath).toBe('');
    expect(col2.collectionPath).toBe('');

    await gitDDB.destroy();
  });

  it('creates deep collection', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = new Collection(gitDDB, 'dir01/dir02/dir03');
    const col2 = new Collection(gitDDB, 'dir01/dir02/dir03/');
    expect(col.collectionPath).toBe('dir01/dir02/dir03/');
    expect(col2.collectionPath).toBe('dir01/dir02/dir03/');

    await gitDDB.destroy();
  });

  describe('parent', () => {
    it('sets parent', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();

      const root = await gitDDB.collection('');
      const root2 = await gitDDB.rootCollection;
      const col01 = await root.collection('col01');
      const col02 = await col01.collection('col02');
      const col03 = await col02.collection('col03');

      expect(root.parent!.collectionPath).toBe('');
      expect(root2.parent).toBeUndefined();
      expect(col01.parent!.collectionPath).toBe('');
      expect(col02.parent!.collectionPath).toBe('col01/');
      expect(col03.parent!.collectionPath).toBe('col01/col02/');

      await gitDDB.destroy();
    });

    it('collectionPath is inherited by child', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();

      const root = await gitDDB.collection('');
      const root2 = await gitDDB.rootCollection;
      const col01 = await root.collection('col01');
      const col02 = await col01.collection('col02');
      const col03 = await col02.collection('col03');

      expect(root.collectionPath).toBe('');
      expect(root2.collectionPath).toBe('');
      expect(col01.collectionPath).toBe('col01/');
      expect(col02.collectionPath).toBe('col01/col02/');
      expect(col03.collectionPath).toBe('col01/col02/col03/');

      await gitDDB.destroy();
    });

    it('options are inherited by child', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();

      const root = await gitDDB.collection('', { namePrefix: 'root' });
      const col01 = await root.collection('col01');
      const col02 = await col01.collection('col02');
      const col03 = await col02.collection('col03', { namePrefix: 'col03' });
      const col03dash = await new Collection(gitDDB, 'col03');

      expect(root.options.namePrefix).toBe('root');
      expect(col01.options.namePrefix).toBe('root');
      expect(col02.options.namePrefix).toBe('root');
      expect(col03.options.namePrefix).toBe('col03');
      expect(col03dash.options.namePrefix).toBe('');

      await gitDDB.destroy();
    });
  });

  describe('getCollections()', () => {
    it('returns sub directory collections from root collection', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });

      await gitDDB.open();
      const root01 = gitDDB.collection('sub/root01');
      const root02 = gitDDB.collection('sub/root02');
      const root03 = gitDDB.collection('sub03');
      await root01.put('item01', {});
      await root02.put('item02', {});
      await root03.put('item03', {});

      const root = new Collection(gitDDB, '');
      const cols = await root.getCollections();
      expect(cols.length).toBe(2);
      await expect(cols[0].get('root01/item01')).resolves.toEqual({ _id: 'root01/item01' });
      await expect(cols[0].get('root02/item02')).resolves.toEqual({ _id: 'root02/item02' });
      await expect(cols[1].get('item03')).resolves.toEqual({ _id: 'item03' });

      const cols2 = await root.getCollections('sub');
      expect(cols2.length).toBe(2);
      await expect(cols2[0].get('item01')).resolves.toEqual({ _id: 'item01' });
      await expect(cols2[1].get('item02')).resolves.toEqual({ _id: 'item02' });

      const cols3 = await root.getCollections('sub/');
      expect(cols3.length).toBe(2);
      await expect(cols3[0].get('item01')).resolves.toEqual({ _id: 'item01' });
      await expect(cols3[1].get('item02')).resolves.toEqual({ _id: 'item02' });

      await gitDDB.destroy();
    });

    it('returns sub directory collections from sub collection', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });

      await gitDDB.open();
      const root01 = gitDDB.collection('sub/root01');
      const root02 = gitDDB.collection('sub/root02');
      await root01.put('item01', {});
      await root02.put('item02', {});

      const sub = gitDDB.collection('sub');
      const cols = await sub.getCollections();

      expect(cols.length).toBe(2);
      await expect(cols[0].get('item01')).resolves.toEqual({ _id: 'item01' });
      await expect(cols[1].get('item02')).resolves.toEqual({ _id: 'item02' });

      await gitDDB.destroy();
    });
  });
});
