import { GitDocumentDB } from 'git-documentdb';

const gitDDB = new GitDocumentDB({
  db_name: 'db01', // Git working directory
});
const foo = async () => {
  // Open a database
  await gitDDB.open(); // Git creates a repository (/your/path/to/the/app/gitddb/db01/.git)
  // Create a document
  await gitDDB.put({ _id: 'profile01', name: 'Yuzuki', age: '15' }); // Git adds 'profile01.json' under the working directory and commit it.
  // Update it
  await gitDDB.put({ _id: 'profile01', name: 'Yuzuki', age: '16' }); // Git adds a updated file and commit it.
  // Read it
  const doc = await gitDDB.get('profile01');
  console.log(doc); // doc = { _id: 'profile01', name: 'Yuzuki', age: '16' }
  // Delete it
  await gitDDB.remove('profile01'); // Git removes a file and commit it.

  /* Where is the working directory?
  const workingDir = gitDDB.workingDir();
  console.log(workingDir); // workingDir = '/your/path/to/the/app/gitddb/db01'
  */

  /**
    Create documents under sub-directories

    gitddb
    └── db01
        ├── Gunma
        │   ├── 1.json
        │   ├── 2.json
        │   └── 3.json
        └── Sapporo
            └── 1.json

  */
  // Put documents by using filepath representation
  await gitDDB.put({ _id: 'Gunma/1', name: 'Kimari', age: '16' });
  await gitDDB.put({ _id: 'Gunma/2', name: 'Shirase', age: '17' });
  await gitDDB.put({ _id: 'Gunma/3', name: 'Hinata', age: '17' });
  await gitDDB.put({ _id: 'Sapporo/1', name: 'Yuzuki', age: '16' });
  
  // Read one
  const docFromSapporo = await gitDDB.get('Sapporo/1');
  console.log(docFromSapporo); // docFromSapporo = { _id: 'Sapporo/1', name: 'Yuzuki', age: '16' }

  // Read all the documents under Gunma sub-directory
  const docsFromGunma = await gitDDB.allDocs({ collection_path: 'Gunma', include_docs: true });
  console.dir(docsFromGunma, { depth: 3 });
  /* docsFromGunma = 
  {
    total_rows: 3,
    commit_sha: '39b82ee2458a39023fd9cd098ea6a5486593aceb',
    rows: [
      {
        id: 'Gunma/1',
        file_sha: 'fae60a86958402b424102f16361a501c561be654',
        doc: { name: 'Kimari', age: '16', _id: '1' }
      },
      {
        id: 'Gunma/2',
        file_sha: '1255eff6d316a73077468dbda2b026e96fdf00e6',
        doc: { name: 'Shirase', age: '17', _id: '2' }
      },
      {
        id: 'Gunma/3',
        file_sha: '1f1c89b5253c4feab67a31f8bce1443e3d72512f',
        doc: { name: 'Hinata', age: '17', _id: '3' }
      }
    ]
  }
  */
  // destroy() closes db and removes both the Git repository and the working directory.
  await gitDDB.destroy();

  // Try it again by another way.
  await gitDDB.open();
  // Use collections to make it easier
  const Gunma = gitDDB.collection('Gunma');
  const Sapporo = gitDDB.collection('Sapporo');
  await Gunma.put({ _id: '1', name: 'Kimari', age: '16' });
  await Gunma.put({ _id: '2', name: 'Shirase', age: '17' });
  await Gunma.put({ _id: '3', name: 'Hinata', age: '17' });
  await Sapporo.put({ _id: '1', name: 'Yuzuki', age: '16' });

  // Read one
  const docFromSapporoCollection = await Sapporo.get('1');
  console.log(docFromSapporoCollection); // docFromSapporoCollection = { _id: '1', name: 'Yuzuki', age: '16' }

  // Read all the documents in Gunma collection
  const docsFromCollection = await Gunma.allDocs({ include_docs: true });
  console.dir(docsFromCollection, { depth: 3 });
  /* docsFromGunmaCollection = 
  {
    total_rows: 3,
    commit_sha: '39b82ee2458a39023fd9cd098ea6a5486593aceb',
    rows: [
      {
        id: '1',
        file_sha: 'fae60a86958402b424102f16361a501c561be654',
        doc: { _id: '1', name: 'Kimari', age: '16' }
      },
      {
        id: '2',
        file_sha: '1255eff6d316a73077468dbda2b026e96fdf00e6',
        doc: { _id: '2', name: 'Shirase', age: '17' }
      },
      {
        id: '3',
        file_sha: '1f1c89b5253c4feab67a31f8bce1443e3d72512f',
        doc: { _id: '3', name: 'Hinata', age: '17' }
      }
    ]
  }
  */

  // Read one by using filepath representation
  const docFromSapporoCollectionByUsingPath = await gitDDB.get('Sapporo/1');
  console.log(docFromSapporoCollectionByUsingPath); // docFromSapporoCollectionByUsingPath = { _id: 'Sapporo/1', name: 'Yuzuki', age: '16' }

  /*
   * Actually, collection is a sugar syntax of filepath representation.
   * Both filepath representation (like PouchDB) and collection put the same file on the same location in a Git repository.
   * e.g) Both gitDDB.put({ _id: 'Sapporo/1', name: 'Yuzuki' }) and gitDDB.collection('Sapporo').put({ _id: '1', name: 'Yuzuki' }) put 'gitddb/db01/Sapporo/1.json' in which JSON document has { _id: '1', name: 'Yuzuki' }.
   * 
   * Notice that APIs return different _id values in spite of the same source file.
   * gitDDB.get({ _id: 'Sapporo/1' }) returns { _id: 'Sapporo/1', name: 'Yuzuki' }.
   * gitDDB.collection('Sapporo').get({ _id: '1' }) returns { _id: '1', name: 'Yuzuki' }.
   */

  // Close database
  await gitDDB.close();

};
foo();
