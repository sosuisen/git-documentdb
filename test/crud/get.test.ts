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
  InvalidBackNumberError,
  InvalidFileSHAFormatError,
  InvalidIdCharacterError,
  InvalidJsonObjectError,
  RepositoryNotOpenError,
  UndefinedDocumentIdError,
  UndefinedFileSHAError,
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

    await gitDDB.createDB();
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

    await gitDDB.createDB();
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
    await gitDDB.createDB();

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
    await gitDDB.createDB();
    await gitDDB.close();
    await expect(gitDDB.get('tmp')).rejects.toThrowError(RepositoryNotOpenError);
  });

  it('throws UndefinedDocumentIdError', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
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

    await gitDDB.createDB();
    const _id = 'prof01';
    await expect(gitDDB.get('_prof01')).rejects.toThrowError(InvalidIdCharacterError);
    await gitDDB.destroy();
  });

  it('returns undefined if db does not have commits.', async () => {
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

    await expect(gitDDB.get('prof01')).resolves.toBeUndefined();

    await gitDDB.destroy();
  });

  it('returns undefined if a document is not put.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    await expect(gitDDB.get('prof01')).resolves.toBeUndefined();
    await gitDDB.destroy();
  });

  it('throws CannotGetEntryError if error occurs while reading a document.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();

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
    await gitDDB.createDB();

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
    const treeOid = await index.writeTree(); // get reference to a set of changes
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
      treeOid,
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

    await gitDDB.createDB();
    const _id = '春はあけぼの';
    await gitDDB.put({ _id: _id, name: 'shirase' });
    // Get
    await expect(gitDDB.get(_id)).resolves.toEqual({ _id: _id, name: 'shirase' });
    await gitDDB.destroy();
  });

  describe('<crud/get> get() back number', () => {
    it('throws InvalidBackNumberError when back_number is less than 0.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });

      await gitDDB.createDB();
      const _idA = 'profA';
      const jsonA01 = { _id: _idA, name: 'v01' };
      await gitDDB.put(jsonA01);
      // Get
      await expect(gitDDB.get(_idA, -1)).rejects.toThrowError(InvalidBackNumberError);

      await destroyDBs([gitDDB]);
    });

    it('returns undefined when get deleted document with backNumber #0.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });

      await gitDDB.createDB();
      const _idA = 'profA';
      const jsonA01 = { _id: _idA, name: 'v01' };
      await gitDDB.put(jsonA01);
      const jsonA02 = { _id: _idA, name: 'v02' };
      await gitDDB.put(jsonA02);
      await gitDDB.delete(_idA);
      // Get
      await expect(gitDDB.get(_idA, 0)).resolves.toBeUndefined();
      await expect(gitDDB.get(_idA)).resolves.toBeUndefined();

      await destroyDBs([gitDDB]);
    });

    it('returns one revision before when get back number #1 of the deleted document.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });

      await gitDDB.createDB();
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

    it('returns two revisions before when get back number #2 of the deleted document.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });

      await gitDDB.createDB();
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

    it('returns an old revision after a document was deleted and created again.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });

      await gitDDB.createDB();
      const _idA = 'profA';
      const jsonA01 = { _id: _idA, name: 'v01' };
      await gitDDB.put(jsonA01);
      await gitDDB.delete(_idA);
      const jsonA02 = { _id: _idA, name: 'v02' };
      await gitDDB.put(jsonA02);

      // Get
      await expect(gitDDB.get(_idA, 1)).resolves.toMatchObject(jsonA01);

      await destroyDBs([gitDDB]);
    });

    it('returns undefined when get document with backNumber that does not exist (1)', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });

      await gitDDB.createDB();
      const _idA = 'profA';
      const jsonA01 = { _id: _idA, name: 'v01' };
      await gitDDB.put(jsonA01);
      await gitDDB.delete(_idA);
      const jsonA02 = { _id: _idA, name: 'v02' };
      await gitDDB.put(jsonA02);

      // Get
      await expect(gitDDB.get(_idA, 2)).resolves.toBeUndefined();

      await destroyDBs([gitDDB]);
    });

    it('returns undefined when get document with backNumber that does not exist (2)', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });

      await gitDDB.createDB();
      const _idA = 'profA';
      const jsonA01 = { _id: _idA, name: 'v01' };
      await gitDDB.put(jsonA01);
      const jsonA02 = { _id: _idA, name: 'v02' };
      await gitDDB.put(jsonA02);
      await gitDDB.delete(_idA);
      // Get
      await expect(gitDDB.get(_idA, 3)).resolves.toBeUndefined();

      await destroyDBs([gitDDB]);
    });

    it('throws CannotGetEntryError when error occurs while reading a document.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });

      await gitDDB.createDB();
      const _idA = 'profA';
      const jsonA01 = { _id: _idA, name: 'v01' };
      await gitDDB.put(jsonA01);
      const jsonA02 = { _id: _idA, name: 'v02' };
      await gitDDB.put(jsonA02);

      const stub = sandbox.stub(nodegit.Commit.prototype, 'getEntry');
      stub.rejects(new Error());
      await expect(gitDDB.get('prof01', 1)).rejects.toThrowError(CannotGetEntryError);
      await gitDDB.destroy();
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

    await gitDDB.createDB();
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
    await gitDDB.createDB();

    for (let i = 0; i < 100; i++) {
      // put() will throw Error after the database is closed by force.
      gitDDB.put({ _id: i.toString(), name: i.toString() }).catch(() => {});
    }
    // Call close() without await
    gitDDB.close().catch(() => {});
    await expect(
      gitDDB.getByRevision('0000000000111111111122222222223333333333')
    ).rejects.toThrowError(DatabaseClosingError);

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
    await gitDDB.createDB();
    await gitDDB.close();
    await expect(
      gitDDB.getByRevision('0000000000111111111122222222223333333333')
    ).rejects.toThrowError(RepositoryNotOpenError);
  });

  it('throws UndefinedFileSHAError', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    // @ts-ignore
    await expect(gitDDB.getByRevision(undefined)).rejects.toThrowError(
      UndefinedFileSHAError
    );
    await gitDDB.destroy();
  });

  it('throws InvalidFileSHAFormatError', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();
    // @ts-ignore
    await expect(gitDDB.getByRevision('invalid format')).rejects.toThrowError(
      InvalidFileSHAFormatError
    );
    await gitDDB.destroy();
  });

  it('returns undefined', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    await gitDDB.createDB();
    const _id = 'prof01';
    const putResult = await gitDDB.put({ _id: _id, name: 'shirase' });
    // Get by revision
    await expect(
      gitDDB.getByRevision('0000000000111111111122222222223333333333')
    ).resolves.toBeUndefined();
    await gitDDB.destroy();
  });

  it('throws CannotGetEntryError', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();

    const stub = sandbox.stub(nodegit.Repository.prototype, 'getBlob');
    stub.rejects(new Error());
    await expect(
      gitDDB.getByRevision('0000000000111111111122222222223333333333')
    ).rejects.toThrowError(CannotGetEntryError);
    await gitDDB.destroy();
  });

  it('throws InvalidJsonObjectError', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();

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
    const treeOid = await index.writeTree(); // get reference to a set of changes

    // Get SHA of blob if needed.
    const entry = index.getByPath(filename, 0); // https://www.nodegit.org/api/index/#STAGE
    const fileSHA = entry.id.tostrS();

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
      treeOid,
      parentCommits
    );

    await expect(gitDDB.getByRevision(fileSHA)).rejects.toThrowError(
      InvalidJsonObjectError
    );

    await gitDDB.destroy();
  });
});
