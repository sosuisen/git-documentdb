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

const localDir = `./test/database_collection_find`;

beforeEach(function () {
  // @ts-ignore
  console.log(`... ${this.currentTest.fullTitle()}`);
});

after(() => {
  fs.removeSync(path.resolve(localDir));
});


describe('find()', () => {
  const _id_a = 'apple';
  const name_a = 'Apple woman';
  const _id_b = 'banana';
  const name_b = 'Banana man';

  const _id_c01 = 'citrus/amanatsu';
  const name_c01 = 'Amanatsu boy';
  const _id_c02 = 'citrus/yuzu';
  const name_c02 = 'Yuzu girl';
  const _id_d = 'durio/durian';
  const name_d = 'Durian girls';
  const _id_p = 'pear/Japan/21st';
  const name_p = '21st century pear';

  it('gets documents', async () => {
    const dbName = monoId();

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await expect(gitDDB.find()).rejects.toThrowError(RepositoryNotOpenError);

    await gitDDB.open();
    const users = gitDDB.collection('users');
    await expect(users.find()).resolves.toMatchObject({
      totalRows: 0,
      commitOid: expect.stringMatching(/^[\da-z]{40}$/),
    });

    await users.put({ _id: _id_b, name: name_b });
    await users.put({ _id: _id_a, name: name_a });

    await expect(users.find()).resolves.toMatchObject({
      totalRows: 2,
      commitOid: expect.stringMatching(/^[\da-z]{40}$/),
      rows: [
        {
          _id: expect.stringMatching('^' + _id_a + '$'),
          fileOid: expect.stringMatching(/^[\da-z]{40}$/),
        },
        {
          _id: expect.stringMatching('^' + _id_b + '$'),
          fileOid: expect.stringMatching(/^[\da-z]{40}$/),
        },
      ],
    });

    await gitDDB.destroy();
  });

  it('gets from deep directory', async () => {
    const dbName = monoId();

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const users = gitDDB.collection('users');
    await users.put({ _id: _id_p, name: name_p });

    await users.put({ _id: _id_b, name: name_b });
    await users.put({ _id: _id_a, name: name_a });
    await users.put({ _id: _id_d, name: name_d });
    await users.put({ _id: _id_c01, name: name_c01 });
    await users.put({ _id: _id_c02, name: name_c02 });

    await expect(users.find({ prefix: 'pear/Japan' })).resolves.toMatchObject({
      totalRows: 1,
      commitOid: expect.stringMatching(/^[\da-z]{40}$/),
      rows: [
        {
          _id: expect.stringMatching('^' + _id_p + '$'),
          fileOid: expect.stringMatching(/^[\da-z]{40}$/),
          doc: {
            _id: expect.stringMatching('^' + _id_p + '$'),
            name: name_p,
          },
        },
      ],
    });

    await gitDDB.destroy();
  });
});
