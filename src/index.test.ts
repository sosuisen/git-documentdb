
import fs from 'fs-extra';
import path from 'path';
import { CannotCreateDirectoryError, CannotWriteDataError } from './error';
import { GitDocumentDB } from './index';
import nodegit from 'nodegit';


interface RepositoryInitOptions {
  description?: string;
  initialHead?: string;
  flags?: number; // https://libgit2.org/libgit2/#HEAD/type/git_repository_init_flag_t
  mode?: number; // https://libgit2.org/libgit2/#HEAD/type/git_repository_init_mode_t
  originUrl?: string;
  templatePath?: string;
  version?: number;
  workdirPath?: string;
}

const repositoryInitOptionFlags = {
  GIT_REPOSITORY_INIT_BARE: 1,
  GIT_REPOSITORY_INIT_NO_REINIT: 2,
  GIT_REPOSITORY_INIT_NO_DOTGIT_DIR: 4,
  GIT_REPOSITORY_INIT_MKDIR: 8,
  GIT_REPOSITORY_INIT_MKPATH: 16,
  GIT_REPOSITORY_INIT_EXTERNAL_TEMPLATE: 32,
  GIT_REPOSITORY_INIT_RELATIVE_GITLINK: 64,
};


describe('Create repository (1)', () => {
  const readonlyDir = './test/readonly/';
  const localDir = './test/database01_1';
  const dbName = './test_repos01_';

  beforeAll(() => {
    if (process.platform !== 'win32') {
      fs.removeSync(path.resolve(readonlyDir));
    }
  });

  afterAll(() => {
    if (process.platform !== 'win32') {
      fs.removeSync(path.resolve(readonlyDir));
    }
  });

  test('open(): Try to create a new repository on a readonly filesystem.', async () => {
    // Windows does not support permission option of fs.mkdir().
    if (process.platform === 'win32') {
      console.warn(`You must create ${readonlyDir} directory by hand, click [disable inheritance] button, and remove write permission of Authenticated Users.`);
    }
    else {
      await fs.mkdir(readonlyDir, { mode: 0o400 });
    }
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: readonlyDir + 'database'
    });
    // You don't have permission
    await expect(gitDDB.open()).rejects.toBeInstanceOf(CannotCreateDirectoryError);
  });
});

describe('Create repository (2)', () => {
  const localDir = './test/database01_2';
  const dbName = './test_repos01_2';

  const gitDDB: GitDocumentDB = new GitDocumentDB({
    dbName: dbName,
    localDir: localDir
  });

  beforeAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  afterAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  test('open(): Create and destroy a new repository.', async () => {
    // Create db
    await expect(gitDDB.open()).resolves.toMatchObject({ isNew: true });
    // Destroy db
    await expect(gitDDB.destroy()).resolves.toBeTruthy();
    // fs.access() throw error when a file cannot be accessed.    
    await expect(fs.access(path.resolve(localDir, dbName))).rejects.toMatchObject({ name: 'Error', code: 'ENOENT' });
  });
});


