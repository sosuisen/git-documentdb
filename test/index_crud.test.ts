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
import { monotonicFactory } from 'ulid';
import expect from 'expect';
import fs from 'fs-extra';
import { GitDocumentDB } from '../src/index';
import { sleep, toSortedJSONString } from '../src/utils';
import { JSON_EXT, SHORT_SHA_LENGTH } from '../src/const';
import { IDocumentDB } from '../src/types_gitddb';
import {
  DatabaseClosingError,
  DocumentNotFoundError,
  InvalidJsonObjectError,
  RepositoryNotOpenError,
} from '../src/error';

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = `./test/database_index`;

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

describe('<index> put(jsonDoc)', () => {
  it('creates a JSON file', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const _id = 'prof01';
    // Check put operation
    const json = { _id, name: 'Shirase' };
    const putResult = await gitDDB.put(json);
    const fileOid = (await git.hashBlob({ object: toSortedJSONString(json) })).oid;
    const shortOid = fileOid.substr(0, SHORT_SHA_LENGTH);
    expect(putResult._id).toBe(_id);
    expect(putResult.fileOid).toBe(fileOid);
    expect(putResult.commit.message).toBe(`insert: ${_id}${JSON_EXT}(${shortOid})`);

    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(gitDDB.workingDir(), _id + JSON_EXT);
    await expect(fs.access(filePath)).resolves.not.toThrowError();
    expect(fs.readFileSync(filePath, 'utf8')).toBe(toSortedJSONString(json));

    await gitDDB.destroy();
  });

  it('puts with a commitMessage', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const _id = 'prof01';
    const json = { _id, name: 'Shirase' };
    const commitMessage = 'message';
    const putResult = await gitDDB.put(json, { commitMessage });
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
});

describe('<index> put(_id, jsonDoc)', () => {
  it('creates a JSON file', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const _id = 'prof01';
    const json = { _id, name: 'Shirase' };
    const putResult = await gitDDB.put(_id, json);
    const fileOid = (await git.hashBlob({ object: toSortedJSONString(json) })).oid;
    const shortOid = fileOid.substr(0, SHORT_SHA_LENGTH);
    expect(putResult._id).toBe(_id);
    expect(putResult.fileOid).toBe(fileOid);
    expect(putResult.commit.message).toBe(`insert: ${_id}${JSON_EXT}(${shortOid})`);

    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(gitDDB.workingDir(), _id + JSON_EXT);
    await expect(fs.access(filePath)).resolves.not.toThrowError();
    expect(fs.readFileSync(filePath, 'utf8')).toBe(toSortedJSONString(json));

    await gitDDB.destroy();
  });

  it('puts with a commitMessage', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const _id = 'prof01';
    const json = { _id, name: 'Shirase' };
    const commitMessage = 'message';
    const putResult = await gitDDB.put(_id, json, { commitMessage });
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
});

describe('<index> insert(jsonDoc)', () => {
  it('inserts a JSON file', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const _id = 'prof01';
    const json = { _id, name: 'Shirase' };
    const putResult = await gitDDB.insert(json);
    const fileOid = (await git.hashBlob({ object: toSortedJSONString(json) })).oid;
    const shortOid = fileOid.substr(0, SHORT_SHA_LENGTH);
    expect(putResult._id).toBe(_id);
    expect(putResult.fileOid).toBe(fileOid);
    expect(putResult.commit.message).toBe(`insert: ${_id}${JSON_EXT}(${shortOid})`);

    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(gitDDB.workingDir(), _id + JSON_EXT);
    await expect(fs.access(filePath)).resolves.not.toThrowError();

    expect(fs.readFileSync(filePath, 'utf8')).toBe(toSortedJSONString(json));

    await gitDDB.destroy();
  });

  it('sets commitMessage by PutOptions', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const _id = 'prof01';
    const commitMessage = 'message';
    const json = { _id, name: 'Shirase' };
    const putResult = await gitDDB.insert(json, { commitMessage });
    const fileOid = (await git.hashBlob({ object: toSortedJSONString(json) })).oid;
    fileOid.substr(0, SHORT_SHA_LENGTH);
    expect(putResult.commit.message).toBe(commitMessage);

    await gitDDB.destroy();
  });
});

