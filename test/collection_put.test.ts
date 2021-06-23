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
import { PutResultJsonDoc } from '../src/types';
import { toSortedJSONString } from '../src/utils';
import { JSON_EXT, SHORT_SHA_LENGTH } from '../src/const';
import { GitDocumentDB } from '../src/git_documentdb';
import {
  InvalidCollectionPathCharacterError,
  InvalidIdCharacterError,
  InvalidIdLengthError,
  InvalidJsonFileExtensionError,
  InvalidJsonObjectError,
} from '../src/error';
import { Collection } from '../src/collection';
import { Validator } from '../src/validator';

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = './test/database_collection_put';

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
  describe('put(jsonDoc)', () => {
    it('throws InvalidJsonObjectError when JsonDoc is undefined', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const col = new Collection(gitDDB, 'col01');
      // @ts-ignore
      await expect(col.put(undefined)).rejects.toThrowError(InvalidJsonObjectError);
      await gitDDB.destroy();
    });

    it('generates new _id when _id is not found in JsonDoc', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const col = new Collection(gitDDB, 'col01');
      const json = { name: 'Shirase' };
      const putResult = await col.put(json);
      expect(putResult._id).toMatch(/^[\dA-HJKMNP-TV-Z]{26}$/); // Match ULID
      await expect(col.get(putResult._id)).resolves.toEqual({
        ...json,
        _id: putResult._id,
      });

      const json2 = { _id: '', name: 'Shirase' };
      const putResult2 = await col.put(json2);
      expect(putResult2._id).toMatch(/^[\dA-HJKMNP-TV-Z]{26}$/); // Match ULID
      await expect(col.get(putResult2._id)).resolves.toEqual({
        ...json2,
        _id: putResult2._id,
      });

      const json3 = { _id: null, name: 'Shirase' };
      const putResult3 = await col.put(json2);
      expect(putResult3._id).toMatch(/^[\dA-HJKMNP-TV-Z]{26}$/); // Match ULID
      await expect(col.get(putResult3._id)).resolves.toEqual({
        ...json3,
        _id: putResult3._id,
      });

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
      const col = new Collection(gitDDB, 'col01');
      const obj1 = { func: () => {}, symbol: Symbol('foo'), undef: undefined };
      const _id = 'prof01';
      const json = { _id, obj: obj1 };
      // properties in obj will be skipped
      const internalJson = { _id: col.collectionPath() + _id, obj: {} };
      const putResult = await col.put(json);
      const { oid } = await git.hashBlob({ object: toSortedJSONString(internalJson) });
      expect(putResult.fileOid).toBe(oid);

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
      const maxIdLen = validator.maxIdLength() - col.collectionPath().length;
      let _id = '';
      for (let i = 0; i < maxIdLen; i++) {
        _id += '0';
      }
      await expect(col.put({ _id, name: 'Shirase' })).resolves.toMatchObject({
        _id,
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
      expect(putResult).toMatchObject({
        _id,
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
        _id + JSON_EXT
      );
      await expect(fs.access(filePath)).resolves.not.toThrowError();
      // Read JSON and check doc._id
      expect(fs.readJSONSync(filePath)._id).toBe(col.collectionPath() + _id);

      await gitDDB.destroy();
    });

    it('creates a JSON file', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const prevCommitOid = await git.resolveRef({
        fs,
        dir: gitDDB.workingDir(),
        ref: 'HEAD',
      });

      const col = new Collection(gitDDB, 'col01');
      const _id = 'prof01';
      // Check put operation
      const json = { _id, name: 'Shirase' };

      const beforeTimestamp = Math.floor(Date.now() / 1000) * 1000;
      const putResult = await col.put(json);
      const afterTimestamp = Math.floor(Date.now() / 1000) * 1000;

      const currentCommitOid = await git.resolveRef({
        fs,
        dir: gitDDB.workingDir(),
        ref: 'HEAD',
      });

      const internalJson = JSON.parse(JSON.stringify(json));
      internalJson._id = col.collectionPath() + _id;
      const fileOid = (await git.hashBlob({ object: toSortedJSONString(internalJson) }))
        .oid;
      const shortOid = fileOid.substr(0, SHORT_SHA_LENGTH);

      expect(putResult._id).toBe(_id);
      expect(putResult.fileOid).toBe(fileOid);
      expect(putResult.commit.oid).toBe(currentCommitOid);
      expect(putResult.commit.message).toBe(
        `insert: ${col.collectionPath()}${_id}${JSON_EXT}(${shortOid})`
      );

      expect(putResult.commit.parent).toEqual([prevCommitOid]);
      expect(putResult.commit.author.name).toEqual(gitDDB.author.name);
      expect(putResult.commit.author.email).toEqual(gitDDB.author.email);
      expect(putResult.commit.author.timestamp.getTime()).toBeGreaterThanOrEqual(
        beforeTimestamp
      );
      expect(putResult.commit.author.timestamp.getTime()).toBeLessThanOrEqual(
        afterTimestamp
      );
      expect(putResult.commit.committer.name).toEqual(gitDDB.author.name);
      expect(putResult.commit.committer.email).toEqual(gitDDB.author.email);
      expect(putResult.commit.committer.timestamp.getTime()).toBeGreaterThanOrEqual(
        beforeTimestamp
      );
      expect(putResult.commit.committer.timestamp.getTime()).toBeLessThanOrEqual(
        afterTimestamp
      );

      // fs.access() throw error when a file cannot be accessed.
      const filePath = path.resolve(
        gitDDB.workingDir(),
        col.collectionPath(),
        _id + JSON_EXT
      );
      await expect(fs.access(filePath)).resolves.not.toThrowError();
      expect(fs.readFileSync(filePath, 'utf8')).toBe(toSortedJSONString(internalJson));

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
        internalJson._id = col.collectionPath() + _id;
        const fileOid = (await git.hashBlob({ object: toSortedJSONString(internalJson) }))
          .oid;
        const shortOid = fileOid.substr(0, SHORT_SHA_LENGTH);
        expect(putResult.commit.message).toBe(
          `insert: ${col.collectionPath()}${_id}${JSON_EXT}(${shortOid})`
        );

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
        const internalJson = JSON.parse(JSON.stringify(json));
        internalJson._id = col.collectionPath() + _id;

        // Check filename
        // fs.access() throw error when a file cannot be accessed.
        const filePath = path.resolve(
          gitDDB.workingDir(),
          col.collectionPath() + _id + JSON_EXT
        );
        await expect(fs.access(filePath)).resolves.not.toThrowError();
        // Read JSON and check doc._id
        expect(fs.readFileSync(filePath, 'utf8')).toBe(toSortedJSONString(internalJson));

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
        const internalJson = JSON.parse(JSON.stringify(json));
        internalJson._id = col.collectionPath() + _id;
        const shortOid = (
          await git.hashBlob({ object: toSortedJSONString(internalJson) })
        ).oid.substr(0, SHORT_SHA_LENGTH);
        expect(putResult.commit.message).toBe(
          `insert: ${col.collectionPath()}${_id}${JSON_EXT}(${shortOid})`
        );

        // Check filename
        // fs.access() throw error when a file cannot be accessed.
        const filePath = path.resolve(
          gitDDB.workingDir(),
          col.collectionPath() + _id + JSON_EXT
        );
        await expect(fs.access(filePath)).resolves.not.toThrowError();
        expect(fs.readFileSync(filePath, 'utf8')).toBe(toSortedJSONString(internalJson));

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
          `insert: ${col.collectionPath()}${_id}${JSON_EXT}(${shortOid})\n`
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
        const _id = 'prof01';
        const json = { _id, name: 'Shirase' };
        const commitMessage = 'message';
        const putResult = await col.put(json, { commitMessage });
        expect(putResult.commit.message).toBe(commitMessage);

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

      it('puts with an empty commitMessage', async () => {
        const dbName = monoId();
        const gitDDB: GitDocumentDB = new GitDocumentDB({
          dbName,
          localDir,
        });
        await gitDDB.open();
        const col = gitDDB.collection('col01');
        const _id = 'prof01';
        const json = { _id, name: 'Shirase' };
        const commitMessage = '';
        const putResult = await col.put(json, { commitMessage });
        expect(putResult.commit.message).toBe(commitMessage);

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
        const internalJson = JSON.parse(JSON.stringify(updatedJson));
        internalJson._id = col.collectionPath() + _id;
        const fileOid = (await git.hashBlob({ object: toSortedJSONString(internalJson) }))
          .oid;

        const putResult = await col.put(updatedJson);
        expect(putResult.commit.message).toBe(
          `update: ${col.collectionPath()}${_id}${JSON_EXT}(${fileOid.substr(
            0,
            SHORT_SHA_LENGTH
          )})`
        );

        // Get
        await expect(col.get(_id)).resolves.toEqual(updatedJson);

        await gitDDB.destroy();
      });
    });
  });

  describe('<crud/put> put(shortId, jsonDoc)', () => {
    it('throws InvalidJsonObjectError', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const col = new Collection(gitDDB, 'col01');
      // JSON.stringify() throws error if an object has a bigint value
      const json = { bigint: BigInt(9007199254740991) };
      // @ts-ignore
      await expect(col.put('prof01', json)).rejects.toThrowError(InvalidJsonObjectError);
      await gitDDB.destroy();
    });

    it('generates new _id when _id is not found in JsonDoc', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const col = new Collection(gitDDB, 'col01');
      const json = { name: 'Shirase' };
      const putResult = await col.put(undefined, json);
      expect(putResult._id).toMatch(/^[\dA-HJKMNP-TV-Z]{26}$/); // Match ULID
      await expect(col.get(putResult._id)).resolves.toEqual({
        ...json,
        _id: putResult._id,
      });

      const json2 = { name: 'Shirase' };
      const putResult2 = await col.put('', json2);
      expect(putResult2._id).toMatch(/^[\dA-HJKMNP-TV-Z]{26}$/); // Match ULID
      await expect(col.get(putResult2._id)).resolves.toEqual({
        ...json2,
        _id: putResult2._id,
      });

      const json3 = { name: 'Shirase' };
      const putResult3 = await col.put(null, json2);
      expect(putResult3._id).toMatch(/^[\dA-HJKMNP-TV-Z]{26}$/); // Match ULID
      await expect(col.get(putResult3._id)).resolves.toEqual({
        ...json3,
        _id: putResult3._id,
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
      const prevCommitOid = await git.resolveRef({
        fs,
        dir: gitDDB.workingDir(),
        ref: 'HEAD',
      });

      const col = new Collection(gitDDB, 'col01');
      const _id = 'dir01/prof01';
      // Check put operation
      const json = { _id, name: 'Shirase' };

      const beforeTimestamp = Math.floor(Date.now() / 1000) * 1000;
      const putResult = await col.put(_id, json);
      const afterTimestamp = Math.floor(Date.now() / 1000) * 1000;

      const currentCommitOid = await git.resolveRef({
        fs,
        dir: gitDDB.workingDir(),
        ref: 'HEAD',
      });

      const internalJson = JSON.parse(JSON.stringify(json));
      internalJson._id = col.collectionPath() + _id;
      const fileOid = (await git.hashBlob({ object: toSortedJSONString(internalJson) }))
        .oid;
      const shortOid = fileOid.substr(0, SHORT_SHA_LENGTH);

      expect(putResult._id).toBe(_id);
      expect(putResult.fileOid).toBe(fileOid);
      expect(putResult.commit.oid).toBe(currentCommitOid);
      expect(putResult.commit.message).toBe(
        `insert: ${col.collectionPath()}${_id}${JSON_EXT}(${shortOid})`
      );

      expect(putResult.commit.parent).toEqual([prevCommitOid]);
      expect(putResult.commit.author.name).toEqual(gitDDB.author.name);
      expect(putResult.commit.author.email).toEqual(gitDDB.author.email);
      expect(putResult.commit.author.timestamp.getTime()).toBeGreaterThanOrEqual(
        beforeTimestamp
      );
      expect(putResult.commit.author.timestamp.getTime()).toBeLessThanOrEqual(
        afterTimestamp
      );
      expect(putResult.commit.committer.name).toEqual(gitDDB.author.name);
      expect(putResult.commit.committer.email).toEqual(gitDDB.author.email);
      expect(putResult.commit.committer.timestamp.getTime()).toBeGreaterThanOrEqual(
        beforeTimestamp
      );
      expect(putResult.commit.committer.timestamp.getTime()).toBeLessThanOrEqual(
        afterTimestamp
      );

      // fs.access() throw error when a file cannot be accessed.
      const filePath = path.resolve(
        gitDDB.workingDir(),
        col.collectionPath(),
        _id + JSON_EXT
      );
      await expect(fs.access(filePath)).resolves.not.toThrowError();
      expect(fs.readFileSync(filePath, 'utf8')).toBe(toSortedJSONString(internalJson));

      await gitDDB.destroy();
    });

    it('uses PutOptions to set a commitMessage', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const col = new Collection(gitDDB, 'col01');
      const _id = 'prof01';
      const json = { _id, name: 'Shirase' };
      const commitMessage = 'message';
      const putResult = await col.put('prof01', json, { commitMessage });
      expect(putResult.commit.message).toBe(commitMessage);

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

    it('overwrites _id in a document by _id in the first argument', async () => {
      const dbName = monoId();

      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const col = new Collection(gitDDB, 'col01');
      const _id = 'id-in-the-first-argument';
      const json = { _id: 'id-in-doc', name: 'Shirase' };
      const putResult = await col.put(_id, json);
      const shortOid = putResult.fileOid.substr(0, SHORT_SHA_LENGTH);
      const internalJson = JSON.parse(JSON.stringify(json));
      internalJson._id = col.collectionPath() + _id;

      expect(putResult._id).toBe(_id);
      expect(putResult.commit.message).toBe(
        `insert: ${col.collectionPath()}${_id}${JSON_EXT}(${shortOid})`
      );

      // _id of original json must not be overwritten
      expect(json._id).toBe('id-in-doc');

      // fs.access() throw error when a file cannot be accessed.
      const fullDocPath = col.collectionPath() + _id + JSON_EXT;
      const filePath = path.resolve(gitDDB.workingDir(), fullDocPath);
      await expect(fs.access(filePath)).resolves.not.toThrowError();
      expect(fs.readFileSync(filePath, 'utf8')).toBe(toSortedJSONString(internalJson));

      await gitDDB.destroy();
    });
  });

  it('returns JSON object including sorted property name and two-spaces-indented structure', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = new Collection(gitDDB, 'col01');
    await col.put({
      'b': 'b',
      'c': 'c',
      '_id': 'id',
      'array': ['item2', 'item1'],
      'z': { ZZ: 'ZZ', ZA: 'ZA' },
      'a': 'a',
      '1': 1,
      'A': 'A',
    });

    const filePath = path.resolve(
      gitDDB.workingDir(),
      col.collectionPath() + 'id' + JSON_EXT
    );
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
  "_id": "col01/id"
}`);

    await gitDDB.destroy();
  });

  describe('<crud/put> putFatDoc(shortName, jsonDoc)', () => {
    it('generates new _id when _id is not found in JsonDoc', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });
      await gitDDB.open();
      const col = new Collection(gitDDB, 'col01');
      const json = { name: 'Shirase' };
      const putResult = (await col.putFatDoc(undefined, json)) as PutResultJsonDoc;
      expect(putResult._id).toMatch(/^[\dA-HJKMNP-TV-Z]{26}$/); // Match ULID
      await expect(col.get(putResult._id)).resolves.toEqual({
        ...json,
        _id: putResult._id,
      });

      // Check .json extension
      const filePath = path.resolve(
        gitDDB.workingDir(),
        col.collectionPath(),
        putResult._id + JSON_EXT
      );
      await expect(fs.access(filePath)).resolves.not.toThrowError();

      const json2 = { name: 'Shirase' };
      const putResult2 = (await col.putFatDoc('', json2)) as PutResultJsonDoc;
      expect(putResult2._id).toMatch(/^[\dA-HJKMNP-TV-Z]{26}$/); // Match ULID
      await expect(col.get(putResult2._id)).resolves.toEqual({
        ...json2,
        _id: putResult2._id,
      });

      const json3 = { name: 'Shirase' };
      const putResult3 = (await col.putFatDoc(null, json2)) as PutResultJsonDoc;
      expect(putResult3._id).toMatch(/^[\dA-HJKMNP-TV-Z]{26}$/); // Match ULID
      await expect(col.get(putResult3._id)).resolves.toEqual({
        ...json3,
        _id: putResult3._id,
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
      const prevCommitOid = await git.resolveRef({
        fs,
        dir: gitDDB.workingDir(),
        ref: 'HEAD',
      });

      const col = new Collection(gitDDB, 'col01');
      const _id = 'dir01/prof01';
      const shortName = _id + JSON_EXT;
      // Check put operation
      const json = { _id, name: 'Shirase' };

      const beforeTimestamp = Math.floor(Date.now() / 1000) * 1000;
      const putResult = await col.putFatDoc(shortName, json);
      const afterTimestamp = Math.floor(Date.now() / 1000) * 1000;

      const currentCommitOid = await git.resolveRef({
        fs,
        dir: gitDDB.workingDir(),
        ref: 'HEAD',
      });

      const internalJson = JSON.parse(JSON.stringify(json));
      internalJson._id = col.collectionPath() + _id;
      const fileOid = (await git.hashBlob({ object: toSortedJSONString(internalJson) }))
        .oid;
      const shortOid = fileOid.substr(0, SHORT_SHA_LENGTH);

      expect((putResult as PutResultJsonDoc)._id).toBe(_id);
      expect(putResult.fileOid).toBe(fileOid);
      expect(putResult.commit.oid).toBe(currentCommitOid);
      expect(putResult.commit.message).toBe(
        `insert: ${col.collectionPath()}${_id}${JSON_EXT}(${shortOid})`
      );

      expect(putResult.commit.parent).toEqual([prevCommitOid]);
      expect(putResult.commit.author.name).toEqual(gitDDB.author.name);
      expect(putResult.commit.author.email).toEqual(gitDDB.author.email);
      expect(putResult.commit.author.timestamp.getTime()).toBeGreaterThanOrEqual(
        beforeTimestamp
      );
      expect(putResult.commit.author.timestamp.getTime()).toBeLessThanOrEqual(
        afterTimestamp
      );
      expect(putResult.commit.committer.name).toEqual(gitDDB.author.name);
      expect(putResult.commit.committer.email).toEqual(gitDDB.author.email);
      expect(putResult.commit.committer.timestamp.getTime()).toBeGreaterThanOrEqual(
        beforeTimestamp
      );
      expect(putResult.commit.committer.timestamp.getTime()).toBeLessThanOrEqual(
        afterTimestamp
      );

      // fs.access() throw error when a file cannot be accessed.
      const filePath = path.resolve(
        gitDDB.workingDir(),
        col.collectionPath(),
        _id + JSON_EXT
      );
      await expect(fs.access(filePath)).resolves.not.toThrowError();
      expect(fs.readFileSync(filePath, 'utf8')).toBe(toSortedJSONString(internalJson));

      await gitDDB.destroy();
    });
  });
});
