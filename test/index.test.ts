/* eslint-disable @typescript-eslint/naming-convention */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import git from 'isomorphic-git';
import { monotonicFactory } from 'ulid';
import expect from 'expect';
import fs from 'fs-extra';
import { GitDocumentDB } from '../src/index';
import { toSortedJSONString } from '../src/utils';
import { JSON_EXT, SHORT_SHA_LENGTH } from '../src/const';

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = `./test/database_index`;

beforeEach(function () {
  // @ts-ignore
  console.log(`... ${this.currentTest.fullTitle()}`);
});

after(() => {
  fs.removeSync(path.resolve(localDir));
});

describe('<index>', () => {
  it('GitDocumentDB#dbName', () => {
    const dbName = monoId();
    const gitDDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    expect(gitDDB.dbName()).toBe(dbName);
  });
});
