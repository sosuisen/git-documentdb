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
import { FRONT_MATTER_POSTFIX, JSON_POSTFIX, YAML_POSTFIX } from '../src/const';
import { Collection, createCollection } from '../src/collection';
import { sleep, toFrontMatterMarkdown, toSortedJSONString, toYAML } from '../src/utils';
import { GitDocumentDB } from '../src/git_documentdb';
import { Err } from '../src/error';
import { addOneData, removeOneData } from './utils';

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
  it('throws DatabaseClosingError', async () => {
    const dbName = monoId();
    const gitDDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = createCollection(gitDDB, 'col01');
    for (let i = 0; i < 100; i++) {
      // put() will throw Error after the database is closed by force.
      col.put({ _id: i.toString(), name: i.toString() }).catch(() => {});
    }
    // Call close() without await
    gitDDB.close().catch(() => {});
    await expect(col.get('99')).rejects.toThrowError(Err.DatabaseClosingError);

    while (gitDDB.isClosing) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(100);
    }
    await gitDDB.destroy();
  });

  it('throws InvalidJsonObjectError', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = createCollection(gitDDB, 'col01');

    const shortId = 'prof01';
    const fullDocPath = col.collectionPath + shortId + JSON_POSTFIX;
    await addOneData(gitDDB, fullDocPath, 'invalid data');

    await expect(col.get(shortId)).rejects.toThrowError(Err.InvalidJsonObjectError);

    await gitDDB.destroy();
  });

  it('returns the latest JsonDoc', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = createCollection(gitDDB, 'col01');
    const shortId = 'prof01';
    const fullDocPath = col.collectionPath + shortId + JSON_POSTFIX;
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
    const col = createCollection(gitDDB, 'col01');
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
    const col = createCollection(gitDDB, 'col01');
    const shortId = 'prof01';
    const fullDocPath = col.collectionPath + shortId + JSON_POSTFIX;
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
    const col = createCollection(gitDDB, 'col01/col02/col03/');
    const shortId = 'dir01/prof01';
    const fullDocPath = col.collectionPath + shortId + JSON_POSTFIX;
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
    const col = createCollection(gitDDB, 'dir01/dir02/dir03');
    const shortId = 'prof01';
    const fullDocPath = col.collectionPath + shortId + JSON_POSTFIX;
    const json01 = { _id: shortId, name: 'v1' };
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json01));

    // @ts-ignore
    await expect(col.get(shortId, 'invalid')).resolves.toEqual(json01);
    await gitDDB.destroy();
  });

  describe('with front-matter', () => {
    it('returns front-matter', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
        serialize: 'front-matter',
      });

      await gitDDB.open();
      const shortId = 'foo';
      const shortName = shortId + FRONT_MATTER_POSTFIX;
      const fullDocPath = shortName;
      const json = { _id: shortId, name: 'var', _body: 'baz' };
      await addOneData(gitDDB, fullDocPath, toFrontMatterMarkdown(json)); // save foo.md

      await expect(gitDDB.get(shortId)).resolves.toEqual(json);

      await gitDDB.destroy();
    });

    it('returns foo.yml', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
        serialize: 'front-matter',
      });

      await gitDDB.open();
      const shortId = 'foo';
      const shortNameYAML = shortId + YAML_POSTFIX;
      const fullDocPathYAML = shortNameYAML;
      const jsonYAML = { _id: shortId, name: 'Shirase' };
      await addOneData(gitDDB, fullDocPathYAML, toYAML(jsonYAML)); // save foo.yml

      await expect(gitDDB.get(shortId)).resolves.toEqual(jsonYAML);

      await gitDDB.destroy();
    });

    it('returns foo.md if both foo.md and foo.yml exist', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
        serialize: 'front-matter',
      });

      await gitDDB.open();
      const shortId = 'foo';
      const shortNameYAML = shortId + YAML_POSTFIX;
      const fullDocPathYAML = shortNameYAML;
      const jsonYAML = { _id: shortId, name: 'Shirase' };
      await addOneData(gitDDB, fullDocPathYAML, toYAML(jsonYAML)); // save foo.yml

      const shortNameMD = shortId + FRONT_MATTER_POSTFIX;
      const fullDocPathMD = shortNameMD;
      const jsonMD = { _id: shortId, name: 'Shirase', _body: 'var' };
      await addOneData(gitDDB, fullDocPathMD, toFrontMatterMarkdown(jsonMD)); // save foo.md

      await expect(gitDDB.get(shortId)).resolves.toEqual(jsonMD);

      await gitDDB.destroy();
    });

    it('returns _body with _id when .md does not have front matter', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        dbName,
        localDir,
        serialize: 'front-matter',
      });

      await gitDDB.open();
      const shortId = 'foo';
      const shortNameMD = shortId + '.md';
      const fullDocPathMD = shortNameMD;
      const md = 'Hello';
      const jsonMD = { _id: 'foo', _body: md };
      await addOneData(gitDDB, fullDocPathMD, md); // save foo.md

      await expect(gitDDB.get(shortId)).resolves.toEqual(jsonMD);

      await gitDDB.destroy();
    });
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
    const col = createCollection(gitDDB);
    const shortId = 'prof01';
    const shortName = shortId + JSON_POSTFIX;
    const fullDocPath = col.collectionPath + shortId + JSON_POSTFIX;
    const json01 = { _id: shortId, name: 'v1' };
    const json02 = { _id: shortId, name: 'v2' };
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json01));
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json02));

    await expect(col.getFatDoc(shortName)).resolves.toEqual({
      _id: shortId,
      name: shortName,
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
    const col = createCollection(gitDDB);
    const shortId = 'prof01';
    const shortName = shortId + JSON_POSTFIX;

    await expect(col.getFatDoc(shortName)).resolves.toBeUndefined();
    await gitDDB.destroy();
  });
});

