/* eslint-disable @typescript-eslint/naming-convention */
/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

/**
 * Network test for TaskQueue
 * by using GitHub Personal Access Token
 * These tests create a new repository on GitHub if not exists.
 */

import expect from 'expect';
import { ConnectionSettings } from '../../src/types';
import { createDatabase, destroyDBs, removeRemoteRepositories } from '../remote_utils';

export const networkTaskQueueBase = (
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

  describe('<remote/network_task_queue> remote', () => {
    it('increments statistics: push', async () => {
      const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
        connection,
      });

      // The first push in open()
      expect(dbA.taskQueue.currentStatistics().push).toBe(1);

      const jsonA1 = { _id: '1', name: 'fromA' };
      await dbA.put(jsonA1);
      await syncA.tryPush();
      expect(dbA.taskQueue.currentStatistics().push).toBe(2);

      await destroyDBs([dbA]);
    });

    it('increments statistics: sync', async () => {
      const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
        connection,
      });

      expect(dbA.taskQueue.currentStatistics().sync).toBe(0);

      await syncA.trySync();
      expect(dbA.taskQueue.currentStatistics().sync).toBe(1);

      await destroyDBs([dbA]);
    });

    it('clear() statistics', async () => {
      const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId, {
        connection,
      });

      await syncA.trySync();
      expect(dbA.taskQueue.currentStatistics()).toEqual({
        put: 0,
        insert: 0,
        update: 0,
        delete: 0,
        push: 1,
        sync: 1,
        cancel: 0,
      });
      dbA.taskQueue.stop();
      expect(dbA.taskQueue.currentStatistics()).toEqual({
        put: 0,
        insert: 0,
        update: 0,
        delete: 0,
        push: 0,
        sync: 0,
        cancel: 0,
      });
      await destroyDBs([dbA]);
    });
  });
};
