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
import { DocumentNotFoundError } from '../../src/error';
import { GitDocumentDB } from '../../src/index';

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = `./test/database_update`;

beforeEach(function () {
  // @ts-ignore
  console.log(`... ${this.currentTest.fullTitle()}`);
});

afterAll(() => {
  fs.removeSync(path.resolve(localDir));
});

describe('<crud/update> update(JsonDoc)', () => {
  it('throws DocumentNotFoundError.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.createDB();
    await expect(gitDDB.update({ _id: 'prof01', name: 'Shirase' })).rejects.toThrowError(
      DocumentNotFoundError
    );
    await gitDDB.destroy();
  });

  it('update a document.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.createDB();
    const json01 = { _id: 'prof01', name: 'Shirase' };
    await gitDDB.insert(json01);
    const json01dash = { _id: 'prof01', name: 'updated' };
    await gitDDB.update(json01dash);
    await expect(gitDDB.get('prof01')).resolves.toEqual(json01dash);
    await gitDDB.destroy();
  });
});

describe('<crud/insert> update(id, document)', () => {
  it('throws DocumentNotFoundError.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.createDB();
    await expect(gitDDB.update('prof01', { name: 'Shirase' })).rejects.toThrowError(
      DocumentNotFoundError
    );
    await gitDDB.destroy();
  });

  it('update a document.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.createDB();
    const json01 = { _id: 'prof01', name: 'Shirase' };
    await gitDDB.insert(json01);
    const json01dash = { _id: 'prof01', name: 'updated' };
    await gitDDB.update('prof01', json01dash);
    await expect(gitDDB.get('prof01')).resolves.toEqual(json01dash);
    await gitDDB.destroy();
  });
});
