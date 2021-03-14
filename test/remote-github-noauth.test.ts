/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

/**
 * Test synchronization (pull only) on GitHub
 * without GitHub Personal Access Token
 * without OAuth on GitHub
 * without SSH key pair authentication
 * These tests does not create a new repository on GitHub if not exists.
 */

// auth is not used when options are undefined

/**
  test('Undefined options', async () => {
    const dbName = serialId();
    const remoteURL = remoteURLBase + dbName;
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.open();

    // pull
    await expect(gitDDB.sync(remoteURL))...

    gitDDB.destroy();
  });  
*/
