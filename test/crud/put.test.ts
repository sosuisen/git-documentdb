/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import nodegit from '@sosuisen/nodegit';
import fs from 'fs-extra';
import sinon from 'sinon';
import { monotonicFactory } from 'ulid';
import {
  CannotWriteDataError,
  InvalidIdCharacterError,
  InvalidIdLengthError,
  InvalidJsonObjectError,
  InvalidPropertyNameInDocumentError,
  RepositoryNotOpenError,
  UndefinedDBError,
  UndefinedDocumentIdError,
} from '../../src/error';
import { GitDocumentDB } from '../../src/index';
import { Validator } from '../../src/validator';
import { put_worker } from '../../src/crud/put';
import { SHORT_SHA_LENGTH } from '../../src/const';
import { sleep } from '../../src/utils';
import { TaskMetadata } from '../../src/types';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs_module = require('fs-extra');

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = `./test/database_put`;

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

afterAll(() => {
  fs.removeSync(path.resolve(localDir));
});

describe('<crud/put> put(JsonDoc)', () => {
  it('throws RepositoryNotOpenError when a repository is not opened.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await expect(gitDDB.put({ _id: 'prof01', name: 'Shirase' })).rejects.toThrowError(
      RepositoryNotOpenError
    );
    await gitDDB.destroy();
  });

  it('throws UndefinedDocumentIdError when JsonDoc is undefined', async () => {
    const dbName = monoId();

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    // @ts-ignore
    await expect(gitDDB.put(undefined)).rejects.toThrowError(UndefinedDocumentIdError);
    await gitDDB.destroy();
  });

  it('throws UndefinedDocumentIdError when _id is not found in JsonDoc', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    await expect(gitDDB.put({ name: 'Shirase' })).rejects.toThrowError(
      UndefinedDocumentIdError
    );
    await gitDDB.destroy();
  });

  it('throws InvalidIdCharacter when _id includes invalid characters', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    await expect(
      gitDDB.put({ _id: '<angleBrackets>', name: 'shirase' })
    ).rejects.toThrowError(InvalidIdCharacterError);
    await expect(
      gitDDB.put({ _id: '_headingUnderscore', name: 'shirase' })
    ).rejects.toThrowError(InvalidIdCharacterError);
    await expect(
      gitDDB.put({ _id: 'trailingPeriod.', name: 'shirase' })
    ).rejects.toThrowError(InvalidIdCharacterError);
    await expect(
      gitDDB.put({ _id: 'trailing/Slash/', name: 'shirase' })
    ).rejects.toThrowError(InvalidIdCharacterError);

    await gitDDB.destroy();
  });

  it('throws InvalidIdLengthError when _id length is too long or too short', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    const validator = new Validator(gitDDB.workingDir());
    const maxIdLen = validator.maxIdLength();
    let id = '';
    for (let i = 0; i < maxIdLen; i++) {
      id += '0';
    }

    await expect(gitDDB.put({ _id: id, name: 'shirase' })).resolves.toMatchObject({
      ok: true,
      id: expect.stringMatching(id),
      file_sha: expect.stringMatching(/^[\da-z]{40}$/),
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });
    id += '0';

    await expect(gitDDB.put({ _id: id, name: 'shirase' })).rejects.toThrowError(
      InvalidIdLengthError
    );
    await expect(gitDDB.put({ _id: '', name: 'shirase' })).rejects.toThrowError(
      InvalidIdCharacterError
    );
    await expect(gitDDB.put({ _id: '/', name: 'shirase' })).rejects.toThrowError(
      InvalidIdCharacterError
    );

    await gitDDB.destroy();
  });

  it('accepts _id including valid punctuations', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    const _id = '-.()[]_';
    await expect(gitDDB.put({ _id: _id, name: 'shirase' })).resolves.toMatchObject({
      ok: true,
      id: expect.stringMatching(/^-.\(\)\[]_$/),
      file_sha: expect.stringMatching(/^[\da-z]{40}$/),
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });
    await gitDDB.destroy();
  });

  it('throws InvalidPropertyNameInDocumentError when a property name starts with an underscore in a document', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    await expect(
      gitDDB.put({
        _id: 'prof01',
        _underscore: 'Property name cannot start with underscore',
      })
    ).rejects.toThrowError(InvalidPropertyNameInDocumentError);
    await gitDDB.destroy();
  });

  it('throws InvalidJsonObjectError when a document is a recursive object', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    // JSON.stringify() throws error if an object is recursive.
    const obj1 = { obj: {} };
    const obj2 = { obj: obj1 };
    obj1.obj = obj2;
    await expect(gitDDB.put({ _id: 'prof01', obj: obj1 })).rejects.toThrowError(
      InvalidJsonObjectError
    );
    await gitDDB.destroy();
  });

  it('throws InvalidJsonObjectError when a document includes Bigint', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    // JSON.stringify() throws error if an object has a bigint value
    const obj1 = { bigint: BigInt(9007199254740991) };
    await expect(gitDDB.put({ _id: 'prof01', obj: obj1 })).rejects.toThrowError(
      InvalidJsonObjectError
    );
    await gitDDB.destroy();
  });

  it('skips a document including Function, Symbol, and undefined', async () => {
    /**
     * See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify#description
     */
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    // JSON.stringify() throws error if an object has a bigint value
    const obj1 = { func: () => {}, symbol: Symbol('foo'), undef: undefined };
    await expect(gitDDB.put({ _id: 'prof01', obj: obj1 })).resolves.toMatchObject({
      ok: true,
      id: 'prof01',
      file_sha: expect.stringMatching(/^[\da-z]{40}$/),
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });
    await gitDDB.destroy();
  });

  it('accepts _id including non-ASCII characters in _id', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    const _id = '春はあけぼの';
    const putResult = await gitDDB.put({ _id: _id, name: 'shirase' });
    expect(putResult).toMatchObject({
      ok: true,
      id: expect.stringMatching('^' + _id + '$'),
      file_sha: expect.stringMatching(/^[\da-z]{40}$/),
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });
    const short_sha = putResult.file_sha.substr(0, SHORT_SHA_LENGTH);

    const repository = gitDDB.repository();
    if (repository !== undefined) {
      const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
      const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
      // Check commit message
      expect(commit.message()).toEqual(`insert: ${_id}${gitDDB.fileExt}(${short_sha})`);
    }

    // Check filename
    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(gitDDB.workingDir(), _id + '.json');
    await expect(fs.access(filePath)).resolves.not.toThrowError();
    // Read JSON and check doc._id
    expect(fs.readJSONSync(filePath)._id).toBe(_id);

    await gitDDB.destroy();
  });

  it('returns PutResult', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    const _id = 'prof01';
    // Check put operation
    const putResult = await gitDDB.put({ _id: _id, name: 'Shirase' });
    expect(putResult).toMatchObject({
      ok: true,
      id: expect.stringMatching('^' + _id + '$'),
      file_sha: expect.stringMatching(/^[\da-z]{40}$/),
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });
    await gitDDB.destroy();
  });

  it('commits with a default commit message', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    const _id = 'prof01';
    // Check put operation
    const putResult = await gitDDB.put({ _id: _id, name: 'Shirase' });

    const short_sha = putResult.file_sha.substr(0, SHORT_SHA_LENGTH);

    const repository = gitDDB.repository();
    if (repository !== undefined) {
      const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
      const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
      // Check commit message
      expect(commit.message()).toEqual(`insert: ${_id}${gitDDB.fileExt}(${short_sha})`);
    }
    await gitDDB.destroy();
  });

  it('creates a JSON file', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    const _id = 'prof01';
    // Check put operation
    const putResult = await gitDDB.put({ _id: _id, name: 'Shirase' });

    // Check filename
    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(gitDDB.workingDir(), _id + '.json');
    await expect(fs.access(filePath)).resolves.not.toThrowError();
    // Read JSON and check doc._id
    expect(fs.readJSONSync(filePath)._id).toBe(_id);

    await gitDDB.destroy();
  });

  describe('into subdirectory', () => {
    it('returns PutResult', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.createDB();
      const _id = 'dir01/prof01';
      // Check put operation
      const putResult = await gitDDB.put({ _id: _id, name: 'Shirase' });
      expect(putResult).toMatchObject({
        ok: true,
        id: expect.stringMatching('^' + _id + '$'),
        file_sha: expect.stringMatching(/^[\da-z]{40}$/),
        commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
      });
      await gitDDB.destroy();
    });

    it('commits with a default commit message', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.createDB();
      const _id = 'dir01/prof01';
      // Check put operation
      const putResult = await gitDDB.put({ _id: _id, name: 'Shirase' });

      const short_sha = putResult.file_sha.substr(0, SHORT_SHA_LENGTH);

      const repository = gitDDB.repository();
      const head = await nodegit.Reference.nameToId(repository!, 'HEAD').catch(e => false); // get HEAD
      const commit = await repository!.getCommit(head as nodegit.Oid); // get the commit of HEAD
      // Check commit message
      expect(commit.message()).toEqual(`insert: ${_id}${gitDDB.fileExt}(${short_sha})`);
      await gitDDB.destroy();
    });

    it('creates a JSON file', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.createDB();
      const _id = 'dir01/prof01';
      // Check put operation
      const putResult = await gitDDB.put({ _id: _id, name: 'Shirase' });

      // Check filename
      // fs.access() throw error when a file cannot be accessed.
      const filePath = path.resolve(gitDDB.workingDir(), _id + '.json');
      await expect(fs.access(filePath)).resolves.not.toThrowError();
      // Read JSON and check doc._id
      expect(fs.readJSONSync(filePath)._id).toBe('prof01'); // not 'dir01/prof01'

      await gitDDB.destroy();
    });
  });

  it('returns results in order', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();

    const results: number[] = [];
    const validResults: number[] = [];
    for (let i = 0; i < 100; i++) {
      validResults.push(i);
      gitDDB
        .put({ _id: i.toString(), name: i.toString() })
        .then(res => results.push(Number.parseInt(res.id, 10)))
        .catch(() => {});
    }
    // close() can wait results of all Promises if timeout is set to large number.
    await gitDDB.close({ timeout: 100 * 1000 });

    // put() methods are called asynchronously, but the results must be arranged in order.
    expect(JSON.stringify(results)).toEqual(JSON.stringify(validResults));
    await gitDDB.destroy();
  });

  it('commits a given commit message', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    const _id = 'dir01/prof01';
    await gitDDB.put(
      { _id: _id, name: 'Shirase' },
      { commit_message: 'my commit message' }
    );
    const repository = gitDDB.repository();
    const head = await nodegit.Reference.nameToId(repository!, 'HEAD').catch(e => false); // get HEAD
    const commit = await repository!.getCommit(head as nodegit.Oid); // get the commit of HEAD
    expect(commit.message()).toEqual(`my commit message`);
    await gitDDB.destroy();
  });

  it('returns JSON object including sorted property name and two-spaces-indented structure', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    await gitDDB.put({
      'b': 'b',
      'c': 'c',
      '_id': 'id',
      '_deleted': true,
      'array': ['item2', 'item1'],
      'z': { ZZ: 'ZZ', ZA: 'ZA' },
      'a': 'a',
      '1': 1,
      'A': 'A',
    });

    const filePath = path.resolve(gitDDB.workingDir(), 'id.json');
    const jsonStr = fs.readFileSync(filePath, 'utf8');
    expect(jsonStr).toBe(`{
  "1": 1,
  "A": "A",
  "a": "a",
  "array": [
    "item2",
    "item1"
  ],
  "b": "b",
  "c": "c",
  "z": {
    "ZA": "ZA",
    "ZZ": "ZZ"
  },
  "_deleted": true,
  "_id": "id"
}`);

    await gitDDB.destroy();
  });

  it('updates an existing document', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    await gitDDB.createDB();
    const _id = 'prof01';
    await gitDDB.put({ _id: _id, name: 'Shirase' });
    // Update
    await expect(gitDDB.put({ _id: _id, name: 'mari' })).resolves.toMatchObject({
      ok: true,
      id: expect.stringMatching('^' + _id + '$'),
      file_sha: expect.stringMatching(/^[\da-z]{40}$/),
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });

    // Get
    await expect(gitDDB.get('prof01')).resolves.toEqual({ _id: 'prof01', name: 'mari' });

    await gitDDB.destroy();
  });

  it('runs asynchronously', async () => {
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

    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();

    await Promise.all([
      gitDDB.put({ _id: _id_a, name: name_a }),
      gitDDB.put({ _id: _id_b, name: name_b }),
      gitDDB.put({ _id: _id_c01, name: name_c01 }),
      gitDDB.put({ _id: _id_c02, name: name_c02 }),
      gitDDB.put({ _id: _id_d, name: name_d }),
      gitDDB.put({ _id: _id_p, name: name_p }),
    ]);

    await expect(gitDDB.allDocs({ recursive: true })).resolves.toMatchObject({
      total_rows: 6,
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
      rows: [
        {
          id: expect.stringMatching('^' + _id_a + '$'),
          file_sha: expect.stringMatching(/^[\da-z]{40}$/),
        },
        {
          id: expect.stringMatching('^' + _id_b + '$'),
          file_sha: expect.stringMatching(/^[\da-z]{40}$/),
        },
        {
          id: expect.stringMatching('^' + _id_c01 + '$'),
          file_sha: expect.stringMatching(/^[\da-z]{40}$/),
        },
        {
          id: expect.stringMatching('^' + _id_c02 + '$'),
          file_sha: expect.stringMatching(/^[\da-z]{40}$/),
        },
        {
          id: expect.stringMatching('^' + _id_d + '$'),
          file_sha: expect.stringMatching(/^[\da-z]{40}$/),
        },
        {
          id: expect.stringMatching('^' + _id_p + '$'),
          file_sha: expect.stringMatching(/^[\da-z]{40}$/),
        },
      ],
    });

    await gitDDB.destroy();
  });

  it('can run 100 times repeatedly', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();

    const workers = [];
    for (let i = 0; i < 100; i++) {
      workers.push(gitDDB.put({ _id: i.toString(), name: i.toString() }));
    }
    await expect(Promise.all(workers)).resolves.toHaveLength(100);

    await expect(gitDDB.allDocs({ recursive: true })).resolves.toMatchObject({
      total_rows: 100,
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });

    await gitDDB.destroy();
  });

  it('can be called asynchronously but is executed in order', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();

    const workers = [];
    for (let i = 0; i < 99; i++) {
      // put() Promises are queued
      // They have not await keyword
      gitDDB.put({ _id: i.toString(), name: i.toString() });
    }
    // The last put() with await keyword is resolved after all preceding (queued) Promises
    await gitDDB.put({ _id: '99', name: '99' });
    await expect(gitDDB.allDocs()).resolves.toMatchObject({ total_rows: 100 });

    await gitDDB.destroy();
  });

  it('throws CannotWriteDataError', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    const _id = 'prof01';
    // Check put operation
    const stubWriteFile = sandbox.stub(fs_module, 'writeFile');
    stubWriteFile.rejects();

    await expect(gitDDB.put({ _id: _id, name: 'Shirase' })).rejects.toThrowError(
      CannotWriteDataError
    );

    await gitDDB.destroy();
  });

  it('set taskId', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    const enqueueEvent: TaskMetadata[] = [];
    const id1 = gitDDB.taskQueue.newTaskId();
    const id2 = gitDDB.taskQueue.newTaskId();
    await gitDDB.put(
      { _id: '1' },
      {
        taskId: id1,
        enqueueCallback: (taskMetadata: TaskMetadata) => {
          enqueueEvent.push(taskMetadata);
        },
      }
    );
    await gitDDB.put(
      { _id: '2' },
      {
        taskId: id2,
        enqueueCallback: (taskMetadata: TaskMetadata) => {
          enqueueEvent.push(taskMetadata);
        },
      }
    );
    await sleep(2000);
    expect(enqueueEvent[0].taskId).toBe(id1);
    expect(enqueueEvent[1].taskId).toBe(id2);

    await gitDDB.destroy();
  });
});

