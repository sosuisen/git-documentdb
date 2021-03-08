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
import { GitDocumentDB } from '../src';
import { SyncOptions } from '../src/types';
import { InvalidSSHKeyPathError } from '../src/error';
const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const maybe =
  process.env.GITDDB_PRIVATE_KEY_PATH && process.env.GITDDB_PUBLIC_KEY_PATH
    ? describe
    : describe.skip;

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
    const options: SyncOptions = {
      live: false,
      ssh: {
        use: true,
        private_key_path: '',
        public_key_path: '',
      },
    };
    expect(() => gitDDB.sync(options)).toThrowError(InvalidSSHKeyPathError);
  });
});
