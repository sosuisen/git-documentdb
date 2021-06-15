/* eslint-disable @typescript-eslint/naming-convention */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import { readFileSync } from 'fs';
import git from 'isomorphic-git';
import expect from 'expect';
import fs from 'fs-extra';
import sinon from 'sinon';
import { monotonicFactory } from 'ulid';
import {
  CannotCreateDirectoryError,
  CannotWriteDataError,
  DatabaseClosingError,
  DocumentNotFoundError,
  RepositoryNotOpenError,
  SameIdExistsError,
  TaskCancelError,
  UndefinedDBError,
} from '../../src/error';
import { GitDocumentDB } from '../../src/index';
import { putImpl, putWorker } from '../../src/crud/put';
import { JSON_EXT, SHORT_SHA_LENGTH } from '../../src/const';
import { sleep, toSortedJSONString } from '../../src/utils';
import { TaskMetadata } from '../../src/types';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs_module = require('fs-extra');

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = `./test/database_blob`;

// Use sandbox to restore stub and spy in parallel mocha tests
let sandbox: sinon.SinonSandbox;
beforeEach(function () {
  // @ts-ignore
  console.log(`... ${this.currentTest.fullTitle()}`);
  sandbox = sinon.createSandbox();
});

afterEach(function () {
  sandbox.restore();
});

after(() => {
  fs.removeSync(path.resolve(localDir));
});

describe('<crud/put> put', () => {
  it('causes DatabaseClosingError', async () => {
    const dbName = monoId();
    const gitDDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();

    for (let i = 0; i < 50; i++) {
      // put() will throw Error after the database is closed by force.
      gitDDB.put({ _id: i.toString(), name: i.toString() }).catch(() => {});
    }
    // Call close() without await
    gitDDB.close().catch(() => {});
    const _id = 'prof01';
    await expect(gitDDB.put({ _id: _id, name: 'shirase' })).rejects.toThrowError(
      DatabaseClosingError
    );

    // wait close
    await sleep(5000);
    await gitDDB.destroy();
  });
});