describe('<crud/put> put(id, document)', () => {
  it('throws UndefinedDocumentIdError when id is undefined', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    await expect(
      // @ts-ignore
      gitDDB.put(undefined, {
        name: 'Kimari',
      })
    ).rejects.toThrowError(UndefinedDocumentIdError);
    await gitDDB.destroy();
  });

  it('throws InvalidJsonObjectError when document is string type', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    // @ts-ignore
    await expect(gitDDB.put('prof01', 'document')).rejects.toThrowError(
      InvalidJsonObjectError
    );
    await gitDDB.destroy();
  });

  it('returns PutResult', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    const _id = 'prof01';
    const putResult = await gitDDB.put(_id, { name: 'Shirase' });
    expect(putResult).toMatchObject({
      ok: true,
      id: expect.stringMatching('^' + _id + '$'),
      file_sha: expect.stringMatching(/^[\da-z]{40}$/),
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });

    await gitDDB.destroy();
  });

  it('commits with a default commit message', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    const _id = 'prof01';
    const putResult = await gitDDB.put(_id, { name: 'Shirase' });

    const short_sha = putResult.file_sha.substr(0, SHORT_SHA_LENGTH);

    const repository = gitDDB.repository();
    const head = await nodegit.Reference.nameToId(repository!, 'HEAD').catch(e => false); // get HEAD
    const commit = await repository!.getCommit(head as nodegit.Oid); // get the commit of HEAD
    expect(commit.message()).toEqual(`insert: ${_id}${gitDDB.fileExt}(${short_sha})`);

    await gitDDB.destroy();
  });

  it('creates a JSON file', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    const _id = 'prof01';
    const putResult = await gitDDB.put(_id, { name: 'Shirase' });

    // Check filename
    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(gitDDB.workingDir(), _id + '.json');
    await expect(fs.access(filePath)).resolves.not.toThrowError();
    // Read JSON and check doc._id
    expect(fs.readJSONSync(filePath)._id).toBe(_id);

    await gitDDB.destroy();
  });

  it('overwrites _id in a document by _id in the first argument', async () => {
    const dbName = monoId();

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    const _id = 'id-in-the-first-argument';
    const doc = { _id: 'id-in-doc', name: 'Shirase' };
    const putResult = await gitDDB.put(_id, doc);
    expect(putResult).toMatchObject({
      ok: true,
      id: expect.stringMatching('^' + _id + '$'),
      file_sha: expect.stringMatching(/^[\da-z]{40}$/),
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });
    const short_sha = putResult.file_sha.substr(0, SHORT_SHA_LENGTH);

    expect(doc._id).toBe('id-in-doc');

    const repository = gitDDB.repository();
    if (repository !== undefined) {
      const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
      const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
      expect(commit.message()).toEqual(`insert: ${_id}${gitDDB.fileExt}(${short_sha})`);
    }

    // Check filename
    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(gitDDB.workingDir(), _id + '.json');
    await expect(fs.access(filePath)).resolves.not.toThrowError();
    // Read JSON and check doc._id
    expect(fs.readJSONSync(filePath)._id).toBe(_id);

    await gitDDB.destroy();
  });

  it('commits with a given commit message', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    const _id = 'dir01/prof01';
    await gitDDB.put(_id, { name: 'Shirase' }, { commit_message: 'my commit message' });
    const repository = gitDDB.repository();
    if (repository !== undefined) {
      const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
      const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
      expect(commit.message()).toEqual(`my commit message`);
    }
    await gitDDB.destroy();
  });

  it('commits with an empty commit message.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    const _id = 'dir01/prof01';
    await gitDDB.put(_id, { name: 'Shirase' }, { commit_message: '' });
    const repository = gitDDB.repository();
    if (repository !== undefined) {
      const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
      const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
      expect(commit.message()).toEqual('');
    }
    await gitDDB.destroy();
  });
});

