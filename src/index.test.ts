/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import fs from 'fs-extra';
import path from 'path';
import { CannotCreateDirectoryError, UndefinedDocumentIdError, DocumentNotFoundError, InvalidJsonObjectError, InvalidIdCharacterError, InvalidIdLengthError, InvalidWorkingDirectoryPathLengthError, RepositoryNotOpenError, DatabaseCloseTimeoutError, DatabaseClosingError } from './error';
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

describe('Create repository', () => {
  const readonlyDir = './test/readonly/';
  const localDir = './test/database01_1';

  beforeAll(() => {
    if (process.platform !== 'win32') {
      fs.removeSync(path.resolve(localDir));
    }
  });

  afterAll(() => {
    if (process.platform !== 'win32') {
      fs.removeSync(path.resolve(localDir));
    }
  });

  test('open(): Try to create a new repository on a readonly filesystem.', async () => {
    const dbName = './test_repos01_1';
    // Windows does not support permission option of fs.mkdir().
    if (process.platform === 'win32') {
      console.warn(`You must create ${readonlyDir} directory by hand, click [disable inheritance] button, and remove write permission of Authenticated Users.`);
    }
    else {
      if (!fs.existsSync('test')){
        await fs.mkdir('test');
      }
      await fs.ensureDir(readonlyDir, { mode: 0o400 }).catch((err: Error) => { console.error(err) });
    }
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: readonlyDir + 'database'
    });
    // You don't have permission
    await expect(gitDDB.open()).rejects.toThrowError(CannotCreateDirectoryError);
    if (process.platform !== 'win32') {
      fs.chmodSync(readonlyDir, 0o644);
    }
  });


  test('open(): Create and destroy a new repository.', async () => {
    const dbName = './test_repos01_2';

    const gitDDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });

    // Create db
    await expect(gitDDB.open()).resolves.toMatchObject({ isNew: true }).catch(e => console.error(e));
    // Check path of working directory
    expect(gitDDB.workingDir()).toBe(path.resolve('./test/database01_1/test_repos01_2'));
    // Destroy db
    await expect(gitDDB.destroy()).resolves.toBeTruthy().catch(e => console.error(e));
    // fs.access() throw error when a file cannot be accessed.    
    await expect(fs.access(path.resolve(localDir, dbName))).rejects.toMatchObject({ name: 'Error', code: 'ENOENT' });
  });


  test('open(): Try to create a long name repository.', async () => {
    const dbName = './0123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789';
    // Code must be wrapped by () => {} to test exception
    // https://jestjs.io/docs/en/expect#tothrowerror
    expect(() => {
      new GitDocumentDB({
        dbName: dbName,
        localDir: localDir
      });
    }).toThrowError(InvalidWorkingDirectoryPathLengthError);
  });
});


