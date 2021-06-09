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
import { cloneRepository } from '../../src/remote/clone';
import { removeRemoteRepositories } from '../remote_utils';

const reposPrefix = 'test_clone___';
const localDir = `./test/database_clone`;

beforeEach(function () {
  // @ts-ignore
  console.log(`... ${this.currentTest.fullTitle()}`);
});

beforeAll(() => {
  fs.removeSync(path.resolve(localDir));
});

afterAll(() => {
  fs.removeSync(path.resolve(localDir));
});

// GITDDB_GITHUB_USER_URL: URL of your GitHub account
// e.g.) https://github.com/foo/
const maybe =
  process.env.GITDDB_GITHUB_USER_URL && process.env.GITDDB_PERSONAL_ACCESS_TOKEN
    ? describe
    : describe.skip;

maybe('<remote/clone> cloneRepository', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  beforeAll(async () => {
    // Remove remote
    await removeRemoteRepositories(reposPrefix);
  });

  it('returns undefined when invalid RemoteOptions', async () => {
    // @ts-ignore
    await expect(cloneRepository('tmp')).resolves.toBeUndefined();
    await expect(cloneRepository('tmp', { remoteUrl: undefined })).resolves.toBeUndefined();
  });
});
