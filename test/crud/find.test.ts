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
import fs from 'fs-extra';
import expect from 'expect';
import { monotonicFactory } from 'ulid';
import { sleep, toSortedJSONString } from '../../src/utils';
import { Err } from '../../src/error';
import { GitDocumentDB } from '../../src/git_documentdb';
import { FIRST_COMMIT_MESSAGE, GIT_DOCUMENTDB_INFO_ID, JSON_EXT } from '../../src/const';
import { findImpl } from '../../src/crud/find';
import { addOneData } from '../utils';

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = `./test/database_crud_find`;

beforeEach(function () {
  // @ts-ignore
  console.log(`... ${this.currentTest.fullTitle()}`);
});

before(() => {
  fs.removeSync(path.resolve(localDir));
});

after(() => {
  fs.removeSync(path.resolve(localDir));
});

describe('<crud/find> find()', () => {
  const _id_1 = '1';
  const name_1 = 'one';
  const _id_a = 'apple';
  const name_a = 'Apple woman';
  const _id_b = 'banana';
  const name_b = 'Banana man';
  const _id_c = 'cherry';
  const name_c = 'Cherry cat';

  const _id_c000 = 'citrus_carrot';
  const name_c000 = 'Citrus and carrot';
  const _id_c001 = 'citrus_celery';
  const name_c001 = 'Citrus and celery';

  const _id_c01 = 'citrus/amanatsu';
  const name_c01 = 'Amanatsu boy';
  const _id_c02 = 'citrus/yuzu';
  const name_c02 = 'Yuzu girl';
  const _id_d = 'durio/durian';
  const name_d = 'Durian girls';
  const _id_p = 'pear/Japan/21st';
  const name_p = '21st century pear';

  it('throws DatabaseClosingError', async () => {
    const dbName = monoId();
    const gitDDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();

    for (let i = 0; i < 100; i++) {
      // put() will throw Error after the database is closed by force.
      gitDDB.put({ _id: i.toString(), name: i.toString() }).catch(() => {});
    }
    // Call close() without await
    gitDDB.close().catch(() => {});
    await expect(findImpl(gitDDB, '', true, false)).rejects.toThrowError(
      Err.DatabaseClosingError
    );
    while (gitDDB.isClosing) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(100);
    }
    await gitDDB.destroy();
  });

  it('throws RepositoryNotOpenError', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    await gitDDB.close();
    await expect(findImpl(gitDDB, '', true, false)).rejects.toThrowError(
      Err.RepositoryNotOpenError
    );
    await gitDDB.destroy();
  });

  it('throws InvalidJsonObjectError', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();

    await addOneData(gitDDB, 'invalidJSON' + JSON_EXT, 'invalidJSON');

    await expect(findImpl(gitDDB, '', true, false)).rejects.toThrowError(
      Err.InvalidJsonObjectError
    );

    await gitDDB.destroy();
  });

  it('opens db which is not created by GitDocumentDB', async () => {
    const dbName = monoId();

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    const infoPath = path.resolve(gitDDB.workingDir, GIT_DOCUMENTDB_INFO_ID + JSON_EXT);
    await fs.ensureDir(path.dirname(infoPath));
    // Create empty repository
    await git.init({ fs, dir: gitDDB.workingDir, defaultBranch: 'main' });
    await fs.writeFile(infoPath, {});
    await git.add({
      fs,
      dir: gitDDB.workingDir,
      filepath: GIT_DOCUMENTDB_INFO_ID + JSON_EXT,
    });
    await git.commit({
      fs,
      dir: gitDDB.workingDir,
      author: {
        name: 'test',
        email: 'text@example.com',
      },
      message: FIRST_COMMIT_MESSAGE,
    });

    const _id = '1';
    const json = { _id };
    await addOneData(gitDDB, _id + JSON_EXT, toSortedJSONString(json));

    await gitDDB.open();

    await expect(findImpl(gitDDB, '', true, false)).resolves.toEqual([json]);

    await gitDDB.destroy();
  });

  it('returns empty', async () => {
    const dbName = monoId();

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();

    await expect(findImpl(gitDDB, '', true, false)).resolves.toEqual([]);

    await gitDDB.destroy();
  });

  it('returns entries by ascending alphabetic order', async () => {
    const dbName = monoId();

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await expect(findImpl(gitDDB, '', true, false)).rejects.toThrowError(
      Err.RepositoryNotOpenError
    );

    await gitDDB.open();

    const json_b = { _id: _id_b, name: name_b };
    const json_a = { _id: _id_a, name: name_a };
    const json_1 = { _id: _id_1, name: name_1 };
    const json_c = { _id: _id_c, name: name_c };

    await addOneData(gitDDB, _id_b + JSON_EXT, toSortedJSONString(json_b));
    await addOneData(gitDDB, _id_a + JSON_EXT, toSortedJSONString(json_a));
    await addOneData(gitDDB, _id_1 + JSON_EXT, toSortedJSONString(json_1));
    await addOneData(gitDDB, _id_c + JSON_EXT, toSortedJSONString(json_c));

    await expect(findImpl(gitDDB, '', true, false)).resolves.toEqual([
      json_1,
      json_a,
      json_b,
      json_c,
    ]);

    await gitDDB.destroy();
  });

  it('returns entries by descending alphabetical order', async () => {
    const dbName = monoId();

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();

    const json_b = { _id: _id_b, name: name_b };
    const json_a = { _id: _id_a, name: name_a };
    const json_1 = { _id: _id_1, name: name_1 };
    const json_c = { _id: _id_c, name: name_c };

    await addOneData(gitDDB, _id_b + JSON_EXT, toSortedJSONString(json_b));
    await addOneData(gitDDB, _id_a + JSON_EXT, toSortedJSONString(json_a));
    await addOneData(gitDDB, _id_1 + JSON_EXT, toSortedJSONString(json_1));
    await addOneData(gitDDB, _id_c + JSON_EXT, toSortedJSONString(json_c));

    await expect(findImpl(gitDDB, '', true, false)).resolves.toEqual([
      json_1,
      json_a,
      json_b,
      json_c,
    ]);

    await expect(findImpl(gitDDB, '', true, false, { descending: true })).resolves.toEqual([
      json_c,
      json_b,
      json_a,
      json_1,
    ]);

    await gitDDB.destroy();
  });

  it('returns docs by breadth-first search (recursive)', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();

    const json_b = { _id: _id_b, name: name_b };
    const json_a = { _id: _id_a, name: name_a };
    const json_d = { _id: _id_d, name: name_d };
    const json_c01 = { _id: _id_c01, name: name_c01 };
    const json_c02 = { _id: _id_c02, name: name_c02 };

    await addOneData(gitDDB, _id_b + JSON_EXT, toSortedJSONString(json_b));
    await addOneData(gitDDB, _id_a + JSON_EXT, toSortedJSONString(json_a));
    await addOneData(gitDDB, _id_d + JSON_EXT, toSortedJSONString(json_d));
    await addOneData(gitDDB, _id_c01 + JSON_EXT, toSortedJSONString(json_c01));
    await addOneData(gitDDB, _id_c02 + JSON_EXT, toSortedJSONString(json_c02));

    await expect(findImpl(gitDDB, '', true, false)).resolves.toEqual([
      json_a,
      json_b,
      json_c01,
      json_c02,
      json_d,
    ]);

    await gitDDB.destroy();
  });

  it('returns docs by breadth-first search (not recursive)', async () => {
    const dbName = monoId();

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();

    const json_b = { _id: _id_b, name: name_b };
    const json_a = { _id: _id_a, name: name_a };
    const json_d = { _id: _id_d, name: name_d };
    const json_c01 = { _id: _id_c01, name: name_c01 };
    const json_c02 = { _id: _id_c02, name: name_c02 };

    await addOneData(gitDDB, _id_b + JSON_EXT, toSortedJSONString(json_b));
    await addOneData(gitDDB, _id_a + JSON_EXT, toSortedJSONString(json_a));
    await addOneData(gitDDB, _id_d + JSON_EXT, toSortedJSONString(json_d));
    await addOneData(gitDDB, _id_c01 + JSON_EXT, toSortedJSONString(json_c01));
    await addOneData(gitDDB, _id_c02 + JSON_EXT, toSortedJSONString(json_c02));

    await expect(findImpl(gitDDB, '', true, false, { recursive: false })).resolves.toEqual([
      json_a,
      json_b,
    ]);

    await gitDDB.destroy();
  });

  it('returns only JSON documents', async () => {
    const dbName = monoId();

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await expect(findImpl(gitDDB, '', true, false)).rejects.toThrowError(
      Err.RepositoryNotOpenError
    );

    await gitDDB.open();

    const json_b = { _id: _id_b, name: name_b };
    const json_a = { _id: _id_a, name: name_a };
    const json_1 = { _id: _id_1, name: name_1 };
    const json_c = { _id: _id_c, name: name_c };

    await addOneData(gitDDB, _id_b + JSON_EXT, toSortedJSONString(json_b));
    await addOneData(gitDDB, _id_a + JSON_EXT, toSortedJSONString(json_a));
    await addOneData(gitDDB, _id_1, toSortedJSONString(json_1));
    await addOneData(gitDDB, _id_c, toSortedJSONString(json_c));

    await expect(findImpl(gitDDB, '', true, false)).resolves.toEqual([json_a, json_b]);

    await gitDDB.destroy();
  });

  describe('Prefix search', () => {
    it('gets from directory', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();

      const json_b = { _id: _id_b, name: name_b };
      const json_a = { _id: _id_a, name: name_a };
      const json_d = { _id: _id_d, name: name_d };
      const json_c000 = { _id: _id_c000, name: name_c000 };
      const json_c001 = { _id: _id_c001, name: name_c001 };
      const json_c01 = { _id: _id_c01, name: name_c01 };
      const json_c02 = { _id: _id_c02, name: name_c02 };

      await addOneData(gitDDB, _id_b + JSON_EXT, toSortedJSONString(json_b));
      await addOneData(gitDDB, _id_a + JSON_EXT, toSortedJSONString(json_a));
      await addOneData(gitDDB, _id_d + JSON_EXT, toSortedJSONString(json_d));
      await addOneData(gitDDB, _id_c000 + JSON_EXT, toSortedJSONString(json_c000));
      await addOneData(gitDDB, _id_c001 + JSON_EXT, toSortedJSONString(json_c001));
      await addOneData(gitDDB, _id_c01 + JSON_EXT, toSortedJSONString(json_c01));
      await addOneData(gitDDB, _id_c02 + JSON_EXT, toSortedJSONString(json_c02));

      const prefix = 'citrus/';

      await expect(findImpl(gitDDB, '', true, false, { prefix })).resolves.toEqual([
        json_c01,
        json_c02,
      ]);

      await gitDDB.destroy();
    });

    it('gets only from top directory', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();

      const json_b = { _id: _id_b, name: name_b };
      const json_a = { _id: _id_a, name: name_a };
      const json_d = { _id: _id_d, name: name_d };
      const json_c000 = { _id: _id_c000, name: name_c000 };
      const json_c001 = { _id: _id_c001, name: name_c001 };
      const json_c01 = { _id: _id_c01, name: name_c01 };
      const json_c02 = { _id: _id_c02, name: name_c02 };

      await addOneData(gitDDB, _id_b + JSON_EXT, toSortedJSONString(json_b));
      await addOneData(gitDDB, _id_a + JSON_EXT, toSortedJSONString(json_a));
      await addOneData(gitDDB, _id_d + JSON_EXT, toSortedJSONString(json_d));
      await addOneData(gitDDB, _id_c000 + JSON_EXT, toSortedJSONString(json_c000));
      await addOneData(gitDDB, _id_c001 + JSON_EXT, toSortedJSONString(json_c001));
      await addOneData(gitDDB, _id_c01 + JSON_EXT, toSortedJSONString(json_c01));
      await addOneData(gitDDB, _id_c02 + JSON_EXT, toSortedJSONString(json_c02));

      const prefix = 'cit';

      await expect(
        findImpl(gitDDB, '', true, false, { prefix, recursive: false })
      ).resolves.toEqual([json_c000, json_c001]);

      await gitDDB.destroy();
    });

    it('gets from parent directory and child directory', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();

      const json_b = { _id: _id_b, name: name_b };
      const json_a = { _id: _id_a, name: name_a };
      const json_d = { _id: _id_d, name: name_d };
      const json_c000 = { _id: _id_c000, name: name_c000 };
      const json_c001 = { _id: _id_c001, name: name_c001 };
      const json_c01 = { _id: _id_c01, name: name_c01 };
      const json_c02 = { _id: _id_c02, name: name_c02 };

      await addOneData(gitDDB, _id_b + JSON_EXT, toSortedJSONString(json_b));
      await addOneData(gitDDB, _id_a + JSON_EXT, toSortedJSONString(json_a));
      await addOneData(gitDDB, _id_d + JSON_EXT, toSortedJSONString(json_d));
      await addOneData(gitDDB, _id_c000 + JSON_EXT, toSortedJSONString(json_c000));
      await addOneData(gitDDB, _id_c001 + JSON_EXT, toSortedJSONString(json_c001));
      await addOneData(gitDDB, _id_c01 + JSON_EXT, toSortedJSONString(json_c01));
      await addOneData(gitDDB, _id_c02 + JSON_EXT, toSortedJSONString(json_c02));

      const prefix = 'citrus';

      await expect(findImpl(gitDDB, '', true, false, { prefix })).resolves.toEqual([
        json_c000,
        json_c001,
        json_c01,
        json_c02,
      ]);

      await gitDDB.destroy();
    });

    it('gets from a sub directory', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();

      const json_b = { _id: _id_b, name: name_b };
      const json_a = { _id: _id_a, name: name_a };
      const json_d = { _id: _id_d, name: name_d };
      const json_c000 = { _id: _id_c000, name: name_c000 };
      const json_c001 = { _id: _id_c001, name: name_c001 };
      const json_c01 = { _id: _id_c01, name: name_c01 };
      const json_c02 = { _id: _id_c02, name: name_c02 };

      await addOneData(gitDDB, _id_b + JSON_EXT, toSortedJSONString(json_b));
      await addOneData(gitDDB, _id_a + JSON_EXT, toSortedJSONString(json_a));
      await addOneData(gitDDB, _id_d + JSON_EXT, toSortedJSONString(json_d));
      await addOneData(gitDDB, _id_c000 + JSON_EXT, toSortedJSONString(json_c000));
      await addOneData(gitDDB, _id_c001 + JSON_EXT, toSortedJSONString(json_c001));
      await addOneData(gitDDB, _id_c01 + JSON_EXT, toSortedJSONString(json_c01));
      await addOneData(gitDDB, _id_c02 + JSON_EXT, toSortedJSONString(json_c02));

      const prefix = 'citrus/y';

      await expect(findImpl(gitDDB, '', true, false, { prefix })).resolves.toEqual([
        json_c02,
      ]);

      await gitDDB.destroy();
    });

    it('returns no entry when prefix does not match', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();

      const json_b = { _id: _id_b, name: name_b };
      const json_a = { _id: _id_a, name: name_a };
      const json_d = { _id: _id_d, name: name_d };
      const json_c000 = { _id: _id_c000, name: name_c000 };
      const json_c001 = { _id: _id_c001, name: name_c001 };
      const json_c01 = { _id: _id_c01, name: name_c01 };
      const json_c02 = { _id: _id_c02, name: name_c02 };

      await addOneData(gitDDB, _id_b + JSON_EXT, toSortedJSONString(json_b));
      await addOneData(gitDDB, _id_a + JSON_EXT, toSortedJSONString(json_a));
      await addOneData(gitDDB, _id_d + JSON_EXT, toSortedJSONString(json_d));
      await addOneData(gitDDB, _id_c000 + JSON_EXT, toSortedJSONString(json_c000));
      await addOneData(gitDDB, _id_c001 + JSON_EXT, toSortedJSONString(json_c001));
      await addOneData(gitDDB, _id_c01 + JSON_EXT, toSortedJSONString(json_c01));
      await addOneData(gitDDB, _id_c02 + JSON_EXT, toSortedJSONString(json_c02));

      const prefix = 'not_exist/';

      await expect(findImpl(gitDDB, '', true, false, { prefix })).resolves.toEqual([]);

      await gitDDB.destroy();
    });

    it('gets from deep directory', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();

      const json_p = { _id: _id_p, name: name_p };
      const json_b = { _id: _id_b, name: name_b };
      const json_a = { _id: _id_a, name: name_a };
      const json_d = { _id: _id_d, name: name_d };
      const json_c000 = { _id: _id_c000, name: name_c000 };
      const json_c001 = { _id: _id_c001, name: name_c001 };
      const json_c01 = { _id: _id_c01, name: name_c01 };
      const json_c02 = { _id: _id_c02, name: name_c02 };

      await addOneData(gitDDB, _id_p + JSON_EXT, toSortedJSONString(json_p));

      await addOneData(gitDDB, _id_b + JSON_EXT, toSortedJSONString(json_b));
      await addOneData(gitDDB, _id_a + JSON_EXT, toSortedJSONString(json_a));
      await addOneData(gitDDB, _id_d + JSON_EXT, toSortedJSONString(json_d));
      await addOneData(gitDDB, _id_c000 + JSON_EXT, toSortedJSONString(json_c000));
      await addOneData(gitDDB, _id_c001 + JSON_EXT, toSortedJSONString(json_c001));
      await addOneData(gitDDB, _id_c01 + JSON_EXT, toSortedJSONString(json_c01));
      await addOneData(gitDDB, _id_c02 + JSON_EXT, toSortedJSONString(json_c02));

      await expect(
        findImpl(gitDDB, '', true, false, { prefix: 'pear/Japan' })
      ).resolves.toEqual([json_p]);

      await expect(findImpl(gitDDB, '', true, false, { prefix: 'pear' })).resolves.toEqual([
        json_p,
      ]);

      await gitDDB.destroy();
    });
  });

  describe('with collectionPath', () => {
    it('returns empty', async () => {
      const dbName = monoId();

      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });

      await gitDDB.open();

      await expect(findImpl(gitDDB, 'col01', true, false)).resolves.toEqual([]);

      await gitDDB.destroy();
    });

    it('returns entries by ascending alphabetic order', async () => {
      const dbName = monoId();

      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });

      await expect(findImpl(gitDDB, '', true, false)).rejects.toThrowError(
        Err.RepositoryNotOpenError
      );

      await gitDDB.open();

      const colPath = 'col01/';
      const json_b = { _id: colPath + _id_b, name: name_b };
      const json_a = { _id: colPath + _id_a, name: name_a };
      const json_1 = { _id: colPath + _id_1, name: name_1 };
      const json_c = { _id: colPath + _id_c, name: name_c };

      const json_b_ = { _id: _id_b, name: name_b };
      const json_a_ = { _id: _id_a, name: name_a };
      const json_1_ = { _id: _id_1, name: name_1 };
      const json_c_ = { _id: _id_c, name: name_c };

      await addOneData(gitDDB, colPath + _id_b + JSON_EXT, toSortedJSONString(json_b));
      await addOneData(gitDDB, colPath + _id_a + JSON_EXT, toSortedJSONString(json_a));
      await addOneData(gitDDB, colPath + _id_1 + JSON_EXT, toSortedJSONString(json_1));
      await addOneData(gitDDB, colPath + _id_c + JSON_EXT, toSortedJSONString(json_c));

      await expect(findImpl(gitDDB, colPath, true, false)).resolves.toEqual([
        json_1_,
        json_a_,
        json_b_,
        json_c_,
      ]);

      await gitDDB.destroy();
    });

    it('returns docs by breadth-first search (recursive)', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();

      const colPath = 'col01/';
      const json_b = { _id: colPath + _id_b, name: name_b };
      const json_a = { _id: colPath + _id_a, name: name_a };
      const json_d = { _id: colPath + _id_d, name: name_d };
      const json_c01 = { _id: colPath + _id_c01, name: name_c01 };
      const json_c02 = { _id: colPath + _id_c02, name: name_c02 };

      const json_b_ = { _id: _id_b, name: name_b };
      const json_a_ = { _id: _id_a, name: name_a };
      const json_d_ = { _id: _id_d, name: name_d };
      const json_c01_ = { _id: _id_c01, name: name_c01 };
      const json_c02_ = { _id: _id_c02, name: name_c02 };

      await addOneData(gitDDB, colPath + _id_b + JSON_EXT, toSortedJSONString(json_b));
      await addOneData(gitDDB, colPath + _id_a + JSON_EXT, toSortedJSONString(json_a));
      await addOneData(gitDDB, colPath + _id_d + JSON_EXT, toSortedJSONString(json_d));
      await addOneData(gitDDB, colPath + _id_c01 + JSON_EXT, toSortedJSONString(json_c01));
      await addOneData(gitDDB, colPath + _id_c02 + JSON_EXT, toSortedJSONString(json_c02));

      await expect(findImpl(gitDDB, colPath, true, false)).resolves.toEqual([
        json_a_,
        json_b_,
        json_c01_,
        json_c02_,
        json_d_,
      ]);

      await gitDDB.destroy();
    });

    describe('and prefix search', () => {
      it('gets from directory', async () => {
        const dbName = monoId();
        const gitDDB: GitDocumentDB = new GitDocumentDB({
          dbName,
          localDir,
        });
        await gitDDB.open();

        const colPath = 'col01/';
        const json_b = { _id: colPath + _id_b, name: name_b };
        const json_a = { _id: colPath + _id_a, name: name_a };
        const json_d = { _id: colPath + _id_d, name: name_d };
        const json_c000 = { _id: colPath + _id_c000, name: name_c000 };
        const json_c001 = { _id: colPath + _id_c001, name: name_c001 };
        const json_c01 = { _id: colPath + _id_c01, name: name_c01 };
        const json_c02 = { _id: colPath + _id_c02, name: name_c02 };

        const json_b_ = { _id: _id_b, name: name_b };
        const json_a_ = { _id: _id_a, name: name_a };
        const json_d_ = { _id: _id_d, name: name_d };
        const json_c000_ = { _id: _id_c000, name: name_c000 };
        const json_c001_ = { _id: _id_c001, name: name_c001 };
        const json_c01_ = { _id: _id_c01, name: name_c01 };
        const json_c02_ = { _id: _id_c02, name: name_c02 };

        await addOneData(gitDDB, colPath + _id_b + JSON_EXT, toSortedJSONString(json_b));
        await addOneData(gitDDB, colPath + _id_a + JSON_EXT, toSortedJSONString(json_a));
        await addOneData(gitDDB, colPath + _id_d + JSON_EXT, toSortedJSONString(json_d));
        await addOneData(
          gitDDB,
          colPath + _id_c000 + JSON_EXT,
          toSortedJSONString(json_c000)
        );
        await addOneData(
          gitDDB,
          colPath + _id_c001 + JSON_EXT,
          toSortedJSONString(json_c001)
        );
        await addOneData(
          gitDDB,
          colPath + _id_c01 + JSON_EXT,
          toSortedJSONString(json_c01)
        );
        await addOneData(
          gitDDB,
          colPath + _id_c02 + JSON_EXT,
          toSortedJSONString(json_c02)
        );

        const prefix = 'citrus/';

        await expect(findImpl(gitDDB, colPath, true, false, { prefix })).resolves.toEqual([
          json_c01_,
          json_c02_,
        ]);

        await gitDDB.destroy();
      });

      it('gets only from top directory', async () => {
        const dbName = monoId();
        const gitDDB: GitDocumentDB = new GitDocumentDB({
          dbName,
          localDir,
        });
        await gitDDB.open();

        const colPath = 'col01/';
        const json_b = { _id: colPath + _id_b, name: name_b };
        const json_a = { _id: colPath + _id_a, name: name_a };
        const json_d = { _id: colPath + _id_d, name: name_d };
        const json_c000 = { _id: colPath + _id_c000, name: name_c000 };
        const json_c001 = { _id: colPath + _id_c001, name: name_c001 };
        const json_c01 = { _id: colPath + _id_c01, name: name_c01 };
        const json_c02 = { _id: colPath + _id_c02, name: name_c02 };

        const json_b_ = { _id: _id_b, name: name_b };
        const json_a_ = { _id: _id_a, name: name_a };
        const json_d_ = { _id: _id_d, name: name_d };
        const json_c000_ = { _id: _id_c000, name: name_c000 };
        const json_c001_ = { _id: _id_c001, name: name_c001 };
        const json_c01_ = { _id: _id_c01, name: name_c01 };
        const json_c02_ = { _id: _id_c02, name: name_c02 };

        await addOneData(gitDDB, colPath + _id_b + JSON_EXT, toSortedJSONString(json_b));
        await addOneData(gitDDB, colPath + _id_a + JSON_EXT, toSortedJSONString(json_a));
        await addOneData(gitDDB, colPath + _id_d + JSON_EXT, toSortedJSONString(json_d));
        await addOneData(
          gitDDB,
          colPath + _id_c000 + JSON_EXT,
          toSortedJSONString(json_c000)
        );
        await addOneData(
          gitDDB,
          colPath + _id_c001 + JSON_EXT,
          toSortedJSONString(json_c001)
        );
        await addOneData(
          gitDDB,
          colPath + _id_c01 + JSON_EXT,
          toSortedJSONString(json_c01)
        );
        await addOneData(
          gitDDB,
          colPath + _id_c02 + JSON_EXT,
          toSortedJSONString(json_c02)
        );

        const prefix = 'cit';

        await expect(
          findImpl(gitDDB, colPath, true, false, { prefix, recursive: false })
        ).resolves.toEqual([json_c000_, json_c001_]);

        await gitDDB.destroy();
      });

      it('gets from parent directory and child directory', async () => {
        const dbName = monoId();
        const gitDDB: GitDocumentDB = new GitDocumentDB({
          dbName,
          localDir,
        });
        await gitDDB.open();

        const colPath = 'col01/';
        const json_b = { _id: colPath + _id_b, name: name_b };
        const json_a = { _id: colPath + _id_a, name: name_a };
        const json_d = { _id: colPath + _id_d, name: name_d };
        const json_c000 = { _id: colPath + _id_c000, name: name_c000 };
        const json_c001 = { _id: colPath + _id_c001, name: name_c001 };
        const json_c01 = { _id: colPath + _id_c01, name: name_c01 };
        const json_c02 = { _id: colPath + _id_c02, name: name_c02 };

        const json_b_ = { _id: _id_b, name: name_b };
        const json_a_ = { _id: _id_a, name: name_a };
        const json_d_ = { _id: _id_d, name: name_d };
        const json_c000_ = { _id: _id_c000, name: name_c000 };
        const json_c001_ = { _id: _id_c001, name: name_c001 };
        const json_c01_ = { _id: _id_c01, name: name_c01 };
        const json_c02_ = { _id: _id_c02, name: name_c02 };

        await addOneData(gitDDB, colPath + _id_b + JSON_EXT, toSortedJSONString(json_b));
        await addOneData(gitDDB, colPath + _id_a + JSON_EXT, toSortedJSONString(json_a));
        await addOneData(gitDDB, colPath + _id_d + JSON_EXT, toSortedJSONString(json_d));
        await addOneData(
          gitDDB,
          colPath + _id_c000 + JSON_EXT,
          toSortedJSONString(json_c000)
        );
        await addOneData(
          gitDDB,
          colPath + _id_c001 + JSON_EXT,
          toSortedJSONString(json_c001)
        );
        await addOneData(
          gitDDB,
          colPath + _id_c01 + JSON_EXT,
          toSortedJSONString(json_c01)
        );
        await addOneData(
          gitDDB,
          colPath + _id_c02 + JSON_EXT,
          toSortedJSONString(json_c02)
        );

        const prefix = 'citrus';

        await expect(findImpl(gitDDB, colPath, true, false, { prefix })).resolves.toEqual([
          json_c000_,
          json_c001_,
          json_c01_,
          json_c02_,
        ]);

        await gitDDB.destroy();
      });

      it('gets from a sub directory', async () => {
        const dbName = monoId();
        const gitDDB: GitDocumentDB = new GitDocumentDB({
          dbName,
          localDir,
        });
        await gitDDB.open();

        const colPath = 'col01/';
        const json_b = { _id: colPath + _id_b, name: name_b };
        const json_a = { _id: colPath + _id_a, name: name_a };
        const json_d = { _id: colPath + _id_d, name: name_d };
        const json_c000 = { _id: colPath + _id_c000, name: name_c000 };
        const json_c001 = { _id: colPath + _id_c001, name: name_c001 };
        const json_c01 = { _id: colPath + _id_c01, name: name_c01 };
        const json_c02 = { _id: colPath + _id_c02, name: name_c02 };

        const json_b_ = { _id: _id_b, name: name_b };
        const json_a_ = { _id: _id_a, name: name_a };
        const json_d_ = { _id: _id_d, name: name_d };
        const json_c000_ = { _id: _id_c000, name: name_c000 };
        const json_c001_ = { _id: _id_c001, name: name_c001 };
        const json_c01_ = { _id: _id_c01, name: name_c01 };
        const json_c02_ = { _id: _id_c02, name: name_c02 };

        await addOneData(gitDDB, colPath + _id_b + JSON_EXT, toSortedJSONString(json_b));
        await addOneData(gitDDB, colPath + _id_a + JSON_EXT, toSortedJSONString(json_a));
        await addOneData(gitDDB, colPath + _id_d + JSON_EXT, toSortedJSONString(json_d));
        await addOneData(
          gitDDB,
          colPath + _id_c000 + JSON_EXT,
          toSortedJSONString(json_c000)
        );
        await addOneData(
          gitDDB,
          colPath + _id_c001 + JSON_EXT,
          toSortedJSONString(json_c001)
        );
        await addOneData(
          gitDDB,
          colPath + _id_c01 + JSON_EXT,
          toSortedJSONString(json_c01)
        );
        await addOneData(
          gitDDB,
          colPath + _id_c02 + JSON_EXT,
          toSortedJSONString(json_c02)
        );

        const prefix = 'citrus/y';

        await expect(findImpl(gitDDB, colPath, true, false, { prefix })).resolves.toEqual([
          json_c02_,
        ]);

        await gitDDB.destroy();
      });

      it('returns no entry when prefix does not match', async () => {
        const dbName = monoId();
        const gitDDB: GitDocumentDB = new GitDocumentDB({
          dbName,
          localDir,
        });
        await gitDDB.open();

        const colPath = 'col01/';
        const json_b = { _id: colPath + _id_b, name: name_b };
        const json_a = { _id: colPath + _id_a, name: name_a };
        const json_d = { _id: colPath + _id_d, name: name_d };
        const json_c000 = { _id: colPath + _id_c000, name: name_c000 };
        const json_c001 = { _id: colPath + _id_c001, name: name_c001 };
        const json_c01 = { _id: colPath + _id_c01, name: name_c01 };
        const json_c02 = { _id: colPath + _id_c02, name: name_c02 };

        const json_b_ = { _id: _id_b, name: name_b };
        const json_a_ = { _id: _id_a, name: name_a };
        const json_d_ = { _id: _id_d, name: name_d };
        const json_c000_ = { _id: _id_c000, name: name_c000 };
        const json_c001_ = { _id: _id_c001, name: name_c001 };
        const json_c01_ = { _id: _id_c01, name: name_c01 };
        const json_c02_ = { _id: _id_c02, name: name_c02 };

        await addOneData(gitDDB, colPath + _id_b + JSON_EXT, toSortedJSONString(json_b));
        await addOneData(gitDDB, colPath + _id_a + JSON_EXT, toSortedJSONString(json_a));
        await addOneData(gitDDB, colPath + _id_d + JSON_EXT, toSortedJSONString(json_d));
        await addOneData(
          gitDDB,
          colPath + _id_c000 + JSON_EXT,
          toSortedJSONString(json_c000)
        );
        await addOneData(
          gitDDB,
          colPath + _id_c001 + JSON_EXT,
          toSortedJSONString(json_c001)
        );
        await addOneData(
          gitDDB,
          colPath + _id_c01 + JSON_EXT,
          toSortedJSONString(json_c01)
        );
        await addOneData(
          gitDDB,
          colPath + _id_c02 + JSON_EXT,
          toSortedJSONString(json_c02)
        );

        const prefix = 'not_exist/';

        await expect(findImpl(gitDDB, colPath, true, false, { prefix })).resolves.toEqual(
          []
        );

        await gitDDB.destroy();
      });

      it('gets from deep directory', async () => {
        const dbName = monoId();
        const gitDDB: GitDocumentDB = new GitDocumentDB({
          dbName,
          localDir,
        });
        await gitDDB.open();

        const colPath = 'col01/';
        const json_p = { _id: colPath + _id_p, name: name_p };
        const json_b = { _id: colPath + _id_b, name: name_b };
        const json_a = { _id: colPath + _id_a, name: name_a };
        const json_d = { _id: colPath + _id_d, name: name_d };
        const json_c000 = { _id: colPath + _id_c000, name: name_c000 };
        const json_c001 = { _id: colPath + _id_c001, name: name_c001 };
        const json_c01 = { _id: colPath + _id_c01, name: name_c01 };
        const json_c02 = { _id: colPath + _id_c02, name: name_c02 };

        const json_p_ = { _id: _id_p, name: name_p };
        const json_b_ = { _id: _id_b, name: name_b };
        const json_a_ = { _id: _id_a, name: name_a };
        const json_d_ = { _id: _id_d, name: name_d };
        const json_c000_ = { _id: _id_c000, name: name_c000 };
        const json_c001_ = { _id: _id_c001, name: name_c001 };
        const json_c01_ = { _id: _id_c01, name: name_c01 };
        const json_c02_ = { _id: _id_c02, name: name_c02 };

        await addOneData(gitDDB, colPath + _id_p + JSON_EXT, toSortedJSONString(json_p));

        await addOneData(gitDDB, colPath + _id_b + JSON_EXT, toSortedJSONString(json_b));
        await addOneData(gitDDB, colPath + _id_a + JSON_EXT, toSortedJSONString(json_a));
        await addOneData(gitDDB, colPath + _id_d + JSON_EXT, toSortedJSONString(json_d));
        await addOneData(
          gitDDB,
          colPath + _id_c000 + JSON_EXT,
          toSortedJSONString(json_c000)
        );
        await addOneData(
          gitDDB,
          colPath + _id_c001 + JSON_EXT,
          toSortedJSONString(json_c001)
        );
        await addOneData(
          gitDDB,
          colPath + _id_c01 + JSON_EXT,
          toSortedJSONString(json_c01)
        );
        await addOneData(
          gitDDB,
          colPath + _id_c02 + JSON_EXT,
          toSortedJSONString(json_c02)
        );

        await expect(
          findImpl(gitDDB, colPath, true, false, { prefix: 'pear/Japan' })
        ).resolves.toEqual([json_p_]);

        await expect(
          findImpl(gitDDB, colPath, true, false, { prefix: 'pear' })
        ).resolves.toEqual([json_p_]);

        await gitDDB.destroy();
      });
    });
  });

  describe('with metadata', () => {
    it('returns empty', async () => {
      const dbName = monoId();

      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });

      await gitDDB.open();

      await expect(findImpl(gitDDB, '', true, true)).resolves.toEqual([]);

      await gitDDB.destroy();
    });

    it('returns docs by breadth-first search (recursive)', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();

      const json_b = { _id: _id_b, name: name_b };
      const json_a = { _id: _id_a, name: name_a };
      const json_d = { _id: _id_d, name: name_d };
      const json_c01 = { _id: _id_c01, name: name_c01 };
      const json_c02 = { _id: _id_c02, name: name_c02 };

      await addOneData(gitDDB, _id_b + JSON_EXT, toSortedJSONString(json_b));
      await addOneData(gitDDB, _id_a + JSON_EXT, toSortedJSONString(json_a));
      await addOneData(gitDDB, _id_d + JSON_EXT, toSortedJSONString(json_d));
      await addOneData(gitDDB, _id_c01 + JSON_EXT, toSortedJSONString(json_c01));
      await addOneData(gitDDB, _id_c02 + JSON_EXT, toSortedJSONString(json_c02));

      await expect(findImpl(gitDDB, '', true, true)).resolves.toEqual([
        {
          _id: _id_a,
          name: _id_a + JSON_EXT,
          fileOid: (await git.hashBlob({ object: toSortedJSONString(json_a) })).oid,
          type: 'json',
          doc: json_a,
        },
        {
          _id: _id_b,
          name: _id_b + JSON_EXT,
          fileOid: (await git.hashBlob({ object: toSortedJSONString(json_b) })).oid,
          type: 'json',
          doc: json_b,
        },
        {
          _id: _id_c01,
          name: _id_c01 + JSON_EXT,
          fileOid: (await git.hashBlob({ object: toSortedJSONString(json_c01) })).oid,
          type: 'json',
          doc: json_c01,
        },
        {
          _id: _id_c02,
          name: _id_c02 + JSON_EXT,
          fileOid: (await git.hashBlob({ object: toSortedJSONString(json_c02) })).oid,
          type: 'json',
          doc: json_c02,
        },
        {
          _id: _id_d,
          name: _id_d + JSON_EXT,
          fileOid: (await git.hashBlob({ object: toSortedJSONString(json_d) })).oid,
          type: 'json',
          doc: json_d,
        },
      ]);

      await gitDDB.destroy();
    });
  });
});
