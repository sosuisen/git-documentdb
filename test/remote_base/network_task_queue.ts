const maybe =
  process.env.GITDDB_GITHUB_USER_URL && process.env.GITDDB_PERSONAL_ACCESS_TOKEN
    ? describe
    : describe.skip;

maybe('<task_queue> remote', () => {
  const remoteURLBase = process.env.GITDDB_GITHUB_USER_URL?.endsWith('/')
    ? process.env.GITDDB_GITHUB_USER_URL
    : process.env.GITDDB_GITHUB_USER_URL + '/';
  const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

  before(async () => {
    await removeRemoteRepositories(reposPrefix);
  });

  it('increments statistics: push', async () => {
    const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId);

    // The first push in open()
    expect(dbA.taskQueue.currentStatistics().push).toBe(1);

    const jsonA1 = { _id: '1', name: 'fromA' };
    await dbA.put(jsonA1);
    await syncA.tryPush();
    expect(dbA.taskQueue.currentStatistics().push).toBe(2);

    await destroyDBs([dbA]);
  });

  it('increments statistics: sync', async () => {
    const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId);

    expect(dbA.taskQueue.currentStatistics().sync).toBe(0);

    await syncA.trySync();
    expect(dbA.taskQueue.currentStatistics().sync).toBe(1);

    await destroyDBs([dbA]);
  });

  it('clear() statistics', async () => {
    const [dbA, syncA] = await createDatabase(remoteURLBase, localDir, serialId);

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
    dbA.taskQueue.clear();
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