describe('Open, close and destroy repository', () => {
  const localDir = './test/database02_1';

  beforeAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  afterAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  test('open(), close() and destroy(): Open an existing repository.', async () => {
    const dbName = './test_repos02_1';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });

    // Create db
    await gitDDB.open();

    // Close created db
    await expect(gitDDB.close()).resolves.toBeTruthy();

    // Open existing db
    await expect(gitDDB.open()).resolves.toMatchObject({ isNew: false, isCreatedByGitDDB: true, isValidVersion: true });
    expect(gitDDB.isOpened()).toBeTruthy();

    // Destroy() closes db automatically
    await expect(gitDDB.destroy()).resolves.toBeTruthy();
    expect(gitDDB.isOpened()).toBeFalsy();
  });


  test('open(): Open a repository created by another app.', async () => {
    const dbName = 'test_repos02_2';
    const gitDDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    const options: RepositoryInitOptions = {
      description: 'another app',
      flags: repositoryInitOptionFlags.GIT_REPOSITORY_INIT_MKDIR,
      initialHead: 'main'
    };
    // Create git repository with invalid description
    await fs.ensureDir(localDir);
    // @ts-ignore
    await nodegit.Repository.initExt(path.resolve(localDir, dbName), options).catch(err => { throw new Error(err) });
    await gitDDB.close();

    await expect(gitDDB.open()).resolves.toMatchObject({ isNew: false, isCreatedByGitDDB: false, isValidVersion: false });
    await gitDDB.destroy();
  });


  test('open(): Open a repository created by another version.', async () => {
    const dbName = 'test_repos02_3';
    const gitDDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    const options: RepositoryInitOptions = {
      description: 'GitDocumentDB: 0.1',
      flags: repositoryInitOptionFlags.GIT_REPOSITORY_INIT_MKDIR,
      initialHead: 'main'
    };
    // Create git repository with invalid description
    await fs.ensureDir(localDir);
    // @ts-ignore
    await nodegit.Repository.initExt(path.resolve(localDir, dbName), options).catch(err => { throw new Error(err) });
    await gitDDB.close();

    await expect(gitDDB.open()).resolves.toMatchObject({ isNew: false, isCreatedByGitDDB: true, isValidVersion: false });
    await gitDDB.destroy();
  });

  test('open(): Open a repository with no description file.', async () => {
    const dbName = 'test_repos02_4';
    const gitDDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();
    const workingDirectory = gitDDB.workingDir();
    await gitDDB.close();
    fs.removeSync(path.resolve(workingDirectory, '.git', 'description'));
    await expect(gitDDB.open()).resolves.toMatchObject({ isNew: false, isCreatedByGitDDB: false, isValidVersion: false });
  });

  test('Open db twice.', async () => {
    const dbName = './test_repos02_5';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });

    // Create db
    const info = await gitDDB.open();
    await expect(gitDDB.open()).resolves.toMatchObject(info);
    await gitDDB.destroy();
  });

});


describe('Create document', () => {
  const localDir = './test/database03';

  beforeAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  afterAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  test('put(): Repository is not opened.', async () => {
    const dbName = './test_repos03_1';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await expect(gitDDB.put({ _id: 'prof01', name: 'shirase' })).rejects.toThrowError(RepositoryNotOpenError);
    await expect(gitDDB._put_concurrent({ _id: 'prof01', name: 'shirase' })).rejects.toThrowError(RepositoryNotOpenError);
    await gitDDB.destroy();
  });


  test('put(): Put an undefined value', async () => {
    const dbName = './test_repos03_2';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();
    // @ts-ignore
    await expect(gitDDB.put(undefined)).rejects.toThrowError(InvalidJsonObjectError);
    await gitDDB.destroy();
  });


  test('put(): An _id is not found.', async () => {
    const dbName = './test_repos03_3';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();
    await expect(gitDDB.put({ name: 'shirase' })).rejects.toThrowError(UndefinedDocumentIdError);
    await gitDDB.destroy();
  });


  test('put(): key includes invalid character.', async () => {
    const dbName = './test_repos03_4';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();
    await expect(gitDDB.put({ _id: '<test>', name: 'shirase' })).rejects.toThrowError(InvalidIdCharacterError);
    await expect(gitDDB.put({ _id: '_test', name: 'shirase' })).rejects.toThrowError(InvalidIdCharacterError);
    await expect(gitDDB.put({ _id: 'test.', name: 'shirase' })).rejects.toThrowError(InvalidIdCharacterError);
    await gitDDB.destroy();
  });


  test('put(): key length is invalid.', async () => {
    const dbName = './test_repos03_5';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();
    await expect(gitDDB.put({ _id: '0123456789012345678901234567890123456789012345678901234567890123456789', name: 'shirase' })).rejects.toThrowError(InvalidIdLengthError);
    await expect(gitDDB.put({ _id: '', name: 'shirase' })).rejects.toThrowError(InvalidIdLengthError);
    await gitDDB.destroy();
  });


  test('put(): Put a JSON Object.', async () => {
    const dbName = './test_repos03_6';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();
    const _id = 'prof01';
    await expect(gitDDB.put({ _id: _id, name: 'shirase' })).resolves.toMatchObject(
      {
        _id: expect.stringContaining(_id),
        file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
        commit_sha: expect.stringMatching(/^[a-z0-9]{40}$/)
      }
    );
    await gitDDB.destroy();
  });


  test('put(): Put a JSON Object into subdirectory.', async () => {
    const dbName = './test_repos03_7';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();
    const _id = 'dir01/prof01';
    await expect(gitDDB.put({ _id: _id, name: 'shirase' })).resolves.toMatchObject(
      {
        _id: expect.stringContaining(_id),
        file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
        commit_sha: expect.stringMatching(/^[a-z0-9]{40}$/)
      }
    );
    await gitDDB.destroy();
  });

  test('put(): Put a invalid JSON Object (not pure)', async () => {
    const dbName = './test_repos03_8';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();
    const _id = 'prof01';
    // JSON.stringify() throws error if an object is recursive.
    const obj1 = { obj: {} };
    const obj2 = { obj: obj1 };
    obj1.obj = obj2;
    await expect(gitDDB.put({ _id: 'prof01', obj: obj1 })).rejects.toThrowError(InvalidJsonObjectError);
    await gitDDB.destroy();
  });

  test.todo('Check whether _id property is excluded from the repository document')

  test.todo('Test CannotWriteDataError. Create readonly file and try to rewrite it. Prepare it by hand if OS is Windows.');

});


