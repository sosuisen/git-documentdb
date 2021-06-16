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
import sinon from 'sinon';
import { IDocumentDB } from '../../src/types_gitddb';
import { sleep, toSortedJSONString } from '../../src/utils';
import {
  DatabaseClosingError,
  InvalidJsonObjectError,
  RepositoryNotOpenError,
} from '../../src/error';
import { GitDocumentDB } from '../../src/index';
import { getImpl } from '../../src/crud/get';
import { JSON_EXT } from '../../src/const';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const git_module = require('isomorphic-git');

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = './test/database_crud_get';

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

before(() => {
  fs.removeSync(path.resolve(localDir));
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

const removeOneData = async (gitDDB: IDocumentDB, fullDocPath: string, data: string) => {
  await git.remove({ fs, dir: gitDDB.workingDir(), filepath: fullDocPath });
  fs.removeSync(path.resolve(gitDDB.workingDir(), fullDocPath));
  await git.commit({
    fs,
    dir: gitDDB.workingDir(),
    message: 'message',
    author: gitDDB.author,
  });
};

describe('<crud/get> getImpl()', () => {
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
    await expect(getImpl(gitDDB, 'tmp', '', true)).rejects.toThrowError(
      DatabaseClosingError
    );
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
    await expect(getImpl(gitDDB, 'tmp', '', true)).rejects.toThrowError(
      RepositoryNotOpenError
    );
    await gitDDB.destroy();
  });

  it('throws InvalidJsonObjectError', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();

    const shortId = 'foo';
    const collectionPath = '';
    const fullDocPath = collectionPath + shortId + JSON_EXT;
    const data = 'invalid data'; // JSON.parse() will throw error
    await addOneData(gitDDB, fullDocPath, data);

    await expect(getImpl(gitDDB, shortId, collectionPath, true)).rejects.toThrowError(
      InvalidJsonObjectError
    );

    await gitDDB.destroy();
  });

  it('returns latest JsonDoc', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const shortId = 'prof01';
    const collectionPath = '';
    const fullDocPath = collectionPath + shortId + JSON_EXT;
    const json = { _id: shortId, name: 'Shirase' };
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json));
    await expect(getImpl(gitDDB, shortId, collectionPath, true)).resolves.toEqual(json);

    await gitDDB.destroy();
  });

  it('returns latest JsonDoc in subdirectory', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const shortId = 'dir01/prof01';
    const collectionPath = '';
    const fullDocPath = collectionPath + shortId + JSON_EXT;
    const json = { _id: shortId, name: 'Shirase' };
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json));
    await expect(getImpl(gitDDB, shortId, collectionPath, true)).resolves.toEqual(json);

    await gitDDB.destroy();
  });

  it('returns latest JsonDoc under deep collectionPath', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const shortId = 'dir01/prof01';
    const collectionPath = 'col01/col02/col03';
    const fullDocPath = collectionPath + shortId + JSON_EXT;
    const json = { _id: shortId, name: 'Shirase' };
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json));
    await expect(getImpl(gitDDB, shortId, collectionPath, true)).resolves.toEqual(json);

    await gitDDB.destroy();
  });

  it('returns undefined if db does not have commits.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await git.init({ fs, dir: gitDDB.workingDir() });
    const stubIsOpened = sandbox.stub(gitDDB, 'isOpened');
    stubIsOpened.returns(true);

    const shortId = 'prof01';
    const collectionPath = '';
    await expect(getImpl(gitDDB, shortId, collectionPath, true)).resolves.toBeUndefined();

    await gitDDB.destroy();
  });

  it('returns undefined if a document is not put.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();

    const shortId = 'dir01/prof01';
    const collectionPath = '';

    await expect(getImpl(gitDDB, shortId, collectionPath, true)).resolves.toBeUndefined();

    await gitDDB.destroy();
  });

  it('returns undefined if readBlob throws Error', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const shortId = 'prof01';
    const collectionPath = '';
    const fullDocPath = collectionPath + shortId + JSON_EXT;
    const json = { _id: shortId, name: 'Shirase' };
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json));

    const stubReadBlob = sandbox.stub(git_module, 'readBlob');
    stubReadBlob.rejects();

    await expect(getImpl(gitDDB, shortId, collectionPath, true)).resolves.toBeUndefined();

    await gitDDB.destroy();
  });

  it('returns a document by non-ASCII _id', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const shortId = '枕草子/春はあけぼの';
    const collectionPath = '';
    const fullDocPath = collectionPath + shortId + JSON_EXT;
    const json = { _id: shortId, name: 'Shirase' };
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json));
    await expect(getImpl(gitDDB, shortId, collectionPath, true)).resolves.toEqual(json);

    await gitDDB.destroy();
  });

  describe('with internalOptions', () => {
    it('returns latest JsonDoc by oid', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });

      await gitDDB.open();
      const shortId = 'prof01';
      const collectionPath = '';
      const fullDocPath = collectionPath + shortId + JSON_EXT;
      const json = { _id: shortId, name: 'Shirase' };
      const { oid } = await git.hashBlob({ object: toSortedJSONString(json) });
      await addOneData(gitDDB, fullDocPath, toSortedJSONString(json));
      await expect(
        getImpl(gitDDB, shortId, collectionPath, true, undefined, { oid })
      ).resolves.toEqual(json);

      await gitDDB.destroy();
    });

    it('returns latest FatJsonDoc', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });

      await gitDDB.open();
      const shortId = 'prof01';
      const collectionPath = '';
      const fullDocPath = collectionPath + shortId + JSON_EXT;
      const json = { _id: shortId, name: 'Shirase' };
      const { oid } = await git.hashBlob({ object: toSortedJSONString(json) });
      await addOneData(gitDDB, fullDocPath, toSortedJSONString(json));
      await expect(
        getImpl(gitDDB, shortId, collectionPath, true, undefined, { withMetadata: true })
      ).resolves.toEqual({
        _id: shortId,
        fileOid: oid,
        type: 'json',
        doc: json,
      });

      await gitDDB.destroy();
    });

    it('return undefined when back_number is less than 0.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });

      await gitDDB.open();
      const shortId = 'prof01';
      const collectionPath = '';
      const fullDocPath = collectionPath + shortId + JSON_EXT;
      const json = { _id: shortId, name: 'Shirase' };
      await addOneData(gitDDB, fullDocPath, toSortedJSONString(json));

      await expect(
        getImpl(gitDDB, shortId, collectionPath, true, undefined, { backNumber: -1 })
      ).resolves.toBeUndefined();

      await gitDDB.destroy();
    });

    it('returns undefined when get deleted document with backNumber #0.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });

      await gitDDB.open();
      const shortId = 'prof01';
      const collectionPath = '';
      const fullDocPath = collectionPath + shortId + JSON_EXT;
      const json = { _id: shortId, name: 'Shirase' };
      await addOneData(gitDDB, fullDocPath, toSortedJSONString(json));
      await removeOneData(gitDDB, fullDocPath, toSortedJSONString(json));

      await expect(
        getImpl(gitDDB, shortId, collectionPath, true, undefined, { backNumber: 0 })
      ).resolves.toBeUndefined();

      await gitDDB.destroy();
    });

    it('returns one revision before when get back number #1 of the deleted document.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });

      await gitDDB.open();
      const shortId = 'prof01';
      const collectionPath = '';
      const fullDocPath = collectionPath + shortId + JSON_EXT;
      const json = { _id: shortId, name: 'Shirase' };
      await addOneData(gitDDB, fullDocPath, toSortedJSONString(json));
      await removeOneData(gitDDB, fullDocPath, toSortedJSONString(json));

      await expect(
        getImpl(gitDDB, shortId, collectionPath, true, undefined, { backNumber: 1 })
      ).resolves.toEqual(json);

      await gitDDB.destroy();
    });

    it('returns two revisions before when get back number #2 of the deleted document.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });

      await gitDDB.open();
      const shortId = 'prof01';
      const collectionPath = '';
      const fullDocPath = collectionPath + shortId + JSON_EXT;
      const json01 = { _id: shortId, name: 'v01' };
      const json02 = { _id: shortId, name: 'v02' };
      await addOneData(gitDDB, fullDocPath, toSortedJSONString(json01));
      await addOneData(gitDDB, fullDocPath, toSortedJSONString(json02));
      await removeOneData(gitDDB, fullDocPath, toSortedJSONString(json02));

      await expect(
        getImpl(gitDDB, shortId, collectionPath, true, undefined, { backNumber: 2 })
      ).resolves.toEqual(json01);

      await gitDDB.destroy();
    });

    it('returns an old revision after a document was deleted and created again.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });

      await gitDDB.open();
      const shortId = 'prof01';
      const collectionPath = '';
      const fullDocPath = collectionPath + shortId + JSON_EXT;
      const json01 = { _id: shortId, name: 'v01' };
      const json02 = { _id: shortId, name: 'v02' };
      await addOneData(gitDDB, fullDocPath, toSortedJSONString(json01));
      await removeOneData(gitDDB, fullDocPath, toSortedJSONString(json01));
      await addOneData(gitDDB, fullDocPath, toSortedJSONString(json02));

      await expect(
        getImpl(gitDDB, shortId, collectionPath, true, undefined, { backNumber: 2 })
      ).resolves.toEqual(json01);

      await gitDDB.destroy();
    });

    it('returns undefined when get document with backNumber that was deleted once', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });

      await gitDDB.open();
      const shortId = 'prof01';
      const collectionPath = '';
      const fullDocPath = collectionPath + shortId + JSON_EXT;
      const json01 = { _id: shortId, name: 'v01' };
      const json02 = { _id: shortId, name: 'v02' };
      await addOneData(gitDDB, fullDocPath, toSortedJSONString(json01));
      await removeOneData(gitDDB, fullDocPath, toSortedJSONString(json01));
      await addOneData(gitDDB, fullDocPath, toSortedJSONString(json02));

      await expect(
        getImpl(gitDDB, shortId, collectionPath, true, undefined, { backNumber: 1 })
      ).resolves.toBeUndefined();

      await gitDDB.destroy();
    });

    it('returns undefined when get document with backNumber that does not exist', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });

      await gitDDB.open();
      const shortId = 'prof01';
      const collectionPath = '';
      const fullDocPath = collectionPath + shortId + JSON_EXT;
      const json01 = { _id: shortId, name: 'v01' };
      const json02 = { _id: shortId, name: 'v02' };
      await addOneData(gitDDB, fullDocPath, toSortedJSONString(json01));
      await removeOneData(gitDDB, fullDocPath, toSortedJSONString(json01));
      await addOneData(gitDDB, fullDocPath, toSortedJSONString(json02));

      await expect(
        getImpl(gitDDB, shortId, collectionPath, true, undefined, { backNumber: 3 })
      ).resolves.toBeUndefined();

      await gitDDB.destroy();
    });

    it('returns undefined if a document is not put.', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });

      await gitDDB.open();
      const shortId = 'prof01';
      const collectionPath = '';

      await expect(
        getImpl(gitDDB, shortId, collectionPath, true, undefined, { backNumber: 0 })
      ).resolves.toBeUndefined();

      await gitDDB.destroy();
    });

    it('returns undefined if readBlob throws Error', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
      });

      await gitDDB.open();
      const shortId = 'prof01';
      const collectionPath = '';
      const fullDocPath = collectionPath + shortId + JSON_EXT;
      const json = { _id: shortId, name: 'Shirase' };
      await addOneData(gitDDB, fullDocPath, toSortedJSONString(json));

      const stubReadBlob = sandbox.stub(git_module, 'readBlob');
      stubReadBlob.rejects();

      await expect(
        getImpl(gitDDB, shortId, collectionPath, true, undefined, { backNumber: 0 })
      ).resolves.toBeUndefined();

      await gitDDB.destroy();
    });
  });

  describe('returns a revision filtered by historyOptions', () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    const targetId = '01';
    const collectionPath = '';
    const fullDocPath = collectionPath + targetId + JSON_EXT;

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

    it('with author.name, author.email, committer.name, and committer.email', async () => {
      await expect(
        getImpl(
          gitDDB,
          targetId,
          collectionPath,
          true,
          undefined,
          { backNumber: 0 },
          {
            filter: [
              {
                author: { name: 'authorA', email: 'authorEmailA' },
                committer: { name: 'committerA', email: 'committerEmailA' },
              },
            ],
          }
        )
      ).resolves.toEqual(json02);

      await expect(
        getImpl(
          gitDDB,
          targetId,
          collectionPath,
          true,
          undefined,
          { backNumber: 1 },
          {
            filter: [
              {
                author: { name: 'authorA', email: 'authorEmailA' },
                committer: { name: 'committerA', email: 'committerEmailA' },
              },
            ],
          }
        )
      ).resolves.toBeUndefined();
    });

    it('with OR condition', async () => {
      await expect(
        getImpl(
          gitDDB,
          targetId,
          collectionPath,
          true,
          undefined,
          { backNumber: 0 },
          {
            filter: [
              { committer: { name: 'committerA', email: 'committerEmailA' } },
              { committer: { name: 'committerB', email: 'committerEmailB' } },
            ],
          }
        )
      ).resolves.toEqual(json17);

      await expect(
        getImpl(
          gitDDB,
          targetId,
          collectionPath,
          true,
          undefined,
          { backNumber: 1 },
          {
            filter: [
              { committer: { name: 'committerA', email: 'committerEmailA' } },
              { committer: { name: 'committerB', email: 'committerEmailB' } },
            ],
          }
        )
      ).resolves.toEqual(json14);
    });
  });
});
