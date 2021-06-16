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
import { Collection } from '../src/collection';
import { JSON_EXT, SHORT_SHA_LENGTH } from '../src/const';
import { toSortedJSONString } from '../src/utils';
import { GitDocumentDB } from '../src/index';
import { SameIdExistsError } from '../src/error';

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

describe('<collection> get()', () => {

  it('throws UndefinedDocumentIdError', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const _id = 'prof01';
    // @ts-ignore
    await expect(gitDDB.get(undefined)).rejects.toThrowError(UndefinedDocumentIdError);
    await gitDDB.destroy();
  });

  it('throws InvalidIdCharacterError', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const _id = 'prof01';
    await expect(gitDDB.get('<prof01>')).rejects.toThrowError(InvalidIdCharacterError);
    await gitDDB.destroy();
  });



  it('reads an existing document', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
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
      dbName,
      localDir,
    });

    await gitDDB.open();
    const users = gitDDB.collection('users');
    const _id = 'dir01/prof01';
    await users.put({ _id: _id, name: 'shirase' });
    // Get
    await expect(users.get(_id)).resolves.toEqual({ _id: _id, name: 'shirase' });
    await gitDDB.destroy();
  });
});

describe('get() back number', () => {

});

describe('<crud/get> getByRevision()', () => {
  it('returns the specified document', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const _id = 'prof01';
    const putResult = await gitDDB.put({ _id: _id, name: 'shirase' });
    // Get by revision
    await expect(gitDDB.getByRevision(putResult.fileOid)).resolves.toEqual({
      _id: _id,
      name: 'shirase',
    });
    await gitDDB.destroy();
  });

  it('throws DatabaseClosingError', async () => {
    const dbName = monoId();
    const gitDDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();

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
      dbName,
      localDir,
    });
    await gitDDB.open();
    await gitDDB.close();
    await expect(
      gitDDB.getByRevision('0000000000111111111122222222223333333333')
    ).rejects.toThrowError(RepositoryNotOpenError);
  });

  it('throws UndefinedFileSHAError', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    // @ts-ignore
    await expect(gitDDB.getByRevision(undefined)).rejects.toThrowError(
      UndefinedFileSHAError
    );
    await gitDDB.destroy();
  });

  it('throws InvalidFileSHAFormatError', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    // @ts-ignore
    await expect(gitDDB.getByRevision('invalid format')).rejects.toThrowError(
      InvalidFileSHAFormatError
    );
    await gitDDB.destroy();
  });

  it('returns undefined', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
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
      dbName,
      localDir,
    });
    await gitDDB.open();

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
      dbName,
      localDir,
    });
    await gitDDB.open();

    const _id = 'invalidJSON';
    let fileOid: string;
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

describe('<crud/get> getFatDoc', () => {
  it('returns JsonDoc with metadata', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const _id = 'prof01';
    const putResult = await gitDDB.put({ _id: _id, name: 'shirase' });
    // Get
    await expect(gitDDB.getFatDoc(_id)).resolves.toEqual({
      id: _id,
      fileOid: putResult.fileOid,
      doc: { _id: _id, name: 'shirase' },
    });
    await gitDDB.destroy();
  });

  it('returns backNumber#1 with metadata', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const _id = 'prof01';
    const putResult = await gitDDB.put({ _id: _id, name: '1' });
    await gitDDB.put({ _id: _id, name: '2' });
    // Get
    await expect(gitDDB.getFatDoc(_id, 1)).resolves.toEqual({
      id: _id,
      fileOid: putResult.fileOid,
      doc: { _id: _id, name: '1' },
    });
    await gitDDB.destroy();
  });
});
