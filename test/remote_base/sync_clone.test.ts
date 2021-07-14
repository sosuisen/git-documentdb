/* eslint-disable @typescript-eslint/naming-convention */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

/**
 * Test clone
 * by using GitHub Personal Access Token
 */
import path from 'path';
import fs from 'fs-extra';
import expect from 'expect';
import { createDatabase, destroyDBs, removeRemoteRepositories } from '../remote_utils';
import { GitDocumentDB } from '../../src/git_documentdb';
import { RemoteEngine } from '../../src/remote/remote_engine';

const reposPrefix = 'test_sync_clone___';
const localDir = `./test/database_sync_clone`;

let idCounter = 0;
const serialId = () => {
  return `${reposPrefix}${idCounter++}`;
};

beforeEach(function () {
  // @ts-ignore
  console.log(`... ${this.currentTest.fullTitle()}`);
});

before(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  GitDocumentDB.plugin(require('git-documentdb-plugin-remote-nodegit'));

  fs.removeSync(path.resolve(localDir));
});

after(() => {
  fs.removeSync(path.resolve(localDir));
});

// GITDDB_GITHUB_USER_URL: URL of your GitHub account
// e.g.) https://github.com/foo/
const maybe =
  process.env.GITDDB_GITHUB_USER_URL && process.env.GITDDB_PERSONAL_ACCESS_TOKEN
    ? describe
    : describe.skip;

maybe('<remote/clone> clone', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  before(async () => {
    // Remove remote
    await removeRemoteRepositories(reposPrefix);
  });

  describe('using NodeGit', () => {
    it('returns undefined when invalid RemoteOptions', async () => {
      // @ts-ignore
      await expect(RemoteEngine.nodegit.clone('tmp')).resolves.toBeFalsy();
      await expect(
        RemoteEngine.nodegit.clone('tmp', { remoteUrl: undefined })
      ).resolves.toBeFalsy();
    });

    it('clones a repository by NodeGit', async () => {
      const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId);
      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);
      await syncA.tryPush();

      const dbNameB = serialId();
      const workingDir = localDir + '/' + dbNameB;
      await RemoteEngine[syncA.engine].clone(workingDir, syncA.options);

      const dbB = new GitDocumentDB({ localDir, dbName: dbNameB });
      await dbB.open();
      await expect(dbB.get(jsonA1._id)).resolves.toEqual(jsonA1);

      await destroyDBs([dbA, dbB]);
    });
  });
});
