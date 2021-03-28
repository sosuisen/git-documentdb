import { GitDocumentDB } from 'git-documentdb';

const gitDDB = new GitDocumentDB({
  db_name: 'db01', // Git working directory
});
const foo = async () => {
  // Open
  await gitDDB.open(); // Git creates a repository (/your/path/to/the/app/gitddb/db01/.git)
  // Create
  await gitDDB.put({ _id: 'profile01', name: 'Yuzuki', age: '15' }); // Git adds 'profile01.json' under the working directory and commits it.
  // Update
  await gitDDB.put({ _id: 'profile01', name: 'Yuzuki', age: '16' }); // Git adds a updated file and commits it.
  // Read
  const doc = await gitDDB.get('profile01');
  console.log(doc); // doc = { _id: 'profile01', name: 'Yuzuki', age: '16' }
  // Delete
  await gitDDB.remove('profile01'); // Git removes a file and commits it.

  /* Where is the working directory?
  const workingDir = gitDDB.workingDir();
  console.log(workingDir); // workingDir = '/your/path/to/the/app/gitddb/db01'
  */

  /**
    Create documents under sub-directories

    gitddb
    └── db01
        ├── tatebayashi
        │   ├── tamaki_mari.json
        │   ├── kobuchizawa_shirase.json
        │   ├── miyake_hinata.json
        │   └── tamaki_rin.json
        └── sapporo
            └── shiraishi_yuzuki.json

  */
  // Put documents by using filepath representation.
  await gitDDB.put({ _id: 'tatebayashi/tamaki_mari', nickname: 'Kimari', age: '16' });
  await gitDDB.put({ _id: 'tatebayashi/kobuchizawa_shirase', nickname: 'Shirase', age: '17' });
  await gitDDB.put({ _id: 'tatebayashi/miyake_hinata', nickname: 'Hinata', age: '17' });
  await gitDDB.put({ _id: 'tatebayashi/tamaki_rin', nickname: 'Rin' });
  await gitDDB.put({ _id: 'sapporo/shiraishi_yuzuki', nickname: 'Yuzu', age: '16' });

  // Read
  const fromSapporo = await gitDDB.get('sapporo/shiraishi_yuzuki');
  console.log(fromSapporo); // fromSapporo = { _id: 'sapporo/shiraishi_yuzuki', nickname: 'Yuzu', age: '16' }

  // Prefix search
  
  // Read all the documents whose IDs start with the prefix.
  const fromTatebayashi = await gitDDB.allDocs({ prefix: 'tatebayashi/tamaki', include_docs: true });
  console.dir(fromTatebayashi, { depth: 3 });
  /* fromTatebayashi = 
  {
    total_rows: 2,
    commit_sha: 'xxxxx_commit_sha_of_your_head_commit_xxxxx',
    rows: [
      {
        id: 'tatebayashi/tamaki_mari',
        file_sha: 'cfde86e9d46ff368c418d7d281cf51bcf62f12de',
        doc: { age: '16', nickname: 'Kimari', _id: 'tatebayashi/tamaki_mari' }
      },
      {
        id: 'tatebayashi/tamaki_rin',
        file_sha: 'ed0e428c3b17b888a5c8ba40f2a2e1b0f3490531',
        doc: { nickname: 'Rin', _id: 'tatebayashi/tamaki_rin' }
      }
    ]
  }
  */
  // destroy() closes db and removes both the Git repository and the working directory.
  await gitDDB.destroy();

  // Try it again by another way.
  await gitDDB.open();
  // Use collections to make it easier
  const tatebayashi = gitDDB.collection('tatebayashi');
  const sapporo = gitDDB.collection('sapporo');
  await tatebayashi.put({ _id: 'tamaki_mari', nickname: 'Kimari', age: '16' });
  await tatebayashi.put({ _id: 'kobuchizawa_shirase', nickname: 'Shirase', age: '17' });
  await tatebayashi.put({ _id: 'miyake_hinata', nickname: 'Hinata', age: '17' });
  await tatebayashi.put({ _id: 'tamaki_rin', nickname: 'Rin' });  
  await sapporo.put({ _id: 'shiraishi_yuzuki', nickname: 'Yuzu', age: '16' });

  // Read
  const fromSapporoCollection = await sapporo.get('shiraishi_yuzuki');
  console.log(fromSapporoCollection); // fromSapporoCollection = { _id: 'shiraishi_yuzuki', nickname: 'Yuzu', age: '16' }

  // Read all the documents in tatebayashi collection
  const fromCollection = await tatebayashi.allDocs({ include_docs: true });
  console.dir(fromCollection, { depth: 3 });
  /* fromCollection = 
  {
    total_rows: 4,
    commit_sha: 'xxxxx_commit_sha_of_your_head_commit_xxxxx',
    rows: [
      {
        id: 'kobuchizawa_shirase',
        file_sha: 'c65985e6c0e29f8c51d7c36213336b76077bbcb4',
        doc: { age: '17', nickname: 'Shirase', _id: 'kobuchizawa_shirase' }
      },
      {
        id: 'miyake_hinata',
        file_sha: 'efecfc5383ba0393dd22e3b856fc6b67951e924a',
        doc: { age: '17', nickname: 'Hinata', _id: 'miyake_hinata' }
      },
      {
        id: 'tamaki_mari',
        file_sha: '6b1001f4e9ab07300a45d3d332e64c5e7dcfc297',
        doc: { age: '16', nickname: 'Kimari', _id: 'tamaki_mari' }
      },
      {
        id: 'tamaki_rin',
        file_sha: 'ebadad3d8f15dc97f884f25eea74b4a19d4421f7',
        doc: { nickname: 'Rin', _id: 'tamaki_rin' }
      }
    ]
  }
  */

  // Read one by using filepath representation
  const fromSapporoCollectionByPath = await gitDDB.get('sapporo/shiraishi_yuzuki');
  console.log(fromSapporoCollectionByPath); // fromSapporoCollectionByPath = { _id: 'sapporo/shiraishi_yuzuki', nickname: 'Yuzu', age: '16' }

  /*
   * Actually, collection is a sugar syntax of filepath representation.
   * Both filepath representation (like PouchDB) and collection put the same file on the same location in a Git repository.
   *
   * e.g) gitDDB.put({ _id: 'sapporo/shiraishi_yuzuki', nickname: 'Yuzu' }) and gitDDB.collection('sapporo').put({ _id: 'shiraishi_yuzuki', nickname: 'Yuzu' }) put the same file.
   *      Both put 'gitddb/db01/sapporo/shiraishi_yuzuki.json' in which JSON object is { _id: 'shiraishi_yuzuki', nickname: 'Yuzu' }.
   * 
   * Notice that API returns different _id values in spite of the same JSON document in a Git repository.
   * 
   * e.g) gitDDB.get({ _id: 'sapporo/shiraishi_yuzuki' }) returns { _id: 'sapporo/shiraishi_yuzuki', nickname: 'Yuzu' }.
   *      gitDDB.collection('sapporo').get({ _id: 'shiraishi_yuzuki' }) returns { _id: 'shiraishi_yuzuki', nickname: 'Yuzu' }.
   */

  // Close database
  await gitDDB.close();

};
foo();
