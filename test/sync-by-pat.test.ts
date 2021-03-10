/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

/**
 * Test sync by using GitHub Personal Access Token
 */
import path from 'path';
import fs from 'fs-extra';
import { monotonicFactory } from 'ulid';
import { GitDocumentDB } from '../src';
import { RemoteOptions } from '../src/types';
import { UndefinedRemoteURLError } from '../src/error';
const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const maybe = process.env.GITDDB_PERSONAL_ACCESS_TOKEN ? describe : describe.skip;

maybe('sync(): Sync Class:', () => {
  const localDir = `./test/database_put${monoId()}`;

  beforeAll(() => {
    if (process.platform !== 'win32') {
      fs.removeSync(path.resolve(localDir));
    }
  });

  afterAll(() => {
    if (process.platform !== 'win32') {
      fs.removeSync(path.resolve(localDir));
    }
  });

  test('Invalid private key path', () => {
    const dbName = `test_repos_${monoId()}`;
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    const options: RemoteOptions = {
      live: false,
      auth: {
        type: 'github',
        personal_access_token: '',
      },
    };
    expect(() => gitDDB.sync('', options)).toThrowError(UndefinedRemoteURLError);
  });
});