describe('<crud/put> put_worker', () => {
  it('throws UndefinedDBError when Undefined DB', async () => {
    const dbName = monoId();

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    // @ts-ignore
    await expect(put_worker(undefined)).rejects.toThrowError(UndefinedDBError);
    await gitDDB.destroy();
  });

  it('throws RepositoryNotOpenError when a repository is not opened.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await expect(
      put_worker(
        gitDDB,
        'prof01',
        gitDDB.fileExt,
        '{ "_id": "prof01", "name": "Shirase" }',
        'message'
      )
    ).rejects.toThrowError(RepositoryNotOpenError);
    await gitDDB.destroy();
  });

  // Skip this test because segmentation fault often occurs in libgit2.
  // Check this only when you would like to check behavior of _put_worker()
  it.skip('Concurrent calls of _put_worker() cause an error.', async () => {
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

    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();

    await expect(
      Promise.all([
        put_worker(
          gitDDB,
          _id_a,
          gitDDB.fileExt,
          `{ "_id": "${_id_a}", "name": "${name_a}" }`,
          'message'
        ),
        put_worker(
          gitDDB,
          _id_b,
          gitDDB.fileExt,
          `{ "_id": "${_id_b}", "name": "${name_b}" }`,
          'message'
        ),
        put_worker(
          gitDDB,
          _id_c01,
          gitDDB.fileExt,
          `{ "_id": "${_id_c01}", "name": "${name_c01}" }`,
          'message'
        ),
        put_worker(
          gitDDB,
          _id_c02,
          gitDDB.fileExt,
          `{ "_id": "${_id_c02}", "name": "${name_c02}" }`,
          'message'
        ),
        put_worker(
          gitDDB,
          _id_d,
          gitDDB.fileExt,
          `{ "_id": "${_id_d}", "name": "${name_d}" }`,
          'message'
        ),
        put_worker(
          gitDDB,
          _id_p,
          gitDDB.fileExt,
          `{ "_id": "${_id_p}", "name": "${name_p}" }`,
          'message'
        ),
      ])
    ).rejects.toThrowError();

    await gitDDB.destroy();
  });
});
