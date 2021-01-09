
import fs from 'fs-extra';
import path from 'path';
import { GitDocumentDB, example } from './index';

describe('Create database', () => {
  const localDir = './test_repos01';
  const dbName = 'ddb_test_repository01';

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

  test('Create and destroy a new database', async () => {
    // Path not found
    await expect(gitDDB.open()).rejects.toMatchObject({ name: 'Error' });

    // Create directory
    fs.mkdirSync(path.resolve(localDir));

    // Create db
    await expect(gitDDB.open()).resolves.toMatchObject({ isNew: true });

    // Destroy db
    await expect(gitDDB.destroy()).resolves.toBeTruthy();
    // fs.access() throw error when a file cannot be accessed.    
    await expect(fs.access(path.resolve(localDir, dbName))).rejects.toMatchObject({ name: 'Error', code: 'ENOENT' });
  });
});


describe('Open and close database', () => {
  const localDir = './test_repos02';
  const dbName = 'ddb_test_repository02';

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
    fs.mkdirSync(path.resolve(localDir));
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
  const localDir = './test_repos03';
  const dbName = 'ddb_test_repository03';

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
    fs.mkdirSync(path.resolve(localDir));
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
