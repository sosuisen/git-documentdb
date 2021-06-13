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
import { monotonicFactory } from 'ulid';
import { sleep } from '../src/utils';
import {
  DatabaseCloseTimeoutError,
  DatabaseClosingError,
  TaskCancelError,
} from '../src/error';
import { GitDocumentDB } from '../src/index';
import { destroyDBs } from './remote_utils';

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = './test/database_close';

beforeEach(function () {
  // @ts-ignore
  console.log(`... ${this.currentTest.fullTitle()}`);
});

beforeAll(() => {
  fs.removeSync(path.resolve(localDir));
});

afterAll(() => {
  fs.removeSync(path.resolve(localDir));
});

describe('<close> GitDocumentDB#close()', () => {
  it('waits queued operations', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();

    for (let i = 0; i < 50; i++) {
      gitDDB.put({ _id: i.toString(), name: i.toString() });
    }

    await gitDDB.close();

    await gitDDB.open();

    await expect(gitDDB.find({ recursive: true })).resolves.toMatchObject({
      totalRows: 50,
      commitOid: expect.stringMatching(/^[\da-z]{40}$/),
    });

    await gitDDB.destroy();
  });

  it('throws DatabaseCloseTimeoutError when timeout is 1', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();

    for (let i = 0; i < 100; i++) {
      gitDDB.put({ _id: i.toString(), name: i.toString() }).catch(() => {});
    }

    await expect(gitDDB.close({ timeout: 1 })).rejects.toThrowError(
      DatabaseCloseTimeoutError
    );

    await gitDDB.open();
    // totalRows is less than 100
    await expect(gitDDB.find({ recursive: true })).resolves.not.toMatchObject({
      totalRows: 100,
    });

    await gitDDB.destroy();
  });

  it('catches TaskCancelError from put() when timeout is 1', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();

    const errors: any[] = [];
    for (let i = 0; i < 100; i++) {
      gitDDB.put({ _id: i.toString(), name: i.toString() }).catch(err => {
        errors.push(err);
      });
    }

    await expect(gitDDB.close({ timeout: 1 })).rejects.toThrowError(
      DatabaseCloseTimeoutError
    );

    const taskCancelErrors = errors.filter(err => err instanceof TaskCancelError);
    expect(taskCancelErrors.length).toBeGreaterThan(50); // Set number less than 100

    await gitDDB.destroy();
  });

  it('catches TaskCancelError from delete() when timeout is 1', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();

    for (let i = 0; i < 100; i++) {
      // eslint-disable-next-line no-await-in-loop
      await gitDDB.put({ _id: i.toString(), name: i.toString() }).catch(() => {});
    }

    const errors: any[] = [];
    for (let i = 0; i < 100; i++) {
      gitDDB.delete({ _id: i.toString(), name: i.toString() }).catch(err => {
        errors.push(err);
      });
    }

    await expect(gitDDB.close({ timeout: 1 })).rejects.toThrowError(
      DatabaseCloseTimeoutError
    );

    const taskCancelErrors = errors.filter(err => err instanceof TaskCancelError);
    expect(taskCancelErrors.length).toBeGreaterThan(50); // Set number less than 100

    await gitDDB.destroy();
  });

  it('closes database by force', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();

    for (let i = 0; i < 100; i++) {
      // put() will throw Error after the database is closed by force.
      gitDDB.put({ _id: i.toString(), name: i.toString() }).catch(() => {});
    }

    await gitDDB.close({ force: true, timeout: 1000000 });

    await gitDDB.open();

    // totalRows is less than 100
    await expect(gitDDB.find({ recursive: true })).resolves.not.toMatchObject({
      totalRows: 100,
    });

    await gitDDB.destroy();
  });

  it('causes DatabaseClosingError in CRUD methods by isClosing flag', async () => {
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
    await expect(gitDDB.open()).rejects.toThrowError(DatabaseClosingError);
    const _id = 'prof01';
    await expect(gitDDB.put({ _id: _id, name: 'shirase' })).rejects.toThrowError(
      DatabaseClosingError
    );
    await expect(gitDDB.get(_id)).rejects.toThrowError(DatabaseClosingError);
    await expect(gitDDB.delete(_id)).rejects.toThrowError(DatabaseClosingError);
    await expect(gitDDB.close()).rejects.toThrowError(DatabaseClosingError);
    await expect(gitDDB.destroy()).rejects.toThrowError(DatabaseClosingError);
    await expect(gitDDB.find()).rejects.toThrowError(DatabaseClosingError);

    while (gitDDB.isClosing) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(100);
    }
    await destroyDBs([gitDDB]);
  });
});