describe('Read document', () => {
  const localDir = './test/database05';

  beforeAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  afterAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  test('get(): Read an existing document', async () => {
    const dbName = './test_repos05_1';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });

    await gitDDB.open();
    const _id = 'prof01';
    await gitDDB.put({ _id: _id, name: 'shirase' });
    // Get
    await expect(gitDDB.get(_id)).resolves.toEqual({ _id: _id, name: 'shirase' });
    await gitDDB.destroy();
    // Check error
    await expect(gitDDB.get(_id)).rejects.toThrowError(RepositoryNotOpenError);
  });


  test('get(): Read an existing document in subdirectory', async () => {
    const dbName = './test_repos05_2';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });

    await gitDDB.open();
    const _id = 'dir01/prof01';
    await gitDDB.put({ _id: _id, name: 'shirase' });
    // Get
    await expect(gitDDB.get(_id)).resolves.toEqual({ _id: _id, name: 'shirase' });
    await gitDDB.destroy();
  });

  test('get(): Read a document that does not exist.', async () => {
    const dbName = './test_repos05_3';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();
    const _id = 'prof01';
    await expect(gitDDB.get('prof01')).rejects.toThrowError(DocumentNotFoundError);
    await gitDDB.put({ _id: _id, name: 'shirase' });
    // @ts-ignore
    await expect(gitDDB.get(undefined)).rejects.toThrowError(UndefinedDocumentIdError);
    await expect(gitDDB.get('prof02')).rejects.toThrowError(DocumentNotFoundError);
    await gitDDB.destroy();
  });

  test.todo('Check InvalidJsonObjectError.');
});


describe('Update document', () => {
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
    const _id = 'prof01';
    await gitDDB.put({ _id: _id, name: 'shirase' });
    // Update
    await expect(gitDDB.put({ _id: _id, name: 'mari' })).resolves.toMatchObject(
      {
        _id: expect.stringContaining(_id),
        file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
        commit_sha: expect.stringMatching(/^[a-z0-9]{40}$/)
      }
    );
    // Get
    await expect(gitDDB.get('prof01')).resolves.toEqual({ _id: 'prof01', name: 'mari' });

    await gitDDB.destroy();
  });
});


