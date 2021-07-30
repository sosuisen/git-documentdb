/* eslint-disable @typescript-eslint/naming-convention */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

/**
 * Network test for GitDocumentDB class
 * by using GitHub Personal Access Token
 * These tests create a new repository on GitHub if not exists.
 */

import sinon from 'sinon';
import expect from 'expect';
import { ConnectionSettings, RemoteOptions } from '../../src/types';
import { destroyDBs, removeRemoteRepositories } from '../remote_utils';
import { GitDocumentDB } from '../../src/git_documentdb';
import { Err } from '../../src/error';

export const networkGitDocumentDB = (
  connection: ConnectionSettings,
  remoteURLBase: string,
  reposPrefix: string,
  localDir: string
) => () => {
  let idCounter = 0;
  const serialId = () => {
    return `${reposPrefix}${idCounter++}`;
  };

  // Use sandbox to restore stub and spy in parallel mocha tests
  let sandbox: sinon.SinonSandbox;
  beforeEach(function () {
    sandbox = sinon.createSandbox();
  });

  afterEach(function () {
    sandbox.restore();
  });

  before(async () => {
    await removeRemoteRepositories(reposPrefix);
  });

  /**
   * Initialize synchronization by open() with remoteURL
   * Initialize means creating local and remote repositories by using a remoteUrl
   */
  describe('is initialized from GitDocumentDB():', () => {
    it('sync() returns an instance of Sync.', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbNameA = serialId();
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameA,
        localDir: localDir,
      });
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection,
      };
      await dbA.open();
      const syncA = await dbA.sync(options);
      expect(syncA.remoteURL).toBe(remoteURL);
      await destroyDBs([dbA]);
    });

    it('unregisterRemote() removes an instance of Sync.', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbNameA = serialId();
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameA,
        localDir: localDir,
      });
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection,
      };
      await dbA.open();
      await dbA.sync(options);
      dbA.removeSync(remoteURL);
      expect(dbA.getSync(remoteURL)).toBeUndefined();
      await destroyDBs([dbA]);
    });

    it('throws RemoteAlreadyRegisteredError when sync() the same url twice.', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbNameA = serialId();

      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameA,
        localDir: localDir,
      });

      await dbA.open();

      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection,
      };
      const syncA = await dbA.sync(options);
      await expect(dbA.sync(options)).rejects.toThrowError(
        Err.RemoteAlreadyRegisteredError
      );
      await dbA.destroy();
    });

    it('getRemoteURLs() returns sync', async () => {
      const remoteURL = remoteURLBase + serialId();
      const dbNameA = serialId();
      const dbA: GitDocumentDB = new GitDocumentDB({
        dbName: dbNameA,
        localDir: localDir,
        logLevel: 'trace',
      });
      const options: RemoteOptions = {
        remoteUrl: remoteURL,
        connection,
      };
      await dbA.open();
      await dbA.sync(options);
      const remoteURL2 = remoteURLBase + serialId();
      const options2: RemoteOptions = {
        remoteUrl: remoteURL2,
        connection,
      };
      await dbA.sync(options2);
      expect(dbA.getRemoteURLs()).toEqual([remoteURL, remoteURL2]);
      await destroyDBs([dbA]);
    });
  });
};
