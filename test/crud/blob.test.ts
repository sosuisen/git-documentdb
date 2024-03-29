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
  blobToJsonDocWithoutOverwrittenId,
  blobToText,
  readBlobByOid,
  readLatestBlob,
} from '../../src/crud/blob';
import { Err } from '../../src/error';
import { GitDocumentDB } from '../../src/git_documentdb';
import {
  toFrontMatterMarkdown,
  toSortedJSONString,
  toYAML,
  utf8encode,
} from '../../src/utils';
import { FRONT_MATTER_POSTFIX, JSON_POSTFIX, YAML_POSTFIX } from '../../src/const';
import {
  SerializeFormatFrontMatter,
  SerializeFormatJSON,
} from '../../src/serialize_format';

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
      expect(() =>
        blobToJsonDoc(
          shortId,
          readBlobResult,
          false,
          new SerializeFormatJSON(),
          JSON_POSTFIX
        )
      ).toThrowError(Err.InvalidJsonObjectError);
    });

    it('returns JsonDoc', async () => {
      const shortId = 'foo';
      const json = { _id: shortId, name: 'bar' };
      const text = toSortedJSONString(json);
      const readBlobResult: ReadBlobResult = {
        oid: (await git.hashBlob({ object: text })).oid,
        blob: utf8encode(text),
      };
      expect(
        blobToJsonDoc(
          shortId,
          readBlobResult,
          false,
          new SerializeFormatJSON(),
          JSON_POSTFIX
        )
      ).toEqual(json);
    });

    it('returns JsonDoc with only _id when YAML_POSTFIX and Front-Matter + Markdown is empty', async () => {
      const shortId = 'foo';
      const text = '';
      const readBlobResult: ReadBlobResult = {
        oid: (await git.hashBlob({ object: text })).oid,
        blob: utf8encode(text),
      };
      expect(
        blobToJsonDoc(
          shortId,
          readBlobResult,
          false,
          new SerializeFormatFrontMatter(),
          YAML_POSTFIX
        )
      ).toEqual({
        _id: 'foo',
      });
    });

    it('returns JsonDoc with only _id and _body when FRONT_MATTER_POSTFIX and Front-Matter + Markdown is empty', async () => {
      const shortId = 'foo';
      const text = '';
      const readBlobResult: ReadBlobResult = {
        oid: (await git.hashBlob({ object: text })).oid,
        blob: utf8encode(text),
      };
      expect(
        blobToJsonDoc(
          shortId,
          readBlobResult,
          false,
          new SerializeFormatFrontMatter(),
          FRONT_MATTER_POSTFIX
        )
      ).toEqual({
        _id: 'foo',
        _body: '',
      });
    });

    it('returns JsonDoc with only _id and _body when Front-Matter is empty', async () => {
      const shortId = 'foo';
      const text = 'bar\nbaz';
      const readBlobResult: ReadBlobResult = {
        oid: (await git.hashBlob({ object: text })).oid,
        blob: utf8encode(text),
      };
      expect(
        blobToJsonDoc(
          shortId,
          readBlobResult,
          false,
          new SerializeFormatFrontMatter(),
          FRONT_MATTER_POSTFIX
        )
      ).toEqual({
        _id: 'foo',
        _body: text,
      });
    });

    it('returns JsonDoc with only _id and _body when Front-Matter does not end', async () => {
      const shortId = 'foo';
      const text = '---\na: foo';
      const readBlobResult: ReadBlobResult = {
        oid: (await git.hashBlob({ object: text })).oid,
        blob: utf8encode(text),
      };
      expect(
        blobToJsonDoc(
          shortId,
          readBlobResult,
          false,
          new SerializeFormatFrontMatter(),
          FRONT_MATTER_POSTFIX
        )
      ).toEqual({
        _id: 'foo',
        _body: text,
      });
    });

    it('returns JsonDoc of Front-Matter + Markdown', async () => {
      const shortId = 'foo';
      const json = { _id: shortId, propA: 'A', propB: 'B', _body: 'foo\nbar' };
      const text = toFrontMatterMarkdown(json);
      const readBlobResult: ReadBlobResult = {
        oid: (await git.hashBlob({ object: text })).oid,
        blob: utf8encode(text),
      };
      expect(
        blobToJsonDoc(
          shortId,
          readBlobResult,
          false,
          new SerializeFormatFrontMatter(),
          FRONT_MATTER_POSTFIX
        )
      ).toEqual(json);
    });

    it('returns JsonDoc of Front-Matter + Markdown when _body is empty', async () => {
      const shortId = 'foo';
      const json = { _id: shortId, propA: 'A', propB: 'B', _body: '' };
      const text = toFrontMatterMarkdown(json);
      const readBlobResult: ReadBlobResult = {
        oid: (await git.hashBlob({ object: text })).oid,
        blob: utf8encode(text),
      };
      expect(
        blobToJsonDoc(
          shortId,
          readBlobResult,
          false,
          new SerializeFormatFrontMatter(),
          FRONT_MATTER_POSTFIX
        )
      ).toEqual(json);
    });

    it('returns JsonDoc of Front-Matter + Markdown that ends with \n', async () => {
      const shortId = 'foo';
      const json = { _id: shortId, propA: 'A', propB: 'B', _body: 'foo\nbar\n' };
      const text = toFrontMatterMarkdown(json);
      const readBlobResult: ReadBlobResult = {
        oid: (await git.hashBlob({ object: text })).oid,
        blob: utf8encode(text),
      };
      expect(
        blobToJsonDoc(
          shortId,
          readBlobResult,
          false,
          new SerializeFormatFrontMatter(),
          FRONT_MATTER_POSTFIX
        )
      ).toEqual(json);
    });

    it('returns JsonDoc of Front-Matter and Markdown witch stats with ---', async () => {
      const shortId = 'foo';
      const json = { _id: shortId, propA: 'A', propB: 'B', _body: '---\nfoo\nbar' };
      const text = toFrontMatterMarkdown(json);
      const readBlobResult: ReadBlobResult = {
        oid: (await git.hashBlob({ object: text })).oid,
        blob: utf8encode(text),
      };
      expect(
        blobToJsonDoc(
          shortId,
          readBlobResult,
          false,
          new SerializeFormatFrontMatter(),
          FRONT_MATTER_POSTFIX
        )
      ).toEqual(json);
    });

    it('returns JsonDoc of YAML without Markdown', async () => {
      const shortId = 'foo';
      const json = { _id: shortId, propA: 'A', propB: 'B' };
      const text = toYAML(json);
      const readBlobResult: ReadBlobResult = {
        oid: (await git.hashBlob({ object: text })).oid,
        blob: utf8encode(text),
      };
      expect(
        blobToJsonDoc(
          shortId,
          readBlobResult,
          false,
          new SerializeFormatFrontMatter(),
          YAML_POSTFIX
        )
      ).toEqual(json);
    });

    it('returns JsonDoc of Markdown when file extension is unknown', async () => {
      const shortId = 'foo';
      const json = { _id: shortId, propA: 'A', propB: 'B' };
      const jsonMarkdown = { _id: shortId, _body: '_id: foo\npropA: A\npropB: B\n' };
      const text = toYAML(json);
      const readBlobResult: ReadBlobResult = {
        oid: (await git.hashBlob({ object: text })).oid,
        blob: utf8encode(text),
      };
      expect(
        blobToJsonDoc(shortId, readBlobResult, false, new SerializeFormatFrontMatter(), '')
      ).toEqual(jsonMarkdown);
    });

    it('returns JsonDoc with overwritten _id', async () => {
      const shortId = 'foo';
      const shortId2 = 'foo';
      const json = { _id: shortId, name: 'bar' };
      const json2 = { _id: shortId2, name: 'bar' };
      const text = toSortedJSONString(json);
      const readBlobResult: ReadBlobResult = {
        oid: (await git.hashBlob({ object: text })).oid,
        blob: utf8encode(text),
      };
      expect(
        blobToJsonDoc(
          shortId2,
          readBlobResult,
          false,
          new SerializeFormatJSON(),
          JSON_POSTFIX
        )
      ).toEqual(json2);
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
      expect(
        blobToJsonDoc(
          shortId,
          readBlobResult,
          true,
          new SerializeFormatJSON(),
          JSON_POSTFIX
        )
      ).toEqual({
        _id: shortId,
        name: shortId + JSON_POSTFIX,
        fileOid,
        type: 'json',
        doc: json,
      });
    });
  });

  describe('blobToJsonDocWithoutOverwrittenId', () => {
    it('throws InvalidJsonObjectError', async () => {
      const text = 'bar';
      const readBlobResult: ReadBlobResult = {
        oid: (await git.hashBlob({ object: text })).oid,
        blob: utf8encode(text),
      };
      expect(() =>
        blobToJsonDocWithoutOverwrittenId(
          readBlobResult,
          new SerializeFormatJSON(),
          JSON_POSTFIX
        )
      ).toThrowError(Err.InvalidJsonObjectError);
    });

    it('returns JsonDoc', async () => {
      const shortId = 'foo';
      const json = { _id: shortId, name: 'bar' };
      const text = toSortedJSONString(json);
      const readBlobResult: ReadBlobResult = {
        oid: (await git.hashBlob({ object: text })).oid,
        blob: utf8encode(text),
      };
      expect(
        blobToJsonDocWithoutOverwrittenId(
          readBlobResult,
          new SerializeFormatJSON(),
          JSON_POSTFIX
        )
      ).toEqual(json);
    });

    it('returns JsonDoc in FrontMatterMarkdown', async () => {
      const shortId = 'foo';
      const json = { _id: shortId, name: 'bar', _body: 'baz' };
      const text = toFrontMatterMarkdown(json);
      const readBlobResult: ReadBlobResult = {
        oid: (await git.hashBlob({ object: text })).oid,
        blob: utf8encode(text),
      };
      expect(
        blobToJsonDocWithoutOverwrittenId(
          readBlobResult,
          new SerializeFormatFrontMatter(),
          FRONT_MATTER_POSTFIX
        )
      ).toEqual(json);
    });

    it('returns JsonDoc in YAML', async () => {
      const shortId = 'foo';
      const json = { _id: shortId, name: 'bar' };
      const text = toYAML(json);
      const readBlobResult: ReadBlobResult = {
        oid: (await git.hashBlob({ object: text })).oid,
        blob: utf8encode(text),
      };
      expect(
        blobToJsonDocWithoutOverwrittenId(
          readBlobResult,
          new SerializeFormatFrontMatter(),
          YAML_POSTFIX
        )
      ).toEqual(json);
    });

    it('returns JsonDoc of Markdown when shortId and file extension is unknown', async () => {
      const shortId = 'foo';
      const json = { _id: shortId, propA: 'A', propB: 'B' };
      const jsonMarkdown = { _body: '_id: foo\npropA: A\npropB: B\n' };
      const text = toYAML(json);
      const readBlobResult: ReadBlobResult = {
        oid: (await git.hashBlob({ object: text })).oid,
        blob: utf8encode(text),
      };
      expect(
        blobToJsonDocWithoutOverwrittenId(
          readBlobResult,
          new SerializeFormatFrontMatter(),
          ''
        )
      ).toEqual(jsonMarkdown);
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
      const shortName = 'foo.md';
      const text = '春はあけぼの';
      const fileOid = (await git.hashBlob({ object: text })).oid;
      const readBlobResult: ReadBlobResult = {
        oid: fileOid,
        blob: utf8encode(text),
      };
      expect(blobToText(shortName, readBlobResult, true)).toEqual({
        name: shortName,
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

    it('returns FatBinaryDoc', async () => {
      const shortName = 'foo.json';
      const uint8array = new Uint8Array([0, 1, 2]);
      const fileOid = (await git.hashBlob({ object: uint8array })).oid;
      const readBlobResult: ReadBlobResult = {
        oid: fileOid,
        blob: uint8array,
      };
      expect(blobToBinary(shortName, readBlobResult, true)).toEqual({
        name: shortName,
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
      await git.init({ fs, dir: gitDDB.workingDir });
      const oid = await git.writeBlob({ fs, dir: gitDDB.workingDir, blob: uint8array });
      const readBlobResult = await readBlobByOid(gitDDB.workingDir, oid);
      expect(readBlobResult?.blob).toEqual(uint8array);
      expect(readBlobResult?.oid).toEqual(oid);

      await gitDDB.destroy();
    });

    it('returns undefined', async () => {
      const gitDDB = new GitDocumentDB({ localDir: localDir, dbName: monoId() });
      await expect(readBlobByOid(gitDDB.workingDir, 'foobar')).resolves.toBeUndefined();
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
      await git.init({ fs, dir: gitDDB.workingDir, defaultBranch: 'main' });
      fs.writeFileSync(path.resolve(gitDDB.workingDir, fullDocPath), text);
      await git.add({ fs, dir: gitDDB.workingDir, filepath: fullDocPath });
      await git.commit({
        fs,
        dir: gitDDB.workingDir,
        message: 'test',
        author: gitDDB.author,
      });
      await expect(readLatestBlob(gitDDB.workingDir, fullDocPath)).resolves.toEqual({
        oid,
        blob,
      });
      await gitDDB.destroy();
    });

    it('returns undefined when Git is empty', async () => {
      const gitDDB = new GitDocumentDB({ localDir: localDir, dbName: monoId() });
      await git.init({ fs, dir: gitDDB.workingDir });
      await expect(readLatestBlob(gitDDB.workingDir, 'foo')).resolves.toBeUndefined();
      await gitDDB.destroy();
    });

    it('returns undefined when the specified document does not exist.', async () => {
      const fullDocPath = 'foo';
      const text = 'bar';

      const gitDDB = new GitDocumentDB({ localDir: localDir, dbName: monoId() });
      await git.init({ fs, dir: gitDDB.workingDir, defaultBranch: 'main' });
      await git.init({ fs, dir: gitDDB.workingDir, defaultBranch: 'main' });
      fs.writeFileSync(path.resolve(gitDDB.workingDir, fullDocPath), text);
      await git.add({ fs, dir: gitDDB.workingDir, filepath: fullDocPath });
      await git.commit({
        fs,
        dir: gitDDB.workingDir,
        message: 'test',
        author: gitDDB.author,
      });
      await expect(
        readLatestBlob(gitDDB.workingDir, fullDocPath + 'bar')
      ).resolves.toBeUndefined();
      await gitDDB.destroy();
    });

    it('returns undefined if readBlob throws Error', async () => {
      const fullDocPath = 'foo';
      const text = 'bar';

      const oid = (await git.hashBlob({ object: text })).oid;
      const blob = utf8encode(text);

      const gitDDB = new GitDocumentDB({ localDir: localDir, dbName: monoId() });
      await git.init({ fs, dir: gitDDB.workingDir, defaultBranch: 'main' });
      fs.writeFileSync(path.resolve(gitDDB.workingDir, fullDocPath), text);
      await git.add({ fs, dir: gitDDB.workingDir, filepath: fullDocPath });
      await git.commit({
        fs,
        dir: gitDDB.workingDir,
        message: 'test',
        author: gitDDB.author,
      });
      const stubReadBlob = sandbox.stub(git_module, 'readBlob');
      stubReadBlob.rejects();

      await expect(readLatestBlob(gitDDB.workingDir, fullDocPath)).resolves.toBeUndefined();

      await gitDDB.destroy();
    });
  });
});
