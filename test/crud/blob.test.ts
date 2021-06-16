/* eslint-disable @typescript-eslint/naming-convention */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import git, { ReadBlobResult, STAGE, WORKDIR } from 'isomorphic-git';
import expect from 'expect';
import fs from 'fs-extra';
import sinon from 'sinon';
import { monotonicFactory } from 'ulid';
import { blobToJsonDoc } from '../../src/crud/blob';
import { InvalidJsonObjectError } from '../../src/error';
import { GitDocumentDB } from '../../src/index';
import { JSON_EXT } from '../../src/const';
import { toSortedJSONString, utf8encode } from '../../src/utils';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs_module = require('fs-extra');

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = `./test/database_blob`;

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
});
