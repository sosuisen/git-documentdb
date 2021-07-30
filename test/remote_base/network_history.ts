/* eslint-disable @typescript-eslint/naming-convention */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

/**
 * Network test for history
 * by using GitHub Personal Access Token
 * These tests create a new repository on GitHub if not exists.
 */

import expect from 'expect';
import { ConnectionSettings } from '../../src/types';
import {
  createClonedDatabases,
  destroyDBs,
  removeRemoteRepositories,
} from '../remote_utils';
import { sleep, toSortedJSONString, utf8encode } from '../../src/utils';
import { JSON_EXT } from '../../src/const';
import { getHistoryImpl, readOldBlob } from '../../src/crud/history';

export const networkHistoryBase = (
  connection: ConnectionSettings,
  remoteURLBase: string,
  reposPrefix: string,
  localDir: string
) => () => {
  let idCounter = 0;
  const serialId = () => {
    return `${reposPrefix}${idCounter++}`;
  };

  before(async () => {
    await removeRemoteRepositories(reposPrefix);
  });

  describe('<remote/network_history> getHistoryImpl', () => {
    it('gets all revisions sorted by date from merged commit', async () => {
      const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
        remoteURLBase,
        localDir,
        serialId,
        {
          conflictResolutionStrategy: 'ours',
          connection,
        }
      );

      const _id = 'prof';
      const shortName = _id + JSON_EXT;
      const jsonA1 = { _id, name: 'A-1' };
      const jsonA2 = { _id, name: 'A-2' };
      const jsonA3 = { _id, name: 'A-3' };
      const jsonB1 = { _id, name: 'B-1' };
      const jsonB2 = { _id, name: 'B-2' };
      const putResultA1 = await dbA.put(jsonA1);
      await sleep(1500);
      const putResultB1 = await dbB.put(jsonB1);
      await sleep(1500);
      const putResultA2 = await dbA.put(jsonA2);
      await sleep(1500);
      const putResultB2 = await dbB.put(jsonB2);
      await sleep(1500);
      const putResultA3 = await dbA.put(jsonA3);
      await sleep(1500);

      await syncA.trySync();
      await syncB.trySync(); // Resolve conflict. jsonB2 wins.

      // Get
      const history = await getHistoryImpl(dbB, shortName, '', undefined, undefined, true);

      expect(history[0]).toEqual({
        _id,
        name: shortName,
        fileOid: expect.stringMatching(/^[\da-z]{40}$/),
        type: 'json',
        doc: jsonB2,
      });
      expect(history[1]).toEqual({
        _id,
        name: shortName,
        fileOid: expect.stringMatching(/^[\da-z]{40}$/),
        type: 'json',
        doc: jsonA3,
      });
      expect(history[2]).toEqual({
        _id,
        name: shortName,
        fileOid: expect.stringMatching(/^[\da-z]{40}$/),
        type: 'json',
        doc: jsonB2,
      });
      expect(history[3]).toEqual({
        _id,
        name: shortName,
        fileOid: expect.stringMatching(/^[\da-z]{40}$/),
        type: 'json',
        doc: jsonA2,
      });
      expect(history[4]).toEqual({
        _id,
        name: shortName,
        fileOid: expect.stringMatching(/^[\da-z]{40}$/),
        type: 'json',
        doc: jsonB1,
      });
      expect(history[5]).toEqual({
        _id,
        name: shortName,
        fileOid: expect.stringMatching(/^[\da-z]{40}$/),
        type: 'json',
        doc: jsonA1,
      });

      await destroyDBs([dbA, dbB]);
    });
  });

  describe('<remote/network_history> readOldBlob()', () => {
    it('skips a merge commit', async () => {
      const [dbA, dbB, syncA, syncB] = await createClonedDatabases(
        remoteURLBase,
        localDir,
        serialId,
        {
          conflictResolutionStrategy: 'ours',
          connection,
        }
      );
      dbA.author = {
        name: 'authorA',
        email: 'authorEmailA',
      };
      dbB.author = {
        name: 'authorB',
        email: 'authorEmailB',
      };

      const jsonA1 = { _id: 'A1', name: 'A1' };
      const jsonA1internal = { _id: 'A1', name: 'A1' };
      const jsonB1 = { _id: 'B1', name: 'B1' };
      const putResultA1 = await dbA.put(jsonA1);
      await sleep(1500);
      await dbB.put(jsonB1);
      await sleep(1500);

      await syncA.trySync();
      await syncB.trySync(); // dbB commits 'merge'

      await expect(
        readOldBlob(dbB.workingDir, 'A1.json', 0, { filter: [{ author: dbB.author }] })
      ).resolves.toBeUndefined(); // merge commit is skipped, so jsonA1 does not exist.

      await expect(
        readOldBlob(dbB.workingDir, 'A1.json', 0, { filter: [{ author: dbA.author }] })
      ).resolves.toEqual({
        oid: putResultA1.fileOid,
        blob: utf8encode(toSortedJSONString(jsonA1internal)),
      });

      await destroyDBs([dbA, dbB]);
    });
  });
};
