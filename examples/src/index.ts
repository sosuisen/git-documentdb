import { GitDocumentDB } from 'git-documentdb';

const gitDDB = new GitDocumentDB({
    localDir: 'gddb_data',
    dbName: 'db01',
  });
const setAndGetProf = async () => {
  // Create repository
  await gitDDB.open();
  // Create
  await gitDDB.put({ _id: '4', name: 'Yuzuki', age: '15' });
  // Update
  await gitDDB.put({ _id: '4', name: 'Yuzuki', age: '16' });
  // Read
  const prof = await gitDDB.get('4');
  console.log(prof);  // { _id: '4', name: 'Yuzuki', age: '16' }
  // Delete
  await gitDDB.delete('4');
  await gitDDB.close();
  // destroy() removes repository
  // await gitDDB.destroy(); 
}
setAndGetProf();
