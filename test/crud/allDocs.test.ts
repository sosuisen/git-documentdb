/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */
import path from 'path';
import nodegit from '@sosuisen/nodegit';
import fs from 'fs-extra';
import { monotonicFactory } from 'ulid';
import { InvalidJsonObjectError, RepositoryNotOpenError } from '../../src/error';
import { GitDocumentDB } from '../../src/index';

const ulid = monotonicFactory();
const monoId = () => {
  return ulid(Date.now());
};

const localDir = `./test/database_allDocs`;

beforeEach(function () {
  // @ts-ignore
  console.log(`... ${this.currentTest.fullTitle()}`);
});

beforeAll(() => {
  fs.removeSync(path.resolve(localDir));
});

afterAll(() => {
  fs.removeSync(path.resolve(localDir));
});

describe('<crud/allDocs> allDocs()', () => {
  const _id_1 = '1';
  const name_1 = 'one';
  const _id_a = 'apple';
  const name_a = 'Apple woman';
  const _id_b = 'banana';
  const name_b = 'Banana man';
  const _id_c = 'cherry';
  const name_c = 'Cherry cat';

  const _id_c000 = 'citrus_celery';
  const name_c000 = 'Citrus and celery';
  const _id_c001 = 'citrus_carrot';
  const name_c001 = 'Citrus and carrot';

  const _id_c01 = 'citrus/amanatsu';
  const name_c01 = 'Amanatsu boy';
  const _id_c02 = 'citrus/yuzu';
  const name_c02 = 'Yuzu girl';
  const _id_d = 'durio/durian';
  const name_d = 'Durian girls';
  const _id_p = 'pear/Japan/21st';
  const name_p = '21st century pear';

  it('opens db which is not created by GitDocumentDB', async () => {
    const dbName = monoId();

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    await fs.ensureDir(gitDDB.workingDir());
    // Create empty repository
    await nodegit.Repository.init(gitDDB.workingDir(), 0).catch(err => {
      return Promise.reject(err);
    });
    await gitDDB.open();

    await expect(gitDDB.allDocs()).resolves.toMatchObject({
      total_rows: 0,
      commit_sha: /^.+$/,
      rows: [],
    });

    await gitDDB.destroy();
  });

  it('returns entries by ascending alphabetic order', async () => {
    const dbName = monoId();

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });

    await expect(gitDDB.allDocs()).rejects.toThrowError(RepositoryNotOpenError);

    await gitDDB.createDB();

    await expect(gitDDB.allDocs()).resolves.toStrictEqual({
      total_rows: 0,
      rows: [],
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
    });

    await gitDDB.put({ _id: _id_b, name: name_b });
    await gitDDB.put({ _id: _id_a, name: name_a });
    await gitDDB.put({ _id: _id_1, name: name_1 });
    await gitDDB.put({ _id: _id_c, name: name_c });

    await expect(gitDDB.allDocs()).resolves.toMatchObject({
      total_rows: 4,
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
      rows: [
        {
          id: expect.stringMatching('^' + _id_1 + '$'),
          file_sha: expect.stringMatching(/^[\da-z]{40}$/),
        },
        {
          id: expect.stringMatching('^' + _id_a + '$'),
          file_sha: expect.stringMatching(/^[\da-z]{40}$/),
        },
        {
          id: expect.stringMatching('^' + _id_b + '$'),
          file_sha: expect.stringMatching(/^[\da-z]{40}$/),
        },
        {
          id: expect.stringMatching('^' + _id_c + '$'),
          file_sha: expect.stringMatching(/^[\da-z]{40}$/),
        },
      ],
    });

    await gitDDB.destroy();
  });

  it('returns entries by descending alphabetical order', async () => {
    const dbName = monoId();

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();

    await gitDDB.put({ _id: _id_b, name: name_b });
    await gitDDB.put({ _id: _id_a, name: name_a });
    await gitDDB.put({ _id: _id_c, name: name_c });

    await expect(gitDDB.allDocs({ descending: true })).resolves.toMatchObject({
      total_rows: 3,
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
      rows: [
        {
          id: expect.stringMatching('^' + _id_c + '$'),
          file_sha: expect.stringMatching(/^[\da-z]{40}$/),
        },
        {
          id: expect.stringMatching('^' + _id_b + '$'),
          file_sha: expect.stringMatching(/^[\da-z]{40}$/),
        },
        {
          id: expect.stringMatching('^' + _id_a + '$'),
          file_sha: expect.stringMatching(/^[\da-z]{40}$/),
        },
      ],
    });

    await gitDDB.destroy();
  });

  it('returns entries including JsonDocs', async () => {
    const dbName = monoId();

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();

    await gitDDB.put({ _id: _id_b, name: name_b });
    await gitDDB.put({ _id: _id_a, name: name_a });

    await expect(gitDDB.allDocs({ include_docs: true })).resolves.toMatchObject({
      total_rows: 2,
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
      rows: [
        {
          id: expect.stringMatching('^' + _id_a + '$'),
          file_sha: expect.stringMatching(/^[\da-z]{40}$/),
          doc: {
            _id: expect.stringMatching('^' + _id_a + '$'),
            name: name_a,
          },
        },
        {
          id: expect.stringMatching('^' + _id_b + '$'),
          file_sha: expect.stringMatching(/^[\da-z]{40}$/),
          doc: {
            _id: expect.stringMatching('^' + _id_b + '$'),
            name: name_b,
          },
        },
      ],
    });

    await gitDDB.destroy();
  });

  it('returns docs by breadth-first search (recursive)', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();

    await gitDDB.put({ _id: _id_b, name: name_b });
    await gitDDB.put({ _id: _id_a, name: name_a });
    await gitDDB.put({ _id: _id_d, name: name_d });
    await gitDDB.put({ _id: _id_c01, name: name_c01 });
    await gitDDB.put({ _id: _id_c02, name: name_c02 });

    await expect(gitDDB.allDocs({ include_docs: true })).resolves.toMatchObject({
      total_rows: 5,
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
      rows: [
        {
          id: expect.stringMatching('^' + _id_a + '$'),
          file_sha: expect.stringMatching(/^[\da-z]{40}$/),
          doc: {
            _id: expect.stringMatching('^' + _id_a + '$'),
            name: name_a,
          },
        },
        {
          id: expect.stringMatching('^' + _id_b + '$'),
          file_sha: expect.stringMatching(/^[\da-z]{40}$/),
          doc: {
            _id: expect.stringMatching('^' + _id_b + '$'),
            name: name_b,
          },
        },
        {
          id: expect.stringMatching('^' + _id_c01 + '$'),
          file_sha: expect.stringMatching(/^[\da-z]{40}$/),
          doc: {
            _id: expect.stringMatching('^' + _id_c01 + '$'),
            name: name_c01,
          },
        },
        {
          id: expect.stringMatching('^' + _id_c02 + '$'),
          file_sha: expect.stringMatching(/^[\da-z]{40}$/),
          doc: {
            _id: expect.stringMatching('^' + _id_c02 + '$'),
            name: name_c02,
          },
        },
        {
          id: expect.stringMatching('^' + _id_d + '$'),
          file_sha: expect.stringMatching(/^[\da-z]{40}$/),
          doc: {
            _id: expect.stringMatching('^' + _id_d + '$'),
            name: name_d,
          },
        },
      ],
    });

    await gitDDB.destroy();
  });

  it('returns docs by breadth-first search (not recursive)', async () => {
    const dbName = monoId();

    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();

    await gitDDB.put({ _id: _id_b, name: name_b });
    await gitDDB.put({ _id: _id_a, name: name_a });
    await gitDDB.put({ _id: _id_d, name: name_d });
    await gitDDB.put({ _id: _id_c01, name: name_c01 });
    await gitDDB.put({ _id: _id_c02, name: name_c02 });

    await expect(
      gitDDB.allDocs({ include_docs: true, recursive: false })
    ).resolves.toMatchObject({
      total_rows: 2,
      commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
      rows: [
        {
          id: expect.stringMatching('^' + _id_a + '$'),
          file_sha: expect.stringMatching(/^[\da-z]{40}$/),
          doc: {
            _id: expect.stringMatching('^' + _id_a + '$'),
            name: name_a,
          },
        },
        {
          id: expect.stringMatching('^' + _id_b + '$'),
          file_sha: expect.stringMatching(/^[\da-z]{40}$/),
          doc: {
            _id: expect.stringMatching('^' + _id_b + '$'),
            name: name_b,
          },
        },
      ],
    });

    await gitDDB.destroy();
  });

  describe('Prefix search', () => {
    it('gets from directory', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.createDB();

      await gitDDB.put({ _id: _id_b, name: name_b });
      await gitDDB.put({ _id: _id_a, name: name_a });
      await gitDDB.put({ _id: _id_d, name: name_d });
      await gitDDB.put({ _id: _id_c000, name: name_c000 });
      await gitDDB.put({ _id: _id_c001, name: name_c001 });
      await gitDDB.put({ _id: _id_c01, name: name_c01 });
      await gitDDB.put({ _id: _id_c02, name: name_c02 });

      const prefix = 'citrus/';

      await expect(gitDDB.allDocs({ prefix, include_docs: true })).resolves.toMatchObject({
        total_rows: 2,
        commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
        rows: [
          {
            id: expect.stringMatching('^' + _id_c01 + '$'),
            file_sha: expect.stringMatching(/^[\da-z]{40}$/),
            doc: {
              _id: expect.stringMatching('^' + _id_c01 + '$'),
              name: name_c01,
            },
          },
          {
            id: expect.stringMatching('^' + _id_c02 + '$'),
            file_sha: expect.stringMatching(/^[\da-z]{40}$/),
            doc: {
              _id: expect.stringMatching('^' + _id_c02 + '$'),
              name: name_c02,
            },
          },
        ],
      });

      await gitDDB.destroy();
    });

    it('gets only from top directory', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.createDB();

      await gitDDB.put({ _id: _id_b, name: name_b });
      await gitDDB.put({ _id: _id_a, name: name_a });
      await gitDDB.put({ _id: _id_d, name: name_d });
      await gitDDB.put({ _id: _id_c000, name: name_c000 });
      await gitDDB.put({ _id: _id_c001, name: name_c001 });
      await gitDDB.put({ _id: _id_c01, name: name_c01 });
      await gitDDB.put({ _id: _id_c02, name: name_c02 });

      const prefix = 'cit';

      await expect(
        gitDDB.allDocs({ prefix, include_docs: true, recursive: false })
      ).resolves.toMatchObject({
        total_rows: 2,
        commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
        rows: [
          {
            id: expect.stringMatching('^' + _id_c001 + '$'),
            file_sha: expect.stringMatching(/^[\da-z]{40}$/),
            doc: {
              _id: expect.stringMatching('^' + _id_c001 + '$'),
              name: name_c001,
            },
          },
          {
            id: expect.stringMatching('^' + _id_c000 + '$'),
            file_sha: expect.stringMatching(/^[\da-z]{40}$/),
            doc: {
              _id: expect.stringMatching('^' + _id_c000 + '$'),
              name: name_c000,
            },
          },
        ],
      });

      await gitDDB.destroy();
    });

    it('uses recursive option to get from parent directory and child directory', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.createDB();

      await gitDDB.put({ _id: _id_b, name: name_b });
      await gitDDB.put({ _id: _id_a, name: name_a });
      await gitDDB.put({ _id: _id_d, name: name_d });
      await gitDDB.put({ _id: _id_c000, name: name_c000 });
      await gitDDB.put({ _id: _id_c001, name: name_c001 });
      await gitDDB.put({ _id: _id_c01, name: name_c01 });
      await gitDDB.put({ _id: _id_c02, name: name_c02 });

      const prefix = 'citrus';

      await expect(gitDDB.allDocs({ prefix, include_docs: true })).resolves.toMatchObject({
        total_rows: 4,
        commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
        rows: [
          {
            id: expect.stringMatching('^' + _id_c001 + '$'),
            file_sha: expect.stringMatching(/^[\da-z]{40}$/),
            doc: {
              _id: expect.stringMatching('^' + _id_c001 + '$'),
              name: name_c001,
            },
          },
          {
            id: expect.stringMatching('^' + _id_c000 + '$'),
            file_sha: expect.stringMatching(/^[\da-z]{40}$/),
            doc: {
              _id: expect.stringMatching('^' + _id_c000 + '$'),
              name: name_c000,
            },
          },
          {
            id: expect.stringMatching('^' + _id_c01 + '$'),
            file_sha: expect.stringMatching(/^[\da-z]{40}$/),
            doc: {
              _id: expect.stringMatching('^' + _id_c01 + '$'),
              name: name_c01,
            },
          },
          {
            id: expect.stringMatching('^' + _id_c02 + '$'),
            file_sha: expect.stringMatching(/^[\da-z]{40}$/),
            doc: {
              _id: expect.stringMatching('^' + _id_c02 + '$'),
              name: name_c02,
            },
          },
        ],
      });

      await gitDDB.destroy();
    });

    it('gets from a sub directory', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.createDB();

      await gitDDB.put({ _id: _id_b, name: name_b });
      await gitDDB.put({ _id: _id_a, name: name_a });
      await gitDDB.put({ _id: _id_d, name: name_d });
      await gitDDB.put({ _id: _id_c000, name: name_c000 });
      await gitDDB.put({ _id: _id_c001, name: name_c001 });
      await gitDDB.put({ _id: _id_c01, name: name_c01 });
      await gitDDB.put({ _id: _id_c02, name: name_c02 });

      const prefix = 'citrus/y';

      await expect(gitDDB.allDocs({ prefix, include_docs: true })).resolves.toMatchObject({
        total_rows: 1,
        commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
        rows: [
          {
            id: expect.stringMatching('^' + _id_c02 + '$'),
            file_sha: expect.stringMatching(/^[\da-z]{40}$/),
            doc: {
              _id: expect.stringMatching('^' + _id_c02 + '$'),
              name: name_c02,
            },
          },
        ],
      });

      await gitDDB.destroy();
    });

    it('returns no entry when prefix does not match', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.createDB();

      await gitDDB.put({ _id: _id_b, name: name_b });
      await gitDDB.put({ _id: _id_a, name: name_a });
      await gitDDB.put({ _id: _id_d, name: name_d });
      await gitDDB.put({ _id: _id_c000, name: name_c000 });
      await gitDDB.put({ _id: _id_c001, name: name_c001 });
      await gitDDB.put({ _id: _id_c01, name: name_c01 });
      await gitDDB.put({ _id: _id_c02, name: name_c02 });

      const prefix = 'not_exist/';

      await expect(gitDDB.allDocs({ prefix, include_docs: true })).resolves.toMatchObject({
        total_rows: 0,
        rows: [],
        commit_sha: expect.stringMatching(/^[\da-z]{40}/),
      });

      await gitDDB.destroy();
    });

    it('gets from deep directory', async () => {
      const dbName = monoId();
      const gitDDB: GitDocumentDB = new GitDocumentDB({
        db_name: dbName,
        local_dir: localDir,
      });
      await gitDDB.createDB();

      await gitDDB.put({ _id: _id_p, name: name_p });

      await gitDDB.put({ _id: _id_b, name: name_b });
      await gitDDB.put({ _id: _id_a, name: name_a });
      await gitDDB.put({ _id: _id_d, name: name_d });
      await gitDDB.put({ _id: _id_c000, name: name_c000 });
      await gitDDB.put({ _id: _id_c001, name: name_c001 });
      await gitDDB.put({ _id: _id_c01, name: name_c01 });
      await gitDDB.put({ _id: _id_c02, name: name_c02 });

      await expect(
        gitDDB.allDocs({ prefix: 'pear/Japan', include_docs: true })
      ).resolves.toMatchObject({
        total_rows: 1,
        commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
        rows: [
          {
            id: expect.stringMatching('^' + _id_p + '$'),
            file_sha: expect.stringMatching(/^[\da-z]{40}$/),
            doc: {
              _id: expect.stringMatching('^' + _id_p + '$'),
              name: name_p,
            },
          },
        ],
      });

      await expect(
        gitDDB.allDocs({ prefix: 'pear', include_docs: true })
      ).resolves.toMatchObject({
        total_rows: 1,
        commit_sha: expect.stringMatching(/^[\da-z]{40}$/),
        rows: [
          {
            id: expect.stringMatching('^' + _id_p + '$'),
            file_sha: expect.stringMatching(/^[\da-z]{40}$/),
            doc: {
              _id: expect.stringMatching('^' + _id_p + '$'),
              name: name_p,
            },
          },
        ],
      });
      await gitDDB.destroy();
    });
  });

  it('throws InvalidJsonObjectError', async () => {
    const dbName = monoId();
    const gitDDB: GitDocumentDB = new GitDocumentDB({
      db_name: dbName,
      local_dir: localDir,
    });
    await gitDDB.createDB();

    const _id = 'invalidJSON';
    let file_sha, commit_sha: string;
    const data = 'invalid data'; // JSON.parse() will throw error
    const _currentRepository = gitDDB.repository();
    if (_currentRepository) {
      try {
        const filePath = path.resolve(gitDDB.workingDir(), _id);
        const dir = path.dirname(filePath);
        await fs.ensureDir(dir).catch((err: Error) => console.error(err));
        await fs.writeFile(filePath, data);

        const index = await _currentRepository.refreshIndex(); // read latest index

        await index.addByPath(_id); // stage
        await index.write(); // flush changes to index
        const changes = await index.writeTree(); // get reference to a set of changes

        const entry = index.getByPath(_id, 0); // https://www.nodegit.org/api/index/#STAGE
        file_sha = entry.id.tostrS();

        const gitAuthor = {
          name: 'GitDocumentDB',
          email: 'system@gdd.localhost',
        };

        const author = nodegit.Signature.now(gitAuthor.name, gitAuthor.email);
        const committer = nodegit.Signature.now(gitAuthor.name, gitAuthor.email);

        // Calling nameToId() for HEAD throws error when there is not a commit object yet.
        const head = await nodegit.Reference.nameToId(_currentRepository, 'HEAD').catch(
          e => false
        ); // get HEAD
        let commit;
        if (!head) {
          // First commit
          commit = await _currentRepository.createCommit(
            'HEAD',
            author,
            committer,
            'message',
            changes,
            []
          );
        }
        else {
          const parent = await _currentRepository.getCommit(head as nodegit.Oid); // get the commit of HEAD
          commit = await _currentRepository.createCommit(
            'HEAD',
            author,
            committer,
            'message',
            changes,
            [parent]
          );
        }
      } catch (e) {
        console.error(e);
      }

      await expect(gitDDB.allDocs({ include_docs: true })).rejects.toThrowError(
        InvalidJsonObjectError
      );
    }
    await gitDDB.destroy();
  });
});
