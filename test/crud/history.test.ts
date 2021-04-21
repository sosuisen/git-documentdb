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
import { destroyDBs } from '../remote_utils';
import { GitDocumentDB } from '../../src/index';

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = './test/database_history';

beforeEach(function () {
  // @ts-ignore
  console.log(`... ${this.currentTest.fullTitle()}`);
});

beforeAll(() => {
  fs.removeSync(path.resolve(localDir));
});

afterAll(() => {
  // fs.removeSync(path.resolve(localDir));
});

describe('<crud/history> getDocHistory()', () => {
  it('gets all revisions', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    await gitDDB.create();
    const _idA = 'profA';
    const jsonA01 = { _id: _idA, name: 'v01' };
    const jsonA02 = { _id: _idA, name: 'v02' };
    const jsonA03 = { _id: _idA, name: 'v03' };
    await gitDDB.put(jsonA01);
    await gitDDB.put(jsonA02);
    await gitDDB.put(jsonA03);
    const _idB = 'profB';
    const jsonB01 = { _id: _idB, name: 'v01' };
    const jsonB02 = { _id: _idB, name: 'v02' };
    await gitDDB.put(jsonB01);
    await gitDDB.put(jsonB02);
    // Get
    const historyA = await gitDDB.getDocHistory(_idA);
    expect(historyA.length).toBe(3);
    await expect(gitDDB.getByRevision(historyA[0])).resolves.toMatchObject(jsonA03);
    await expect(gitDDB.getByRevision(historyA[1])).resolves.toMatchObject(jsonA02);
    await expect(gitDDB.getByRevision(historyA[2])).resolves.toMatchObject(jsonA01);
    const historyB = await gitDDB.getDocHistory(_idB);
    expect(historyB.length).toBe(2);
    await expect(gitDDB.getByRevision(historyB[0])).resolves.toMatchObject(jsonB02);
    await expect(gitDDB.getByRevision(historyB[1])).resolves.toMatchObject(jsonB01);

    await destroyDBs([gitDDB]);
  });

  it('gets empty revision', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    await gitDDB.create();
    const _idA = 'profA';
    const jsonA01 = { _id: _idA, name: 'v01' };
    await gitDDB.put(jsonA01);
    // Get
    const historyA = await gitDDB.getDocHistory('invalid_id');
    expect(historyA.length).toBe(0);

    await destroyDBs([gitDDB]);
  });
});
