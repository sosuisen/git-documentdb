
import { GitDocumentDB } from './index';

let gitDDB: GitDocumentDB = new GitDocumentDB('ddb_test_repository01');

test('Create a new document', () => {
  expect(gitDDB.put({ id: 'prof01', name: 'shirase' })).toEqual({ id: 'prof01', name: 'shirase'});
});

test('Update an existing document', () => {
  expect(gitDDB.put({ id: 'prof01', name: 'mari' })).toEqual({ id: 'prof01', name: 'mari' });
});

test('Fetch a document', () => {
  expect(gitDDB.get('prof01')).toEqual({ id: 'prof01', name: 'mari'});
})

test('Delete the document', () => {
  expect(gitDDB.delete('prof01')).toEqual({ id: 'prof01', name: 'mari'});
})

test('Create another document', () => {
  expect(gitDDB.put({ id: 'prof02', name: 'yuzu' })).toEqual({ id: 'prof02', name: 'yuzu'});
});

test('Close the database', () => {
  expect(gitDDB.close()).toBeTruthy();
  expect(gitDDB.put({ id: 'prof01', name: 'shirase' })).toThrowError();
})

gitDDB = new GitDocumentDB('ddb_test_repository01');

test('Open existing database and fetch a document', () => {
  expect(gitDDB.get('prof02')).toEqual({ id: 'prof02', name: 'yuzu'});
})