describe('Delete document', () => {
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
    const _id = 'prof01';
    await expect(gitDDB.delete(_id)).rejects.toThrowError(DocumentNotFoundError);
    await gitDDB.put({ _id: _id, name: 'shirase' });
    // Delete
    await expect(gitDDB.delete(_id)).resolves.toMatchObject(
      {
        _id: expect.stringContaining(_id),
        file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
        commit_sha: expect.stringMatching(/^[a-z0-9]{40}$/)
      }
    );
    await expect(gitDDB.delete(_id)).rejects.toThrowError(DocumentNotFoundError);    
    await expect(gitDDB.get(_id)).rejects.toThrowError(DocumentNotFoundError);
    // @ts-ignore
    await expect(gitDDB._delete_concurrent(undefined)).rejects.toThrowError(UndefinedDocumentIdError);

    await gitDDB.destroy();

    await expect(gitDDB.delete(_id)).rejects.toThrowError(RepositoryNotOpenError);    
  });

});


describe('Fetch a batch of documents', () => {
  const localDir = './test/database08';
  const _id_a = 'apple';
  const name_a = 'Apple woman';
  const _id_b = 'banana';
  const name_b = 'Banana man';

  const _id_c01 = 'citrus/amanatsu';
  const name_c01 = 'Amanatsu boy';
  const _id_c02 = 'citrus/yuzu';
  const name_c02 = 'Yuzu girl';
  const _id_d = 'durio/durian';
  const name_d = 'Durian girls';
  const _id_p = 'pear/Japan/21st';
  const name_p = '21st century pear';


  beforeAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  afterAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  test('allDocs()', async () => {
    const dbName = './test_repos08_1';

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });

    await expect(gitDDB.allDocs({ recursive: true })).rejects.toThrowError(RepositoryNotOpenError);

    await gitDDB.open();

    await expect(gitDDB.allDocs()).resolves.toStrictEqual({ total_rows : 0});    

    await gitDDB.put({ _id: _id_b, name: name_b });
    await gitDDB.put({ _id: _id_a, name: name_a });

    await expect(gitDDB.allDocs()).resolves.toMatchObject(
      {
        total_rows: 2,
        commit_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
        rows: [
          {
            _id: expect.stringContaining(_id_a),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
          },
          {
            _id: expect.stringContaining(_id_b),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
          },
        ]
      });

    await gitDDB.destroy();
  });


  test('allDocs(): options.descendant', async () => {
    const dbName = './test_repos08_2';

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();

    await gitDDB.put({ _id: _id_b, name: name_b });
    await gitDDB.put({ _id: _id_a, name: name_a });

    await expect(gitDDB.allDocs({ descendant: true })).resolves.toMatchObject(
      {
        total_rows: 2,
        commit_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
        rows: [
          {
            _id: expect.stringContaining(_id_b),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
          },
          {
            _id: expect.stringContaining(_id_a),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
          },
        ]
      });

    await gitDDB.destroy();
  });

  test('allDocs(): options.include_docs', async () => {
    const dbName = './test_repos08_3';

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();

    await gitDDB.put({ _id: _id_b, name: name_b });
    await gitDDB.put({ _id: _id_a, name: name_a });

    await expect(gitDDB.allDocs({ include_docs: true })).resolves.toMatchObject(
      {
        total_rows: 2,
        commit_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
        rows: [
          {
            _id: expect.stringContaining(_id_a),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
            doc: {
              _id: expect.stringContaining(_id_a),
              name: name_a
            }
          },
          {
            _id: expect.stringContaining(_id_b),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
            doc: {
              _id: expect.stringContaining(_id_b),
              name: name_b
            }
          },
        ]
      });

    await gitDDB.destroy();
  });

  test('allDocs(): breadth-first search (recursive)', async () => {
    const dbName = './test_repos08_4';

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();

    await gitDDB.put({ _id: _id_b, name: name_b });
    await gitDDB.put({ _id: _id_a, name: name_a });
    await gitDDB.put({ _id: _id_d, name: name_d });
    await gitDDB.put({ _id: _id_c01, name: name_c01 });
    await gitDDB.put({ _id: _id_c02, name: name_c02 });

    await expect(gitDDB.allDocs({ include_docs: true, recursive: true })).resolves.toMatchObject(
      {
        total_rows: 5,
        commit_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
        rows: [
          {
            _id: expect.stringContaining(_id_a),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
            doc: {
              _id: expect.stringContaining(_id_a),
              name: name_a
            }
          },
          {
            _id: expect.stringContaining(_id_b),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
            doc: {
              _id: expect.stringContaining(_id_b),
              name: name_b
            }
          },
          {
            _id: expect.stringContaining(_id_c01),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
            doc: {
              _id: expect.stringContaining(_id_c01),
              name: name_c01
            }
          },
          {
            _id: expect.stringContaining(_id_c02),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
            doc: {
              _id: expect.stringContaining(_id_c02),
              name: name_c02
            }
          },
          {
            _id: expect.stringContaining(_id_d),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
            doc: {
              _id: expect.stringContaining(_id_d),
              name: name_d
            }
          },
        ]
      });

    await gitDDB.destroy();
  });


  test('allDocs(): breadth-first search (not recursive)', async () => {
    const dbName = './test_repos08_5';

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();

    await gitDDB.put({ _id: _id_b, name: name_b });
    await gitDDB.put({ _id: _id_a, name: name_a });
    await gitDDB.put({ _id: _id_d, name: name_d });
    await gitDDB.put({ _id: _id_c01, name: name_c01 });
    await gitDDB.put({ _id: _id_c02, name: name_c02 });

    await expect(gitDDB.allDocs({ include_docs: true })).resolves.toMatchObject(
      {
        total_rows: 2,
        commit_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
        rows: [
          {
            _id: expect.stringContaining(_id_a),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
            doc: {
              _id: expect.stringContaining(_id_a),
              name: name_a
            }
          },
          {
            _id: expect.stringContaining(_id_b),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
            doc: {
              _id: expect.stringContaining(_id_b),
              name: name_b
            }
          }
        ]
      });

    await gitDDB.destroy();
  });


  test('allDocs(): get from directory', async () => {
    const dbName = './test_repos08_6';

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();

    await gitDDB.put({ _id: _id_b, name: name_b });
    await gitDDB.put({ _id: _id_a, name: name_a });
    await gitDDB.put({ _id: _id_d, name: name_d });
    await gitDDB.put({ _id: _id_c01, name: name_c01 });
    await gitDDB.put({ _id: _id_c02, name: name_c02 });

    await expect(gitDDB.allDocs({ directory: 'citrus', include_docs: true })).resolves.toMatchObject(
      {
        total_rows: 2,
        commit_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
        rows: [
          {
            _id: expect.stringContaining(_id_c01),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
            doc: {
              _id: expect.stringContaining(_id_c01),
              name: name_c01
            }
          },
          {
            _id: expect.stringContaining(_id_c02),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
            doc: {
              _id: expect.stringContaining(_id_c02),
              name: name_c02
            }
          },
        ]
      });

    await expect(gitDDB.allDocs({ recursive: true, directory: 'not_exist' })).resolves.toStrictEqual({ total_rows: 0 });


    await gitDDB.destroy();
  });


  test('allDocs(): get from deep directory', async () => {
    const dbName = './test_repos08_7';

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();

    await gitDDB.put({ _id: _id_p, name: name_p });

    await gitDDB.put({ _id: _id_b, name: name_b });
    await gitDDB.put({ _id: _id_a, name: name_a });
    await gitDDB.put({ _id: _id_d, name: name_d });
    await gitDDB.put({ _id: _id_c01, name: name_c01 });
    await gitDDB.put({ _id: _id_c02, name: name_c02 });

    await expect(gitDDB.allDocs({ directory: 'pear/Japan', include_docs: true })).resolves.toMatchObject(
      {
        total_rows: 1,
        commit_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
        rows: [
          {
            _id: expect.stringContaining(_id_p),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
            doc: {
              _id: expect.stringContaining(_id_p),
              name: name_p
            }
          },
        ]
      });

    await gitDDB.destroy();
  });

});




