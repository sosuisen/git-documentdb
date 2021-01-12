
import fs from 'fs-extra';
import path from 'path';
import { CannotCreateDirectoryError } from './error';
import { GitDocumentDB } from './index';

const dbName = 'ddb_test_repository';

describe('Create database (1)', () => {
  const readonlyDir = './test_repos01_readonly/';
  const localDir = './test_repos01';
   
  beforeAll(() => {
    if(process.platform !== 'win32') {
      fs.removeSync(path.resolve(readonlyDir));
    }
  });

  afterAll(() => {
    if(process.platform !== 'win32') {
      fs.removeSync(path.resolve(readonlyDir));
    }
  });

  test('Create a new database', async () => {
      // Windows does not support permission option of fs.mkdir().
    if(process.platform === 'win32') {
      console.log(`You must create ${readonlyDir} directory by hand and remove write permission of Authenticated Users.`);
    }
    else{
      await fs.mkdir(readonlyDir, {mode: 0o400});
    }
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: readonlyDir + localDir
    });
    // You don't have permission
    await expect(gitDDB.open()).rejects.toBeInstanceOf(CannotCreateDirectoryError);
  });
});

describe('Create database (2)', () => {
  const localDir = './test_repos02';

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

  test('Create a new database', async () => {
    // Create db
    await expect(gitDDB.open()).resolves.toMatchObject({ isNew: true });
    // Destroy db
    await expect(gitDDB.destroy()).resolves.toBeTruthy();
    // fs.access() throw error when a file cannot be accessed.    
    await expect(fs.access(path.resolve(localDir, dbName))).rejects.toMatchObject({ name: 'Error', code: 'ENOENT' });
  });
});


describe('Open and close database', () => {
  const localDir = './test_repos03';

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

  test('Open and close the existing database', async () => {
    // Create db
    await gitDDB.open();

    // Close created db
    expect(gitDDB.close()).toBeTruthy();

    // Open existing db
    await expect(gitDDB.open()).resolves.toMatchObject({ isNew: false });
    expect(gitDDB.isOpened()).toBeTruthy();

    // Destroy() closes db automatically
    await expect(gitDDB.destroy()).resolves.toBeTruthy();
    expect(gitDDB.isOpened()).toBeFalsy();
  });
});

describe('CRUD', () => {
  const localDir = './test_repos04';

  const gitDDB: GitDocumentDB = new GitDocumentDB({
    dbName: dbName,
    localDir: localDir
  });

  beforeAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  afterAll(() => {
//    fs.removeSync(path.resolve(localDir));
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
