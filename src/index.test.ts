
import fs from 'fs-extra';
import path from 'path';
import { GitDocumentDB } from './index';

describe('Create database', () => {
  const localPath = './test_repos01';
  const dbName = 'ddb_test_repository01';

  const gitDDB: GitDocumentDB = new GitDocumentDB({
    dbName: dbName,
    localPath: localPath
  });
    
  beforeAll(() => {
    fs.removeSync(path.resolve(localPath));
  });

  afterAll(() => {
    fs.removeSync(path.resolve(localPath));
  });

  test('Create and destroy a new database', async () => {
    // Path not found
    await expect(gitDDB.open()).rejects.toMatchObject({ name: 'Error' });

    // Create directory
    fs.mkdirSync(path.resolve(localPath));

    // Create db
    await expect(gitDDB.open()).resolves.toMatchObject({ isNew: true });

    // Destroy db
    await expect(gitDDB.destroy()).resolves.toBeTruthy();
    // fs.access() throw error when a file cannot be accessed.    
    await expect(fs.access(path.resolve(localPath, dbName))).rejects.toMatchObject({ name: 'Error', code: 'ENOENT' });
  });
});


describe('Open and close database', () => {
  const localPath = './test_repos02';
  const dbName = 'ddb_test_repository02';

  const gitDDB: GitDocumentDB = new GitDocumentDB({
    dbName: dbName,
    localPath: localPath
  });

  beforeAll(() => {
    fs.removeSync(path.resolve(localPath));
  });

  afterAll(() => {
    fs.removeSync(path.resolve(localPath));
  });

  test('Open and close the existing database', async () => {
    // Create db
    fs.mkdirSync(path.resolve(localPath));
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
  /*
  test('Create a new document', () => {
    expect(gitDDB.put({ id: 'prof01', name: 'shirase' })).toEqual({ id: 'prof01', name: 'shirase' });
  });


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
