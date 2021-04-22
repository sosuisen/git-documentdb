/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import { GitDocumentDB } from 'git-documentdb';

const gitddb_example = async () => {
  let gitDDB = new GitDocumentDB({
    db_name: 'db01', // Git working directory
  });

  // Open
  const result = await gitDDB.open(); // Open a repository if exists. (/your/path/to/the/example/git-documentdb/db01/.git)
  if (!result.ok) await gitDDB.create(); // Git creates and opens a repository if not exits.

  /**
   * Synchronization
   */
  const github_repository = 'https://github.com/enter_your_accunt_name/git-documentdb-example.git'; // Please enter your GitHub account name.
  const your_github_personal_access_token = 'Enter your personal access token with checked [repo]'; // See https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token
  // @ts-ignore
  if (your_github_personal_access_token !== 'Enter your personal access token with checked [repo]') {
    await gitDDB.sync({
      live: true,
      remote_url: github_repository,
      connection: { type: 'github', personal_access_token: your_github_personal_access_token },
    });
    // git-documentdb-example.git is automatically created in your GitHub account.
    // The data will be synchronized every 10 seconds.
    // Check below if you fail:
    // - It throws NoMergeBaseFoundError if the github_repository has already exist. Delete it before running this example.
    // - It throws RemoteRepositoryConnectError if [repo] is not checked in your personal access token settings.
  }

    // Create
    await gitDDB.put({ _id: 'nara', flower: 'cherry blossoms', season: 'spring' }); // Git adds 'nara.json' under the working directory and commits it.
    // Update
    await gitDDB.put({ _id: 'nara', flower: 'double cherry blossoms', season: 'spring' }); // Git adds an updated file and commits it.
    // Read
    const doc = await gitDDB.get('nara');
    console.log(doc); // doc = { flower: 'double cherry blossoms', season: 'spring', _id: 'nara' }
    // Delete
    await gitDDB.remove('nara'); // Git removes a file and commits it.

  await gitDDB.close();
};
gitddb_example();