describe('<index> insert(_id, jsonDoc)', () => {
  it('inserts a JSON file', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const _id = 'prof01';
    const json = { _id, name: 'Shirase' };
    const putResult = await gitDDB.insert(_id, json);
    const fileOid = (await git.hashBlob({ object: toSortedJSONString(json) })).oid;
    const shortOid = fileOid.substr(0, SHORT_SHA_LENGTH);
    expect(putResult._id).toBe(_id);
    expect(putResult.fileOid).toBe(fileOid);
    expect(putResult.commit.message).toBe(`insert: ${_id}${JSON_EXT}(${shortOid})`);

    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(gitDDB.workingDir(), _id + JSON_EXT);
    await expect(fs.access(filePath)).resolves.not.toThrowError();

    expect(fs.readFileSync(filePath, 'utf8')).toBe(toSortedJSONString(json));

    await gitDDB.destroy();
  });

  it('sets commitMessage by PutOptions', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const _id = 'prof01';
    const commitMessage = 'message';
    const json = { _id, name: 'Shirase' };
    const putResult = await gitDDB.insert(_id, json, { commitMessage });
    const fileOid = (await git.hashBlob({ object: toSortedJSONString(json) })).oid;
    fileOid.substr(0, SHORT_SHA_LENGTH);
    expect(putResult.commit.message).toBe(commitMessage);

    await gitDDB.destroy();
  });
});

describe('<index> update(jsonDoc)', () => {
  it('update a JSON file', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const _id = 'prof01';
    const json = { _id, name: 'Shirase' };
    await gitDDB.insert(json);
    const jsonUpdated = { _id: 'prof01', name: 'updated' };
    const putResult = await gitDDB.update(jsonUpdated);
    const fileOid = (await git.hashBlob({ object: toSortedJSONString(jsonUpdated) })).oid;
    const shortOid = fileOid.substr(0, SHORT_SHA_LENGTH);
    expect(putResult._id).toBe(_id);
    expect(putResult.fileOid).toBe(fileOid);
    expect(putResult.commit.message).toBe(`update: ${_id}${JSON_EXT}(${shortOid})`);

    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(gitDDB.workingDir(), _id + JSON_EXT);
    await expect(fs.access(filePath)).resolves.not.toThrowError();

    expect(fs.readFileSync(filePath, 'utf8')).toBe(toSortedJSONString(jsonUpdated));

    await gitDDB.destroy();
  });

  it('set a commitMessage by PutOptions', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const _id = 'prof01';
    const json = { _id, name: 'Shirase' };
    await gitDDB.insert(json);
    const commitMessage = 'message';
    const jsonUpdated = { _id: 'prof01', name: 'updated' };
    const putResult = await gitDDB.update(jsonUpdated, { commitMessage });
    const fileOid = (await git.hashBlob({ object: toSortedJSONString(jsonUpdated) })).oid;
    expect(putResult.commit.message).toBe(commitMessage);

    await gitDDB.destroy();
  });
});

describe('<index> update(_id, jsonDoc', () => {
  it('update a JSON file', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const _id = 'prof01';
    const json = { _id, name: 'Shirase' };
    await gitDDB.insert(json);
    const jsonUpdated = { _id, name: 'updated' };
    const putResult = await gitDDB.update('prof01', jsonUpdated);
    const fileOid = (await git.hashBlob({ object: toSortedJSONString(jsonUpdated) })).oid;
    const shortOid = fileOid.substr(0, SHORT_SHA_LENGTH);
    expect(putResult._id).toBe(_id);
    expect(putResult.fileOid).toBe(fileOid);
    expect(putResult.commit.message).toBe(`update: ${_id}${JSON_EXT}(${shortOid})`);

    // fs.access() throw error when a file cannot be accessed.
    const filePath = path.resolve(gitDDB.workingDir(), _id + JSON_EXT);
    await expect(fs.access(filePath)).resolves.not.toThrowError();

    expect(fs.readFileSync(filePath, 'utf8')).toBe(toSortedJSONString(jsonUpdated));

    await gitDDB.destroy();
  });

  it('set a commitMessage by PutOptions', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const _id = 'prof01';
    const json = { _id, name: 'Shirase' };
    await gitDDB.insert(json);
    const commitMessage = 'message';
    const jsonUpdated = { _id, name: 'updated' };
    const putResult = await gitDDB.update('prof01', jsonUpdated, { commitMessage });
    const fileOid = (await git.hashBlob({ object: toSortedJSONString(jsonUpdated) })).oid;
    expect(putResult.commit.message).toBe(commitMessage);

    await gitDDB.destroy();
  });
});

