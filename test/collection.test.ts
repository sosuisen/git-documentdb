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
import { JSON_EXT, SHORT_SHA_LENGTH } from '../src/const';
import { GitDocumentDB } from '../src/index';
import {
  DocumentNotFoundError,
  InvalidCollectionPathCharacterError,
  RepositoryNotOpenError,
  SameIdExistsError,
  UndefinedDocumentIdError,
} from '../src/error';
import { destroyDBs } from './remote_utils';

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = './test/database_collection';

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

describe('<collection>', () => {
  it('throws InvalidCollectionPathCharacterError', () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    gitDDB.createDB();
    expect(() => gitDDB.collection('users./')).toThrowError(
      InvalidCollectionPathCharacterError
    );
    gitDDB.destroy();
  });

  describe('put()', () => {
    it('puts a JSON document.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.createDB();
      const users = gitDDB.collection('users');
      const doc = { _id: 'prof01', name: 'Kimari' };
      await expect(users.put(doc)).resolves.toMatchObject({
        ok: true,
        id: expect.stringMatching('^prof01$'),
        file_sha: expect.stringMatching(/^[\da-z]{40}$/),
        commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
      });
      expect(doc._id).toBe('prof01');

      // Check filename
      // fs.access() throw error when a file cannot be accessed.
      const filePath = path.resolve(
        gitDDB.workingDir(),
        users.collectionPath() + 'prof01.json'
      );
      await expect(fs.access(filePath)).resolves.not.toThrowError();
      // Read JSON and check doc._id
      expect(fs.readJSONSync(filePath)._id).toBe('prof01');

      gitDDB.destroy();
    });

    it('puts a sub-directory ID into sub-directory collection.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.createDB();
      const users = gitDDB.collection('users/Gunma');
      const doc = { _id: 'prof01/page01', name: 'Kimari' };
      const putResult = await users.put(doc);
      expect(putResult).toMatchObject({
        ok: true,
        id: expect.stringMatching('^prof01/page01$'),
        file_sha: expect.stringMatching(/^[\da-z]{40}$/),
        commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
      });
      expect(doc._id).toBe('prof01/page01');
      // Check filename
      // fs.access() throw error when a file cannot be accessed.
      const filePath = path.resolve(
        gitDDB.workingDir(),
        users.collectionPath() + 'prof01/page01.json'
      );
      await expect(fs.access(filePath)).resolves.not.toThrowError();
      // Read JSON and check doc._id
      expect(fs.readJSONSync(filePath)._id).toBe('page01'); // not 'prof01/page01'

      const repository = gitDDB.repository();
      if (repository !== undefined) {
        const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
        const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
        expect(commit.message()).toEqual(
          `insert: users/Gunma/prof01/page01${JSON_EXT}(${putResult.file_sha.substr(
            0,
            SHORT_SHA_LENGTH
          )})\n`
        );
      }

      gitDDB.destroy();
    });

    it('puts with a commit_message', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.createDB();
      const users = gitDDB.collection('users');
      const doc = { _id: 'prof01', name: 'Kimari' };
      await expect(users.put(doc, { commit_message: 'message' })).resolves.toMatchObject({
        ok: true,
        id: expect.stringMatching('^prof01$'),
        file_sha: expect.stringMatching(/^[\da-z]{40}$/),
        commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
      });

      const repository = gitDDB.repository();
      if (repository !== undefined) {
        const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
        const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
        expect(commit.message()).toEqual(`message\n`);
      }

      gitDDB.destroy();
    });

    it('puts a JSON document with commit_message (overload)', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.createDB();
      const users = gitDDB.collection('users');
      const doc = { _id: 'id-in-document', name: 'Kimari' };
      await expect(
        users.put('prof01', doc, { commit_message: 'message' })
      ).resolves.toMatchObject({
        ok: true,
        id: expect.stringMatching('^prof01$'),
        file_sha: expect.stringMatching(/^[\da-z]{40}$/),
        commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
      });
      // doc._id is ignored.
      expect(doc._id).toBe('id-in-document');

      const repository = gitDDB.repository();
      if (repository !== undefined) {
        const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
        const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
        expect(commit.message()).toEqual(`message\n`);
      }

      gitDDB.destroy();
    });

    it('throws UndefinedDocumentIdError', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.createDB();
      const users = gitDDB.collection('users');
      // @ts-ignore
      await expect(users.put()).rejects.toThrowError(UndefinedDocumentIdError);

      gitDDB.destroy();
    });
  });

  describe('insert(JsonDoc)', () => {
    it('throws SameIdExistsError when a document which has the same id exists.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.createDB();
      const users = gitDDB.collection('users');
      await users.insert({ _id: 'prof01' });
      await expect(users.insert({ _id: 'prof01', name: 'Shirase' })).rejects.toThrowError(
        SameIdExistsError
      );
      await gitDDB.destroy();
    });

    it('inserts a document.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.createDB();
      const users = gitDDB.collection('users');
      const json01 = { _id: 'prof01', name: 'Shirase' };
      await users.insert(json01);
      await expect(users.get('prof01')).resolves.toEqual(json01);
      await gitDDB.destroy();
    });
  });

  describe('insert(id, document)', () => {
    it('throws SameIdExistsError when a document which has the same id exists.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.createDB();
      const users = gitDDB.collection('users');
      await users.insert('prof01', { name: 'Shirase' });
      await expect(users.insert('prof01', { name: 'Shirase' })).rejects.toThrowError(
        SameIdExistsError
      );
      await gitDDB.destroy();
    });

    it('inserts a document.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.createDB();
      const users = gitDDB.collection('users');
      const json01 = { _id: 'prof01', name: 'Shirase' };
      await users.insert('prof01', json01);
      await expect(users.get('prof01')).resolves.toEqual(json01);
      await gitDDB.destroy();
    });
  });

  describe('update(JsonDoc)', () => {
    it('throws DocumentNotFoundError.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.createDB();
      const users = gitDDB.collection('users');
      await expect(users.update({ _id: 'prof01', name: 'Shirase' })).rejects.toThrowError(
        DocumentNotFoundError
      );
      await gitDDB.destroy();
    });

    it('update a document.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.createDB();
      const users = gitDDB.collection('users');
      const json01 = { _id: 'prof01', name: 'Shirase' };
      await users.insert(json01);
      const json01dash = { _id: 'prof01', name: 'updated' };
      await users.update(json01dash);
      await expect(users.get('prof01')).resolves.toEqual(json01dash);
      await gitDDB.destroy();
    });
  });

  describe('update(id, document)', () => {
    it('throws DocumentNotFoundError.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.createDB();
      const users = gitDDB.collection('users');
      await expect(users.update('prof01', { name: 'Shirase' })).rejects.toThrowError(
        DocumentNotFoundError
      );
      await gitDDB.destroy();
    });

    it('update a document.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.createDB();
      const users = gitDDB.collection('users');
      const json01 = { _id: 'prof01', name: 'Shirase' };
      await users.insert(json01);
      const json01dash = { _id: 'prof01', name: 'updated' };
      await users.update('prof01', json01dash);
      await expect(users.get('prof01')).resolves.toEqual(json01dash);
      await gitDDB.destroy();
    });
  });

  describe('get()', () => {
    it('reads an existing document', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });

      await gitDDB.createDB();
      const users = gitDDB.collection('users');
      const _id = 'prof01';
      await users.put({ _id: _id, name: 'shirase' });
      // Get
      await expect(users.get(_id)).resolves.toEqual({ _id: _id, name: 'shirase' });
      await gitDDB.destroy();
      // Check error
      await expect(users.get(_id)).rejects.toThrowError(RepositoryNotOpenError);
    });

    it('reads an existing document in subdirectory', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });

      await gitDDB.createDB();
      const users = gitDDB.collection('users');
      const _id = 'dir01/prof01';
      await users.put({ _id: _id, name: 'shirase' });
      // Get
      await expect(users.get(_id)).resolves.toEqual({ _id: _id, name: 'shirase' });
      await gitDDB.destroy();
    });
  });

  describe('get() back number', () => {
    it('returns undefined when get back number #0 of the deleted document.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });

      await gitDDB.createDB();
      const users = gitDDB.collection('users');
      const _idA = 'profA';
      const jsonA01 = { _id: _idA, name: 'v01' };
      await users.put(jsonA01);
      const jsonA02 = { _id: _idA, name: 'v02' };
      await users.put(jsonA02);
      await users.delete(_idA);
      // Get
      await expect(users.get(_idA, 0)).resolves.toBeUndefined();

      await destroyDBs([gitDDB]);
    });

    it('returns one revision before when get back number #1 of the deleted document.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });

      await gitDDB.createDB();
      const users = gitDDB.collection('users');
      const _idA = 'profA';
      const jsonA01 = { _id: _idA, name: 'v01' };
      await users.put(jsonA01);
      const jsonA02 = { _id: _idA, name: 'v02' };
      await users.put(jsonA02);
      await users.delete(_idA);
      // Get
      await expect(users.get(_idA, 1)).resolves.toMatchObject(jsonA02);

      await destroyDBs([gitDDB]);
    });

    it('returns two revision before when get back number #2 of the deleted document.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });

      await gitDDB.createDB();
      const users = gitDDB.collection('users');
      const _idA = 'profA';
      const jsonA01 = { _id: _idA, name: 'v01' };
      await users.put(jsonA01);
      const jsonA02 = { _id: _idA, name: 'v02' };
      await users.put(jsonA02);
      await users.delete(_idA);
      // Get
      await expect(users.get(_idA, 2)).resolves.toMatchObject(jsonA01);

      await destroyDBs([gitDDB]);
    });
  });

  describe('delete()', () => {
    it('deletes a document by id.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });

      await gitDDB.createDB();
      const _id = 'test/prof01';
      const _id2 = 'test/prof02';
      const users = gitDDB.collection('users');
      await expect(users.delete(_id)).rejects.toThrowError(DocumentNotFoundError);

      await users.put({ _id: _id, name: 'shirase' });
      await users.put({ _id: _id2, name: 'kimari' });

      // Delete
      const deleteResult = await users.delete(_id);
      expect(deleteResult).toMatchObject({
        ok: true,
        id: expect.stringMatching('^test/prof01$'),
        file_sha: expect.stringMatching(/^[\da-z]{40}$/),
        commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
      });

      // Check commit message
      const repository = gitDDB.repository();
      if (repository !== undefined) {
        const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
        const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
        expect(commit.message()).toEqual(
          `delete: users/${_id}${JSON_EXT}(${deleteResult.file_sha.substr(
            0,
            SHORT_SHA_LENGTH
          )})`
        );
      }

      await expect(users.delete(_id)).rejects.toThrowError(DocumentNotFoundError);
      await expect(users.get(_id)).resolves.toBeUndefined();

      await users.delete(_id2);
      // Directory is empty
      await expect(
        fs.access(
          path.dirname(path.resolve(gitDDB.workingDir(), 'users', _id)),
          fs.constants.F_OK
        )
      ).rejects.toThrowError();

      await gitDDB.destroy();

      await expect(users.delete(_id)).rejects.toThrowError(RepositoryNotOpenError);
    });

    it('deletes a document by JsonDoc.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });

      await gitDDB.createDB();
      const _id = 'test/prof01';
      const users = gitDDB.collection('users');
      const doc = { _id: _id, name: 'shirase' };
      await users.put(doc);
      const sameDoc = { _id: _id, name: 'shirase' };
      await expect(users.delete(sameDoc)).resolves.toMatchObject({
        ok: true,
        id: expect.stringMatching('^test/prof01$'),
        file_sha: expect.stringMatching(/^[\da-z]{40}$/),
        commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
      });
      expect(sameDoc._id).toBe(_id);
      await gitDDB.destroy();
    });

    it('throws UndefinedDocumentIdError', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });

      await gitDDB.createDB();
      const users = gitDDB.collection('users');
      // @ts-ignore
      await expect(users.delete()).rejects.toThrowError(UndefinedDocumentIdError);

      await gitDDB.destroy();
    });
  });

  describe('remove()', () => {
    it('deletes a document by id.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });

      await gitDDB.createDB();
      const _id = 'test/prof01';
      const users = gitDDB.collection('users');
      const doc = { _id: _id, name: 'shirase' };
      await users.put(doc);
      await expect(users.remove(_id)).resolves.toMatchObject({
        ok: true,
        id: expect.stringMatching('^test/prof01$'),
        file_sha: expect.stringMatching(/^[\da-z]{40}$/),
        commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
      });
      await gitDDB.destroy();
    });

    it('modifies a commit message.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });

      await gitDDB.createDB();
      const users = gitDDB.collection('users');
      const _id = 'test/prof01';
      await users.put({ _id: _id, name: 'shirase' });

      // Delete
      await users.remove(_id, { commit_message: 'my commit message' });

      // Check commit message
      const repository = gitDDB.repository();
      if (repository !== undefined) {
        const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
        const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
        expect(commit.message()).toEqual(`my commit message`);
      }

      await gitDDB.destroy();
    });

    it('throws UndefinedDocumentIdError', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });

      await gitDDB.createDB();
      const users = gitDDB.collection('users');
      // @ts-ignore
      await expect(users.remove()).rejects.toThrowError(UndefinedDocumentIdError);

      await gitDDB.destroy();
    });

    it('deletes a document by JsonDoc.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });

      await gitDDB.createDB();
      const users = gitDDB.collection('users');
      const _id = 'test/prof01';
      const doc = { _id: _id, name: 'shirase' };
      await users.put(doc);

      // Delete
      await expect(users.remove(doc)).resolves.toMatchObject({
        ok: true,
        id: expect.stringMatching('^test/prof01$'),
        file_sha: expect.stringMatching(/^[\da-z]{40}$/),
        commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
      });
      expect(doc._id).toBe('test/prof01');

      await gitDDB.destroy();
    });
  });

  describe('getCollections()', () => {
    it('returns root collections', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });

      await gitDDB.createDB();
      const root01 = gitDDB.collection('root01');
      const root02 = gitDDB.collection('root02');
      const root03 = gitDDB.collection('root03');
      await root01.put('item01', {});
      await root02.put('item02', {});
      await root03.put('item03', {});
      const cols = await gitDDB.getCollections();
      expect(cols.length).toBe(3);
      await expect(cols[0].get('item01')).resolves.toEqual({ _id: 'item01' });
      await expect(cols[1].get('item02')).resolves.toEqual({ _id: 'item02' });
      await expect(cols[2].get('item03')).resolves.toEqual({ _id: 'item03' });

      const cols2 = await gitDDB.getCollections('/');
      expect(cols2.length).toBe(3);
    });

    it('returns sub directory collections', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });

      await gitDDB.createDB();
      const root01 = gitDDB.collection('sub/root01');
      const root02 = gitDDB.collection('sub/root02');
      const root03 = gitDDB.collection('sub03');
      await root01.put('item01', {});
      await root02.put('item02', {});
      await root03.put('item03', {});

      const cols = await gitDDB.getCollections();
      expect(cols.length).toBe(2);
      await expect(cols[0].get('root01/item01')).resolves.toEqual({ _id: 'root01/item01' });
      await expect(cols[0].get('root02/item02')).resolves.toEqual({ _id: 'root02/item02' });
      await expect(cols[1].get('item03')).resolves.toEqual({ _id: 'item03' });

      const cols2 = await gitDDB.getCollections('sub');
      expect(cols2.length).toBe(2);
      await expect(cols2[0].get('item01')).resolves.toEqual({ _id: 'item01' });
      await expect(cols2[1].get('item02')).resolves.toEqual({ _id: 'item02' });

      const cols3 = await gitDDB.getCollections('sub/');
      expect(cols3.length).toBe(2);
      await expect(cols3[0].get('item01')).resolves.toEqual({ _id: 'item01' });
      await expect(cols3[1].get('item02')).resolves.toEqual({ _id: 'item02' });
    });
  });

  describe('allDocs()', () => {
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

    it('gets documents', async () => {
      const dbName = monoId();

      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });

      await expect(gitDDB.allDocs()).rejects.toThrowError(RepositoryNotOpenError);

      await gitDDB.createDB();
      const users = gitDDB.collection('users');
      await expect(users.allDocs()).resolves.toMatchObject({
        total_rows: 0,
        commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
      });

      await users.put({ _id: _id_b, name: name_b });
      await users.put({ _id: _id_a, name: name_a });

      await expect(users.allDocs({ include_docs: false })).resolves.toMatchObject({
        total_rows: 2,
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
        ],
      });

      await gitDDB.destroy();
    });

    it('gets from deep directory', async () => {
      const dbName = monoId();

      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.createDB();
      const users = gitDDB.collection('users');
      await users.put({ _id: _id_p, name: name_p });

      await users.put({ _id: _id_b, name: name_b });
      await users.put({ _id: _id_a, name: name_a });
      await users.put({ _id: _id_d, name: name_d });
      await users.put({ _id: _id_c01, name: name_c01 });
      await users.put({ _id: _id_c02, name: name_c02 });

      await expect(
        users.allDocs({ prefix: 'pear/Japan', include_docs: true })
      ).resolves.toMatchObject({
        total_rows: 1,
        commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
        rows: [
          {
            id: expect.stringMatching('^' + _id_p + '$'),
            file_sha: expect.stringMatching(/^[\da-z]{40}$/),
            doc: {
              _id: expect.stringMatching('^' + _id_p + '$'),
              name: name_p,
            },
          },
        ],
      });

      await gitDDB.destroy();
    });
  });
});
