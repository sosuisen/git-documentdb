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
import {
  DatabaseClosingError,
  InvalidJsonObjectError,
  RepositoryNotOpenError,
} from '../../src/error';
import {
  createClonedDatabases,
  destroyDBs,
  removeRemoteRepositories,
} from '../remote_utils';
import { GitDocumentDB } from '../../src/index';
import { sleep, toSortedJSONString, utf8encode } from '../../src/utils';
import { getHistoryImpl, readOldBlob } from '../../src/crud/history';
import { IDocumentDB } from '../../src/types_gitddb';
import { JSON_EXT } from '../../src/const';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const git_module = require('isomorphic-git');

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = './test/database_crud_history';

const reposPrefix = 'test_history___';

let idCounter = 0;
const serialId = () => {
  return `${reposPrefix}${idCounter++}`;
};

// Use sandbox to restore stub and spy in parallel mocha tests
let sandbox: sinon.SinonSandbox;
beforeEach(function () {
  // @ts-ignore
  console.log(`... ${this.currentTest.fullTitle()}`);
  sandbox = sinon.createSandbox();
});

before(() => {
  fs.removeSync(path.resolve(localDir));
});

afterEach(function () {
  sandbox.restore();
});

after(() => {
  fs.removeSync(path.resolve(localDir));
});

const addOneData = async (
  gitDDB: IDocumentDB,
  fullDocPath: string,
  data: string,
  author?: { name?: string; email?: string },
  committer?: { name?: string; email?: string }
) => {
  fs.ensureDirSync(path.dirname(path.resolve(gitDDB.workingDir(), fullDocPath)));
  fs.writeFileSync(path.resolve(gitDDB.workingDir(), fullDocPath), data);
  await git.add({ fs, dir: gitDDB.workingDir(), filepath: fullDocPath });
  await git.commit({
    fs,
    dir: gitDDB.workingDir(),
    message: 'message',
    author: author ?? gitDDB.author,
    committer: committer ?? gitDDB.committer,
  });
};

const removeOneData = async (gitDDB: IDocumentDB, fullDocPath: string, data: string) => {
  await git.remove({ fs, dir: gitDDB.workingDir(), filepath: fullDocPath });
  fs.removeSync(path.resolve(gitDDB.workingDir(), fullDocPath));
  await git.commit({
    fs,
    dir: gitDDB.workingDir(),
    message: 'message',
    author: gitDDB.author,
  });
};

// This test needs environment variables:
//  - GITDDB_GITHUB_USER_URL: URL of your GitHub account
// e.g.) https://github.com/foo/
//  - GITDDB_PERSONAL_ACCESS_TOKEN: A personal access token of your GitHub account
const maybe =
  process.env.GITDDB_GITHUB_USER_URL && process.env.GITDDB_PERSONAL_ACCESS_TOKEN
    ? describe
    : describe.skip;

