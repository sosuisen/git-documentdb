/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import fs from 'fs-extra';
import { DatabaseCloseTimeoutError } from '../src/error';
import { GitDocumentDB } from '../src/index';

describe('Destroy database', () => {
  const localDir = './test/database_destroy01';

  beforeAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  afterAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  test('destroy()', async () => {
    const dbName = 'test_repos_1';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    const workingDir = gitDDB.workingDir();
    await expect(gitDDB.destroy())
      .resolves.toMatchObject({ ok: true })
      .catch(e => console.error(e));

    // Directory is empty
    await expect(fs.access(workingDir, fs.constants.F_OK)).rejects.toThrowError();
  });

  test('destroy(): close() throws Error', async () => {
    const dbName = 'test_repos_2';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();

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