describe('Serial', () => {
  const localDir = './test/database09';
  const _id_a = 'apple';
  const name_a = 'Apple woman';
  const _id_b = 'banana';
  const name_b = 'Banana man';

  const _id_c01 = 'citrus/amanatsu';
  const name_c01 = 'Amanatsu boy';
  const _id_c02 = 'citrus/yuzu';
  const name_c02 = 'Yuzu girl';
  const _id_d = 'durio/durian';
  const name_d = 'Durian girls';
  const _id_p = 'pear/Japan/21st';
  const name_p = '21st century pear';

  beforeAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  afterAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  test('put(): serial', async () => {
    const dbName = './test_repos09_1';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();

    await Promise.all([gitDDB.put({ _id: _id_a, name: name_a }),
    gitDDB.put({ _id: _id_b, name: name_b }),
    gitDDB.put({ _id: _id_c01, name: name_c01 }),
    gitDDB.put({ _id: _id_c02, name: name_c02 }),
    gitDDB.put({ _id: _id_d, name: name_d }),
    gitDDB.put({ _id: _id_p, name: name_p })]);


    await expect(gitDDB.allDocs({ recursive: true })).resolves.toMatchObject(
      {
        total_rows: 6,
        commit_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
        rows: [
          {
            _id: expect.stringContaining(_id_a),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
          },
          {
            _id: expect.stringContaining(_id_b),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
          },
          {
            _id: expect.stringContaining(_id_c01),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
          },
          {
            _id: expect.stringContaining(_id_c02),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
          },
          {
            _id: expect.stringContaining(_id_d),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
          },
          {
            _id: expect.stringContaining(_id_p),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
          },
        ]
      });

    await gitDDB.destroy();
  });


  test('put(): serial put() a lot', async () => {
    const dbName = './test_repos09_2';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();

    const workers = [];
    for (let i = 0; i < 100; i++) {
      workers.push(gitDDB.put({ _id: i.toString(), name: i.toString() }));
    }
    await expect(Promise.all(workers)).resolves.toHaveLength(100);


    await expect(gitDDB.allDocs({ recursive: true })).resolves.toMatchObject(
      {
        total_rows: 100,
        commit_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
      });

    await gitDDB.destroy();
  });


  test('put(): Concurrent calls of _put_concurrent() cause an error.', async () => {
    const dbName = './test_repos09_3';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();

    await expect(Promise.all([gitDDB._put_concurrent({ _id: _id_a, name: name_a }),
    gitDDB._put_concurrent({ _id: _id_b, name: name_b }),
    gitDDB._put_concurrent({ _id: _id_c01, name: name_c01 }),
    gitDDB._put_concurrent({ _id: _id_c02, name: name_c02 }),
    gitDDB._put_concurrent({ _id: _id_d, name: name_d }),
    gitDDB._put_concurrent({ _id: _id_p, name: name_p })])).rejects.toThrowError();

    await gitDDB.destroy();
  });


  test('delete(): serial', async () => {
    const dbName = './test_repos09_4';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();

    await Promise.all([gitDDB.put({ _id: _id_a, name: name_a }),
    gitDDB.put({ _id: _id_b, name: name_b }),
    gitDDB.put({ _id: _id_c01, name: name_c01 }),
    gitDDB.put({ _id: _id_c02, name: name_c02 }),
    gitDDB.put({ _id: _id_d, name: name_d }),
    gitDDB.put({ _id: _id_p, name: name_p })]);

    await Promise.all([gitDDB.delete(_id_a),
    gitDDB.delete(_id_b),
    gitDDB.delete(_id_c01),
    gitDDB.delete(_id_c02),
    gitDDB.delete(_id_d)]);


    await expect(gitDDB.allDocs({ recursive: true })).resolves.toMatchObject(
      {
        total_rows: 1,
        commit_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
        rows: [
          {
            _id: expect.stringContaining(_id_p),
            file_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
          },
        ]
      });

    await gitDDB.destroy();
  });


  test('delete()): Concurrent calls of _delete_concurrent() cause an error.', async () => {
    const dbName = './test_repos09_5';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();

    await Promise.all([gitDDB.put({ _id: _id_a, name: name_a }),
    gitDDB.put({ _id: _id_b, name: name_b }),
    gitDDB.put({ _id: _id_c01, name: name_c01 }),
    gitDDB.put({ _id: _id_c02, name: name_c02 }),
    gitDDB.put({ _id: _id_d, name: name_d }),
    gitDDB.put({ _id: _id_p, name: name_p })]);

    await expect(Promise.all([gitDDB._delete_concurrent(_id_a),
    gitDDB._delete_concurrent(_id_b),
    gitDDB._delete_concurrent(_id_c01),
    gitDDB._delete_concurrent(_id_c02),
    gitDDB._delete_concurrent(_id_d)])).rejects.toThrowError();

    await gitDDB.destroy();
  });
});