maybe('<crud/history> getHistoryImpl', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  before(async () => {
    await removeRemoteRepositories(reposPrefix);
  });

  it('gets all revisions sorted by date from merged commit', async () => {
    const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
      remoteURLBase,
      localDir,
      serialId,
      {
        conflictResolutionStrategy: 'ours',
      }
    );

    const _id = 'prof';
    const jsonA1 = { _id, name: 'A-1' };
    const jsonA2 = { _id, name: 'A-2' };
    const jsonA3 = { _id, name: 'A-3' };
    const jsonB1 = { _id, name: 'B-1' };
    const jsonB2 = { _id, name: 'B-2' };
    const putResultA1 = await dbA.put(jsonA1);
    await sleep(1500);
    const putResultB1 = await dbB.put(jsonB1);
    await sleep(1500);
    const putResultA2 = await dbA.put(jsonA2);
    await sleep(1500);
    const putResultB2 = await dbB.put(jsonB2);
    await sleep(1500);
    const putResultA3 = await dbA.put(jsonA3);
    await sleep(1500);

    await syncA.trySync();
    await syncB.trySync(); // Resolve conflict. jsonB2 wins.

    // Get
    const history = await getHistoryImpl(dbB, _id, '', true);

    expect(history[0]).toEqual({
      _id,
      fileOid: expect.stringMatching(/^[\da-z]{40}$/),
      type: 'json',
      doc: jsonB2,
    });
    expect(history[1]).toEqual({
      _id,
      fileOid: expect.stringMatching(/^[\da-z]{40}$/),
      type: 'json',
      doc: jsonA3,
    });
    expect(history[2]).toEqual({
      _id,
      fileOid: expect.stringMatching(/^[\da-z]{40}$/),
      type: 'json',
      doc: jsonB2,
    });
    expect(history[3]).toEqual({
      _id,
      fileOid: expect.stringMatching(/^[\da-z]{40}$/),
      type: 'json',
      doc: jsonA2,
    });
    expect(history[4]).toEqual({
      _id,
      fileOid: expect.stringMatching(/^[\da-z]{40}$/),
      type: 'json',
      doc: jsonB1,
    });
    expect(history[5]).toEqual({
      _id,
      fileOid: expect.stringMatching(/^[\da-z]{40}$/),
      type: 'json',
      doc: jsonA1,
    });

    await destroyDBs([dbA, dbB]);
  });
});

