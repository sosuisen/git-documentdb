/* eslint-disable @typescript-eslint/naming-convention */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import fs from 'fs-extra';
import git from 'isomorphic-git';
import expect from 'expect';
import { monotonicFactory } from 'ulid';
import { JSON_EXT } from '../src/const';
import { Collection } from '../src/collection';
import { sleep, toSortedJSONString } from '../src/utils';
import { GitDocumentDB } from '../src/index';
import {
  DatabaseClosingError,
  InvalidJsonObjectError,
  RepositoryNotOpenError,
} from '../src/error';
import { IDocumentDB } from '../src/types_gitddb';

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = `./test/database_collection_get`;

beforeEach(function () {
  // @ts-ignore
  console.log(`... ${this.currentTest.fullTitle()}`);
});

after(() => {
  fs.removeSync(path.resolve(localDir));
});

const addOneData = async (
  gitDDB: IDocumentDB,
  fullDocPath: string,
  data: string,
  author?: { name?: string; email?: string },
  committer?: { name?: string; email?: string }
) => {
  fs.ensureDirSync(path.dirname(path.resolve(gitDDB.workingDir(), fullDocPath)));
  fs.writeFileSync(path.resolve(gitDDB.workingDir(), fullDocPath), data);
  await git.add({ fs, dir: gitDDB.workingDir(), filepath: fullDocPath });
  await git.commit({
    fs,
    dir: gitDDB.workingDir(),
    message: 'message',
    author: author ?? gitDDB.author,
    committer: committer ?? gitDDB.committer,
  });
};

const removeOneData = async (gitDDB: IDocumentDB, fullDocPath: string) => {
  await git.remove({ fs, dir: gitDDB.workingDir(), filepath: fullDocPath });
  fs.removeSync(path.resolve(gitDDB.workingDir(), fullDocPath));
  await git.commit({
    fs,
    dir: gitDDB.workingDir(),
    message: 'message',
    author: gitDDB.author,
  });
};

describe('<collection> get()', () => {
  it('throws DatabaseClosingError', async () => {
    const dbName = monoId();
    const gitDDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = new Collection(gitDDB);
    for (let i = 0; i < 100; i++) {
      // put() will throw Error after the database is closed by force.
      col.put({ _id: i.toString(), name: i.toString() }).catch(() => {});
    }
    // Call close() without await
    gitDDB.close().catch(() => {});
    await expect(col.get('99')).rejects.toThrowError(DatabaseClosingError);

    while (gitDDB.isClosing) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(100);
    }
    await gitDDB.destroy();
  });

  it('throws RepositoryNotOpenError', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = new Collection(gitDDB);
    await gitDDB.close();
    await expect(col.get('prof01')).rejects.toThrowError(RepositoryNotOpenError);
  });

  it('throws InvalidJsonObjectError', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = new Collection(gitDDB);

    const shortId = 'prof01';
    const fullDocPath = col.collectionPath() + shortId + JSON_EXT;
    await addOneData(gitDDB, fullDocPath, 'invalid data');

    await expect(col.get(shortId)).rejects.toThrowError(InvalidJsonObjectError);

    await gitDDB.destroy();
  });

  it('returns the latest JsonDoc', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = new Collection(gitDDB);
    const shortId = 'prof01';
    const fullDocPath = col.collectionPath() + shortId + JSON_EXT;
    const json01 = { _id: shortId, name: 'v1' };
    const json02 = { _id: shortId, name: 'v2' };
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json01));
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json02));

    await expect(col.get(shortId)).resolves.toEqual(json02);
    await gitDDB.destroy();
  });

  it('returns undefined if not exists', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = new Collection(gitDDB);
    const shortId = 'prof01';

    await expect(col.get(shortId)).resolves.toBeUndefined();
    await gitDDB.destroy();
  });

  it('returns undefined after deleted', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = new Collection(gitDDB);
    const shortId = 'prof01';
    const fullDocPath = col.collectionPath() + shortId + JSON_EXT;
    const json01 = { _id: shortId, name: 'v1' };
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json01));
    await removeOneData(gitDDB, fullDocPath);

    await expect(col.get(shortId)).resolves.toBeUndefined();
    await gitDDB.destroy();
  });

  it('returns the latest JsonDoc from deep collection', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = new Collection(gitDDB, 'col01/col02/col03/');
    const shortId = 'dir01/prof01';
    const fullDocPath = col.collectionPath() + shortId + JSON_EXT;
    const json01 = { _id: shortId, name: 'v1' };
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json01));

    await expect(col.get(shortId)).resolves.toEqual(json01);
    await gitDDB.destroy();
  });

  it('ignores invalid getOptions', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = new Collection(gitDDB, 'dir01/dir02/dir03');
    const shortId = 'prof01';
    const fullDocPath = col.collectionPath() + shortId + JSON_EXT;
    const json01 = { _id: shortId, name: 'v1' };
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json01));

    // @ts-ignore
    await expect(col.get(shortId, 'invalid')).resolves.toEqual(json01);
    await gitDDB.destroy();
  });
});

describe('<collection> getFatDoc()', () => {
  it('returns the latest FatJsonDoc', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = new Collection(gitDDB);
    const shortId = 'prof01';
    const fullDocPath = col.collectionPath() + shortId + JSON_EXT;
    const json01 = { _id: shortId, name: 'v1' };
    const json02 = { _id: shortId, name: 'v2' };
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json01));
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json02));

    await expect(col.getFatDoc(shortId)).resolves.toEqual({
      _id: shortId,
      fileOid: await (await git.hashBlob({ object: toSortedJSONString(json02) })).oid,
      type: 'json',
      doc: json02,
    });
    await gitDDB.destroy();
  });

  it('returns undefined if not exists', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = new Collection(gitDDB);
    const shortId = 'prof01';

    await expect(col.getFatDoc(shortId)).resolves.toBeUndefined();
    await gitDDB.destroy();
  });
});
/*
describe('<crud/get> getByOid()', () => {
  it('returns the specified FatJsonDoc', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = new Collection(gitDDB, 'col01/col02/col03/');
    const shortId = 'dir01/prof01';
    const fullDocPath = col.collectionPath() + shortId + JSON_EXT;
    const json01 = { _id: shortId, name: 'v1' };
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json01));
    const { oid } = await git.hashBlob({ object: toSortedJSONString(json01) });
    await expect(col.getByOid(shortId, oid)).resolves.toEqual({
      _id: shortId,
      fileOid: oid,
      type: 'json',
      doc: json01,
    });
    await gitDDB.destroy();
  });

  it('returns undefined if oid does not exist', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = new Collection(gitDDB, 'col01/col02/col03/');
    const shortId = 'dir01/prof01';
    const fullDocPath = col.collectionPath() + shortId + JSON_EXT;
    const json01 = { _id: shortId, name: 'v1' };
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json01));
    await expect(col.getByOid(shortId, 'not exist')).resolves.toBeUndefined();
    await gitDDB.destroy();
  });

  it('returns undefined if _id does not exist', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = new Collection(gitDDB, 'col01/col02/col03/');
    const shortId = 'dir01/prof01';
    const fullDocPath = col.collectionPath() + shortId + JSON_EXT;
    const json01 = { _id: shortId, name: 'v1' };
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json01));
    const { oid } = await git.hashBlob({ object: toSortedJSONString(json01) });
    await expect(col.getByOid('not exist', oid)).resolves.toBeUndefined();
    await gitDDB.destroy();
  });
});
*/