describe('<index> get()', () => {
  it('returns undefined if not exists', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const shortId = 'prof01';

    await expect(gitDDB.get(shortId)).resolves.toBeUndefined();
    await gitDDB.destroy();
  });

  it('returns the latest JsonDoc from deep collection', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const shortId = 'dir01/prof01';
    const fullDocPath = shortId + JSON_EXT;
    const json01 = { _id: shortId, name: 'v1' };
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json01));

    await expect(gitDDB.get(shortId)).resolves.toEqual(json01);
    await gitDDB.destroy();
  });

  it('ignores invalid getOptions', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const shortId = 'prof01';
    const fullDocPath = shortId + JSON_EXT;
    const json01 = { _id: shortId, name: 'v1' };
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json01));

    // @ts-ignore
    await expect(gitDDB.get(shortId, 'invalid')).resolves.toEqual(json01);
    await gitDDB.destroy();
  });
});

describe('<index> getFatDoc()', () => {
  it('returns the latest FatJsonDoc', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const shortId = 'prof01';
    const fullDocPath = shortId + JSON_EXT;
    const json01 = { _id: shortId, name: 'v1' };
    const json02 = { _id: shortId, name: 'v2' };
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json01));
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json02));

    await expect(gitDDB.getFatDoc(shortId)).resolves.toEqual({
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
    const shortId = 'prof01';

    await expect(gitDDB.getFatDoc(shortId)).resolves.toBeUndefined();
    await gitDDB.destroy();
  });
});

describe('<index> getByOid()', () => {
  it('returns the specified JsonDoc', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const shortId = 'dir01/prof01';
    const fullDocPath = shortId + JSON_EXT;
    const json01 = { _id: shortId, name: 'v1' };
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json01));
    const { oid } = await git.hashBlob({ object: toSortedJSONString(json01) });
    await expect(gitDDB.getByOid(oid)).resolves.toEqual(json01);
    await gitDDB.destroy();
  });

  it('returns undefined if oid does not exist', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const shortId = 'dir01/prof01';
    const fullDocPath = shortId + JSON_EXT;
    const json01 = { _id: shortId, name: 'v1' };
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json01));
    await expect(gitDDB.getByOid('not exist')).resolves.toBeUndefined();
    await gitDDB.destroy();
  });
});