describe('<crud/history> getHistoryImpl', () => {
  it('gets all revisions', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const _idA = 'profA';
    const jsonA01 = { _id: _idA, name: 'v01' };
    const jsonA02 = { _id: _idA, name: 'v02' };
    const jsonA03 = { _id: _idA, name: 'v03' };
    await gitDDB.put(jsonA01);
    await gitDDB.put(jsonA02);
    await gitDDB.put(jsonA03);
    const _idB = 'profB';
    const jsonB01 = { _id: _idB, name: 'v01' };
    const jsonB02 = { _id: _idB, name: 'v02' };
    await gitDDB.put(jsonB01);
    await gitDDB.put(jsonB02);
    // Get
    const historyA = await getHistoryImpl(gitDDB, _idA, '', true);
    expect(historyA.length).toBe(3);
    expect(historyA[0]?.doc).toMatchObject(jsonA03);
    expect(historyA[1]?.doc).toMatchObject(jsonA02);
    expect(historyA[2]?.doc).toMatchObject(jsonA01);
    const historyB = await getHistoryImpl(gitDDB, _idB, '', true);
    expect(historyB.length).toBe(2);
    expect(historyB[0]?.doc).toMatchObject(jsonB02);
    expect(historyB[1]?.doc).toMatchObject(jsonB01);

    await destroyDBs([gitDDB]);
  });

  it('gets filtered revisions', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const _idA = 'profA';
    const jsonA01 = { _id: _idA, name: 'v01' };
    const jsonA02 = { _id: _idA, name: 'v02' };
    const jsonA03 = { _id: _idA, name: 'v03' };

    gitDDB.author = { name: 'authorA', email: 'authorEmailA' };
    gitDDB.committer = { name: 'committerA', email: 'committerEmailA' };
    await gitDDB.put(jsonA01);

    gitDDB.author = { name: 'authorB', email: 'authorEmailB' };
    gitDDB.committer = { name: 'committerB', email: 'committerEmailB' };
    await gitDDB.put(jsonA02);
    await gitDDB.put(jsonA03);

    const _idB = 'profB';
    const jsonB01 = { _id: _idB, name: 'v01' };
    const jsonB02 = { _id: _idB, name: 'v02' };

    gitDDB.author = { name: 'authorA', email: 'authorEmailA' };
    gitDDB.committer = { name: 'committerA', email: 'committerEmailA' };
    await gitDDB.put(jsonB01);

    gitDDB.author = { name: 'authorB', email: 'authorEmailB' };
    gitDDB.committer = { name: 'committerB', email: 'committerEmailB' };
    await gitDDB.put(jsonB02);

    const historyA = await getHistoryImpl(gitDDB, _idA, '', true, {
      filter: [{ author: { name: 'authorB', email: 'authorEmailB' } }],
    });
    expect(historyA.length).toBe(2);
    expect(historyA[0]?.doc).toMatchObject(jsonA03);
    expect(historyA[1]?.doc).toMatchObject(jsonA02);

    const historyB = await getHistoryImpl(gitDDB, _idB, '', true, {
      filter: [{ author: { name: 'authorB', email: 'authorEmailB' } }],
    });
    expect(historyB.length).toBe(1);
    expect(historyB[0]?.doc).toMatchObject(jsonB02);

    await destroyDBs([gitDDB]);
  });

  it('gets empty revision', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const _idA = 'profA';
    const jsonA01 = { _id: _idA, name: 'v01' };
    await gitDDB.put(jsonA01);
    // Get
    const historyA = await getHistoryImpl(gitDDB, 'invalid_id', '', true);
    expect(historyA.length).toBe(0);

    await destroyDBs([gitDDB]);
  });

  it('gets deleted revisions', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const _idA = 'profA';
    const jsonA01 = { _id: _idA, name: 'v01' };
    const jsonA02 = { _id: _idA, name: 'v02' };
    const jsonA03 = { _id: _idA, name: 'v03' };
    await gitDDB.put(jsonA01);
    await gitDDB.delete(jsonA01);
    await gitDDB.put(jsonA02);
    await gitDDB.delete(jsonA02);
    await gitDDB.put(jsonA03);
    await gitDDB.delete(jsonA03);

    // Get
    const historyA = await getHistoryImpl(gitDDB, _idA, '', true);
    expect(historyA.length).toBe(6);
    expect(historyA[0]).toBe(undefined);
    expect(historyA[1]?.doc).toMatchObject(jsonA03);
    expect(historyA[2]).toBe(undefined);
    expect(historyA[3]?.doc).toMatchObject(jsonA02);
    expect(historyA[4]).toBe(undefined);
    expect(historyA[5]?.doc).toMatchObject(jsonA01);

    await destroyDBs([gitDDB]);
  });

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
    await expect(getHistoryImpl(gitDDB, '0', '', true)).rejects.toThrowError(
      DatabaseClosingError
    );

    while (gitDDB.isClosing) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(100);
    }
    await destroyDBs([gitDDB]);
  });

  it('throws RepositoryNotOpenError', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    await gitDDB.close();
    await expect(getHistoryImpl(gitDDB, 'tmp', '', true)).rejects.toThrowError(
      RepositoryNotOpenError
    );
    await destroyDBs([gitDDB]);
  });

  it('throws InvalidJsonObjectError.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    await gitDDB.put('1.json', 'invalid json');

    await expect(getHistoryImpl(gitDDB, '1', '', true)).rejects.toThrowError(
      InvalidJsonObjectError
    );

    await destroyDBs([gitDDB]);
  });
});

