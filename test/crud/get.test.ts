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
import { monotonicFactory } from 'ulid';
import sinon from 'sinon';
import { sleep } from '../../src/utils';
import { destroyDBs } from '../remote_utils';
import {
  CannotGetEntryError,
  DatabaseClosingError,
  DocumentNotFoundError,
  InvalidIdCharacterError,
  InvalidJsonObjectError,
  RepositoryNotOpenError,
  UndefinedDocumentIdError,
} from '../../src/error';
import { GitDocumentDB } from '../../src/index';

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = './test/database_get';

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
  fs.removeSync(path.resolve(localDir));
});

describe('<crud/get> get()', () => {
  it('returns JsonDoc', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    await gitDDB.create();
    const _id = 'prof01';
    await gitDDB.put({ _id: _id, name: 'shirase' });
    // Get
    await expect(gitDDB.get(_id)).resolves.toEqual({ _id: _id, name: 'shirase' });
    await gitDDB.destroy();
  });

  it('returns JsonDoc in subdirectory', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    await gitDDB.create();
    const _id = 'dir01/prof01';
    await gitDDB.put({ _id: _id, name: 'shirase' });
    // Get
    await expect(gitDDB.get(_id)).resolves.toEqual({ _id: _id, name: 'shirase' });
    await gitDDB.destroy();
  });

  it('throws DatabaseClosingError', async () => {
    const dbName = monoId();
    const gitDDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();

    for (let i = 0; i < 100; i++) {
      // put() will throw Error after the database is closed by force.
      gitDDB.put({ _id: i.toString(), name: i.toString() }).catch(() => {});
    }
    // Call close() without await
    gitDDB.close().catch(() => {});
    await expect(gitDDB.get('tmp')).rejects.toThrowError(DatabaseClosingError);
    while (gitDDB.isClosing) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(100);
    }
    await destroyDBs([gitDDB]);
  });

  it('throws RepositoryNotOpenError', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    await gitDDB.close();
    await expect(gitDDB.get('tmp')).rejects.toThrowError(RepositoryNotOpenError);
  });

  it('throws UndefinedDocumentIdError', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    const _id = 'prof01';
    // @ts-ignore
    await expect(gitDDB.get(undefined)).rejects.toThrowError(UndefinedDocumentIdError);
    await gitDDB.destroy();
  });

  it('throws InvalidIdCharacterError', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    await gitDDB.create();
    const _id = 'prof01';
    await expect(gitDDB.get('_prof01')).rejects.toThrowError(InvalidIdCharacterError);
    await gitDDB.destroy();
  });

  it('throws DocumentNotFoundError if db does not have commits.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
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

    await expect(gitDDB.get('prof01')).rejects.toThrowError(DocumentNotFoundError);
    await gitDDB.destroy();
  });

  it('throws DocumentNotFoundError if a document is not put.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    await expect(gitDDB.get('prof01')).rejects.toThrowError(DocumentNotFoundError);
    await gitDDB.destroy();
  });

  it('throws CannotGetEntryError if error occurs while reading a document.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();

    const stub = sandbox.stub(nodegit.Commit.prototype, 'getEntry');
    stub.rejects(new Error());
    await expect(gitDDB.get('prof01')).rejects.toThrowError(CannotGetEntryError);
    await gitDDB.destroy();
  });

  it('throws InvalidJsonObjectError', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();

    const _id = 'invalidJSON';
    let file_sha: string;
    const data = 'invalid data'; // JSON.parse() will throw error

    // Put data
    const _currentRepository = gitDDB.repository();
    const fileExt = '.json';
    const filename = _id + fileExt;
    const filePath = path.resolve(gitDDB.workingDir(), filename);
    const dir = path.dirname(filePath);
    await fs.ensureDir(dir).catch((err: Error) => console.error(err));
    await fs.writeFile(filePath, data);
    const index = await _currentRepository!.refreshIndex(); // read latest index
    await index.addByPath(filename); // stage
    await index.write(); // flush changes to index
    const changes = await index.writeTree(); // get reference to a set of changes
    const gitAuthor = {
      name: 'GitDocumentDB',
      email: 'system@gdd.localhost',
    };
    const author = nodegit.Signature.now(gitAuthor.name, gitAuthor.email);
    const committer = nodegit.Signature.now(gitAuthor.name, gitAuthor.email);
    const head = await _currentRepository!.getHeadCommit();
    const parentCommits: nodegit.Commit[] = [];
    if (head !== null) {
      parentCommits.push(head);
    }
    await _currentRepository!.createCommit(
      'HEAD',
      author,
      committer,
      'message',
      changes,
      parentCommits
    );

    await expect(gitDDB.get(_id)).rejects.toThrowError(InvalidJsonObjectError);

    await gitDDB.destroy();
  });

  it('returns a document by non-ASCII _id', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    await gitDDB.create();
    const _id = '春はあけぼの';
    await gitDDB.put({ _id: _id, name: 'shirase' });
    // Get
    await expect(gitDDB.get(_id)).resolves.toEqual({ _id: _id, name: 'shirase' });
    await gitDDB.destroy();
  });

  describe('<crud/get> get() back number', () => {
    it('throws DocumentNotFoundError when get deleted document with backNumber #0.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });

      await gitDDB.create();
      const _idA = 'profA';
      const jsonA01 = { _id: _idA, name: 'v01' };
      await gitDDB.put(jsonA01);
      const jsonA02 = { _id: _idA, name: 'v02' };
      await gitDDB.put(jsonA02);
      await gitDDB.delete(_idA);
      // Get
      await expect(gitDDB.get(_idA, 0)).rejects.toThrowError(DocumentNotFoundError);
      await expect(gitDDB.get(_idA)).rejects.toThrowError(DocumentNotFoundError);

      await destroyDBs([gitDDB]);
    });

    it('returns the last revision when get deleted document with backNumber #1.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });

      await gitDDB.create();
      const _idA = 'profA';
      const jsonA01 = { _id: _idA, name: 'v01' };
      await gitDDB.put(jsonA01);
      const jsonA02 = { _id: _idA, name: 'v02' };
      await gitDDB.put(jsonA02);
      await gitDDB.delete(_idA);
      // Get
      await expect(gitDDB.get(_idA, 1)).resolves.toMatchObject(jsonA02);

      await destroyDBs([gitDDB]);
    });

    it('returns the second new revision when get deleted document with backNumber #2.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });

      await gitDDB.create();
      const _idA = 'profA';
      const jsonA01 = { _id: _idA, name: 'v01' };
      await gitDDB.put(jsonA01);
      const jsonA02 = { _id: _idA, name: 'v02' };
      await gitDDB.put(jsonA02);
      await gitDDB.delete(_idA);
      // Get
      await expect(gitDDB.get(_idA, 2)).resolves.toMatchObject(jsonA01);

      await destroyDBs([gitDDB]);
    });

    it('throws DocumentNotFoundError when get document with backNumber that does not exist.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });

      await gitDDB.create();
      const _idA = 'profA';
      const jsonA01 = { _id: _idA, name: 'v01' };
      await gitDDB.put(jsonA01);
      const jsonA02 = { _id: _idA, name: 'v02' };
      await gitDDB.put(jsonA02);
      await gitDDB.delete(_idA);
      // Get
      await expect(gitDDB.get(_idA, 3)).rejects.toThrowError(DocumentNotFoundError);

      await destroyDBs([gitDDB]);
    });
  });
});

describe('<crud/get> getByRevision()', () => {
  it('returns the specified document', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    await gitDDB.create();
    const _id = 'prof01';
    const putResult = await gitDDB.put({ _id: _id, name: 'shirase' });
    // Get by revision
    await expect(gitDDB.getByRevision(putResult.file_sha)).resolves.toEqual({
      _id: _id,
      name: 'shirase',
    });
    await gitDDB.destroy();
  });

  it('throws DatabaseClosingError', async () => {
    const dbName = monoId();
    const gitDDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();

    for (let i = 0; i < 100; i++) {
      // put() will throw Error after the database is closed by force.
      gitDDB.put({ _id: i.toString(), name: i.toString() }).catch(() => {});
    }
    // Call close() without await
    gitDDB.close().catch(() => {});
    await expect(gitDDB.getByRevision('tmp')).rejects.toThrowError(DatabaseClosingError);

    while (gitDDB.isClosing) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(100);
    }
    await destroyDBs([gitDDB]);
  });
  it('throws RepositoryNotOpenError');
  it('throws UndefinedFileSHAError');
  it('throws DocumentNotFoundError');
  it('throws CannotGetEntryError');
  it('throws InvalidJsonObjectError');
});
