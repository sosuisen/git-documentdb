/* eslint-disable @typescript-eslint/naming-convention */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import nodegit from '@sosuisen/nodegit';
import git from 'isomorphic-git';
import fs from 'fs-extra';
import { monotonicFactory } from 'ulid';
import sinon from 'sinon';
import {
  createClonedDatabases,
  destroyDBs,
  removeRemoteRepositories,
} from '../remote_utils';
import { GitDocumentDB } from '../../src/index';
import {
  CannotGetEntryError,
  DatabaseClosingError,
  RepositoryNotOpenError,
  UndefinedDocumentIdError,
} from '../../src/error';
import { sleep } from '../../src/utils';
import { getBackNumber } from '../../src/crud/history';

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = './test/database_history';

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

beforeAll(() => {
  fs.removeSync(path.resolve(localDir));
});

afterAll(() => {
  // fs.removeSync(path.resolve(localDir));
});

describe('<crud/history> getDocHistory()', () => {
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
    const historyA = await gitDDB.getDocHistory(_idA);
    expect(historyA.length).toBe(3);
    await expect(gitDDB.getByRevision(historyA[0])).resolves.toMatchObject(jsonA03);
    await expect(gitDDB.getByRevision(historyA[1])).resolves.toMatchObject(jsonA02);
    await expect(gitDDB.getByRevision(historyA[2])).resolves.toMatchObject(jsonA01);
    const historyB = await gitDDB.getDocHistory(_idB);
    expect(historyB.length).toBe(2);
    await expect(gitDDB.getByRevision(historyB[0])).resolves.toMatchObject(jsonB02);
    await expect(gitDDB.getByRevision(historyB[1])).resolves.toMatchObject(jsonB01);

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
    const historyA = await gitDDB.getDocHistory('invalid_id');
    expect(historyA.length).toBe(0);

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
    await expect(gitDDB.getDocHistory('0')).rejects.toThrowError(DatabaseClosingError);

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
    await expect(gitDDB.getDocHistory('tmp')).rejects.toThrowError(RepositoryNotOpenError);
  });

  it('throws UndefinedDocumentIdError', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    // @ts-ignore
    await expect(gitDDB.getDocHistory(undefined)).rejects.toThrowError(
      UndefinedDocumentIdError
    );
    await gitDDB.destroy();
  });

  it('throws DocumentNotFoundError if db does not have commits.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    // Create db without the first commit
    await fs.ensureDir(gitDDB.workingDir());
    // eslint-disable-next-line dot-notation
    gitDDB['_currentRepository'] = await nodegit.Repository.initExt(
      gitDDB.workingDir(),
      // @ts-ignore
      {
        initialHead: gitDDB.defaultBranch,
      }
    );
    const history = await gitDDB.getDocHistory('tmp');
    expect(history.length).toBe(0);

    await gitDDB.destroy();
  });

  it('throws CannotGetEntryError if error occurs while reading a document.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();

    const stub = sandbox.stub(nodegit.Commit.prototype, 'getEntry');
    stub.rejects(new Error());
    await expect(gitDDB.getDocHistory('prof01')).rejects.toThrowError(CannotGetEntryError);
    await gitDDB.destroy();
  });
});

describe('<crud/history> getBackNumber()', () => {
  it('throws RepositoryNotOpenError', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    await gitDDB.close();
    await expect(getBackNumber(gitDDB, 'tmp', 1)).rejects.toThrowError(
      RepositoryNotOpenError
    );
  });

  it('throws CannotGetEntryError if error occurs while reading a document.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();

    const stub = sandbox.stub(nodegit.Commit.prototype, 'getEntry');
    stub.rejects(new Error());
    await expect(getBackNumber(gitDDB, 'tmp', 1)).rejects.toThrowError(CannotGetEntryError);
    await gitDDB.destroy();
  });

  it('returns undefined when the backNumber#0 does not exist', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();

    await expect(getBackNumber(gitDDB, 'tmp', 0)).resolves.toBeUndefined();

    await gitDDB.destroy();
  });

  it('returns undefined when the backNumber#1 does not exist', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();

    await expect(getBackNumber(gitDDB, 'tmp', 1)).resolves.toBeUndefined();

    await gitDDB.destroy();
  });

  it('returns backNumber#0', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const putResult = await gitDDB.put({ _id: 'tmp', name: 0 });
    await expect(getBackNumber(gitDDB, 'tmp.json', 0)).resolves.toBe(putResult.fileSha);
    await gitDDB.destroy();
  });

  it('returns backNumber#1', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const putResult = await gitDDB.put({ _id: 'tmp', name: 0 });
    await gitDDB.put({ _id: 'tmp', name: 1 });
    await expect(getBackNumber(gitDDB, 'tmp.json', 1)).resolves.toBe(putResult.fileSha);
    await gitDDB.destroy();
  });

  it('returns correct backNumber when the same document is created after deleting', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const json = { _id: 'tmp', name: 0 };
    const putResult = await gitDDB.put(json);
    await gitDDB.delete('tmp');
    // Create the same document again
    await gitDDB.put(json);
    await expect(getBackNumber(gitDDB, 'tmp.json', 1)).resolves.toBe(putResult.fileSha);
    await gitDDB.destroy();
  });
});

const reposPrefix = 'test_history___';

let idCounter = 0;
const serialId = () => {
  return `${reposPrefix}${idCounter++}`;
};

beforeEach(function () {
  // @ts-ignore
  console.log(`... ${this.currentTest.fullTitle()}`);
});

beforeAll(() => {
  fs.removeSync(path.resolve(localDir));
});

afterAll(() => {
  // It may throw error due to memory leak of getCommitLogs()
  // fs.removeSync(path.resolve(localDir));
});

// This test needs environment variables:
//  - GITDDB_GITHUB_USER_URL: URL of your GitHub account
// e.g.) https://github.com/foo/
//  - GITDDB_PERSONAL_ACCESS_TOKEN: A personal access token of your GitHub account
const maybe =
  process.env.GITDDB_GITHUB_USER_URL && process.env.GITDDB_PERSONAL_ACCESS_TOKEN
    ? describe
    : describe.skip;

maybe('<crud/history>', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  beforeAll(async () => {
    await removeRemoteRepositories(reposPrefix);
  });

  it.only('gets all revisions from merged commit', async () => {
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
    const putResultB1 = await dbB.put(jsonB1);
    const putResultA2 = await dbA.put(jsonA2);
    const putResultB2 = await dbB.put(jsonB2);
    const putResultA3 = await dbA.put(jsonA3);

    console.log(putResultA1.fileSha);
    console.log(putResultA2.fileSha);
    console.log(putResultA3.fileSha);
    console.log(putResultB1.fileSha);
    console.log(putResultB2.fileSha);

    await syncA.trySync();
    await syncB.trySync();

    // Get
    // const history = await dbB.getDocHistory(_id);
    const commits = await git.log({
      fs,
      dir: dbB.workingDir(),
      ref: 'main',
    });
    console.log(commits);

    /*
    console.log(history);

    await expect(dbB.getByRevision(history[0])).resolves.toMatchObject(jsonA3);
    await expect(dbB.getByRevision(history[1])).resolves.toMatchObject(jsonA2);
    await expect(dbB.getByRevision(history[2])).resolves.toMatchObject(jsonA1);
    await expect(dbB.getByRevision(history[3])).resolves.toMatchObject(jsonB2);
    await expect(dbB.getByRevision(history[4])).resolves.toMatchObject(jsonB1);
*/

//    await destroyDBs([dbA, dbB]);
  });
});
