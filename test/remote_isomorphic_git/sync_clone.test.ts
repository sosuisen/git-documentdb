/* eslint-disable @typescript-eslint/naming-convention */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

/**
 * Test tryPush
 * by using GitHub Personal Access Token
 * These tests create a new repository on GitHub if not exists.
 */
import path from 'path';
import fs from 'fs-extra';
import { syncCloneBase } from '../remote_base/sync_clone';
import { ConnectionSettingsGitHub } from '../../src/types';

const reposPrefix = 'test_sync_clone_isomorphic_git___';
const localDir = `./test/database_sync_clone_isomorphic_git`;

beforeEach(function () {
  // @ts-ignore
  console.log(`... ${this.currentTest.fullTitle()}`);
});

before(() => {
  fs.removeSync(path.resolve(localDir));
});

after(() => {
  fs.removeSync(path.resolve(localDir));
});

// This test needs environment variables:
//  - GITDDB_GITHUB_USER_URL: URL of your GitHub account
// e.g.) https://github.com/foo/
//  - GITDDB_PERSONAL_ACCESS_TOKEN: A personal access token of your GitHub account
const maybe =
  process.env.GITDDB_GITHUB_USER_URL && process.env.GITDDB_PERSONAL_ACCESS_TOKEN
    ? describe
    : describe.skip;

const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
  ? process.env.GITDDB_GITHUB_USER_URL
  : process.env.GITDDB_GITHUB_USER_URL + '/';

const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

const connection: ConnectionSettingsGitHub = {
  type: 'github',
  personalAccessToken: token,
};

maybe('isomorphic-git', syncCloneBase(connection, remoteURLBase, reposPrefix, localDir));
