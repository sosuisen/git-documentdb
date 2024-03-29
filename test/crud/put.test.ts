/* eslint-disable @typescript-eslint/naming-convention */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import { readFileSync } from 'fs';
import git from 'isomorphic-git';
import expect from 'expect';
import fs from 'fs-extra';
import sinon from 'sinon';
import { monotonicFactory } from 'ulid';
import { Err } from '../../src/error';
import { GitDocumentDB } from '../../src/git_documentdb';
import { putImpl, putWorker } from '../../src/crud/put';
import { JSON_POSTFIX, SHORT_SHA_LENGTH } from '../../src/const';
import { sleep, toSortedJSONString } from '../../src/utils';
import { TaskMetadata } from '../../src/types';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs_module = require('fs-extra');

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = `./test/database_crud_put`;

// Use sandbox to restore stub and spy in parallel mocha tests
let sandbox: sinon.SinonSandbox;
beforeEach(function () {
  // @ts-ignore
  console.log(`... ${this.currentTest.fullTitle()}`);
  sandbox = sinon.createSandbox();
  fs.removeSync(path.resolve(localDir));
});

afterEach(function () {
  sandbox.restore();
});

after(() => {
  fs.removeSync(path.resolve(localDir));
});

describe('<crud/put> put', () => {
  it('causes DatabaseClosingError', async () => {
    const dbName = monoId();
    const gitDDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();

    for (let i = 0; i < 50; i++) {
      // put() will throw Error after the database is closed by force.
      gitDDB.put({ _id: i.toString(), name: i.toString() }).catch(() => {});
    }
    // Call close() without await
    gitDDB.close().catch(() => {});
    const _id = 'prof01';
    await expect(
      putImpl(
        gitDDB,
        '',
        _id,
        _id + JSON_POSTFIX,
        toSortedJSONString({ _id, name: 'shirase' })
      )
    ).rejects.toThrowError(Err.DatabaseClosingError);

    // wait close
    while (gitDDB.isClosing) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(1000);
    }
    await gitDDB.destroy();
  });

  it('returns picked PutResult', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const prevCommitOid = await git.resolveRef({
      fs,
      dir: gitDDB.workingDir,
      ref: 'HEAD',
    });

    const _id = 'prof01';
    const json = { _id, name: 'Shirase' };

    const beforeTimestamp = Math.floor(Date.now() / 1000) * 1000;
    const pickedPutResult = await putImpl(
      gitDDB,
      '',
      _id,
      _id + JSON_POSTFIX,
      toSortedJSONString(json)
    );
    const afterTimestamp = Math.floor(Date.now() / 1000) * 1000;

    const currentCommitOid = await git.resolveRef({
      fs,
      dir: gitDDB.workingDir,
      ref: 'HEAD',
    });

    const { oid } = await git.hashBlob({ object: toSortedJSONString(json) });
    expect(pickedPutResult.fileOid).toBe(oid);

    // Check NormalizedCommit
    expect(pickedPutResult.commit.oid).toBe(currentCommitOid);
    expect(pickedPutResult.commit.message).toBe(
      `insert: ${_id}${JSON_POSTFIX}(${oid.substr(0, SHORT_SHA_LENGTH)})`
    );
    expect(pickedPutResult.commit.parent).toEqual([prevCommitOid]);
    expect(pickedPutResult.commit.author.name).toEqual(gitDDB.author.name);
    expect(pickedPutResult.commit.author.email).toEqual(gitDDB.author.email);
    expect(pickedPutResult.commit.author.timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
    expect(pickedPutResult.commit.author.timestamp).toBeLessThanOrEqual(afterTimestamp);
    expect(pickedPutResult.commit.committer.name).toEqual(gitDDB.author.name);
    expect(pickedPutResult.commit.committer.email).toEqual(gitDDB.author.email);
    expect(pickedPutResult.commit.committer.timestamp).toBeGreaterThanOrEqual(
      beforeTimestamp
    );
    expect(pickedPutResult.commit.committer.timestamp).toBeLessThanOrEqual(afterTimestamp);

    await gitDDB.destroy();
  });

  it('commits with a default commit message (insert)', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const _id = 'prof01';
    const json = { _id, name: 'Shirase' };
    const pickedPutResult = await putImpl(
      gitDDB,
      '',
      _id,
      _id + JSON_POSTFIX,
      toSortedJSONString(json)
    );

    const shortOid = pickedPutResult.fileOid.substr(0, SHORT_SHA_LENGTH);
    expect(pickedPutResult.commit.message).toEqual(
      `insert: ${_id}${JSON_POSTFIX}(${shortOid})`
    );

    // Check commit directly
    const commitOid = await git.resolveRef({ fs, dir: gitDDB.workingDir, ref: 'HEAD' });
    const { commit } = await git.readCommit({
      fs,
      dir: gitDDB.workingDir,
      oid: commitOid,
    });
    expect(commit.message).toEqual(`insert: ${_id}${JSON_POSTFIX}(${shortOid})\n`);
    await gitDDB.destroy();
  });

  it('commits with a default commit message (update)', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const _id = 'prof01';
    const json = { _id, name: 'Shirase' };
    await putImpl(gitDDB, '', _id, _id + JSON_POSTFIX, toSortedJSONString(json));
    // update
    const pickedPutResult = await putImpl(
      gitDDB,
      '',
      _id,
      _id + JSON_POSTFIX,
      toSortedJSONString(json)
    );

    const shortOid = pickedPutResult.fileOid.substr(0, SHORT_SHA_LENGTH);
    expect(pickedPutResult.commit.message).toEqual(
      `update: ${_id}${JSON_POSTFIX}(${shortOid})`
    );

    // Check commit directly
    const commitOid = await git.resolveRef({ fs, dir: gitDDB.workingDir, ref: 'HEAD' });
    const { commit } = await git.readCommit({
      fs,
      dir: gitDDB.workingDir,
      oid: commitOid,
    });
    expect(commit.message).toEqual(`update: ${_id}${JSON_POSTFIX}(${shortOid})\n`);
    await gitDDB.destroy();
  });

  it('commits a sub-directory document with a default commit message', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const _id = 'dir01/prof01';
    const json = { _id: _id, name: 'Shirase' };
    const pickedPutResult = await putImpl(
      gitDDB,
      '',
      _id,
      _id + JSON_POSTFIX,
      toSortedJSONString(json)
    );
    const shortOid = pickedPutResult.fileOid.substr(0, SHORT_SHA_LENGTH);
    const defaultCommitMessage = `insert: ${_id}${JSON_POSTFIX}(${shortOid})`;
    expect(pickedPutResult.commit.message).toEqual(defaultCommitMessage);

    // Check commit directly
    const commitOid = await git.resolveRef({ fs, dir: gitDDB.workingDir, ref: 'HEAD' });
    const { commit } = await git.readCommit({
      fs,
      dir: gitDDB.workingDir,
      oid: commitOid,
    });
    expect(commit.message).toEqual(`${defaultCommitMessage}\n`);
    await gitDDB.destroy();
  });

  it('returns results in order', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();

    const results: number[] = [];
    const validResults: number[] = [];
    for (let i = 0; i < 100; i++) {
      validResults.push(i);
      putImpl(
        gitDDB,
        '',
        i.toString(),
        i.toString() + JSON_POSTFIX,
        toSortedJSONString({ _id: i.toString() }),
        {
          commitMessage: `${i}`,
        }
      )
        .then(res => results.push(Number.parseInt(res.commit.message, 10)))
        .catch(() => {});
    }
    // close() can wait results of all Promises if timeout is set to large number.
    await gitDDB.close({ timeout: 100 * 1000 });

    // put() methods are called asynchronously, but the results must be arranged in order.
    expect(toSortedJSONString(results)).toEqual(toSortedJSONString(validResults));
    await gitDDB.destroy();
  });

  it('commits a given commit message', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const _id = 'dir01/prof01';
    const json = { _id: _id, name: 'Shirase' };
    const myCommitMessage = 'my commit message';
    const pickedPutResult = await putImpl(
      gitDDB,
      '',
      _id,
      _id + JSON_POSTFIX,
      toSortedJSONString(json),
      {
        commitMessage: myCommitMessage,
      }
    );

    expect(pickedPutResult.commit.message).toEqual(myCommitMessage);

    const commitOid = await git.resolveRef({ fs, dir: gitDDB.workingDir, ref: 'HEAD' });
    const { commit } = await git.readCommit({
      fs,
      dir: gitDDB.workingDir,
      oid: commitOid,
    });
    expect(commit.message).toEqual(`${myCommitMessage}\n`);
    await gitDDB.destroy();
  });

  it('runs asynchronously', async () => {
    const _id_a = 'apple';
    const name_a = 'Apple woman';
    const _id_b = 'banana';
    const name_b = 'Banana man';

    const _id_c01 = 'citrus/amanatsu';
    const name_c01 = 'Amanatsu boy';
    const _id_c02 = 'citrus/yuzu';
    const name_c02 = 'Yuzu girl';
    const _id_d = 'durio/durian';
    const name_d = 'Durian girls';
    const _id_p = 'pear/Japan/21st';
    const name_p = '21st century pear';

    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();

    const json_a = { _id: _id_a, name: name_a };
    const json_b = { _id: _id_b, name: name_b };
    const json_c01 = { _id: _id_c01, name: name_c01 };
    const json_c02 = { _id: _id_c02, name: name_c02 };
    const json_d = { _id: _id_d, name: name_d };
    const json_p = { _id: _id_p, name: name_p };

    await Promise.all([
      putImpl(gitDDB, '', _id_a, _id_a + JSON_POSTFIX, toSortedJSONString(json_a)),
      putImpl(gitDDB, '', _id_b, _id_b + JSON_POSTFIX, toSortedJSONString(json_b)),
      putImpl(gitDDB, '', _id_c01, _id_c01 + JSON_POSTFIX, toSortedJSONString(json_c01)),
      putImpl(gitDDB, '', _id_c02, _id_c02 + JSON_POSTFIX, toSortedJSONString(json_c02)),
      putImpl(gitDDB, '', _id_d, _id_d + JSON_POSTFIX, toSortedJSONString(json_d)),
      putImpl(gitDDB, '', _id_p, _id_p + JSON_POSTFIX, toSortedJSONString(json_p)),
    ]);

    await expect(gitDDB.findFatDoc()).resolves.toEqual(
      expect.arrayContaining([
        {
          _id: _id_a,
          name: _id_a + JSON_POSTFIX,
          fileOid: (await git.hashBlob({ object: toSortedJSONString(json_a) })).oid,
          type: 'json',
          doc: json_a,
        },
        {
          _id: _id_b,
          name: _id_b + JSON_POSTFIX,
          fileOid: (await git.hashBlob({ object: toSortedJSONString(json_b) })).oid,
          type: 'json',
          doc: json_b,
        },
        {
          _id: _id_c01,
          name: _id_c01 + JSON_POSTFIX,
          fileOid: (await git.hashBlob({ object: toSortedJSONString(json_c01) })).oid,
          type: 'json',
          doc: json_c01,
        },
        {
          _id: _id_c02,
          name: _id_c02 + JSON_POSTFIX,
          fileOid: (await git.hashBlob({ object: toSortedJSONString(json_c02) })).oid,
          type: 'json',
          doc: json_c02,
        },
        {
          _id: _id_d,
          name: _id_d + JSON_POSTFIX,
          fileOid: (await git.hashBlob({ object: toSortedJSONString(json_d) })).oid,
          type: 'json',
          doc: json_d,
        },
        {
          _id: _id_p,
          name: _id_p + JSON_POSTFIX,
          fileOid: (await git.hashBlob({ object: toSortedJSONString(json_p) })).oid,
          type: 'json',
          doc: json_p,
        },
      ])
    );

    await gitDDB.destroy();
  });

  it('can run 100 times repeatedly', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();

    const workers = [];
    for (let i = 0; i < 100; i++) {
      workers.push(
        putImpl(
          gitDDB,
          '',
          i.toString(),
          i.toString() + JSON_POSTFIX,
          toSortedJSONString({ _id: i.toString() })
        )
      );
    }
    await expect(Promise.all(workers)).resolves.toHaveLength(100);

    const fatDocs = await gitDDB.find();
    expect(fatDocs.length).toBe(100);

    await gitDDB.destroy();
  });

  it('can be called asynchronously but is executed in order', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();

    const workers = [];
    for (let i = 0; i < 99; i++) {
      // putImpl() Promises are queued
      // They have not await keyword
      putImpl(
        gitDDB,
        '',
        i.toString(),
        i.toString() + JSON_POSTFIX,
        toSortedJSONString({ _id: i.toString() })
      );
    }
    // The last put() with await keyword is resolved after all preceding (queued) Promises
    await putImpl(gitDDB, '', '99', '99' + JSON_POSTFIX, toSortedJSONString({ _id: '99' }));
    const fatDocs = await gitDDB.find();
    expect(fatDocs.length).toBe(100);

    await gitDDB.destroy();
  });

  it('set taskId', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const enqueueEvent: TaskMetadata[] = [];
    const id1 = gitDDB.taskQueue.newTaskId();
    const id2 = gitDDB.taskQueue.newTaskId();
    await putImpl(gitDDB, '', '1', '1' + JSON_POSTFIX, toSortedJSONString({ _id: '1' }), {
      taskId: id1,
      enqueueCallback: (taskMetadata: TaskMetadata) => {
        enqueueEvent.push(taskMetadata);
      },
    });
    await putImpl(gitDDB, '', '2', '2' + JSON_POSTFIX, toSortedJSONString({ _id: '2' }), {
      taskId: id2,
      enqueueCallback: (taskMetadata: TaskMetadata) => {
        enqueueEvent.push(taskMetadata);
      },
    });
    await sleep(2000);
    expect(enqueueEvent[0].taskId).toBe(id1);
    expect(enqueueEvent[1].taskId).toBe(id2);

    await gitDDB.destroy();
  });

  it('throws TaskCancelError', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();

    const workers = [];
    let taskCancelErrorCount = 0;
    for (let i = 0; i < 50; i++) {
      putImpl(
        gitDDB,
        '',
        i.toString(),
        i.toString() + JSON_POSTFIX,
        toSortedJSONString({ _id: i.toString() })
      ).catch(
        // eslint-disable-next-line no-loop-func
        err => {
          if (err instanceof Err.TaskCancelError) taskCancelErrorCount++;
        }
      );
    }
    gitDDB.taskQueue.stop();
    await sleep(3000);
    expect(taskCancelErrorCount).toBeGreaterThan(0);
    await gitDDB.destroy();
  });
});

