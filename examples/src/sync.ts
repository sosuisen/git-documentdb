/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import { GitDocumentDB, RemoteOptions } from 'git-documentdb';

const sleep = (msec: number) => new Promise(resolve => setTimeout(resolve, msec));

const sync_example = async () => {
  /**
   * These examples  assume you have an account on GitHub.
   * Please get your personal access token with checked [repo].
   * (See https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token )
   */
  const github_repository = 'https://github.com/enter_your_accunt_name/git-documentdb-example-sync.git'; // Please enter your GitHub account name.
  const your_github_personal_access_token = 'Enter your personal access token with checked [repo]'; // See https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token

  // Set options for synchronization
  const remoteOptions: RemoteOptions = {
    live: true,
    remote_url: github_repository,
    interval: 10000,
    connection: { type: 'github', personal_access_token: your_github_personal_access_token },
  };

  /**
   * Case 1) If you do not have github_repository above on GitHub
   */
  let gitDDB = new GitDocumentDB({
    db_name: 'dbA', // Git working directory
  });
  const result = await gitDDB.open(); // Open a repository if exists. (/your/path/to/the/example/git-documentdb/db01/.git)
  if (!result.ok) await gitDDB.create(); // Git creates and opens a repository if not exits.
  
  // Call sync() with remoteOptions to create and connect a remote repository on GitHub
  const syncA = await gitDDB.sync(remoteOptions);
  /**
   * git-documentdb-example-sync.git is automatically created in your GitHub account.
   * The data will be synchronized every 10 seconds.
   * 
   * Check below if you fail:
   *  - It throws NoMergeBaseFoundError if the github_repository has already exist. Delete it before running this example.
   *  - It throws RemoteRepositoryConnectError if [repo] is not checked in your personal access token settings.
   */

  // Create
  await gitDDB.put({ _id: 'nara', flower: 'cherry blossoms', season: 'spring' });

  // Wait until next synchronization
  await sleep(syncA.options().interval);

}

sync_example();
