import { GitDocumentDB, CannotCreateDirectoryError } from 'git-documentdb';

/**
 * Test readonly directory
 */ 
// const localDir = '../test_repos01_readonly/test_repos_example';
/**
 * Use writable directory
 */ 
const localDir = './test_repos_example';
const dbName = 'ddb_test_repository';

const gitDDB = new GitDocumentDB({
  dbName: dbName,
  localDir: localDir
});

gitDDB.open().then(() => {
  gitDDB.put({ id: 'prof01', name: 'shirase' })
}).catch(err => {
  if (err instanceof CannotCreateDirectoryError) {
    console.log(`Error: ${err.message}`);
  }
});
