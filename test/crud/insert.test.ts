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
import { SameIdExistsError } from '../../src/error';
import { GitDocumentDB } from '../../src/index';

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = `./test/database_insert`;

beforeEach(function () {
  // @ts-ignore
  console.log(`... ${this.currentTest.fullTitle()}`);
});

afterAll(() => {
  fs.removeSync(path.resolve(localDir));
});

describe('<crud/insert> insert(JsonDoc)', () => {
  it('throws SameIdExistsError when a document which has the same id exists.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    await gitDDB.insert({ _id: 'prof01' });
    await expect(gitDDB.insert({ _id: 'prof01', name: 'Shirase' })).rejects.toThrowError(
      SameIdExistsError
    );
    await gitDDB.destroy();
  });

  it('inserts a document.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    const json01 = { _id: 'prof01', name: 'Shirase' };
    await gitDDB.insert(json01);
    await expect(gitDDB.get('prof01')).resolves.toEqual(json01);
    await gitDDB.destroy();
  });
});

describe('<crud/insert> insert(id, document)', () => {
  it('throws SameIdExistsError when a document which has the same id exists.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    await gitDDB.insert('prof01', { name: 'Shirase' });
    await expect(gitDDB.insert('prof01', { name: 'Shirase' })).rejects.toThrowError(
      SameIdExistsError
    );
    await gitDDB.destroy();
  });

  it('inserts a document.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    const json01 = { _id: 'prof01', name: 'Shirase' };
    await gitDDB.insert('prof01', json01);
    await expect(gitDDB.get('prof01')).resolves.toEqual(json01);
    await gitDDB.destroy();
  });
});