describe('<crud/get> getDocByOid()', () => {
  it('returns the specified JsonDoc', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = createCollection(gitDDB, 'col01/col02/col03/');
    const shortId = 'dir01/prof01';
    const fullDocPath = col.collectionPath + shortId + JSON_POSTFIX;
    const json01 = { _id: shortId, name: 'v1' };
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json01));
    const { oid } = await git.hashBlob({ object: toSortedJSONString(json01) });
    await expect(col.getDocByOid(oid, 'json')).resolves.toEqual(json01);
    await gitDDB.destroy();
  });

  it('returns undefined if oid does not exist', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = createCollection(gitDDB, 'col01/col02/col03/');
    const shortId = 'dir01/prof01';
    const fullDocPath = col.collectionPath + shortId + JSON_POSTFIX;
    const json01 = { _id: shortId, name: 'v1' };
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json01));
    await expect(col.getDocByOid('not exist', 'json')).resolves.toBeUndefined();
    await gitDDB.destroy();
  });

  it('returns JsonDoc without _id', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = createCollection(gitDDB, 'col01/col02/col03/');
    const shortId = 'dir01/prof01';
    const shortName = shortId + JSON_POSTFIX;
    const fullDocPath = col.collectionPath + shortName;
    // JsonDoc without _id
    const json01 = { name: 'v1' };
    await addOneData(gitDDB, fullDocPath, toSortedJSONString(json01));
    const { oid } = await git.hashBlob({ object: toSortedJSONString(json01) });
    await expect(col.getDocByOid(oid, 'json')).resolves.toEqual(json01);
    await gitDDB.destroy();
  });
});

