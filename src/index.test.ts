
import fs from 'fs-extra';
import path from 'path';
import { CannotCreateDirectoryError } from './error';
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
  const localDir = './test/database01';
  const dbName = './test_repos01';

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

  test('Create a new repository', async () => {
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
  const localDir = './test/database02';
  const dbName = './test_repos02';

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

  test('Create a new repository', async () => {
    // Create db
    await expect(gitDDB.open()).resolves.toMatchObject({ isNew: true });
    // Destroy db
    await expect(gitDDB.destroy()).resolves.toBeTruthy();
    // fs.access() throw error when a file cannot be accessed.    
    await expect(fs.access(path.resolve(localDir, dbName))).rejects.toMatchObject({ name: 'Error', code: 'ENOENT' });
  });
});


describe('Open and close repository', () => {
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

  test('Open and close an existing repository', async () => {
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


  test('Open a repository created by another app', async () => {
    const dbNameA = 'test_repos03A';
    const gitDDB_A: GitDocumentDB = new GitDocumentDB({
      dbName: dbNameA,
      localDir: localDir
    });
    const optionsA: RepositoryInitOptions = {
      description: 'another app',
      flags: repositoryInitOptionFlags.GIT_REPOSITORY_INIT_MKDIR,
      initialHead: 'main'
    };
    // Create git repository with invalid description
    await fs.ensureDir(localDir).catch((err: Error) => { throw new CannotCreateDirectoryError(err.message); });
    // @ts-ignore
    await nodegit.Repository.initExt(path.resolve(localDir, dbNameA), optionsA).catch(err => { throw new Error(err) });
    gitDDB.close();

    await expect(gitDDB_A.open()).resolves.toMatchObject({ isNew: false, isCreatedByGitDDB: false, isValidVersion: false });
    await gitDDB_A.destroy();
  });


  test('Open a repository created by another version', async () => {
    const dbNameB = 'test_repos03B';
    const gitDDB_B: GitDocumentDB = new GitDocumentDB({
      dbName: dbNameB,
      localDir: localDir
    });
    const optionsB: RepositoryInitOptions = {
      description: 'GitDocumentDB: 0.1',
      flags: repositoryInitOptionFlags.GIT_REPOSITORY_INIT_MKDIR,
      initialHead: 'main'
    };
    // Create git repository with invalid description
    await fs.ensureDir(localDir).catch((err: Error) => { throw new CannotCreateDirectoryError(err.message); });
    // @ts-ignore
    await nodegit.Repository.initExt(path.resolve(localDir, dbNameB), optionsB).catch(err => { throw new Error(err) });
    gitDDB.close();

    await expect(gitDDB_B.open()).resolves.toMatchObject({ isNew: false, isCreatedByGitDDB: true, isValidVersion: false });
    await gitDDB_B.destroy();
  });  
});


describe('CRUD', () => {
  const localDir = './test/database04';
  const dbName = './test_repos04';

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

  test('Create a new document', async () => {
    // Create db
    await gitDDB.open();

    await expect(gitDDB.put({ id: 'prof01', name: 'shirase' })).resolves.toMatch(/^[a-z0-9]{40}$/);

    /**
     * TODO
     * - 初期化のときに main ブランチを追加し、HEADがそこを指すようにする。
     * - 書き込みエラーのチェック    
     */
  });

  /*
    test('Update an existing document', () => {
      expect(gitDDB.put({ id: 'prof01', name: 'mari' })).toEqual({ id: 'prof01', name: 'mari' });
    });
  
  
    test('Fetch a document', () => {
      expect(gitDDB.get('prof01')).toEqual({ id: 'prof01', name: 'mari' });
    })
  
  
    test('Delete the document', () => {
      expect(gitDDB.delete('prof01')).toEqual({ id: 'prof01', name: 'mari' });
    })
  
  
    test('Create another document', () => {
      expect(gitDDB.put({ id: 'prof02', name: 'yuzu' })).toEqual({ id: 'prof02', name: 'yuzu' });
    });
  */
});