describe('<index> getBackNumber()', () => {
  const dbName = monoId();
  const gitDDB: GitDocumentDB = new GitDocumentDB({
    dbName,
    localDir,
  });

  const targetId = '01';
  const fullDocPath = targetId + JSON_EXT;

  const json01 = { _id: targetId, name: 'v01' };
  const json02 = { _id: targetId, name: 'v02' };
  const json03 = { _id: targetId, name: 'v03' };
  const json04 = { _id: targetId, name: 'v04' };
  const json05 = { _id: targetId, name: 'v05' };
  const json06 = { _id: targetId, name: 'v06' };
  const json07 = { _id: targetId, name: 'v07' };
  const json08 = { _id: targetId, name: 'v08' };
  const json09 = { _id: targetId, name: 'v09' };
  const json10 = { _id: targetId, name: 'v10' };
  const json11 = { _id: targetId, name: 'v11' };
  const json12 = { _id: targetId, name: 'v12' };
  const json13 = { _id: targetId, name: 'v13' };
  const json14 = { _id: targetId, name: 'v14' };
  const json15 = { _id: targetId, name: 'v15' };
  const json16 = { _id: targetId, name: 'v16' };
  const json17 = { _id: targetId, name: 'v17' };

  before(async () => {
    await gitDDB.open();

    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json01)); // default

    await addOneData(
      gitDDB,
      fullDocPath,
      toSortedJSONString(json02),
      {
        name: 'authorA',
        email: 'authorEmailA',
      },
      {
        name: 'committerA',
        email: 'committerEmailA',
      }
    );

    await addOneData(
      gitDDB,
      fullDocPath,
      toSortedJSONString(json03),
      {
        name: 'authorA',
        email: 'authorEmailA',
      },
      {
        name: 'committerA',
        email: 'committerEmailB',
      }
    );

    await addOneData(
      gitDDB,
      fullDocPath,
      toSortedJSONString(json04),
      {
        name: 'authorA',
        email: 'authorEmailA',
      },
      {
        name: 'committerB',
        email: 'committerEmailA',
      }
    );

    await addOneData(
      gitDDB,
      fullDocPath,
      toSortedJSONString(json05),
      {
        name: 'authorA',
        email: 'authorEmailA',
      },
      {
        name: 'committerB',
        email: 'committerEmailB',
      }
    );

    await addOneData(
      gitDDB,
      fullDocPath,
      toSortedJSONString(json06),
      {
        name: 'authorA',
        email: 'authorEmailB',
      },
      {
        name: 'committerA',
        email: 'committerEmailA',
      }
    );

    await addOneData(
      gitDDB,
      fullDocPath,
      toSortedJSONString(json07),
      {
        name: 'authorA',
        email: 'authorEmailB',
      },
      {
        name: 'committerA',
        email: 'committerEmailB',
      }
    );

    await addOneData(
      gitDDB,
      fullDocPath,
      toSortedJSONString(json08),
      {
        name: 'authorA',
        email: 'authorEmailB',
      },
      {
        name: 'committerB',
        email: 'committerEmailA',
      }
    );

    await addOneData(
      gitDDB,
      fullDocPath,
      toSortedJSONString(json09),
      {
        name: 'authorA',
        email: 'authorEmailB',
      },
      {
        name: 'committerB',
        email: 'committerEmailB',
      }
    );

    await addOneData(
      gitDDB,
      fullDocPath,
      toSortedJSONString(json10),
      {
        name: 'authorB',
        email: 'authorEmailA',
      },
      {
        name: 'committerA',
        email: 'committerEmailA',
      }
    );

    await addOneData(
      gitDDB,
      fullDocPath,
      toSortedJSONString(json11),
      {
        name: 'authorB',
        email: 'authorEmailA',
      },
      {
        name: 'committerA',
        email: 'committerEmailB',
      }
    );

    await addOneData(
      gitDDB,
      fullDocPath,
      toSortedJSONString(json12),
      {
        name: 'authorB',
        email: 'authorEmailA',
      },
      {
        name: 'committerB',
        email: 'committerEmailA',
      }
    );

    await addOneData(
      gitDDB,
      fullDocPath,
      toSortedJSONString(json13),
      {
        name: 'authorB',
        email: 'authorEmailA',
      },
      {
        name: 'committerB',
        email: 'committerEmailB',
      }
    );

    await addOneData(
      gitDDB,
      fullDocPath,
      toSortedJSONString(json14),
      {
        name: 'authorB',
        email: 'authorEmailB',
      },
      {
        name: 'committerA',
        email: 'committerEmailA',
      }
    );

    await addOneData(
      gitDDB,
      fullDocPath,
      toSortedJSONString(json15),
      {
        name: 'authorB',
        email: 'authorEmailB',
      },
      {
        name: 'committerA',
        email: 'committerEmailB',
      }
    );

    await addOneData(
      gitDDB,
      fullDocPath,
      toSortedJSONString(json16),
      {
        name: 'authorB',
        email: 'authorEmailB',
      },
      {
        name: 'committerB',
        email: 'committerEmailA',
      }
    );

    await addOneData(
      gitDDB,
      fullDocPath,
      toSortedJSONString(json17),
      {
        name: 'authorB',
        email: 'authorEmailB',
      },
      {
        name: 'committerB',
        email: 'committerEmailB',
      }
    );
  });

  after(async () => {
    await gitDDB.destroy();
  });

  it('with author.name', async () => {
    await expect(
      gitDDB.getBackNumber(targetId, 0, {
        filter: [{ author: { name: 'authorA' } }],
      })
    ).resolves.toEqual({
      _id: targetId,
      type: 'json',
      fileOid: (await git.hashBlob({ object: toSortedJSONString(json09) })).oid,
      doc: json09,
    });

    await expect(
      gitDDB.getBackNumber(targetId, 1, {
        filter: [{ author: { name: 'authorA' } }],
      })
    ).resolves.toEqual({
      _id: targetId,
      type: 'json',
      fileOid: (await git.hashBlob({ object: toSortedJSONString(json08) })).oid,
      doc: json08,
    });
  });

  it('with committer.name', async () => {
    await expect(
      gitDDB.getBackNumber(targetId, 0, {
        filter: [{ committer: { name: 'committerA' } }],
      })
    ).resolves.toEqual({
      _id: targetId,
      type: 'json',
      fileOid: (await git.hashBlob({ object: toSortedJSONString(json15) })).oid,
      doc: json15,
    });

    await expect(
      gitDDB.getBackNumber(targetId, 1, {
        filter: [{ committer: { name: 'committerA' } }],
      })
    ).resolves.toEqual({
      _id: targetId,
      type: 'json',

      fileOid: (await git.hashBlob({ object: toSortedJSONString(json14) })).oid,
      doc: json14,
    });
  });

  it('with author.name, author.email, committer.name, and committer.email', async () => {
    await expect(
      gitDDB.getBackNumber(targetId, 0, {
        filter: [
          {
            author: { name: 'authorA', email: 'authorEmailA' },
            committer: { name: 'committerA', email: 'committerEmailA' },
          },
        ],
      })
    ).resolves.toEqual({
      _id: targetId,
      type: 'json',
      fileOid: (await git.hashBlob({ object: toSortedJSONString(json02) })).oid,
      doc: json02,
    });

    await expect(
      gitDDB.getBackNumber(targetId, 1, {
        filter: [
          {
            author: { name: 'authorA', email: 'authorEmailA' },
            committer: { name: 'committerA', email: 'committerEmailA' },
          },
        ],
      })
    ).resolves.toBeUndefined();
  });

  it('with OR condition', async () => {
    await expect(
      gitDDB.getBackNumber(targetId, 0, {
        filter: [
          { committer: { name: 'committerA', email: 'committerEmailA' } },
          { committer: { name: 'committerB', email: 'committerEmailB' } },
        ],
      })
    ).resolves.toEqual({
      _id: targetId,
      type: 'json',
      fileOid: (await git.hashBlob({ object: toSortedJSONString(json17) })).oid,
      doc: json17,
    });

    await expect(
      gitDDB.getBackNumber(targetId, 1, {
        filter: [
          { committer: { name: 'committerA', email: 'committerEmailA' } },
          { committer: { name: 'committerB', email: 'committerEmailB' } },
        ],
      })
    ).resolves.toEqual({
      _id: targetId,
      type: 'json',
      fileOid: (await git.hashBlob({ object: toSortedJSONString(json14) })).oid,
      doc: json14,
    });
  });
});

