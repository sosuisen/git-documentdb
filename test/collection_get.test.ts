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
import { GitDocumentDB } from '../src/index';
import { SameIdExistsError } from '../src/error';

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = `./test/database_collection_get`;

beforeEach(function () {
  // @ts-ignore
  console.log(`... ${this.currentTest.fullTitle()}`);
});

after(() => {
  fs.removeSync(path.resolve(localDir));
});

describe('<collection> get()', () => {
  it('reads an existing document', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const users = gitDDB.collection('users');
    const _id = 'prof01';
    await users.put({ _id: _id, name: 'shirase' });
    // Get
    await expect(users.get(_id)).resolves.toEqual({ _id: _id, name: 'shirase' });
    await gitDDB.destroy();
    // Check error
    await expect(users.get(_id)).rejects.toThrowError(RepositoryNotOpenError);
  });

  it('reads an existing document in subdirectory', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const users = gitDDB.collection('users');
    const _id = 'dir01/prof01';
    await users.put({ _id: _id, name: 'shirase' });
    // Get
    await expect(users.get(_id)).resolves.toEqual({ _id: _id, name: 'shirase' });
    await gitDDB.destroy();
  });
});

describe('get() back number', () => {
  it('returns undefined when get back number #0 of the deleted document.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const users = gitDDB.collection('users');
    const _idA = 'profA';
    const jsonA01 = { _id: _idA, name: 'v01' };
    await users.put(jsonA01);
    const jsonA02 = { _id: _idA, name: 'v02' };
    await users.put(jsonA02);
    await users.delete(_idA);
    // Get
    await expect(users.get(_idA, 0)).resolves.toBeUndefined();

    await destroyDBs([gitDDB]);
  });

  it('returns one revision before when get back number #1 of the deleted document.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const users = gitDDB.collection('users');
    const _idA = 'profA';
    const jsonA01 = { _id: _idA, name: 'v01' };
    await users.put(jsonA01);
    const jsonA02 = { _id: _idA, name: 'v02' };
    await users.put(jsonA02);
    await users.delete(_idA);
    // Get
    await expect(users.get(_idA, 1)).resolves.toMatchObject(jsonA02);

    await destroyDBs([gitDDB]);
  });

  it('returns two revision before when get back number #2 of the deleted document.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const users = gitDDB.collection('users');
    const _idA = 'profA';
    const jsonA01 = { _id: _idA, name: 'v01' };
    await users.put(jsonA01);
    const jsonA02 = { _id: _idA, name: 'v02' };
    await users.put(jsonA02);
    await users.delete(_idA);
    // Get
    await expect(users.get(_idA, 2)).resolves.toMatchObject(jsonA01);

    await destroyDBs([gitDDB]);
  });
});