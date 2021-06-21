/* eslint-disable @typescript-eslint/naming-convention */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import git, { ReadBlobResult } from 'isomorphic-git';
import expect from 'expect';
import fs from 'fs-extra';
import sinon from 'sinon';
import { monotonicFactory } from 'ulid';
import {
  blobToBinary,
  blobToJsonDoc,
  blobToText,
  readBlobByOid,
  readLatestBlob,
} from '../../src/crud/blob';
import { InvalidJsonObjectError } from '../../src/error';
import { GitDocumentDB } from '../../src/git_documentdb';
import { toSortedJSONString, utf8encode } from '../../src/utils';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const git_module = require('isomorphic-git');

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = `./test/database_crud_blob`;

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

after(() => {
  fs.removeSync(path.resolve(localDir));
});

describe('<crud/blob>', () => {
  describe('blobToJsonDoc', () => {
    it('throws InvalidJsonObjectError', async () => {
      const shortId = 'foo';
      const text = 'bar';
      const readBlobResult: ReadBlobResult = {
        oid: (await git.hashBlob({ object: text })).oid,
        blob: utf8encode(text),
      };
      expect(() => blobToJsonDoc(shortId, readBlobResult, false)).toThrowError(
        InvalidJsonObjectError
      );
    });

    it('returns JsonDoc', async () => {
      const shortId = 'foo';
      const json = { _id: shortId, name: 'bar' };
      const text = toSortedJSONString(json);
      const readBlobResult: ReadBlobResult = {
        oid: (await git.hashBlob({ object: text })).oid,
        blob: utf8encode(text),
      };
      expect(blobToJsonDoc(shortId, readBlobResult, false)).toEqual(json);
    });

    it('returns FatJsonDoc', async () => {
      const shortId = 'foo';
      const json = { _id: shortId, name: 'bar' };
      const text = toSortedJSONString(json);
      const fileOid = (await git.hashBlob({ object: text })).oid;
      const readBlobResult: ReadBlobResult = {
        oid: fileOid,
        blob: utf8encode(text),
      };
      expect(blobToJsonDoc(shortId, readBlobResult, true)).toEqual({
        _id: shortId,
        fileOid,
        type: 'json',
        doc: json,
      });
    });
  });

  describe('blobToText', () => {
    it('returns utf8 text', async () => {
      const shortId = 'foo';
      const text = '春はあけぼの';
      const readBlobResult: ReadBlobResult = {
        oid: (await git.hashBlob({ object: text })).oid,
        blob: utf8encode(text),
      };
      expect(blobToText(shortId, readBlobResult, false)).toEqual(text);
    });

    it('returns FatTextDoc', async () => {
      const shortId = 'foo';
      const text = '春はあけぼの';
      const fileOid = (await git.hashBlob({ object: text })).oid;
      const readBlobResult: ReadBlobResult = {
        oid: fileOid,
        blob: utf8encode(text),
      };
      expect(blobToText(shortId, readBlobResult, true)).toEqual({
        _id: shortId,
        fileOid,
        type: 'text',
        doc: text,
      });
    });
  });

  describe('blobToBinary', () => {
    it('returns Uint8Array', async () => {
      const shortId = 'foo';
      const uint8array = new Uint8Array([0, 1, 2]);
      const readBlobResult: ReadBlobResult = {
        oid: (await git.hashBlob({ object: uint8array })).oid,
        blob: uint8array,
      };
      expect(blobToBinary(shortId, readBlobResult, false)).toEqual(uint8array);
    });

    it('returns FatTextDoc', async () => {
      const shortId = 'foo';
      const uint8array = new Uint8Array([0, 1, 2]);
      const fileOid = (await git.hashBlob({ object: uint8array })).oid;
      const readBlobResult: ReadBlobResult = {
        oid: fileOid,
        blob: uint8array,
      };
      expect(blobToBinary(shortId, readBlobResult, true)).toEqual({
        _id: shortId,
        fileOid,
        type: 'binary',
        doc: uint8array,
      });
    });
  });

  describe('readBlobByOid', () => {
    it('returns ReadBlobResult', async () => {
      const uint8array = new Uint8Array([0, 1, 2]);
      const gitDDB = new GitDocumentDB({ localDir: localDir, dbName: monoId() });
      await git.init({ fs, dir: gitDDB.workingDir() });
      const oid = await git.writeBlob({ fs, dir: gitDDB.workingDir(), blob: uint8array });
      const readBlobResult = await readBlobByOid(gitDDB.workingDir(), oid);
      expect(readBlobResult?.blob).toEqual(uint8array);
      expect(readBlobResult?.oid).toEqual(oid);

      await gitDDB.destroy();
    });

    it('returns undefined', async () => {
      const gitDDB = new GitDocumentDB({ localDir: localDir, dbName: monoId() });
      await expect(readBlobByOid(gitDDB.workingDir(), 'foobar')).resolves.toBeUndefined();
      await gitDDB.destroy();
    });
  });

  describe('readLatestBlob', () => {
    it('returns ReadBlobResult', async () => {
      const fullDocPath = 'foo';
      const text = 'bar';

      const oid = (await git.hashBlob({ object: text })).oid;
      const blob = utf8encode(text);

      const gitDDB = new GitDocumentDB({ localDir: localDir, dbName: monoId() });
      await git.init({ fs, dir: gitDDB.workingDir(), defaultBranch: 'main' });
      fs.writeFileSync(path.resolve(gitDDB.workingDir(), fullDocPath), text);
      await git.add({ fs, dir: gitDDB.workingDir(), filepath: fullDocPath });
      await git.commit({
        fs,
        dir: gitDDB.workingDir(),
        message: 'test',
        author: gitDDB.author,
      });
      await expect(readLatestBlob(gitDDB.workingDir(), fullDocPath)).resolves.toEqual({
        oid,
        blob,
      });
      await gitDDB.destroy();
    });

    it('returns undefined when Git is empty', async () => {
      const gitDDB = new GitDocumentDB({ localDir: localDir, dbName: monoId() });
      await git.init({ fs, dir: gitDDB.workingDir() });
      await expect(readLatestBlob(gitDDB.workingDir(), 'foo')).resolves.toBeUndefined();
      await gitDDB.destroy();
    });

    it('returns undefined when the specified document does not exist.', async () => {
      const fullDocPath = 'foo';
      const text = 'bar';

      const gitDDB = new GitDocumentDB({ localDir: localDir, dbName: monoId() });
      await git.init({ fs, dir: gitDDB.workingDir(), defaultBranch: 'main' });
      await git.init({ fs, dir: gitDDB.workingDir(), defaultBranch: 'main' });
      fs.writeFileSync(path.resolve(gitDDB.workingDir(), fullDocPath), text);
      await git.add({ fs, dir: gitDDB.workingDir(), filepath: fullDocPath });
      await git.commit({
        fs,
        dir: gitDDB.workingDir(),
        message: 'test',
        author: gitDDB.author,
      });
      await expect(
        readLatestBlob(gitDDB.workingDir(), fullDocPath + 'bar')
      ).resolves.toBeUndefined();
      await gitDDB.destroy();
    });

    it('returns undefined if readBlob throws Error', async () => {
      const fullDocPath = 'foo';
      const text = 'bar';

      const oid = (await git.hashBlob({ object: text })).oid;
      const blob = utf8encode(text);

      const gitDDB = new GitDocumentDB({ localDir: localDir, dbName: monoId() });
      await git.init({ fs, dir: gitDDB.workingDir(), defaultBranch: 'main' });
      fs.writeFileSync(path.resolve(gitDDB.workingDir(), fullDocPath), text);
      await git.add({ fs, dir: gitDDB.workingDir(), filepath: fullDocPath });
      await git.commit({
        fs,
        dir: gitDDB.workingDir(),
        message: 'test',
        author: gitDDB.author,
      });
      const stubReadBlob = sandbox.stub(git_module, 'readBlob');
      stubReadBlob.rejects();

      await expect(
        readLatestBlob(gitDDB.workingDir(), fullDocPath)
      ).resolves.toBeUndefined();

      await gitDDB.destroy();
    });
  });
});