describe('<crud/put> put FatTextDoc', () => {
  it('write text into .md without front-matter option', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const txt = 'Hello, world!';
    const fullDocPath = 'foo.md';
    await gitDDB.putFatDoc(fullDocPath, txt);
    expect(readFileSync(path.resolve(gitDDB.workingDir, fullDocPath), 'utf8')).toBe(txt);

    await gitDDB.close();
    await gitDDB.destroy();
  });

  it('write YAML into .yml without front-matter option', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const yaml = `
_id: foo
a: aaa
b: bbb
`;
    const fullDocPath = 'foo.yml';
    await gitDDB.putFatDoc(fullDocPath, yaml);
    expect(readFileSync(path.resolve(gitDDB.workingDir, fullDocPath), 'utf8')).toBe(yaml);

    await gitDDB.close();
    await gitDDB.destroy();
  });
});

describe('<crud/put> put to front matter', () => {
  it('write sorted front matter with markdown', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
      serialize: 'front-matter',
    });
    await gitDDB.open();
    await gitDDB.put({
      b: 'bbb',
      a: 'aaa',
      _id: 'foo',
      _body: 'This is a body text.\nThe second line.',
      c: 'ccc',
      array: [1, 2, 3],
    });
    const result = `---
_id: foo
a: aaa
array:
  - 1
  - 2
  - 3
b: bbb
c: ccc
---
This is a body text.
The second line.`;
    const fullDocPath = 'foo.md';
    expect(readFileSync(path.resolve(gitDDB.workingDir, fullDocPath), 'utf8')).toBe(result);

    await gitDDB.close();
    await gitDDB.destroy();
  });

  it('write hierarchical front matter with markdown', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
      serialize: 'front-matter',
    });
    await gitDDB.open();
    await gitDDB.put({
      a: {
        a_1: 'a-1',
        a_2: 'a-2',
      },
      b: [{ b_1: 'b-1' }, { b_2: 'b-2' }],
      _id: 'foo',
      _body: 'This is a body text.\nThe second line.',
    });
    const result = `---
_id: foo
a:
  a_1: a-1
  a_2: a-2
b:
  - b_1: b-1
  - b_2: b-2
---
This is a body text.
The second line.`;
    const fullDocPath = 'foo.md';
    expect(readFileSync(path.resolve(gitDDB.workingDir, fullDocPath), 'utf8')).toBe(result);

    await gitDDB.close();
    await gitDDB.destroy();
  });

  it('write non-ASCII front matter with markdown', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
      serialize: 'front-matter',
    });
    await gitDDB.open();
    await gitDDB.put({
      a: '春はあけぼの',
      _id: 'foo',
      _body:
        'やうやう白くなりゆく山ぎは、すこしあかりて、紫だちたる雲のほそくたなびきたる。',
    });
    const result = `---
_id: foo
a: 春はあけぼの
---
やうやう白くなりゆく山ぎは、すこしあかりて、紫だちたる雲のほそくたなびきたる。`;
    const fullDocPath = 'foo.md';
    expect(readFileSync(path.resolve(gitDDB.workingDir, fullDocPath), 'utf8')).toBe(result);

    await gitDDB.close();
    await gitDDB.destroy();
  });

  it('write yaml when no markdown', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
      serialize: 'front-matter',
    });
    await gitDDB.open();
    await gitDDB.put({
      _id: 'foo',
      a: 'bar',
    });
    const result = `_id: foo
a: bar
`;
    const fullDocPath = 'foo.yml';
    expect(readFileSync(path.resolve(gitDDB.workingDir, fullDocPath), 'utf8')).toBe(result);

    await gitDDB.close();
    await gitDDB.destroy();
  });

  it('write markdown without front matter', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
      serialize: 'front-matter',
    });
    await gitDDB.open();
    await gitDDB.put({
      _id: 'foo',
      _body: 'bar\nbaz',
    });
    const result = `bar
baz`;
    const fullDocPath = 'foo.md';
    expect(readFileSync(path.resolve(gitDDB.workingDir, fullDocPath), 'utf8')).toBe(result);

    await gitDDB.close();
    await gitDDB.destroy();
  });
});

