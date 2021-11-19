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
import expect from 'expect';
import { monotonicFactory } from 'ulid';
import { ILogObject } from 'tslog';
import { Err } from '../src/error';
import { GitDocumentDB } from '../src/git_documentdb';

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = './test/database_logger';

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

describe('<git_documentdb> logger', () => {
  it('write log to a local file', async () => {
    const dbName = monoId();
    const logPath = path.resolve(localDir + '/log.txt');
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
      logLevel: 'debug',
      logToTransport: (logObject: ILogObject) => {
        fs.appendFileSync(logPath, logObject.argumentsArray[0] + '\n');
      },
    });
    await gitDDB.open();
    await gitDDB.put({ _id: 'test' });

    const log = fs.readFileSync(logPath, 'utf-8');
    expect(log.startsWith('\u001b[43m\u001b[30mStart: put()')).toBeTruthy();
    fs.removeSync(logPath);
    await gitDDB.destroy();
  });

  it('write log to a local file without color style', async () => {
    const dbName = monoId();
    const logPath = path.resolve(localDir + '/log.txt');
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
      logLevel: 'debug',
      logToTransport: (logObject: ILogObject) => {
        fs.appendFileSync(logPath, logObject.argumentsArray[0] + '\n');
      },
      logColorEnabled: false,
    });
    await gitDDB.open();
    await gitDDB.put({ _id: 'test' });

    const log = fs.readFileSync(logPath, 'utf-8');
    expect(log.startsWith('Start: put()')).toBeTruthy();

    fs.removeSync(logPath);
    await gitDDB.destroy();
  });
});
