/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import { GitDocumentDB, RemoteOptions } from 'git-documentdb';
import { sleep } from './utils';
/**
 * This example assumes you have an account on GitHub.
 * Please get your personal access token with checked [repo].
 * (See https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token )
 */
let github_repository = 'https://github.com/enter_your_account_name/git-documentdb-example-sync.git'; 
let github_repository2 = 'git@github.com:enter_your_account_name/git-documentdb-example-sync2.git';

let your_github_personal_access_token = 'Enter your personal access token with checked [repo]';

let your_public_key_path = '/Enter/your/private/key/path';
let your_private_key_path = '/Enter/your/public/key/path';
/**
 * You can also set them from environment variables:
 *  - GITDDB_GITHUB_USER_URL
 *      URL of your GitHub account
 *      e.g.) https://github.com/foo/
 * 
 *  - GITDDB_PERSONAL_ACCESS_TOKEN
 *      A personal access token of your GitHub account
 * 
 *  - GITDDB_GITHUB_USER_SSH
 *      SSH URL of your GitHub account
 *      e.g.) git@github.com:foo/
 *            
 *  - SSH_PUBLIC_KEY_PATH
 *      ssk public key of your GitHub account
 *
 *  - SSH_PRIVATE_KEY_PATH
 *      ssk private key of your GitHub account
 */
if (process.env.GITDDB_GITHUB_USER_URL) github_repository = process.env.GITDDB_GITHUB_USER_URL + 'git-documentdb-example-sync.git';
if (process.env.GITDDB_GITHUB_USER_SSH) github_repository2 = process.env.GITDDB_GITHUB_USER_SSH + 'git-documentdb-example-sync2.git';
if (process.env.GITDDB_PERSONAL_ACCESS_TOKEN) your_github_personal_access_token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN;
if (process.env.SSH_PUBLIC_KEY_PATH) your_public_key_path = process.env.SSH_PUBLIC_KEY_PATH;
if (process.env.SSH_PRIVATE_KEY_PATH) your_private_key_path = process.env.SSH_PRIVATE_KEY_PATH;

    
/**
 * Load NodeGit remote engine plugin to connect remote repository
 */ 
GitDocumentDB.plugin(require('git-documentdb-plugin-remote-nodegit'));

const remote_plugin_example = async () => {
   const gitDDB = new GitDocumentDB({
     dbName: 'db_plugin', // Git working directory
   });
   await gitDDB.open();
   await gitDDB.put({ name: 'foo'});

  // Use default remote engine (isomorphic-git)
  const remoteOptionsDefault: RemoteOptions = {
    live: true,
    remoteUrl: github_repository,
    interval: 5000, // Sync every 5,000 msec
    connection: { 
      type: 'github',
      personalAccessToken: your_github_personal_access_token,
    },
  };
  // Add default synchronize to DB
  const syncDefault = await gitDDB.sync(remoteOptionsDefault);
  console.log('## Default RemoteEngine: ' + syncDefault.engine);
  syncDefault.on('start', () => { console.log('[default] synchronizing...')});  
  syncDefault.on('complete', () => { console.log('[default] completed')});

  // Set NodeGit remote engine plugin
  const remoteOptionsNodeGit: RemoteOptions = {
    live: true,
    remoteUrl: github_repository2,
    interval: 5000, // Sync every 5,000 msec
    connection: { 
      type: 'ssh',
      publicKeyPath: your_public_key_path,
      privateKeyPath: your_private_key_path,
      passPhrase: '',
      engine: 'nodegit'
    },
  };
  console.log(remoteOptionsNodeGit);
  // Add extra synchronizer to DB
  const syncNodeGit= await gitDDB.sync(remoteOptionsNodeGit);

  console.log('## Plugin RemoteEngine: ' + syncNodeGit.engine);
  syncNodeGit.on('start', () => { console.log('[NodeGit] synchronizing...')});  
  syncNodeGit.on('complete', () => { console.log('[NodeGit] completed')});

  await sleep(10000);
  await gitDDB.close();
};

remote_plugin_example();

