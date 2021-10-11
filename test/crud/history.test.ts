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
import { Err } from '../../src/error';
import {
  createClonedDatabases,
  destroyDBs,
  removeRemoteRepositories,
} from '../remote_utils';
import { GitDocumentDB } from '../../src/git_documentdb';
import { sleep, toSortedJSONString, utf8encode } from '../../src/utils';
import { getHistoryImpl, readOldBlob } from '../../src/crud/history';

import { JSON_POSTFIX } from '../../src/const';
import { addOneData, removeOneData } from '../utils';
import { FatJsonDoc } from '../../src/types';

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

describe('<crud/history> getHistoryImpl', () => {
  it('gets all revisions', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const _idA = 'profA';
    const shortNameA = _idA + JSON_POSTFIX;
    const jsonA01 = { _id: _idA, name: 'v01' };
    const jsonA02 = { _id: _idA, name: 'v02' };
    const jsonA03 = { _id: _idA, name: 'v03' };
    await gitDDB.put(jsonA01);
    await gitDDB.put(jsonA02);
    await gitDDB.put(jsonA03);
    const _idB = 'profB';
    const shortNameB = _idB + JSON_POSTFIX;
    const jsonB01 = { _id: _idB, name: 'v01' };
    const jsonB02 = { _id: _idB, name: 'v02' };
    await gitDDB.put(jsonB01);
    await gitDDB.put(jsonB02);
    // Get
    const historyA = await getHistoryImpl(
      gitDDB,
      shortNameA,
      '',
      gitDDB.jsonExt,

      undefined,
      undefined,
      true
    );
    expect(historyA.length).toBe(3);
    expect((historyA[0] as FatJsonDoc).doc).toMatchObject(jsonA03);
    expect((historyA[1] as FatJsonDoc).doc).toMatchObject(jsonA02);
    expect((historyA[2] as FatJsonDoc).doc).toMatchObject(jsonA01);
    const historyB = await getHistoryImpl(
      gitDDB,
      shortNameB,
      '',
      gitDDB.jsonExt,
      undefined,
      undefined,
      true
    );
    expect(historyB.length).toBe(2);
    expect((historyB[0] as FatJsonDoc).doc).toMatchObject(jsonB02);
    expect((historyB[1] as FatJsonDoc).doc).toMatchObject(jsonB01);

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
    const shortNameA = _idA + JSON_POSTFIX;
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
    const shortNameB = _idB + JSON_POSTFIX;
    const jsonB01 = { _id: _idB, name: 'v01' };
    const jsonB02 = { _id: _idB, name: 'v02' };

    gitDDB.author = { name: 'authorA', email: 'authorEmailA' };
    gitDDB.committer = { name: 'committerA', email: 'committerEmailA' };
    await gitDDB.put(jsonB01);

    gitDDB.author = { name: 'authorB', email: 'authorEmailB' };
    gitDDB.committer = { name: 'committerB', email: 'committerEmailB' };
    await gitDDB.put(jsonB02);

    const historyA = await getHistoryImpl(
      gitDDB,
      shortNameA,
      '',
      gitDDB.jsonExt,
      {
        filter: [{ author: { name: 'authorB', email: 'authorEmailB' } }],
      },
      undefined,
      true
    );
    expect(historyA.length).toBe(2);
    expect((historyA[0] as FatJsonDoc).doc).toMatchObject(jsonA03);
    expect((historyA[1] as FatJsonDoc).doc).toMatchObject(jsonA02);

    const historyB = await getHistoryImpl(
      gitDDB,
      shortNameB,
      '',
      gitDDB.jsonExt,
      {
        filter: [{ author: { name: 'authorB', email: 'authorEmailB' } }],
      },
      undefined,
      true
    );
    expect(historyB.length).toBe(1);
    expect((historyB[0] as FatJsonDoc).doc).toMatchObject(jsonB02);

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
    const historyA = await getHistoryImpl(
      gitDDB,
      'invalid_id',
      '',
      gitDDB.jsonExt,
      undefined,
      undefined,
      true
    );
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
    const shortNameA = _idA + JSON_POSTFIX;
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
    const historyA = await getHistoryImpl(
      gitDDB,
      shortNameA,
      '',
      gitDDB.jsonExt,
      undefined,
      undefined,
      true
    );
    expect(historyA.length).toBe(6);
    expect(historyA[0]).toBe(undefined);
    expect((historyA[1] as FatJsonDoc).doc).toMatchObject(jsonA03);
    expect(historyA[2]).toBe(undefined);
    expect((historyA[3] as FatJsonDoc).doc).toMatchObject(jsonA02);
    expect(historyA[4]).toBe(undefined);
    expect((historyA[5] as FatJsonDoc).doc).toMatchObject(jsonA01);

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
    await expect(
      getHistoryImpl(gitDDB, '0.json', '', gitDDB.jsonExt, undefined, undefined, true)
    ).rejects.toThrowError(Err.DatabaseClosingError);

    while (gitDDB.isClosing) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(100);
    }
    await destroyDBs([gitDDB]);
  });

  it('throws InvalidJsonObjectError.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    await gitDDB.putFatDoc('1.json', 'invalid json');

    await expect(
      getHistoryImpl(gitDDB, '1.json', '', gitDDB.jsonExt, undefined, undefined, true)
    ).rejects.toThrowError(Err.InvalidJsonObjectError);

    await destroyDBs([gitDDB]);
  });

  describe('without metadata', () => {
    it('gets without metadata by default', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });

      await gitDDB.open();
      const _idA = 'profA';
      const shortNameA = _idA + JSON_POSTFIX;
      const jsonA01 = { _id: _idA, name: 'v01' };
      const jsonA02 = { _id: _idA, name: 'v02' };
      const jsonA03 = { _id: _idA, name: 'v03' };
      await gitDDB.put(jsonA01);
      await gitDDB.put(jsonA02);
      await gitDDB.put(jsonA03);

      // Get
      const historyA = await getHistoryImpl(gitDDB, shortNameA, '', gitDDB.jsonExt);
      expect(historyA.length).toBe(3);
      expect(historyA[0]).toMatchObject(jsonA03);
      expect(historyA[1]).toMatchObject(jsonA02);
      expect(historyA[2]).toMatchObject(jsonA01);

      await destroyDBs([gitDDB]);
    });

    it('gets deleted revisions without metadata', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });

      await gitDDB.open();
      const _idA = 'profA';
      const shortNameA = _idA + JSON_POSTFIX;
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
      const historyA = await getHistoryImpl(
        gitDDB,
        shortNameA,
        '',
        gitDDB.jsonExt,
        undefined,
        undefined,
        false
      );
      expect(historyA.length).toBe(6);
      expect(historyA[0]).toBe(undefined);
      expect(historyA[1]).toMatchObject(jsonA03);
      expect(historyA[2]).toBe(undefined);
      expect(historyA[3]).toMatchObject(jsonA02);
      expect(historyA[4]).toBe(undefined);
      expect(historyA[5]).toMatchObject(jsonA01);

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
      const historyA = await getHistoryImpl(
        gitDDB,
        'invalid_id',
        '',
        gitDDB.jsonExt,
        undefined,
        undefined,
        false
      );
      expect(historyA).toEqual([]);

      await destroyDBs([gitDDB]);
    });
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
    const fullDocPath = collectionPath + shortId + JSON_POSTFIX;
    const json = { _id: shortId, name: 'Shirase' };
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json));

    await expect(readOldBlob(gitDDB.workingDir, fullDocPath, -1)).resolves.toBeUndefined();

    await destroyDBs([gitDDB]);
  });

  it('returns undefined when get deleted document with revision #0.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const shortId = 'prof01';
    const collectionPath = '';
    const fullDocPath = collectionPath + shortId + JSON_POSTFIX;
    const json = { _id: shortId, name: 'Shirase' };
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json));
    await removeOneData(gitDDB, fullDocPath);

    await expect(readOldBlob(gitDDB.workingDir, fullDocPath, 0)).resolves.toBeUndefined();

    await destroyDBs([gitDDB]);
  });

  it('returns one revision before when get an old revision #1 of the deleted document.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const shortId = 'prof01';
    const collectionPath = '';
    const fullDocPath = collectionPath + shortId + JSON_POSTFIX;
    const json = { _id: shortId, name: 'Shirase' };
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json));
    await removeOneData(gitDDB, fullDocPath);
    const { oid } = await git.hashBlob({ object: toSortedJSONString(json) });
    await expect(readOldBlob(gitDDB.workingDir, fullDocPath, 1)).resolves.toEqual({
      oid,
      blob: utf8encode(toSortedJSONString(json)),
    });

    await destroyDBs([gitDDB]);
  });

  it('returns two revisions before when get an old revision #2 of the deleted document.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const shortId = 'prof01';
    const collectionPath = '';
    const fullDocPath = collectionPath + shortId + JSON_POSTFIX;
    const json01 = { _id: shortId, name: 'v01' };
    const json02 = { _id: shortId, name: 'v02' };
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json01));
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json02));
    await removeOneData(gitDDB, fullDocPath);
    const { oid } = await git.hashBlob({ object: toSortedJSONString(json01) });
    await expect(readOldBlob(gitDDB.workingDir, fullDocPath, 2)).resolves.toEqual({
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
    const fullDocPath = collectionPath + shortId + JSON_POSTFIX;
    const json01 = { _id: shortId, name: 'v01' };
    const json02 = { _id: shortId, name: 'v02' };
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json01));
    await removeOneData(gitDDB, fullDocPath);
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json02));
    const { oid } = await git.hashBlob({ object: toSortedJSONString(json01) });
    await expect(readOldBlob(gitDDB.workingDir, fullDocPath, 2)).resolves.toEqual({
      oid,
      blob: utf8encode(toSortedJSONString(json01)),
    });

    await destroyDBs([gitDDB]);
  });

  it('returns undefined when get document with revision that was deleted once', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const shortId = 'prof01';
    const collectionPath = '';
    const fullDocPath = collectionPath + shortId + JSON_POSTFIX;
    const json01 = { _id: shortId, name: 'v01' };
    const json02 = { _id: shortId, name: 'v02' };
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json01));
    await removeOneData(gitDDB, fullDocPath);
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json02));

    await expect(readOldBlob(gitDDB.workingDir, fullDocPath, 1)).resolves.toBeUndefined();

    await destroyDBs([gitDDB]);
  });

  it('returns undefined when get document with revision that does not exist', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const shortId = 'prof01';
    const collectionPath = '';
    const fullDocPath = collectionPath + shortId + JSON_POSTFIX;
    const json01 = { _id: shortId, name: 'v01' };
    const json02 = { _id: shortId, name: 'v02' };
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json01));
    await removeOneData(gitDDB, fullDocPath);
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json02));

    await expect(readOldBlob(gitDDB.workingDir, fullDocPath, 3)).resolves.toBeUndefined();

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
    await expect(readOldBlob(gitDDB.workingDir, fullDocPath, 0)).resolves.toBeUndefined();

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
    const fullDocPath = collectionPath + shortId + JSON_POSTFIX;
    const json = { _id: shortId, name: 'Shirase' };
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json));

    const stubReadBlob = sandbox.stub(git_module, 'readBlob');
    stubReadBlob.rejects();

    await expect(readOldBlob(gitDDB.workingDir, fullDocPath, 0)).resolves.toBeUndefined();

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
    const fullDocPath = collectionPath + shortId + JSON_POSTFIX;
    const json01 = { _id: shortId, name: 'v01' };
    const json02 = { _id: shortId, name: 'v02' };
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json01));
    await removeOneData(gitDDB, fullDocPath);
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json02));

    await expect(
      readOldBlob(gitDDB.workingDir, fullDocPath, 0, {
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
    const fullDocPath = collectionPath + targetId + JSON_POSTFIX;

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
        readOldBlob(gitDDB.workingDir, fullDocPath, 0, {
          filter: [{ author: { name: 'authorA' } }],
        })
      ).resolves.toEqual({
        oid: (await git.hashBlob({ object: toSortedJSONString(json09) })).oid,
        blob: utf8encode(toSortedJSONString(json09)),
      });

      await expect(
        readOldBlob(gitDDB.workingDir, fullDocPath, 1, {
          filter: [{ author: { name: 'authorA' } }],
        })
      ).resolves.toEqual({
        oid: (await git.hashBlob({ object: toSortedJSONString(json08) })).oid,
        blob: utf8encode(toSortedJSONString(json08)),
      });
    });

    it('with author.email', async () => {
      await expect(
        readOldBlob(gitDDB.workingDir, fullDocPath, 0, {
          filter: [{ author: { email: 'authorEmailA' } }],
        })
      ).resolves.toEqual({
        oid: (await git.hashBlob({ object: toSortedJSONString(json13) })).oid,
        blob: utf8encode(toSortedJSONString(json13)),
      });

      await expect(
        readOldBlob(gitDDB.workingDir, fullDocPath, 1, {
          filter: [{ author: { email: 'authorEmailA' } }],
        })
      ).resolves.toEqual({
        oid: (await git.hashBlob({ object: toSortedJSONString(json12) })).oid,
        blob: utf8encode(toSortedJSONString(json12)),
      });
    });

    it('with author.name and author.email', async () => {
      await expect(
        readOldBlob(gitDDB.workingDir, fullDocPath, 0, {
          filter: [{ author: { name: 'authorA', email: 'authorEmailA' } }],
        })
      ).resolves.toEqual({
        oid: (await git.hashBlob({ object: toSortedJSONString(json05) })).oid,
        blob: utf8encode(toSortedJSONString(json05)),
      });

      await expect(
        readOldBlob(gitDDB.workingDir, fullDocPath, 1, {
          filter: [{ author: { name: 'authorA', email: 'authorEmailA' } }],
        })
      ).resolves.toEqual({
        oid: (await git.hashBlob({ object: toSortedJSONString(json04) })).oid,
        blob: utf8encode(toSortedJSONString(json04)),
      });
    });

    it('with committer.name', async () => {
      await expect(
        readOldBlob(gitDDB.workingDir, fullDocPath, 0, {
          filter: [{ committer: { name: 'committerA' } }],
        })
      ).resolves.toEqual({
        oid: (await git.hashBlob({ object: toSortedJSONString(json15) })).oid,
        blob: utf8encode(toSortedJSONString(json15)),
      });

      await expect(
        readOldBlob(gitDDB.workingDir, fullDocPath, 1, {
          filter: [{ committer: { name: 'committerA' } }],
        })
      ).resolves.toEqual({
        oid: (await git.hashBlob({ object: toSortedJSONString(json14) })).oid,
        blob: utf8encode(toSortedJSONString(json14)),
      });
    });

    it('with committer.email', async () => {
      await expect(
        readOldBlob(gitDDB.workingDir, fullDocPath, 0, {
          filter: [{ committer: { email: 'committerEmailA' } }],
        })
      ).resolves.toEqual({
        oid: (await git.hashBlob({ object: toSortedJSONString(json16) })).oid,
        blob: utf8encode(toSortedJSONString(json16)),
      });

      await expect(
        readOldBlob(gitDDB.workingDir, fullDocPath, 1, {
          filter: [{ committer: { email: 'committerEmailA' } }],
        })
      ).resolves.toEqual({
        oid: (await git.hashBlob({ object: toSortedJSONString(json14) })).oid,
        blob: utf8encode(toSortedJSONString(json14)),
      });
    });

    it('with committer.name and committer.email', async () => {
      await expect(
        readOldBlob(gitDDB.workingDir, fullDocPath, 0, {
          filter: [{ committer: { name: 'committerA', email: 'committerEmailA' } }],
        })
      ).resolves.toEqual({
        oid: (await git.hashBlob({ object: toSortedJSONString(json14) })).oid,
        blob: utf8encode(toSortedJSONString(json14)),
      });

      await expect(
        readOldBlob(gitDDB.workingDir, fullDocPath, 1, {
          filter: [{ committer: { name: 'committerA', email: 'committerEmailA' } }],
        })
      ).resolves.toEqual({
        oid: (await git.hashBlob({ object: toSortedJSONString(json10) })).oid,
        blob: utf8encode(toSortedJSONString(json10)),
      });
    });

    it('with author.name, author.email, committer.name, and committer.email', async () => {
      await expect(
        readOldBlob(gitDDB.workingDir, fullDocPath, 0, {
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
        readOldBlob(gitDDB.workingDir, fullDocPath, 1, {
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
        readOldBlob(gitDDB.workingDir, fullDocPath, 0, {
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
        readOldBlob(gitDDB.workingDir, fullDocPath, 1, {
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