describe('<index> getHistory()', () => {
  it('gets all revisions', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();

    const _idA = 'profA';
    const jsonA01 = { _id: _idA, name: 'v01' };
    const jsonA02 = { _id: _idA, name: 'v02' };
    const jsonA03 = { _id: _idA, name: 'v03' };
    await gitDDB.put(jsonA01);
    await gitDDB.put(jsonA02);
    await gitDDB.put(jsonA03);
    const _idB = 'profB';
    const jsonB01 = { _id: _idB, name: 'v01' };
    const jsonB02 = { _id: _idB, name: 'v02' };
    await gitDDB.put(jsonB01);
    await gitDDB.put(jsonB02);
    // Get
    const historyA = await gitDDB.getHistory(_idA);
    expect(historyA.length).toBe(3);
    expect(historyA[0]?.doc).toMatchObject(jsonA03);
    expect(historyA[1]?.doc).toMatchObject(jsonA02);
    expect(historyA[2]?.doc).toMatchObject(jsonA01);
    const historyB = await gitDDB.getHistory(_idB);
    expect(historyB.length).toBe(2);
    expect(historyB[0]?.doc).toMatchObject(jsonB02);
    expect(historyB[1]?.doc).toMatchObject(jsonB01);

    await gitDDB.destroy();
  });

  it('gets filtered revisions', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const _idA = 'profA';
    const jsonA01 = { _id: _idA, name: 'v01' };
    const jsonA02 = { _id: _idA, name: 'v02' };
    const jsonA03 = { _id: _idA, name: 'v03' };

    gitDDB.author = { name: 'authorA', email: 'authorEmailA' };
    gitDDB.committer = { name: 'committerA', email: 'committerEmailA' };
    await gitDDB.put(jsonA01);

    gitDDB.author = { name: 'authorB', email: 'authorEmailB' };
    gitDDB.committer = { name: 'committerB', email: 'committerEmailB' };
    await gitDDB.put(jsonA02);
    await gitDDB.put(jsonA03);

    const _idB = 'profB';
    const jsonB01 = { _id: _idB, name: 'v01' };
    const jsonB02 = { _id: _idB, name: 'v02' };

    gitDDB.author = { name: 'authorA', email: 'authorEmailA' };
    gitDDB.committer = { name: 'committerA', email: 'committerEmailA' };
    await gitDDB.put(jsonB01);

    gitDDB.author = { name: 'authorB', email: 'authorEmailB' };
    gitDDB.committer = { name: 'committerB', email: 'committerEmailB' };
    await gitDDB.put(jsonB02);

    const historyA = await gitDDB.getHistory(_idA, {
      filter: [{ author: { name: 'authorB', email: 'authorEmailB' } }],
    });
    expect(historyA.length).toBe(2);
    expect(historyA[0]?.doc).toMatchObject(jsonA03);
    expect(historyA[1]?.doc).toMatchObject(jsonA02);

    const historyB = await gitDDB.getHistory(_idB, {
      filter: [{ author: { name: 'authorB', email: 'authorEmailB' } }],
    });
    expect(historyB.length).toBe(1);
    expect(historyB[0]?.doc).toMatchObject(jsonB02);

    await gitDDB.destroy();
  });

  it('gets empty revision', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const _idA = 'profA';
    const jsonA01 = { _id: _idA, name: 'v01' };
    await gitDDB.put(jsonA01);
    // Get
    const historyA = await gitDDB.getHistory('invalid_id');
    expect(historyA.length).toBe(0);

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
    await expect(gitDDB.getHistory('0')).rejects.toThrowError(DatabaseClosingError);

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
    await gitDDB.close();
    await expect(gitDDB.getHistory('tmp')).rejects.toThrowError(RepositoryNotOpenError);
    await gitDDB.destroy();
  });

  it('throws InvalidJsonObjectError.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    await gitDDB.put('1.json', 'invalid json');

    await expect(gitDDB.getHistory('1')).rejects.toThrowError(InvalidJsonObjectError);

    await gitDDB.destroy();
  });
});