describe('Open, close and destroy repository', () => {
  const localDir = './test/database02_1';
  let dbName = './test_repos02_1';

  let gitDDB: GitDocumentDB = new GitDocumentDB({
    dbName: dbName,
    localDir: localDir
  });

  beforeAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  afterAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  test('open(), close() and destroy(): Open an existing repository.', async () => {
    // Create db
    await gitDDB.open();

    // Close created db
    expect(gitDDB.close()).toBeTruthy();

    // Open existing db
    await expect(gitDDB.open()).resolves.toMatchObject({ isNew: false, isCreatedByGitDDB: true, isValidVersion: true });
    expect(gitDDB.isOpened()).toBeTruthy();

    // Destroy() closes db automatically
    await expect(gitDDB.destroy()).resolves.toBeTruthy();
    expect(gitDDB.isOpened()).toBeFalsy();
  });


  test('open(): Open a repository created by another app.', async () => {
    dbName = 'test_repos02_2';
    gitDDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    const optionsA: RepositoryInitOptions = {
      description: 'another app',
      flags: repositoryInitOptionFlags.GIT_REPOSITORY_INIT_MKDIR,
      initialHead: 'main'
    };
    // Create git repository with invalid description
    await fs.ensureDir(localDir);
    // @ts-ignore
    await nodegit.Repository.initExt(path.resolve(localDir, dbNameA), optionsA).catch(err => { throw new Error(err) });
    gitDDB.close();

    await expect(gitDDB.open()).resolves.toMatchObject({ isNew: false, isCreatedByGitDDB: false, isValidVersion: false });
    await gitDDB.destroy();
  });


  test('open(): Open a repository created by another version.', async () => {
    dbName = 'test_repos02_3';
    gitDDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    const optionsB: RepositoryInitOptions = {
      description: 'GitDocumentDB: 0.1',
      flags: repositoryInitOptionFlags.GIT_REPOSITORY_INIT_MKDIR,
      initialHead: 'main'
    };
    // Create git repository with invalid description
    await fs.ensureDir(localDir);
    // @ts-ignore
    await nodegit.Repository.initExt(path.resolve(localDir, dbNameB), optionsB).catch(err => { throw new Error(err) });
    gitDDB.close();

    await expect(gitDDB.open()).resolves.toMatchObject({ isNew: false, isCreatedByGitDDB: true, isValidVersion: false });
    await gitDDB.destroy();
  });  
});


describe('Create a document', () => {
  const localDir = './test/database03';
  const dbName = './test_repos03';

  const gitDDB: GitDocumentDB = new GitDocumentDB({
    dbName: dbName,
    localDir: localDir
  });

  beforeAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  afterAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  test('put(): Create a document', async () => {
    /**
     * Repository not open
     */

    await gitDDB.open();

    /**
     * KeyNotFound
     */
    await expect(gitDDB.put('<test>', { id: '<test>', name: 'shirase' })).rejects.toBeInstanceOf(CannotWriteDataError);

    /**
     * InvalidKeyCharacter
     */

    /**
     * InvalidKeyLength
     */

    /*
     * Put a new JSON Object
     */
    await expect(gitDDB.put('prof01', { id: 'prof01', name: 'shirase' })).resolves.toMatch(/^[a-z0-9]{40}$/);

    /*
     * Put a new text
     */

    /*
     * Put a new binary
     */


    await gitDDB.destroy();
  });
});
    

describe('Read a document', () => {
  const localDir = './test/database05';
  const dbName = './test_repos05';

  const gitDDB: GitDocumentDB = new GitDocumentDB({
    dbName: dbName,
    localDir: localDir
  });

  beforeAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  afterAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  test('get(): Read an existing document', async () => {
    await gitDDB.open();

    // Create
    await expect(gitDDB.put('prof01', { id: 'prof01', name: 'shirase' })).resolves.toMatch(/^[a-z0-9]{40}$/);

    // Get
    await expect(gitDDB.get('prof01')).toEqual({ id: 'prof01', name: 'mari' });


    await gitDDB.destroy();    
  });
});


describe('Update a document', () => {
  const localDir = './test/database06';
  const dbName = './test_repos06';

  const gitDDB: GitDocumentDB = new GitDocumentDB({
    dbName: dbName,
    localDir: localDir
  });

  beforeAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  afterAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  test('put(): Update a existing document', async () => {
    await gitDDB.open();

    // Create
    await expect(gitDDB.put('prof01', { id: 'prof01', name: 'shirase' })).resolves.toMatch(/^[a-z0-9]{40}$/);

    // Update
    await expect(gitDDB.put('prof01', { id: 'prof01', name: 'mari' })).toEqual({ id: 'prof01', name: 'mari' });
  

    await gitDDB.destroy();    
  });
});


describe('Delete a document', () => {
  const localDir = './test/database07';
  const dbName = './test_repos07';

  const gitDDB: GitDocumentDB = new GitDocumentDB({
    dbName: dbName,
    localDir: localDir
  });

  beforeAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  afterAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  test('delete()', async () => {
    await gitDDB.open();

    // Create
    await expect(gitDDB.put('prof01', { id: 'prof01', name: 'shirase' })).resolves.toMatch(/^[a-z0-9]{40}$/);

    // Delete
    await expect(gitDDB.delete('prof01')).toEqual({ id: 'prof01', name: 'mari' });
  });

});