describe('<crud/put> putWorker', () => {
  it('throws UndefinedDBError when Undefined DB', async () => {
    // @ts-ignore
    await expect(putWorker(undefined)).rejects.toThrowError(Err.UndefinedDBError);
  });

  it('throws CannotCreateDirectoryError', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();

    const stubEnsureDir = sandbox.stub(fs_module, 'ensureDir');
    stubEnsureDir.rejects();

    await expect(
      putWorker(
        gitDDB,
        '',
        'prof01' + JSON_POSTFIX,
        '{ "_id": "prof01", "name": "Shirase" }',
        'message'
      )
    ).rejects.toThrowError(Err.CannotCreateDirectoryError);
    await gitDDB.destroy();
  });

  it('throws SameIdExistsError', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const fullDocPath = 'prof01' + JSON_POSTFIX;
    await putWorker(
      gitDDB,
      '',
      fullDocPath,
      '{ "_id": "prof01", "name": "Shirase" }',
      'message'
    );
    await expect(
      putWorker(
        gitDDB,
        '',
        fullDocPath,
        '{ "_id": "prof01", "name": "Shirase" }',
        'message',
        'insert'
      )
    ).rejects.toThrowError(Err.SameIdExistsError);
    await gitDDB.destroy();
  });

  it('throws DocumentNotFoundError', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const fullDocPath = 'prof01' + JSON_POSTFIX;
    await expect(
      putWorker(
        gitDDB,
        '',
        fullDocPath,
        '{ "_id": "prof01", "name": "Shirase" }',
        'message',
        'update'
      )
    ).rejects.toThrowError(Err.DocumentNotFoundError);
    await gitDDB.destroy();
  });

  it('throws CannotWriteDataError', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();
    const _id = 'prof01';
    // Check put operation
    const stubWriteFile = sandbox.stub(fs_module, 'writeFile');
    stubWriteFile.rejects();

    await expect(gitDDB.put({ _id: _id, name: 'Shirase' })).rejects.toThrowError(
      Err.CannotWriteDataError
    );

    await gitDDB.destroy();
  });

  it('creates JSON document', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();

    const json = { _id: 'prof01', name: 'Shirase' };
    const fullDocPath = json._id + JSON_POSTFIX;
    await putWorker(gitDDB, '', fullDocPath, toSortedJSONString(json), 'message');
    expect(readFileSync(path.resolve(gitDDB.workingDir, fullDocPath), 'utf8')).toBe(
      toSortedJSONString(json)
    );

    await gitDDB.destroy();
  });

  it('updates JSON document', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();

    const json = { _id: 'prof01', name: 'Shirase' };
    const fullDocPath = json._id + JSON_POSTFIX;
    await putWorker(gitDDB, '', fullDocPath, toSortedJSONString(json), 'message');

    const json2 = { _id: 'prof01', name: 'updated document' };
    await putWorker(gitDDB, '', fullDocPath, toSortedJSONString(json2), 'message');
    expect(readFileSync(path.resolve(gitDDB.workingDir, fullDocPath), 'utf8')).toBe(
      toSortedJSONString(json2)
    );

    await gitDDB.destroy();
  });

  it('Concurrent calls of putWorker() succeeds.', async () => {
    const _id_a = 'apple';
    const name_a = 'Apple woman';
    const _id_b = 'banana';
    const name_b = 'Banana man';

    const _id_c01 = 'citrus/amanatsu';
    const name_c01 = 'Amanatsu boy';
    const _id_c02 = 'citrus/yuzu';
    const name_c02 = 'Yuzu girl';
    const _id_d = 'durio/durian';
    const name_d = 'Durian girls';
    const _id_p = 'pear/Japan/21st';
    const name_p = '21st century pear';

    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName,
      localDir,
    });
    await gitDDB.open();

    const json_a = { _id: _id_a, name: name_a };
    const json_b = { _id: _id_b, name: name_b };
    const json_c01 = { _id: _id_c01, name: name_c01 };
    const json_c02 = { _id: _id_c02, name: name_c02 };
    const json_d = { _id: _id_d, name: name_d };
    const json_p = { _id: _id_p, name: name_p };

    await Promise.all([
      putWorker(gitDDB, '', _id_a + JSON_POSTFIX, toSortedJSONString(json_a), 'message'),
      putWorker(gitDDB, '', _id_b + JSON_POSTFIX, toSortedJSONString(json_b), 'message'),
      putWorker(
        gitDDB,
        '',
        _id_c01 + JSON_POSTFIX,
        toSortedJSONString(json_c01),
        'message'
      ),
      putWorker(
        gitDDB,
        '',
        _id_c02 + JSON_POSTFIX,
        toSortedJSONString(json_c02),
        'message'
      ),
      putWorker(gitDDB, '', _id_d + JSON_POSTFIX, toSortedJSONString(json_d), 'message'),
      putWorker(gitDDB, '', _id_p + JSON_POSTFIX, toSortedJSONString(json_p), 'message'),
    ]);

    await expect(gitDDB.findFatDoc()).resolves.toEqual(
      expect.arrayContaining([
        {
          _id: _id_a,
          name: _id_a + JSON_POSTFIX,
          fileOid: (await git.hashBlob({ object: toSortedJSONString(json_a) })).oid,
          type: 'json',
          doc: json_a,
        },
        {
          _id: _id_b,
          name: _id_b + JSON_POSTFIX,
          fileOid: (await git.hashBlob({ object: toSortedJSONString(json_b) })).oid,
          type: 'json',
          doc: json_b,
        },
        {
          _id: _id_c01,
          name: _id_c01 + JSON_POSTFIX,
          fileOid: (await git.hashBlob({ object: toSortedJSONString(json_c01) })).oid,
          type: 'json',
          doc: json_c01,
        },
        {
          _id: _id_c02,
          name: _id_c02 + JSON_POSTFIX,
          fileOid: (await git.hashBlob({ object: toSortedJSONString(json_c02) })).oid,
          type: 'json',
          doc: json_c02,
        },
        {
          _id: _id_d,
          name: _id_d + JSON_POSTFIX,
          fileOid: (await git.hashBlob({ object: toSortedJSONString(json_d) })).oid,
          type: 'json',
          doc: json_d,
        },
        {
          _id: _id_p,
          name: _id_p + JSON_POSTFIX,
          fileOid: (await git.hashBlob({ object: toSortedJSONString(json_p) })).oid,
          type: 'json',
          doc: json_p,
        },
      ])
    );

    await gitDDB.destroy();
  });
});
