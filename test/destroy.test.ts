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
import { DatabaseCloseTimeoutError } from '../src/error';
import { GitDocumentDB } from '../src/index';

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = './test/database_destroy';

beforeEach(function () {
  // @ts-ignore
  console.log(`... ${this.currentTest.fullTitle()}`);
});

beforeAll(() => {
  fs.removeSync(path.resolve(localDir));
});

afterAll(() => {
  fs.removeSync(path.resolve(localDir));
});

describe('<index> destroy()', () => {
  it('closes and removes a database', async () => {
    const dbName = monoId();

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const workingDir = gitDDB.workingDir();
    await expect(gitDDB.destroy())
      .resolves.toMatchObject({ ok: true })
      .catch(e => console.error(e));

    // Directory is empty
    await expect(fs.access(workingDir, fs.constants.F_OK)).rejects.toThrowError();
  });

  it('can removes a database before db is opened', async () => {
    const dbName = monoId();

    const gitDDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    // Create db
    await gitDDB.open();

    // Destroy db
    await gitDDB.destroy();

    // fs.access() throw error when a file cannot be accessed.
    await expect(fs.access(path.resolve(localDir, dbName))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('throws DatabaseCloseTimeoutError', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();

    for (let i = 0; i < 100; i++) {
      // put() will throw Error after the database is closed by timeout.
      gitDDB.put({ _id: i.toString(), name: i.toString() }).catch(() => {});
    }
    // Set options.force to false explicitly for this test
    await expect(gitDDB.destroy({ force: false, timeout: 1 })).rejects.toThrowError(
      DatabaseCloseTimeoutError
    );
  });
});
