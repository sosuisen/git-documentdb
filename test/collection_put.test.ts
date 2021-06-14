/* eslint-disable @typescript-eslint/naming-convention */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import git from 'isomorphic-git';
import expect from 'expect';
import fs from 'fs-extra';
import { monotonicFactory } from 'ulid';
import { toSortedJSONString } from '../src/utils';
import { JSON_EXT, SHORT_SHA_LENGTH } from '../src/const';
import { GitDocumentDB } from '../src/index';
import {
  InvalidCollectionPathCharacterError,
  InvalidIdCharacterError,
  InvalidIdLengthError,
  InvalidJsonObjectError,
  UndefinedDocumentIdError,
} from '../src/error';
import { Collection } from '../src/collection';
import { Validator } from '../src/validator';

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = './test/database_collection';

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

describe('<collection>', () => {
  describe('put(jsonDoc: JsonDoc)', () => {
    it('throws UndefinedDocumentIdError when JsonDoc is undefined', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const col = new Collection(gitDDB, 'col01');
      // @ts-ignore
      await expect(col.put(undefined)).rejects.toThrowError(UndefinedDocumentIdError);
      await gitDDB.destroy();
    });

    it('throws UndefinedDocumentIdError when _id is not found in JsonDoc', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const col = new Collection(gitDDB, 'col01');
      await expect(col.put({ name: 'Shirase' })).rejects.toThrowError(
        UndefinedDocumentIdError
      );
      await expect(col.put({ _id: '', name: 'Shirase' })).rejects.toThrowError(
        UndefinedDocumentIdError
      );
      await gitDDB.destroy();
    });

    it('throws InvalidJsonObjectError when a document is a recursive object', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const col = new Collection(gitDDB, 'col01');
      // JSON.stringify() throws error if an object is recursive.
      const obj1 = { obj: {} };
      const obj2 = { obj: obj1 };
      obj1.obj = obj2;
      await expect(col.put({ _id: 'prof01', obj: obj1 })).rejects.toThrowError(
        InvalidJsonObjectError
      );
      await gitDDB.destroy();
    });

    it('throws InvalidJsonObjectError when a document includes Bigint', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const col = new Collection(gitDDB, 'col01');
      // JSON.stringify() throws error if an object has a bigint value
      const obj1 = { bigint: BigInt(9007199254740991) };
      await expect(col.put({ _id: 'prof01', obj: obj1 })).rejects.toThrowError(
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
        dbName,
        localDir,
      });
      await gitDDB.open();
      const obj1 = { func: () => {}, symbol: Symbol('foo'), undef: undefined };
      await expect(gitDDB.put({ _id: 'prof01', obj: obj1 })).resolves.toEqual({
        _id: 'prof01',
        fileOid: expect.stringMatching(/^[\da-z]{40}$/),
        commitOid: expect.stringMatching(/^[\da-z]{40}$/),
        commitMessage: expect.stringMatching(/.+/),
      });
      await gitDDB.destroy();
    });

    it('throws InvalidIdCharacter when _id includes invalid characters', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const col = new Collection(gitDDB, 'col01');
      await expect(
        col.put({ _id: '<angleBrackets>', name: 'Shirase' })
      ).rejects.toThrowError(InvalidIdCharacterError);
      await expect(
        col.put({ _id: 'trailing/Slash/', name: 'Shirase' })
      ).rejects.toThrowError(InvalidIdCharacterError);
      await expect(col.put({ _id: '/', name: 'Shirase' })).rejects.toThrowError(
        InvalidIdCharacterError
      );
      await gitDDB.destroy();
    });

    it('throws InvalidIdLengthError when _id length is too long or too short', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const col = new Collection(gitDDB, 'col01');
      const validator = new Validator(gitDDB.workingDir());
      const maxIdLen = validator.maxIdLength();
      let _id = '';
      for (let i = 0; i < maxIdLen; i++) {
        _id += '0';
      }
      await expect(col.put({ _id, name: 'Shirase' })).resolves.toEqual({
        _id,
        fileOid: expect.stringMatching(/^[\da-z]{40}$/),
        commitOid: expect.stringMatching(/^[\da-z]{40}$/),
        commitMessage: expect.stringMatching(/^.+$/),
      });
      _id += '0';

      await expect(col.put({ _id, name: 'Shirase' })).rejects.toThrowError(
        InvalidIdLengthError
      );

      await gitDDB.destroy();
    });

    it('throws InvalidCollectionPathCharacterError', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });

      await gitDDB.open();
      const col = new Collection(gitDDB, 'col01');
      await expect(col.put({ _id: '/headingSlash', name: 'Shirase' })).rejects.toThrowError(
        InvalidCollectionPathCharacterError
      );

      await gitDDB.destroy();
    });

    it('accepts _id including valid punctuations', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const col = new Collection(gitDDB, 'col01');
      const _id = '-.()[]_';
      await expect(col.put({ _id: _id, name: 'Shirase' })).resolves.toMatchObject({
        _id: expect.stringMatching(/^-.\(\)\[]_$/),
        fileOid: expect.stringMatching(/^[\da-z]{40}$/),
        commitOid: expect.stringMatching(/^[\da-z]{40}$/),
        commitMessage: expect.stringMatching(/^.+$/),
      });
      await gitDDB.destroy();
    });

    it('accepts _id including non-ASCII characters in _id', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const _id = '春はあけぼの';
      const col = new Collection(gitDDB, 'col01');
      const putResult = await col.put({ _id: _id, name: 'Shirase' });
      const shortOid = putResult.fileOid.substr(0, SHORT_SHA_LENGTH);
      expect(putResult).toEqual({
        _id: expect.stringMatching('^' + _id + '$'),
        fileOid: expect.stringMatching(/^[\da-z]{40}$/),
        commitOid: expect.stringMatching(/^[\da-z]{40}$/),
        commitMessage: `insert: ${col.collectionPath()}${_id}${JSON_EXT}(${shortOid})`,
      });

      // Check commit directly
      const commitOid = await git.resolveRef({ fs, dir: gitDDB.workingDir(), ref: 'HEAD' });
      const { commit } = await git.readCommit({
        fs,
        dir: gitDDB.workingDir(),
        oid: commitOid,
      });
      expect(commit.message).toEqual(
        `insert: ${col.collectionPath()}${_id}${JSON_EXT}(${shortOid})\n`
      );

      // Check filename
      // fs.access() throw error when a file cannot be accessed.
      const filePath = path.resolve(
        gitDDB.workingDir(),
        col.collectionPath(),
        _id + '.json'
      );
      await expect(fs.access(filePath)).resolves.not.toThrowError();
      // Read JSON and check doc._id
      expect(fs.readJSONSync(filePath)._id).toBe(_id);

      await gitDDB.destroy();
    });

    it('creates a JSON file', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const col = new Collection(gitDDB, 'col01');
      const _id = 'prof01';
      // Check put operation
      const json = { _id, name: 'Shirase' };
      const putResult = await col.put(json);
      const shortOid = putResult.fileOid.substr(0, SHORT_SHA_LENGTH);
      expect(putResult).toEqual({
        _id,
        fileOid: (await git.hashBlob({ object: toSortedJSONString(json) })).oid,
        commitOid: expect.stringMatching(/^[\da-z]{40}$/),
        commitMessage: `insert: ${col.collectionPath()}${_id}${JSON_EXT}(${shortOid})`,
      });
      // Check filename
      // fs.access() throw error when a file cannot be accessed.
      const filePath = path.resolve(
        gitDDB.workingDir(),
        col.collectionPath(),
        _id + '.json'
      );
      await expect(fs.access(filePath)).resolves.not.toThrowError();
      // Read JSON and check doc._id
      expect(fs.readJSONSync(filePath)._id).toBe(_id);

      await gitDDB.destroy();
    });

    describe('into subdirectory', () => {
      it('returns PutResult', async () => {
        const dbName = monoId();
        const gitDDB: GitDocumentDB = new GitDocumentDB({
          dbName,
          localDir,
        });
        await gitDDB.open();
        const col = new Collection(gitDDB, 'col01');
        const _id = 'dir01/prof01';
        const json = { _id, name: 'Shirase' };
        const putResult = await col.put(json);
        const internalJson = JSON.parse(JSON.stringify(json));
        internalJson._id = 'prof01';
        const fileOid = (await git.hashBlob({ object: toSortedJSONString(internalJson) }))
          .oid;
        const shortOid = fileOid.substr(0, SHORT_SHA_LENGTH);
        expect(putResult).toEqual({
          _id,
          fileOid,
          commitOid: expect.stringMatching(/^[\da-z]{40}$/),
          commitMessage: `insert: ${col.collectionPath()}${_id}${JSON_EXT}(${shortOid})`,
        });
        await gitDDB.destroy();
      });

      it('puts a JSON document.', async () => {
        const dbName = monoId();
        const gitDDB: GitDocumentDB = new GitDocumentDB({
          dbName,
          localDir,
        });
        await gitDDB.open();
        const col = new Collection(gitDDB, 'col01');
        const _id = 'dir01/prof01';
        const json = { _id, name: 'Shirase' };
        await col.put(json);

        // Check filename
        // fs.access() throw error when a file cannot be accessed.
        const filePath = path.resolve(
          gitDDB.workingDir(),
          col.collectionPath() + _id + JSON_EXT
        );
        await expect(fs.access(filePath)).resolves.not.toThrowError();
        // Read JSON and check doc._id
        expect(fs.readJSONSync(filePath)._id).toBe('prof01');

        gitDDB.destroy();
      });

      it('puts a sub-directory ID into sub-directory collection.', async () => {
        const dbName = monoId();
        const gitDDB: GitDocumentDB = new GitDocumentDB({
          dbName,
          localDir,
        });
        await gitDDB.open();
        const col = gitDDB.collection('col01/col02');
        const _id = 'dir01/prof01';
        const json = { _id, name: 'Shirase' };
        const putResult = await col.put(json);
        const shortOid = putResult.fileOid.substr(0, SHORT_SHA_LENGTH);
        const internalJson = JSON.parse(JSON.stringify(json));
        internalJson._id = 'prof01';
        expect(putResult).toEqual({
          _id,
          fileOid: (await git.hashBlob({ object: toSortedJSONString(internalJson) })).oid,
          commitOid: expect.stringMatching(/^[\da-z]{40}$/),
          commitMessage: `insert: ${col.collectionPath()}${_id}${JSON_EXT}(${shortOid})`,
        });

        // Check filename
        // fs.access() throw error when a file cannot be accessed.
        const filePath = path.resolve(
          gitDDB.workingDir(),
          col.collectionPath() + _id + JSON_EXT
        );
        await expect(fs.access(filePath)).resolves.not.toThrowError();
        // Read JSON and check doc._id
        expect(fs.readJSONSync(filePath)._id).toBe('prof01'); // not 'dir01/prof01'

        // Check commit directly
        const commitOid = await git.resolveRef({
          fs,
          dir: gitDDB.workingDir(),
          ref: 'HEAD',
        });
        const { commit } = await git.readCommit({
          fs,
          dir: gitDDB.workingDir(),
          oid: commitOid,
        });
        expect(commit.message).toEqual(
          `insert: ${col.collectionPath()}${_id}${JSON_EXT}(${putResult.fileOid.substr(
            0,
            SHORT_SHA_LENGTH
          )})\n`
        );

        gitDDB.destroy();
      });

      it('puts with a commitMessage', async () => {
        const dbName = monoId();
        const gitDDB: GitDocumentDB = new GitDocumentDB({
          dbName,
          localDir,
        });
        await gitDDB.open();
        const col = gitDDB.collection('col01');
        const json = { _id: 'prof01', name: 'Kimari' };
        const commitMessage = 'message';
        await expect(col.put(json, { commitMessage })).resolves.toMatchObject({
          _id: 'prof01',
          fileOid: expect.stringMatching(/^[\da-z]{40}$/),
          commitOid: expect.stringMatching(/^[\da-z]{40}$/),
          commitMessage,
        });

        // Check commit directly
        const commitOid = await git.resolveRef({
          fs,
          dir: gitDDB.workingDir(),
          ref: 'HEAD',
        });
        const { commit } = await git.readCommit({
          fs,
          dir: gitDDB.workingDir(),
          oid: commitOid,
        });
        expect(commit.message).toEqual(`${commitMessage}\n`);

        gitDDB.destroy();
      });

      it('updates an existing document', async () => {
        const dbName = monoId();
        const gitDDB: GitDocumentDB = new GitDocumentDB({
          dbName,
          localDir,
        });

        await gitDDB.open();
        const col = gitDDB.collection('col01');
        const _id = 'prof01';
        await col.put({ _id, name: 'Shirase' });
        // Update
        const updatedJson = { _id, name: 'Soya' };
        const fileOid = (await git.hashBlob({ object: toSortedJSONString(updatedJson) }))
          .oid;
        await expect(col.put(updatedJson)).resolves.toEqual({
          _id,
          fileOid,
          commitOid: expect.stringMatching(/^[\da-z]{40}$/),
          commitMessage: `update: ${col.collectionPath()}${_id}${JSON_EXT}(${fileOid.substr(
            0,
            SHORT_SHA_LENGTH
          )})`,
        });

        // Get
        await expect(col.get(_id)).resolves.toEqual(updatedJson);

        await gitDDB.destroy();
      });
    });
  });
  /*
  describe('<crud/put> put(id, document)', () => {
    it('throws UndefinedDocumentIdError when id is undefined', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
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
        dbName,
        localDir,
      });
      await gitDDB.open();
      // @ts-ignore
      await expect(gitDDB.put('prof01', 'document')).rejects.toThrowError(
        InvalidJsonObjectError
      );
      await gitDDB.destroy();
    });

    it('returns PutResult', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const _id = 'prof01';
      const putResult = await gitDDB.put(_id, { name: 'Shirase' });
      expect(putResult).toMatchObject({
        _id: expect.stringMatching('^' + _id + '$'),
        fileOid: expect.stringMatching(/^[\da-z]{40}$/),
        commitOid: expect.stringMatching(/^[\da-z]{40}$/),
      });

      await gitDDB.destroy();
    });

    it('creates a JSON file', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
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

    it('commits with a default commit message', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const _id = 'prof01';
      const putResult = await gitDDB.put(_id, { name: 'Shirase' });

      const shortOid = putResult.fileOid.substr(0, SHORT_SHA_LENGTH);
      expect(putResult.commitMessage).toEqual(`insert: ${_id}${JSON_EXT}(${shortOid})`);

      const repository = gitDDB.repository();
      const head = await nodegit.Reference.nameToId(repository!, 'HEAD').catch(e => false); // get HEAD
      const commit = await repository!.getCommit(head as nodegit.Oid); // get the commit of HEAD
      expect(commit.message()).toEqual(`insert: ${_id}${JSON_EXT}(${shortOid})\n`);

      await gitDDB.destroy();
    });

    it('puts a JSON document with commitMessage (overload)', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const users = gitDDB.collection('users');
      const doc = { _id: 'id-in-document', name: 'Kimari' };
      await expect(
        users.put('prof01', doc, { commitMessage: 'message' })
      ).resolves.toMatchObject({
        ok: true,
        _id: expect.stringMatching('^prof01$'),
        fileOid: expect.stringMatching(/^[\da-z]{40}$/),
        commitOid: expect.stringMatching(/^[\da-z]{40}$/),
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
    it('creates a JSON file', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
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
        dbName,
        localDir,
      });
      await gitDDB.open();
      const _id = 'id-in-the-first-argument';
      const doc = { _id: 'id-in-doc', name: 'Shirase' };
      const putResult = await gitDDB.put(_id, doc);
      const shortOid = putResult.fileOid.substr(0, SHORT_SHA_LENGTH);
      expect(putResult).toMatchObject({
        _id: expect.stringMatching('^' + _id + '$'),
        fileOid: expect.stringMatching(/^[\da-z]{40}$/),
        commitOid: expect.stringMatching(/^[\da-z]{40}$/),
        commitMessage: `insert: ${_id}${JSON_EXT}(${shortOid})`,
      });

      expect(doc._id).toBe('id-in-doc');

      const repository = gitDDB.repository();
      if (repository !== undefined) {
        const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
        const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
        expect(commit.message()).toEqual(`insert: ${_id}${JSON_EXT}(${shortOid})\n`);
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
        dbName,
        localDir,
      });
      await gitDDB.open();
      const _id = 'dir01/prof01';
      const putResult = await gitDDB.put(
        _id,
        { name: 'Shirase' },
        { commitMessage: 'my commit message' }
      );

      expect(putResult.commitMessage).toEqual(`my commit message`);

      const repository = gitDDB.repository();
      if (repository !== undefined) {
        const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
        const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
        expect(commit.message()).toEqual(`my commit message\n`);
      }
      await gitDDB.destroy();
    });

    it('commits with an empty commit message.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const _id = 'dir01/prof01';
      const putResult = await gitDDB.put(_id, { name: 'Shirase' }, { commitMessage: '' });
      expect(putResult.commitMessage).toEqual('');

      const repository = gitDDB.repository();
      if (repository !== undefined) {
        const head = await nodegit.Reference.nameToId(repository, 'HEAD').catch(e => false); // get HEAD
        const commit = await repository.getCommit(head as nodegit.Oid); // get the commit of HEAD
        expect(commit.message()).toEqual('');
      }
      await gitDDB.destroy();
    });

    it('returns JSON object including sorted property name and two-spaces-indented structure', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      await gitDDB.put({
        'b': 'b',
        'c': 'c',
        '_id': 'id',
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
     "_id": "id"
   }`);

      await gitDDB.destroy();
    });
  });
  */
});