describe('<index> delete()', () => {
  it('throws DocumentNotFoundError', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const _id = 'test/prof01';
    await expect(gitDDB.delete(_id)).rejects.toThrowError(DocumentNotFoundError);

    await gitDDB.destroy();
  });

  it('deletes a document by id.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const _id = 'test/prof01';
    const _id2 = 'test/prof02';

    const putResult = await gitDDB.put({ _id: _id, name: 'Shirase' });
    await gitDDB.put({ _id: _id2, name: 'Soya' });

    const shortOid = putResult.fileOid.substr(0, SHORT_SHA_LENGTH);
    // Delete
    const deleteResult = await gitDDB.delete(_id);
    expect(deleteResult._id).toBe(_id);
    expect(deleteResult.fileOid).toBe(putResult.fileOid);
    expect(deleteResult.commit.message).toBe(`delete: ${_id}${JSON_EXT}(${shortOid})`);

    // Check commit directly
    const commitOid = await git.resolveRef({ fs, dir: gitDDB.workingDir(), ref: 'HEAD' });
    const { commit } = await git.readCommit({
      fs,
      dir: gitDDB.workingDir(),
      oid: commitOid,
    });
    expect(commit.message).toEqual(`delete: ${_id}${JSON_EXT}(${shortOid})\n`);

    await expect(gitDDB.delete(_id)).rejects.toThrowError(DocumentNotFoundError);
    await expect(gitDDB.get(_id)).resolves.toBeUndefined();

    await gitDDB.delete(_id2);

    // Directory is empty
    await expect(
      fs.access(
        path.dirname(path.resolve(gitDDB.workingDir(), 'test', _id)),
        fs.constants.F_OK
      )
    ).rejects.toThrowError();

    await gitDDB.destroy();
  });

  it('deletes a document by JsonDoc.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const _id = 'dir01/prof01';
    const json = { _id: _id, name: 'shirase' };
    const innerJson = { _id, name: 'shirase' };
    const putResult = await gitDDB.put(json);

    const prevCommitOid = putResult.commit.oid;

    // Delete
    const { oid } = await git.hashBlob({ object: toSortedJSONString(innerJson) });
    const beforeTimestamp = Math.floor(Date.now() / 1000) * 1000;
    const deleteResult = await gitDDB.delete(json);
    const afterTimestamp = Math.floor(Date.now() / 1000) * 1000;

    const currentCommitOid = await git.resolveRef({
      fs,
      dir: gitDDB.workingDir(),
      ref: 'HEAD',
    });

    // Check NormalizedCommit
    expect(deleteResult.commit.oid).toBe(currentCommitOid);
    expect(deleteResult.commit.message).toBe(
      `delete: ${_id}${JSON_EXT}(${oid.substr(0, SHORT_SHA_LENGTH)})`
    );
    expect(deleteResult.commit.parent).toEqual([prevCommitOid]);
    expect(deleteResult.commit.author.name).toEqual(gitDDB.author.name);
    expect(deleteResult.commit.author.email).toEqual(gitDDB.author.email);
    expect(deleteResult.commit.author.timestamp.getTime()).toBeGreaterThanOrEqual(
      beforeTimestamp
    );
    expect(deleteResult.commit.author.timestamp.getTime()).toBeLessThanOrEqual(
      afterTimestamp
    );
    expect(deleteResult.commit.committer.name).toEqual(gitDDB.author.name);
    expect(deleteResult.commit.committer.email).toEqual(gitDDB.author.email);
    expect(deleteResult.commit.committer.timestamp.getTime()).toBeGreaterThanOrEqual(
      beforeTimestamp
    );
    expect(deleteResult.commit.committer.timestamp.getTime()).toBeLessThanOrEqual(
      afterTimestamp
    );

    await gitDDB.destroy();
  });

  it('modifies a commit message.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();

    const _id = 'test/prof01';
    await gitDDB.put({ _id: _id, name: 'shirase' });

    // Delete
    const commitMessage = 'my commit message';
    const deleteResult = await gitDDB.delete(_id, { commitMessage });

    expect(deleteResult.commit.message).toBe(commitMessage);

    // Check commit directly
    const commitOid = await git.resolveRef({ fs, dir: gitDDB.workingDir(), ref: 'HEAD' });
    const { commit } = await git.readCommit({
      fs,
      dir: gitDDB.workingDir(),
      oid: commitOid,
    });
    expect(commit.message).toEqual(`${commitMessage}\n`);

    await gitDDB.destroy();
  });
});
