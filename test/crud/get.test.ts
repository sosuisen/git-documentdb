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
import sinon from 'sinon';
import { IDocumentDB } from '../../src/types_gitddb';
import { sleep, toSortedJSONString } from '../../src/utils';
import {
  DatabaseClosingError,
  InvalidJsonObjectError,
  RepositoryNotOpenError,
} from '../../src/error';
import { GitDocumentDB } from '../../src/index';
import { getImpl } from '../../src/crud/get';
import { JSON_EXT } from '../../src/const';

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = './test/database_crud_get';

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

before(() => {
  fs.removeSync(path.resolve(localDir));
});

after(() => {
  fs.removeSync(path.resolve(localDir));
});

const commitOneData = async (gitDDB: IDocumentDB, fullDocPath: string, data: string) => {
  fs.ensureDirSync(path.dirname(path.resolve(gitDDB.workingDir(), fullDocPath)));
  fs.writeFileSync(path.resolve(gitDDB.workingDir(), fullDocPath), data);
  await git.add({ fs, dir: gitDDB.workingDir(), filepath: fullDocPath });
  await git.commit({
    fs,
    dir: gitDDB.workingDir(),
    message: 'message',
    author: gitDDB.author,
  });
};

describe('<crud/get> getImpl()', () => {
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
    await expect(getImpl(gitDDB, 'tmp', '', true)).rejects.toThrowError(
      DatabaseClosingError
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
    await expect(getImpl(gitDDB, 'tmp', '', true)).rejects.toThrowError(
      RepositoryNotOpenError
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

    const shortId = 'foo';
    const collectionPath = '';
    const fullDocPath = collectionPath + shortId + JSON_EXT;
    const data = 'invalid data'; // JSON.parse() will throw error
    await commitOneData(gitDDB, fullDocPath, data);

    await expect(getImpl(gitDDB, shortId, collectionPath, true)).rejects.toThrowError(
      InvalidJsonObjectError
    );

    await gitDDB.destroy();
  });

  it('returns latest JsonDoc', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const shortId = 'prof01';
    const collectionPath = '';
    const fullDocPath = collectionPath + shortId + JSON_EXT;
    const json = { _id: shortId, name: 'Shirase' };
    await commitOneData(gitDDB, fullDocPath, toSortedJSONString(json));
    await expect(getImpl(gitDDB, shortId, collectionPath, true)).resolves.toEqual(json);

    await gitDDB.destroy();
  });

  it('returns latest JsonDoc in subdirectory', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const shortId = 'dir01/prof01';
    const collectionPath = '';
    const fullDocPath = collectionPath + shortId + JSON_EXT;
    const json = { _id: shortId, name: 'Shirase' };
    await commitOneData(gitDDB, fullDocPath, toSortedJSONString(json));
    await expect(getImpl(gitDDB, shortId, collectionPath, true)).resolves.toEqual(json);

    await gitDDB.destroy();
  });

  it('returns latest JsonDoc under deep collectionPath', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const shortId = 'dir01/prof01';
    const collectionPath = 'col01/col02/col03';
    const fullDocPath = collectionPath + shortId + JSON_EXT;
    const json = { _id: shortId, name: 'Shirase' };
    await commitOneData(gitDDB, fullDocPath, toSortedJSONString(json));
    await expect(getImpl(gitDDB, shortId, collectionPath, true)).resolves.toEqual(json);

    await gitDDB.destroy();
  });

  it('returns undefined if db does not have commits.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await git.init({ fs, dir: gitDDB.workingDir() });
    const stubIsOpened = sandbox.stub(gitDDB, 'isOpened');
    stubIsOpened.returns(true);

    const shortId = 'prof01';
    const collectionPath = '';
    await expect(getImpl(gitDDB, shortId, collectionPath, true)).resolves.toBeUndefined();

    await gitDDB.destroy();
  });

  it('returns undefined if a document is not put.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();

    const shortId = 'dir01/prof01';
    const collectionPath = '';

    await expect(getImpl(gitDDB, shortId, collectionPath, true)).resolves.toBeUndefined();

    await gitDDB.destroy();
  });

  it('returns a document by non-ASCII _id', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const shortId = '枕草子/春はあけぼの';
    const collectionPath = '';
    const fullDocPath = collectionPath + shortId + JSON_EXT;
    const json = { _id: shortId, name: 'Shirase' };
    await commitOneData(gitDDB, fullDocPath, toSortedJSONString(json));
    await expect(getImpl(gitDDB, shortId, collectionPath, true)).resolves.toEqual(json);

    await gitDDB.destroy();
  });

  describe('with internalOptions', () => {
    it('returns latest JsonDoc by oid', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });

      await gitDDB.open();
      const shortId = 'prof01';
      const collectionPath = '';
      const fullDocPath = collectionPath + shortId + JSON_EXT;
      const json = { _id: shortId, name: 'Shirase' };
      const { oid } = await git.hashBlob({ object: toSortedJSONString(json) });
      await commitOneData(gitDDB, fullDocPath, toSortedJSONString(json));
      await expect(
        getImpl(gitDDB, shortId, collectionPath, true, undefined, { oid })
      ).resolves.toEqual(json);

      await gitDDB.destroy();
    });

    it('returns latest FatJsonDoc', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });

      await gitDDB.open();
      const shortId = 'prof01';
      const collectionPath = '';
      const fullDocPath = collectionPath + shortId + JSON_EXT;
      const json = { _id: shortId, name: 'Shirase' };
      const { oid } = await git.hashBlob({ object: toSortedJSONString(json) });
      await commitOneData(gitDDB, fullDocPath, toSortedJSONString(json));
      await expect(
        getImpl(gitDDB, shortId, collectionPath, true, undefined, { withMetadata: true })
      ).resolves.toEqual({
        _id: shortId,
        fileOid: oid,
        type: 'json',
        doc: json,
      });

      await gitDDB.destroy();
    });
  });
});