describe('<crud/history> readOldBlob()', () => {
  it('return undefined when back_number is less than 0.', async () => {
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
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json));

    await expect(
      readOldBlob(gitDDB.workingDir(), fullDocPath, -1)
    ).resolves.toBeUndefined();

    await destroyDBs([gitDDB]);
  });

  it('returns undefined when get deleted document with backNumber #0.', async () => {
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
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json));
    await removeOneData(gitDDB, fullDocPath, toSortedJSONString(json));

    await expect(readOldBlob(gitDDB.workingDir(), fullDocPath, 0)).resolves.toBeUndefined();

    await destroyDBs([gitDDB]);
  });

  it('returns one revision before when get back number #1 of the deleted document.', async () => {
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
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json));
    await removeOneData(gitDDB, fullDocPath, toSortedJSONString(json));
    const { oid } = await git.hashBlob({ object: toSortedJSONString(json) });
    await expect(readOldBlob(gitDDB.workingDir(), fullDocPath, 1)).resolves.toEqual({
      oid,
      blob: utf8encode(toSortedJSONString(json)),
    });

    await destroyDBs([gitDDB]);
  });

  it('returns two revisions before when get back number #2 of the deleted document.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const shortId = 'prof01';
    const collectionPath = '';
    const fullDocPath = collectionPath + shortId + JSON_EXT;
    const json01 = { _id: shortId, name: 'v01' };
    const json02 = { _id: shortId, name: 'v02' };
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json01));
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json02));
    await removeOneData(gitDDB, fullDocPath, toSortedJSONString(json02));
    const { oid } = await git.hashBlob({ object: toSortedJSONString(json01) });
    await expect(readOldBlob(gitDDB.workingDir(), fullDocPath, 2)).resolves.toEqual({
      oid,
      blob: utf8encode(toSortedJSONString(json01)),
    });

    await destroyDBs([gitDDB]);
  });

  it('returns an old revision after a document was deleted and created again.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const shortId = 'prof01';
    const collectionPath = '';
    const fullDocPath = collectionPath + shortId + JSON_EXT;
    const json01 = { _id: shortId, name: 'v01' };
    const json02 = { _id: shortId, name: 'v02' };
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json01));
    await removeOneData(gitDDB, fullDocPath, toSortedJSONString(json01));
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json02));
    const { oid } = await git.hashBlob({ object: toSortedJSONString(json01) });
    await expect(readOldBlob(gitDDB.workingDir(), fullDocPath, 2)).resolves.toEqual({
      oid,
      blob: utf8encode(toSortedJSONString(json01)),
    });

    await destroyDBs([gitDDB]);
  });

  it('returns undefined when get document with backNumber that was deleted once', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const shortId = 'prof01';
    const collectionPath = '';
    const fullDocPath = collectionPath + shortId + JSON_EXT;
    const json01 = { _id: shortId, name: 'v01' };
    const json02 = { _id: shortId, name: 'v02' };
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json01));
    await removeOneData(gitDDB, fullDocPath, toSortedJSONString(json01));
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json02));

    await expect(readOldBlob(gitDDB.workingDir(), fullDocPath, 1)).resolves.toBeUndefined();

    await destroyDBs([gitDDB]);
  });

  it('returns undefined when get document with backNumber that does not exist', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const shortId = 'prof01';
    const collectionPath = '';
    const fullDocPath = collectionPath + shortId + JSON_EXT;
    const json01 = { _id: shortId, name: 'v01' };
    const json02 = { _id: shortId, name: 'v02' };
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json01));
    await removeOneData(gitDDB, fullDocPath, toSortedJSONString(json01));
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json02));

    await expect(readOldBlob(gitDDB.workingDir(), fullDocPath, 3)).resolves.toBeUndefined();

    await destroyDBs([gitDDB]);
  });

  it('returns undefined if a document is not put.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const shortId = 'prof01';
    const collectionPath = '';
    const fullDocPath = collectionPath + shortId;
    await expect(readOldBlob(gitDDB.workingDir(), fullDocPath, 0)).resolves.toBeUndefined();

    await destroyDBs([gitDDB]);
  });

  it('returns undefined if readBlob throws Error', async () => {
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
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json));

    const stubReadBlob = sandbox.stub(git_module, 'readBlob');
    stubReadBlob.rejects();

    await expect(readOldBlob(gitDDB.workingDir(), fullDocPath, 0)).resolves.toBeUndefined();

    await destroyDBs([gitDDB]);
  });

  it('returns undefined if filtered revision does not exist', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const shortId = 'prof01';
    const collectionPath = '';
    const fullDocPath = collectionPath + shortId + JSON_EXT;
    const json01 = { _id: shortId, name: 'v01' };
    const json02 = { _id: shortId, name: 'v02' };
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json01));
    await removeOneData(gitDDB, fullDocPath, toSortedJSONString(json01));
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json02));

    await expect(
      readOldBlob(gitDDB.workingDir(), fullDocPath, 0, {
        filter: [{ author: { name: 'invalid author' } }],
      })
    ).resolves.toBeUndefined();

    await destroyDBs([gitDDB]);
  });

  describe('returns a revision filtered by historyOptions', () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    const targetId = '01';
    const collectionPath = '';
    const fullDocPath = collectionPath + targetId + JSON_EXT;

    const json01 = { _id: targetId, name: 'v01' };
    const json02 = { _id: targetId, name: 'v02' };
    const json03 = { _id: targetId, name: 'v03' };
    const json04 = { _id: targetId, name: 'v04' };
    const json05 = { _id: targetId, name: 'v05' };
    const json06 = { _id: targetId, name: 'v06' };
    const json07 = { _id: targetId, name: 'v07' };
    const json08 = { _id: targetId, name: 'v08' };
    const json09 = { _id: targetId, name: 'v09' };
    const json10 = { _id: targetId, name: 'v10' };
    const json11 = { _id: targetId, name: 'v11' };
    const json12 = { _id: targetId, name: 'v12' };
    const json13 = { _id: targetId, name: 'v13' };
    const json14 = { _id: targetId, name: 'v14' };
    const json15 = { _id: targetId, name: 'v15' };
    const json16 = { _id: targetId, name: 'v16' };
    const json17 = { _id: targetId, name: 'v17' };

    before(async () => {
      await gitDDB.open();

      await addOneData(gitDDB, fullDocPath, toSortedJSONString(json01)); // default

      await addOneData(
        gitDDB,
        fullDocPath,
        toSortedJSONString(json02),
        {
          name: 'authorA',
          email: 'authorEmailA',
        },
        {
          name: 'committerA',
          email: 'committerEmailA',
        }
      );

      await addOneData(
        gitDDB,
        fullDocPath,
        toSortedJSONString(json03),
        {
          name: 'authorA',
          email: 'authorEmailA',
        },
        {
          name: 'committerA',
          email: 'committerEmailB',
        }
      );

      await addOneData(
        gitDDB,
        fullDocPath,
        toSortedJSONString(json04),
        {
          name: 'authorA',
          email: 'authorEmailA',
        },
        {
          name: 'committerB',
          email: 'committerEmailA',
        }
      );

      await addOneData(
        gitDDB,
        fullDocPath,
        toSortedJSONString(json05),
        {
          name: 'authorA',
          email: 'authorEmailA',
        },
        {
          name: 'committerB',
          email: 'committerEmailB',
        }
      );

      await addOneData(
        gitDDB,
        fullDocPath,
        toSortedJSONString(json06),
        {
          name: 'authorA',
          email: 'authorEmailB',
        },
        {
          name: 'committerA',
          email: 'committerEmailA',
        }
      );

      await addOneData(
        gitDDB,
        fullDocPath,
        toSortedJSONString(json07),
        {
          name: 'authorA',
          email: 'authorEmailB',
        },
        {
          name: 'committerA',
          email: 'committerEmailB',
        }
      );

      await addOneData(
        gitDDB,
        fullDocPath,
        toSortedJSONString(json08),
        {
          name: 'authorA',
          email: 'authorEmailB',
        },
        {
          name: 'committerB',
          email: 'committerEmailA',
        }
      );

      await addOneData(
        gitDDB,
        fullDocPath,
        toSortedJSONString(json09),
        {
          name: 'authorA',
          email: 'authorEmailB',
        },
        {
          name: 'committerB',
          email: 'committerEmailB',
        }
      );

      await addOneData(
        gitDDB,
        fullDocPath,
        toSortedJSONString(json10),
        {
          name: 'authorB',
          email: 'authorEmailA',
        },
        {
          name: 'committerA',
          email: 'committerEmailA',
        }
      );

      await addOneData(
        gitDDB,
        fullDocPath,
        toSortedJSONString(json11),
        {
          name: 'authorB',
          email: 'authorEmailA',
        },
        {
          name: 'committerA',
          email: 'committerEmailB',
        }
      );

      await addOneData(
        gitDDB,
        fullDocPath,
        toSortedJSONString(json12),
        {
          name: 'authorB',
          email: 'authorEmailA',
        },
        {
          name: 'committerB',
          email: 'committerEmailA',
        }
      );

      await addOneData(
        gitDDB,
        fullDocPath,
        toSortedJSONString(json13),
        {
          name: 'authorB',
          email: 'authorEmailA',
        },
        {
          name: 'committerB',
          email: 'committerEmailB',
        }
      );

      await addOneData(
        gitDDB,
        fullDocPath,
        toSortedJSONString(json14),
        {
          name: 'authorB',
          email: 'authorEmailB',
        },
        {
          name: 'committerA',
          email: 'committerEmailA',
        }
      );

      await addOneData(
        gitDDB,
        fullDocPath,
        toSortedJSONString(json15),
        {
          name: 'authorB',
          email: 'authorEmailB',
        },
        {
          name: 'committerA',
          email: 'committerEmailB',
        }
      );

      await addOneData(
        gitDDB,
        fullDocPath,
        toSortedJSONString(json16),
        {
          name: 'authorB',
          email: 'authorEmailB',
        },
        {
          name: 'committerB',
          email: 'committerEmailA',
        }
      );

      await addOneData(
        gitDDB,
        fullDocPath,
        toSortedJSONString(json17),
        {
          name: 'authorB',
          email: 'authorEmailB',
        },
        {
          name: 'committerB',
          email: 'committerEmailB',
        }
      );
    });

    after(async () => {
      await destroyDBs([gitDDB]);
    });

    it('with author.name', async () => {
      await expect(
        readOldBlob(gitDDB.workingDir(), fullDocPath, 0, {
          filter: [{ author: { name: 'authorA' } }],
        })
      ).resolves.toEqual({
        oid: (await git.hashBlob({ object: toSortedJSONString(json09) })).oid,
        blob: utf8encode(toSortedJSONString(json09)),
      });

      await expect(
        readOldBlob(gitDDB.workingDir(), fullDocPath, 1, {
          filter: [{ author: { name: 'authorA' } }],
        })
      ).resolves.toEqual({
        oid: (await git.hashBlob({ object: toSortedJSONString(json08) })).oid,
        blob: utf8encode(toSortedJSONString(json08)),
      });
    });

    it('with author.email', async () => {
      await expect(
        readOldBlob(gitDDB.workingDir(), fullDocPath, 0, {
          filter: [{ author: { email: 'authorEmailA' } }],
        })
      ).resolves.toEqual({
        oid: (await git.hashBlob({ object: toSortedJSONString(json13) })).oid,
        blob: utf8encode(toSortedJSONString(json13)),
      });

      await expect(
        readOldBlob(gitDDB.workingDir(), fullDocPath, 1, {
          filter: [{ author: { email: 'authorEmailA' } }],
        })
      ).resolves.toEqual({
        oid: (await git.hashBlob({ object: toSortedJSONString(json12) })).oid,
        blob: utf8encode(toSortedJSONString(json12)),
      });
    });

    it('with author.name and author.email', async () => {
      await expect(
        readOldBlob(gitDDB.workingDir(), fullDocPath, 0, {
          filter: [{ author: { name: 'authorA', email: 'authorEmailA' } }],
        })
      ).resolves.toEqual({
        oid: (await git.hashBlob({ object: toSortedJSONString(json05) })).oid,
        blob: utf8encode(toSortedJSONString(json05)),
      });

      await expect(
        readOldBlob(gitDDB.workingDir(), fullDocPath, 1, {
          filter: [{ author: { name: 'authorA', email: 'authorEmailA' } }],
        })
      ).resolves.toEqual({
        oid: (await git.hashBlob({ object: toSortedJSONString(json04) })).oid,
        blob: utf8encode(toSortedJSONString(json04)),
      });
    });

    it('with committer.name', async () => {
      await expect(
        readOldBlob(gitDDB.workingDir(), fullDocPath, 0, {
          filter: [{ committer: { name: 'committerA' } }],
        })
      ).resolves.toEqual({
        oid: (await git.hashBlob({ object: toSortedJSONString(json15) })).oid,
        blob: utf8encode(toSortedJSONString(json15)),
      });

      await expect(
        readOldBlob(gitDDB.workingDir(), fullDocPath, 1, {
          filter: [{ committer: { name: 'committerA' } }],
        })
      ).resolves.toEqual({
        oid: (await git.hashBlob({ object: toSortedJSONString(json14) })).oid,
        blob: utf8encode(toSortedJSONString(json14)),
      });
    });

    it('with committer.email', async () => {
      await expect(
        readOldBlob(gitDDB.workingDir(), fullDocPath, 0, {
          filter: [{ committer: { email: 'committerEmailA' } }],
        })
      ).resolves.toEqual({
        oid: (await git.hashBlob({ object: toSortedJSONString(json16) })).oid,
        blob: utf8encode(toSortedJSONString(json16)),
      });

      await expect(
        readOldBlob(gitDDB.workingDir(), fullDocPath, 1, {
          filter: [{ committer: { email: 'committerEmailA' } }],
        })
      ).resolves.toEqual({
        oid: (await git.hashBlob({ object: toSortedJSONString(json14) })).oid,
        blob: utf8encode(toSortedJSONString(json14)),
      });
    });

    it('with committer.name and committer.email', async () => {
      await expect(
        readOldBlob(gitDDB.workingDir(), fullDocPath, 0, {
          filter: [{ committer: { name: 'committerA', email: 'committerEmailA' } }],
        })
      ).resolves.toEqual({
        oid: (await git.hashBlob({ object: toSortedJSONString(json14) })).oid,
        blob: utf8encode(toSortedJSONString(json14)),
      });

      await expect(
        readOldBlob(gitDDB.workingDir(), fullDocPath, 1, {
          filter: [{ committer: { name: 'committerA', email: 'committerEmailA' } }],
        })
      ).resolves.toEqual({
        oid: (await git.hashBlob({ object: toSortedJSONString(json10) })).oid,
        blob: utf8encode(toSortedJSONString(json10)),
      });
    });

    it('with author.name, author.email, committer.name, and committer.email', async () => {
      await expect(
        readOldBlob(gitDDB.workingDir(), fullDocPath, 0, {
          filter: [
            {
              author: { name: 'authorA', email: 'authorEmailA' },
              committer: { name: 'committerA', email: 'committerEmailA' },
            },
          ],
        })
      ).resolves.toEqual({
        oid: (await git.hashBlob({ object: toSortedJSONString(json02) })).oid,
        blob: utf8encode(toSortedJSONString(json02)),
      });

      await expect(
        readOldBlob(gitDDB.workingDir(), fullDocPath, 1, {
          filter: [
            {
              author: { name: 'authorA', email: 'authorEmailA' },
              committer: { name: 'committerA', email: 'committerEmailA' },
            },
          ],
        })
      ).resolves.toBeUndefined();
    });

    it('with OR condition', async () => {
      await expect(
        readOldBlob(gitDDB.workingDir(), fullDocPath, 0, {
          filter: [
            { committer: { name: 'committerA', email: 'committerEmailA' } },
            { committer: { name: 'committerB', email: 'committerEmailB' } },
          ],
        })
      ).resolves.toEqual({
        oid: (await git.hashBlob({ object: toSortedJSONString(json17) })).oid,
        blob: utf8encode(toSortedJSONString(json17)),
      });

      await expect(
        readOldBlob(gitDDB.workingDir(), fullDocPath, 1, {
          filter: [
            { committer: { name: 'committerA', email: 'committerEmailA' } },
            { committer: { name: 'committerB', email: 'committerEmailB' } },
          ],
        })
      ).resolves.toEqual({
        oid: (await git.hashBlob({ object: toSortedJSONString(json14) })).oid,
        blob: utf8encode(toSortedJSONString(json14)),
      });
    });
  });
});
