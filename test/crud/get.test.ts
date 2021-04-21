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
import { destroyDBs } from '../remote_utils';
import {
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

describe('Read document', () => {
  test('get(): Invalid _id', async () => {
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

  test('get(): Read an existing document', async () => {
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
    // Check error
    await expect(gitDDB.get(_id)).rejects.toThrowError(RepositoryNotOpenError);
  });

  test('get(): Read an existing document in subdirectory', async () => {
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

  test('get(): Read a document that does not exist.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();
    const _id = 'prof01';
    await expect(gitDDB.get('prof01')).rejects.toThrowError(DocumentNotFoundError);
    await gitDDB.put({ _id: _id, name: 'shirase' });
    // @ts-ignore
    await expect(gitDDB.get(undefined)).rejects.toThrowError(UndefinedDocumentIdError);
    await expect(gitDDB.get('prof02')).rejects.toThrowError(DocumentNotFoundError);
    await gitDDB.destroy();
  });

  test('get(): Get invalid JSON', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.create();

    const _id = 'invalidJSON';
    let file_sha: string;
    const data = 'invalid data'; // JSON.parse() will throw error
    const _currentRepository = gitDDB.repository();
    if (_currentRepository) {
      try {
        const fileExt = '.json';
        const filename = _id + fileExt;
        const filePath = path.resolve(gitDDB.workingDir(), filename);
        const dir = path.dirname(filePath);
        await fs.ensureDir(dir).catch((err: Error) => console.error(err));
        await fs.writeFile(filePath, data);

        const index = await _currentRepository.refreshIndex(); // read latest index

        await index.addByPath(filename); // stage
        await index.write(); // flush changes to index
        const changes = await index.writeTree(); // get reference to a set of changes

        const entry = index.getByPath(filename, 0); // https://www.nodegit.org/api/index/#STAGE
        file_sha = entry.id.tostrS();

        const gitAuthor = {
          name: 'GitDocumentDB',
          email: 'system@gdd.localhost',
        };

        const author = nodegit.Signature.now(gitAuthor.name, gitAuthor.email);
        const committer = nodegit.Signature.now(gitAuthor.name, gitAuthor.email);

        // Calling nameToId() for HEAD throws error when this is first commit.
        const head = await nodegit.Reference.nameToId(_currentRepository, 'HEAD').catch(
          e => false
        ); // get HEAD
        let commit;
        if (!head) {
          // First commit
          commit = await _currentRepository.createCommit(
            'HEAD',
            author,
            committer,
            'message',
            changes,
            []
          );
        }
        else {
          const parent = await _currentRepository.getCommit(head as nodegit.Oid); // get the commit of HEAD
          commit = await _currentRepository.createCommit(
            'HEAD',
            author,
            committer,
            'message',
            changes,
            [parent]
          );
        }
      } catch (e) {
        console.error(e);
      }

      await expect(gitDDB.get(_id)).rejects.toThrowError(InvalidJsonObjectError);
    }
    await gitDDB.destroy();
  });

  test('get(): Use non-ASCII _id', async () => {
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
});