describe('Close database', () => {
  const localDir = './test/database10';

  beforeAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  afterAll(() => {
    fs.removeSync(path.resolve(localDir));
  });

  test('close(): wait queued operations', async () => {
    const dbName = './test_repos10_1';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();

    const workers = [];
    for (let i = 0; i < 100; i++) {
      gitDDB.put({ _id: i.toString(), name: i.toString() }).catch(err => console.error(err));
    }

    await gitDDB.close();

    await gitDDB.open();

    await expect(gitDDB.allDocs({ recursive: true })).resolves.toMatchObject(
      {
        total_rows: 100,
        commit_sha: expect.stringMatching(/^[a-z0-9]{40}$/),
      });

    await gitDDB.destroy();
  });


  test('close(): queued operations are timeout', async () => {
    const dbName = './test_repos10_2';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();

    const workers = [];
    for (let i = 0; i < 100; i++) {
      // put() will throw Error after the database is closed by timeout.      
      gitDDB.put({ _id: i.toString(), name: i.toString() }).catch(err => { });
    }

    await expect(gitDDB.close({ timeout: 1 })).rejects.toThrowError(DatabaseCloseTimeoutError);

    await gitDDB.open();

    // total_rows is less than 100    
    await expect(gitDDB.allDocs({ recursive: true })).resolves.not.toMatchObject(
      {
        total_rows: 100
      });

    await gitDDB.destroy();
  });


  test('close(): close database by force', async () => {
    const dbName = './test_repos10_3';
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();

    for (let i = 0; i < 100; i++) {
      // put() will throw Error after the database is closed by force.
      gitDDB.put({ _id: i.toString(), name: i.toString() }).catch(err => { });
    }

    await gitDDB.close({ force: true });

    await gitDDB.open();

    // total_rows is less than 100
    await expect(gitDDB.allDocs({ recursive: true })).resolves.not.toMatchObject(
      {
        total_rows: 100
      });

    await gitDDB.destroy();
  });

  test('Check isClosing flag', async () => {
    const dbName = './test_repos10_4';
    const gitDDB = new GitDocumentDB({
      dbName: dbName,
      localDir: localDir
    });
    await gitDDB.open();
    
    for (let i = 0; i < 100; i++) {
      // put() will throw Error after the database is closed by force.
      gitDDB.put({ _id: i.toString(), name: i.toString() }).catch(err => { });
    }
    // Call close() without await
    gitDDB.close();
    await expect(gitDDB.open()).rejects.toThrowError(DatabaseClosingError);
    const _id = 'prof01';
    await expect(gitDDB.put({ _id: _id, name: 'shirase' })).rejects.toThrowError(DatabaseClosingError);
    await expect(gitDDB.get(_id)).rejects.toThrowError(DatabaseClosingError);
    await expect(gitDDB.delete(_id)).rejects.toThrowError(DatabaseClosingError);    
    await expect(gitDDB.close()).rejects.toThrowError(DatabaseClosingError);        
    await expect(gitDDB.destroy()).rejects.toThrowError(DatabaseClosingError);            
    await expect(gitDDB.allDocs()).rejects.toThrowError(DatabaseClosingError);            
  });

});
