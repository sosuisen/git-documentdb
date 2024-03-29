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
import expect from 'expect';
import {
  createDatabase,
  destroyDBs,
  removeRemoteRepositories,
  resetRemoteCommonRepository,
} from '../remote_utils';
import { GitDocumentDB } from '../../src/git_documentdb';
import { RemoteEngine } from '../../src/remote/remote_engine';
import { ConnectionSettings } from '../../src/types';

export const syncCloneBase = (
  connection: ConnectionSettings,
  remoteURLBase: string,
  reposPrefix: string,
  localDir: string
) => () => {
  let idCounter = 0;
  const serialId = () => {
    return `${reposPrefix}${idCounter++}`;
  };

  // Use commonId to reduce API calls to GitHub
  const commonId = () => {
    return `${reposPrefix}common`;
  };

  before(async () => {
    await removeRemoteRepositories(reposPrefix);
  });

  describe('<remote/clone> clone', () => {
    it('clones a repository', async () => {
      await resetRemoteCommonRepository(remoteURLBase, localDir, serialId, commonId);
      const [dbA, syncA] = await createDatabase(
        remoteURLBase,
        localDir,
        serialId,
        commonId,
        {
          connection,
        }
      );
      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);
      await syncA.tryPush();

      const dbNameB = serialId();
      const workingDir = localDir + '/' + dbNameB;
      await RemoteEngine[syncA.engine].clone(
        workingDir,
        syncA.options,
        'origin',
        dbA.tsLogger
      );

      const dbB = new GitDocumentDB({ localDir, dbName: dbNameB });
      await dbB.open();
      await expect(dbB.get(jsonA1._id)).resolves.toEqual(jsonA1);

      await destroyDBs([dbA, dbB]);
    });
  });
};
