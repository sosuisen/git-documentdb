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
      connection: { type: 'github', personalAccessToken: token },
    };
    await dbA.open();
    const syncA = await dbA.sync(options);
    expect(syncA.remoteURL).toBe(remoteURL);
    destroyDBs([dbA]);
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
      connection: { type: 'github', personalAccessToken: token },
    };
    await dbA.open();
    await dbA.sync(options);
    dbA.removeSync(remoteURL);
    expect(dbA.getSync(remoteURL)).toBeUndefined();
    destroyDBs([dbA]);
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
      connection: { type: 'github', personalAccessToken: token },
    };
    const syncA = await dbA.sync(options);
    await expect(dbA.sync(options)).rejects.toThrowError(
      Err.RemoteAlreadyRegisteredError
    );
    dbA.destroy();
  });


  it.skip('getRemoteURLs() returns sync', async () => {
    const remoteURL = remoteURLBase + serialId();
    const dbNameA = serialId();
    const dbA: GitDocumentDB = new GitDocumentDB({
      dbName: dbNameA,
      localDir: localDir,
      logLevel: 'trace',
    });
    const options: RemoteOptions = {
      remoteUrl: remoteURL,
      connection: { type: 'github', personalAccessToken: token },
    };
    await dbA.open();
    await dbA.sync(options);
    const remoteURL2 = remoteURLBase + serialId();
    const options2: RemoteOptions = {
      remoteUrl: remoteURL2,
      connection: { type: 'github', personalAccessToken: token },
    };
    await dbA.sync(options2);
    expect(dbA.getRemoteURLs()).toEqual([remoteURL, remoteURL2]);
    destroyDBs([dbA]);
  });

  it.skip('Multiple Sync object');
});