describe('<crud/get>', () => {
  const dbName = monoId();
  const gitDDB: GitDocumentDB = new GitDocumentDB({
    dbName,
    localDir,
  });

  const targetId = '01';
  const targetName = targetId + JSON_POSTFIX;
  const collectionPath = 'col01/';
  const col = createCollection(gitDDB, collectionPath);
  const fullDocPath = collectionPath + targetId + JSON_POSTFIX;

  const json01 = { _id: collectionPath + targetId, name: 'v01' };
  const json02 = { _id: collectionPath + targetId, name: 'v02' };
  const json03 = { _id: collectionPath + targetId, name: 'v03' };
  const json04 = { _id: collectionPath + targetId, name: 'v04' };
  const json05 = { _id: collectionPath + targetId, name: 'v05' };
  const json06 = { _id: collectionPath + targetId, name: 'v06' };
  const json07 = { _id: collectionPath + targetId, name: 'v07' };
  const json08 = { _id: collectionPath + targetId, name: 'v08' };
  const json09 = { _id: collectionPath + targetId, name: 'v09' };
  const json10 = { _id: collectionPath + targetId, name: 'v10' };
  const json11 = { _id: collectionPath + targetId, name: 'v11' };
  const json12 = { _id: collectionPath + targetId, name: 'v12' };
  const json13 = { _id: collectionPath + targetId, name: 'v13' };
  const json14 = { _id: collectionPath + targetId, name: 'v14' };
  const json15 = { _id: collectionPath + targetId, name: 'v15' };
  const json16 = { _id: collectionPath + targetId, name: 'v16' };
  const json17 = { _id: collectionPath + targetId, name: 'v17' };

  const json01_ = { _id: targetId, name: 'v01' };
  const json02_ = { _id: targetId, name: 'v02' };
  const json03_ = { _id: targetId, name: 'v03' };
  const json04_ = { _id: targetId, name: 'v04' };
  const json05_ = { _id: targetId, name: 'v05' };
  const json06_ = { _id: targetId, name: 'v06' };
  const json07_ = { _id: targetId, name: 'v07' };
  const json08_ = { _id: targetId, name: 'v08' };
  const json09_ = { _id: targetId, name: 'v09' };
  const json10_ = { _id: targetId, name: 'v10' };
  const json11_ = { _id: targetId, name: 'v11' };
  const json12_ = { _id: targetId, name: 'v12' };
  const json13_ = { _id: targetId, name: 'v13' };
  const json14_ = { _id: targetId, name: 'v14' };
  const json15_ = { _id: targetId, name: 'v15' };
  const json16_ = { _id: targetId, name: 'v16' };
  const json17_ = { _id: targetId, name: 'v17' };

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

  describe('getFatDocOldRevision()', () => {
    it('with author.name', async () => {
      await expect(
        col.getFatDocOldRevision(targetName, 0, {
          filter: [{ author: { name: 'authorA' } }],
        })
      ).resolves.toEqual({
        _id: targetId,
        name: targetName,
        type: 'json',
        fileOid: (await git.hashBlob({ object: toSortedJSONString(json09) })).oid,
        doc: json09_,
      });

      await expect(
        col.getFatDocOldRevision(targetName, 1, {
          filter: [{ author: { name: 'authorA' } }],
        })
      ).resolves.toEqual({
        _id: targetId,
        name: targetName,
        type: 'json',
        fileOid: (await git.hashBlob({ object: toSortedJSONString(json08) })).oid,
        doc: json08_,
      });
    });

    it('with committer.name', async () => {
      await expect(
        col.getFatDocOldRevision(targetName, 0, {
          filter: [{ committer: { name: 'committerA' } }],
        })
      ).resolves.toEqual({
        _id: targetId,
        name: targetName,
        type: 'json',
        fileOid: (await git.hashBlob({ object: toSortedJSONString(json15) })).oid,
        doc: json15_,
      });

      await expect(
        col.getFatDocOldRevision(targetName, 1, {
          filter: [{ committer: { name: 'committerA' } }],
        })
      ).resolves.toEqual({
        _id: targetId,
        name: targetName,
        type: 'json',

        fileOid: (await git.hashBlob({ object: toSortedJSONString(json14) })).oid,
        doc: json14_,
      });
    });

    it('with author.name, author.email, committer.name, and committer.email', async () => {
      await expect(
        col.getFatDocOldRevision(targetName, 0, {
          filter: [
            {
              author: { name: 'authorA', email: 'authorEmailA' },
              committer: { name: 'committerA', email: 'committerEmailA' },
            },
          ],
        })
      ).resolves.toEqual({
        _id: targetId,
        name: targetName,
        type: 'json',
        fileOid: (await git.hashBlob({ object: toSortedJSONString(json02) })).oid,
        doc: json02_,
      });

      await expect(
        col.getFatDocOldRevision(targetName, 1, {
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
        col.getFatDocOldRevision(targetName, 0, {
          filter: [
            { committer: { name: 'committerA', email: 'committerEmailA' } },
            { committer: { name: 'committerB', email: 'committerEmailB' } },
          ],
        })
      ).resolves.toEqual({
        _id: targetId,
        name: targetName,
        type: 'json',
        fileOid: (await git.hashBlob({ object: toSortedJSONString(json17) })).oid,
        doc: json17_,
      });

      await expect(
        col.getFatDocOldRevision(targetName, 1, {
          filter: [
            { committer: { name: 'committerA', email: 'committerEmailA' } },
            { committer: { name: 'committerB', email: 'committerEmailB' } },
          ],
        })
      ).resolves.toEqual({
        _id: targetId,
        name: targetName,
        type: 'json',
        fileOid: (await git.hashBlob({ object: toSortedJSONString(json14) })).oid,
        doc: json14_,
      });
    });
  });

  describe('getOldRevision()', () => {
    it('with author.name, author.email, committer.name, and committer.email', async () => {
      await expect(
        col.getOldRevision(targetId, 0, {
          filter: [
            {
              author: { name: 'authorA', email: 'authorEmailA' },
              committer: { name: 'committerA', email: 'committerEmailA' },
            },
          ],
        })
      ).resolves.toEqual(json02_);

      await expect(
        col.getOldRevision(targetId, 1, {
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
        col.getOldRevision(targetId, 0, {
          filter: [
            { committer: { name: 'committerA', email: 'committerEmailA' } },
            { committer: { name: 'committerB', email: 'committerEmailB' } },
          ],
        })
      ).resolves.toEqual(json17_);

      await expect(
        col.getOldRevision(targetId, 1, {
          filter: [
            { committer: { name: 'committerA', email: 'committerEmailA' } },
            { committer: { name: 'committerB', email: 'committerEmailB' } },
          ],
        })
      ).resolves.toEqual(json14_);
    });
  });
});

describe('<crud/get> getFatDocHistory()', () => {
  it('gets all revisions', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const col = createCollection(gitDDB, 'col01');

    const _idA = 'profA';
    const shortNameA = _idA + JSON_POSTFIX;
    const jsonA01 = { _id: _idA, name: 'v01' };
    const jsonA02 = { _id: _idA, name: 'v02' };
    const jsonA03 = { _id: _idA, name: 'v03' };
    await col.put(jsonA01);
    await col.put(jsonA02);
    await col.put(jsonA03);
    const _idB = 'profB';
    const shortNameB = _idB + JSON_POSTFIX;
    const jsonB01 = { _id: _idB, name: 'v01' };
    const jsonB02 = { _id: _idB, name: 'v02' };
    await col.put(jsonB01);
    await col.put(jsonB02);
    // Get
    const historyA = await col.getFatDocHistory(shortNameA);
    expect(historyA.length).toBe(3);
    expect(historyA[0]?.doc).toMatchObject(jsonA03);
    expect(historyA[1]?.doc).toMatchObject(jsonA02);
    expect(historyA[2]?.doc).toMatchObject(jsonA01);
    const historyB = await col.getFatDocHistory(shortNameB);
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
    const col = createCollection(gitDDB, 'col01');
    const _idA = 'profA';
    const shortNameA = _idA + JSON_POSTFIX;
    const jsonA01 = { _id: _idA, name: 'v01' };
    const jsonA02 = { _id: _idA, name: 'v02' };
    const jsonA03 = { _id: _idA, name: 'v03' };

    gitDDB.author = { name: 'authorA', email: 'authorEmailA' };
    gitDDB.committer = { name: 'committerA', email: 'committerEmailA' };
    await col.put(jsonA01);

    gitDDB.author = { name: 'authorB', email: 'authorEmailB' };
    gitDDB.committer = { name: 'committerB', email: 'committerEmailB' };
    await col.put(jsonA02);
    await col.put(jsonA03);

    const _idB = 'profB';
    const shortNameB = _idB + JSON_POSTFIX;
    const jsonB01 = { _id: _idB, name: 'v01' };
    const jsonB02 = { _id: _idB, name: 'v02' };

    gitDDB.author = { name: 'authorA', email: 'authorEmailA' };
    gitDDB.committer = { name: 'committerA', email: 'committerEmailA' };
    await col.put(jsonB01);

    gitDDB.author = { name: 'authorB', email: 'authorEmailB' };
    gitDDB.committer = { name: 'committerB', email: 'committerEmailB' };
    await col.put(jsonB02);

    const historyA = await col.getFatDocHistory(shortNameA, {
      filter: [{ author: { name: 'authorB', email: 'authorEmailB' } }],
    });
    expect(historyA.length).toBe(2);
    expect(historyA[0]?.doc).toMatchObject(jsonA03);
    expect(historyA[1]?.doc).toMatchObject(jsonA02);

    const historyB = await col.getFatDocHistory(shortNameB, {
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
    const col = createCollection(gitDDB, 'col01');
    const _idA = 'profA';
    const jsonA01 = { _id: _idA, name: 'v01' };
    await col.put(jsonA01);
    // Get
    const historyA = await col.getFatDocHistory('invalid_id');
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
    const col = createCollection(gitDDB, 'col01');

    for (let i = 0; i < 100; i++) {
      // put() will throw Error after the database is closed by force.
      col.put({ _id: i.toString(), name: i.toString() }).catch(() => {});
    }
    // Call close() without await
    gitDDB.close().catch(() => {});
    await expect(col.getFatDocHistory('0.json')).rejects.toThrowError(
      Err.DatabaseClosingError
    );

    while (gitDDB.isClosing) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(100);
    }
    await gitDDB.destroy();
  });

  it('throws InvalidJsonObjectError.', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const col = createCollection(gitDDB, 'col01');
    await col.putFatDoc('1.json', 'invalid json');

    await expect(col.getFatDocHistory('1.json')).rejects.toThrowError(
      Err.InvalidJsonObjectError
    );

    await gitDDB.destroy();
  });
});

describe('<crud/get> getHistory()', () => {
  it('gets all revisions', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const col = createCollection(gitDDB, 'col01');

    const _idA = 'profA';
    const jsonA01 = { _id: _idA, name: 'v01' };
    const jsonA02 = { _id: _idA, name: 'v02' };
    const jsonA03 = { _id: _idA, name: 'v03' };
    await col.put(jsonA01);
    await col.put(jsonA02);
    await col.put(jsonA03);
    const _idB = 'profB';
    const jsonB01 = { _id: _idB, name: 'v01' };
    const jsonB02 = { _id: _idB, name: 'v02' };
    await col.put(jsonB01);
    await col.put(jsonB02);
    // Get
    const historyA = await col.getHistory(_idA);
    expect(historyA.length).toBe(3);
    expect(historyA[0]).toMatchObject(jsonA03);
    expect(historyA[1]).toMatchObject(jsonA02);
    expect(historyA[2]).toMatchObject(jsonA01);
    const historyB = await col.getHistory(_idB);
    expect(historyB.length).toBe(2);
    expect(historyB[0]).toMatchObject(jsonB02);
    expect(historyB[1]).toMatchObject(jsonB01);

    await gitDDB.destroy();
  });

  it('gets filtered revisions', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const col = createCollection(gitDDB, 'col01');
    const _idA = 'profA';
    const jsonA01 = { _id: _idA, name: 'v01' };
    const jsonA02 = { _id: _idA, name: 'v02' };
    const jsonA03 = { _id: _idA, name: 'v03' };

    gitDDB.author = { name: 'authorA', email: 'authorEmailA' };
    gitDDB.committer = { name: 'committerA', email: 'committerEmailA' };
    await col.put(jsonA01);

    gitDDB.author = { name: 'authorB', email: 'authorEmailB' };
    gitDDB.committer = { name: 'committerB', email: 'committerEmailB' };
    await col.put(jsonA02);
    await col.put(jsonA03);

    const _idB = 'profB';
    const jsonB01 = { _id: _idB, name: 'v01' };
    const jsonB02 = { _id: _idB, name: 'v02' };

    gitDDB.author = { name: 'authorA', email: 'authorEmailA' };
    gitDDB.committer = { name: 'committerA', email: 'committerEmailA' };
    await col.put(jsonB01);

    gitDDB.author = { name: 'authorB', email: 'authorEmailB' };
    gitDDB.committer = { name: 'committerB', email: 'committerEmailB' };
    await col.put(jsonB02);

    const historyA = await col.getHistory(_idA, {
      filter: [{ author: { name: 'authorB', email: 'authorEmailB' } }],
    });
    expect(historyA.length).toBe(2);
    expect(historyA[0]).toMatchObject(jsonA03);
    expect(historyA[1]).toMatchObject(jsonA02);

    const historyB = await col.getHistory(_idB, {
      filter: [{ author: { name: 'authorB', email: 'authorEmailB' } }],
    });
    expect(historyB.length).toBe(1);
    expect(historyB[0]).toMatchObject(jsonB02);

    await gitDDB.destroy();
  });

  it('gets empty revision', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });

    await gitDDB.open();
    const col = createCollection(gitDDB, 'col01');
    const _idA = 'profA';
    const jsonA01 = { _id: _idA, name: 'v01' };
    await col.put(jsonA01);
    // Get
    const historyA = await col.getHistory('invalid_id');
    expect(historyA.length).toBe(0);

    await gitDDB.destroy();
  });
});
