/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import nodegit from 'nodegit';
import fs from 'fs-extra';
import path from 'path';
import {
  CannotCreateDirectoryError, CannotWriteDataError,
  UndefinedDocumentIdError, DocumentNotFoundError, InvalidJsonObjectError, InvalidIdCharacterError, InvalidIdLengthError, InvalidWorkingDirectoryPathLengthError, RepositoryNotOpenError, CannotDeleteDataError, DatabaseClosingError, DatabaseCloseTimeoutError
} from './error';
import { MAX_LENGTH_OF_KEY, MAX_LENGTH_OF_WORKING_DIRECTORY_PATH } from './const';

const gitAuthor = {
  name: 'GitDocumentDB',
  email: 'system@gdd.localhost',
};

const databaseName = 'GitDocumentDB';
const databaseVersion = '1.0';
const defaultDescription = `${databaseName}: ${databaseVersion}`;

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

/**
 * Database location
 * 
 * @remarks
 * - localDir: \<Local directory path for the databases of GitDocumentDB\> 
 * 
 * - dbName: \<Name of a git repository\>
 *
 * @beta
 */
export type DatabaseOption = {
  dbName: string,
  localDir: string,
};

/**
 * Database information
 * 
 * @remarks
 * - isNew: Whether a repository is newly created or existing.
 *
 * - isCreatedByGitDDB: Whether a repository is created by git-documentDB or other methods.
 *
 * - isValidVersion: Whether a repository version equals to the current databaseVersion of git-documentDB.
 *   The version is described in .git/description.
 * 
 * @beta
 */
export type DatabaseInfo = {
  isNew: boolean,
  isCreatedByGitDDB: boolean,
  isValidVersion: boolean
};

/**
 * How to get documents
 * 
 * @remarks
 * - include_docs: Include the document itself in each row in the doc property. Otherwise you only get the _id and file_sha properties. Default is false.
 *
 * - descendant: Sort results in rows by descendant. Default is false (ascendant).
 *
 * - directory: Only get the documents under the specified sub directory.
 *
 * - recursive: Get documents recursively from all sub directories. Default is false.
 *
 * @beta
 */
export type AllDocsOptions = {
  include_docs?: boolean,
  descendant?: boolean,
  directory?: string,
  recursive?: boolean
};

/**
 * Result of put()
 * 
 * @remarks
 * - _id: id of a document
 *
 * - file_sha: SHA-1 hash of Git object (40 characters)
 * 
 * - commit_sha: SHA-1 hash of Git commit (40 characters)
 * 
 * @beta
 */
export type PutResult = {
  _id: string,
  file_sha: string,
  commit_sha: string
};

/**
 * Result of delete()
 * 
 * @remarks
 * - _id: id of a document
 *
 * - file_sha: SHA-1 hash of Git object (40 characters)
 * 
 * - commit_sha: SHA-1 hash of Git commit (40 characters)
 * 
 * @beta
 */
export type DeleteResult = {
  _id: string,
  file_sha: string,
  commit_sha: string
};

/**
 * Type for a JSON document
 * 
 * @remarks A document must be a JSON Object that matches the following conditions:
 * 
 * - It must have an '_id' key, which value only allows **a to z, A to Z, 0 to 9, and these 8 punctuation marks _ - . / ( ) [ ]**.
 *
 * - Do not use a period at the end of an '_id' value.
 *
 *  - A length of an '_id' value must be equal to or less than MAX_LENGTH_OF_KEY(64).
 * 
 * @beta
 */
export type JsonDoc = {
  [key: string]: any
};

/**
 * Type for a JSON document with metadata
 * 
 * @remarks
 * - _id: id of a document
 *
 * - file_sha: SHA-1 hash of Git object (40 characters)
 * 
 * - doc: JsonDoc
 * 
 * @beta
 */
export type JsonDocWithMetadata = {
  _id: string,
  file_sha: string,
  doc?: JsonDoc
};


/**
 * How to close database
 * 
 * @remarks 
 * - force: Skip queued operations and closes database immediately.
 * 
 * - timeout: Set timeout(msec). Default is 10000.
 *
 *  @beta
 */
export type DatabaseCloseOption = {
  force?: boolean,
  timeout?: number
};


const sleep = (msec: number) => new Promise(resolve => setTimeout(resolve, msec));

/**
 * Main class of GitDocumentDB
 * 
 * @beta
 */
export class GitDocumentDB {
  private _initOptions: DatabaseOption;
  private _currentRepository: nodegit.Repository | undefined;
  private _workingDirectory: string;

  // @ts-ignore
  private _atomicQueue: (() => Promise<void>)[];
  private _isAtomicQueueWorking: boolean = false;
  // @ts-ignore  
  private _atomicQueueTimer: NodeJS.Timeout;

  /**
   * DB is going to close
   */
  isClosing = false;

  private _dbInfo = {
    isNew: false,
    isCreatedByGitDDB: true,
    isValidVersion: true,
  };

  /**
   * Constructor
   *
   * @remarks 
   * - The git working directory will be localDir/dbName.
   * 
   * - The length of the working directory path must be equal to or lesser than MAX_LENGTH_OF_WORKING_DIRECTORY_PAT(195).
   * 
   * - GitDocumentDB can load a git repository that is not created by git-documentdb module,
   *  however correct behavior is not guaranteed.
   * 
   * @param options - Database location
   * @throws {@link InvalidWorkingDirectoryPathLengthError}
   */
  constructor(options: DatabaseOption) {
    this._initOptions = options;
    // Get full-path
    this._workingDirectory = path.resolve(this._initOptions.localDir, this._initOptions.dbName);
    if (this._workingDirectory.length === 0 || this._workingDirectory.length > MAX_LENGTH_OF_WORKING_DIRECTORY_PATH) {
      throw new InvalidWorkingDirectoryPathLengthError();
    }
  }

  /**
   * Get a path of the current Git working directory
   * 
   * @returns Absolute path of the directory
   */
  workingDir() {
    return this._workingDirectory;
  }

  private _pushToAtomicQueue(func: () => Promise<void>) {
    this._atomicQueue.push(func);
    this._execAtomicQueue();
  };

  private _execAtomicQueue() {
    if (this._atomicQueue.length > 0 && !this._isAtomicQueueWorking) {
      this._isAtomicQueueWorking = true;
      const func = this._atomicQueue.shift();
      if (func !== undefined) {
        func().finally(() => {
          this._isAtomicQueueWorking = false;
          this._execAtomicQueue();
        })
      }
    }
  };

  /**
   * Create a repository or open an existing one.
   *
   * @remarks If localDir does not exist, it is created.
   * 
   * @returns Database information
   * @throws {@link CannotCreateDirectoryError} You may not have write permission.
   * @throws {@link DatabaseClosingError}
   */
  async open(): Promise<DatabaseInfo> {
    if (this.isClosing) {
      throw new DatabaseClosingError();
    }

    if (this.isOpened()) {
      return this._dbInfo;
    }

    await fs.ensureDir(this._initOptions.localDir).catch((err: Error) => { throw new CannotCreateDirectoryError(err.message); });

    this._dbInfo = {
      isNew: false,
      isCreatedByGitDDB: true,
      isValidVersion: true
    };

    /** 
     * nodegit.Repository.open() throws an error if the specified repository does not exist.
     * open() also throws an error if the path is invalid or not writable, 
     * however this case has been already checked in fs.ensureDir.
     */
    this._currentRepository = await nodegit.Repository.open(this._workingDirectory).catch(async (err) => {
      // console.debug(`Create new repository: ${pathToRepo}`);
      const isBare = 0;
      const options: RepositoryInitOptions = {
        description: defaultDescription,
        flags: repositoryInitOptionFlags.GIT_REPOSITORY_INIT_MKDIR,
        initialHead: 'main',
      };
      this._dbInfo.isNew = true;
      // @ts-ignore
      return await nodegit.Repository.initExt(this._workingDirectory, options).catch(err => { throw new Error(err) });
    });

    // Check git description
    const description = await fs.readFile(path.resolve(this._workingDirectory, '.git', 'description'), 'utf8')
      .catch(err => {
        this._dbInfo.isCreatedByGitDDB = false;
        this._dbInfo.isValidVersion = false;
        return '';
      });
    if ((new RegExp('^' + databaseName)).test(description)) {
      this._dbInfo.isCreatedByGitDDB = true;
      if ((new RegExp('^' + defaultDescription)).test(description)) {
        this._dbInfo.isValidVersion = true;
      }
      else {
        // console.warn('Database version is invalid.');
        this._dbInfo.isValidVersion = false;
      }
    }
    else {
      // console.warn('Database is not created by git-documentdb.');
      this._dbInfo.isCreatedByGitDDB = false;
      this._dbInfo.isValidVersion = false;
    }


    this._atomicQueue = [];

    return this._dbInfo;
  }

  /**
   * Test if database is opened
   */
  isOpened() {
    return this._currentRepository === undefined ? false : true;
  }

  /**
   * Validate _id of a document
   * 
   * @remarks See {@link JsonDoc} for restriction
   * 
   * @throws {@link InvalidIdCharacterError}
   * @throws {@link InvalidIdLengthError}
   */
  validateId(id: string) {
    if (id.match(/[^a-zA-Z0-9_\-\.\(\)\[\]\/]/) || id.match(/\.$/)) {
      throw new InvalidIdCharacterError();
    }
    if (id.length === 0 || id.length > MAX_LENGTH_OF_KEY) {
      throw new InvalidIdLengthError();
    }
  }


  /**
   * Add a document into a database
   * 
   * @remarks
   * put() does not check a write permission of your file system (unlike open()).
   * 
   * @param document -  See {@link JsonDoc} for restriction
   * @returns Promise that returns a commit hash 
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link InvalidJsonObjectError}
   * @throws {@link UndefinedDocumentIdError}
   * @throws {@link InvalidIdCharacterError}
   * @throws {@link InvalidIdLengthError}
   * @throws {@link CannotWriteDataError}
   * @throws {@link CannotCreateDirectoryError}
   */
  put(document: JsonDoc): Promise<PutResult> {
    if (this.isClosing) {
      throw new DatabaseClosingError();
    }

    if (this._currentRepository === undefined) {
      return Promise.reject(new RepositoryNotOpenError());
    }

    // put() is atomic.
    return new Promise((resolve, reject) => {
      this._pushToAtomicQueue(() => this._put_nonatomic(document).then(result => resolve(result)).catch(err => reject(err)));
    });
  };

  /**
   * This method is used only for internal use.
   * It is published for test purpose.
   */
  async _put_nonatomic(document: JsonDoc): Promise<PutResult> {
    if (this._currentRepository === undefined) {
      throw new RepositoryNotOpenError();
    }

    if (document === undefined) {
      throw new InvalidJsonObjectError();
    }

    if (document['_id'] === undefined) {
      throw new UndefinedDocumentIdError();
    }

    try {
      this.validateId(document._id);
    } catch (err) { throw err; }

    const _id = document._id;
    let data = '';
    try {
      delete document._id;
      data = JSON.stringify(document);
    } catch (err) {
      // not json
      throw new InvalidJsonObjectError();
    }

    let file_sha, commit_sha: string;
    try {
      const filePath = path.resolve(this._workingDirectory, _id);
      const dir = path.dirname(filePath);
      await fs.ensureDir(dir).catch((err: Error) => { throw new CannotCreateDirectoryError(err.message); });
      await fs.writeFile(filePath, data);

      const index = await this._currentRepository.refreshIndex(); // read latest index

      await index.addByPath(_id); // stage
      await index.write(); // flush changes to index
      const changes = await index.writeTree(); // get reference to a set of changes

      const entry = index.getByPath(_id, 0); // https://www.nodegit.org/api/index/#STAGE
      file_sha = entry.id.tostrS();

      const author = nodegit.Signature.now(gitAuthor.name, gitAuthor.email);
      const committer = nodegit.Signature.now(gitAuthor.name, gitAuthor.email);

      // Calling nameToId() for HEAD throws error when this is first commit.
      const head = await nodegit.Reference.nameToId(this._currentRepository, "HEAD").catch(e => false); // get HEAD
      let commit;
      if (!head) {
        // First commit
        commit = await this._currentRepository.createCommit('HEAD', author, committer, 'message', changes, []);
      }
      else {
        const parent = await this._currentRepository.getCommit(head as nodegit.Oid); // get the commit of HEAD
        commit = await this._currentRepository.createCommit('HEAD', author, committer, 'message', changes, [parent]);
      }
      commit_sha = commit.tostrS();
    } catch (err) {
      throw new CannotWriteDataError(err.message);
    }
    // console.log(commitId.tostrS());
    return { _id: _id, file_sha: file_sha, commit_sha: commit_sha };

  }

  /**
   * Get a document from a database
   *
   * @param _id - id of a target document
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link UndefinedDocumentIdError}
   * @throws {@link DocumentNotFoundError}
   * @throws {@link InvalidJsonObjectError}
   */
  async get(_id: string): Promise<JsonDoc> {
    if (this.isClosing) {
      throw new DatabaseClosingError();
    }

    if (this._currentRepository === undefined) {
      throw new RepositoryNotOpenError();
    }

    if (_id === undefined) {
      throw new UndefinedDocumentIdError();
    }

    // Calling nameToId() for HEAD throws error when this is first commit.
    const head = await nodegit.Reference.nameToId(this._currentRepository, "HEAD").catch(e => false); // get HEAD
    let document;
    if (!head) {
      throw new DocumentNotFoundError();
    }
    else {
      const commit = await this._currentRepository.getCommit(head as nodegit.Oid); // get the commit of HEAD
      const entry = await commit.getEntry(_id).catch(err => { throw new DocumentNotFoundError(err.message) });
      const blob = await entry.getBlob();
      try {
        document = JSON.parse(blob.toString()) as unknown as JsonDoc;
        document['_id'] = _id;
      } catch (e) {
        throw new InvalidJsonObjectError();
      }
    }
    return document;
  };

  /**
   * Delete a document
   * 
   * @param _id - id of a target document
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link UndefinedDocumentIdError}
   * @throws {@link CannotDeleteDataError}
   * @throws {@link DocumentNotFoundError}
   */
  delete(_id: string): Promise<DeleteResult> {
    if (this.isClosing) {
      throw new DatabaseClosingError();
    }

    if (this._currentRepository === undefined) {
      return Promise.reject(new RepositoryNotOpenError());
    }

    // put() is atomic.
    return new Promise((resolve, reject) => {
      this._pushToAtomicQueue(() => this._delete_nonatomic(_id).then(result => resolve(result)).catch(err => reject(err)));
    });
  };

  /**
   * This method is used only for internal use.
   * It is published for test purpose.
   */
  async _delete_nonatomic(_id: string): Promise<DeleteResult> {
    if (this._currentRepository === undefined) {
      throw new RepositoryNotOpenError();
    }

    if (_id === undefined) {
      throw new UndefinedDocumentIdError();
    }

    let file_sha, commit_sha: string;

    let index;
    try {
      index = await this._currentRepository.refreshIndex();

      const entry = index.getByPath(_id, 0); // https://www.nodegit.org/api/index/#STAGE
      if (entry === undefined) {
        throw new DocumentNotFoundError();
      }
      file_sha = entry.id.tostrS();

      await index.removeByPath(_id); // stage
      await index.write(); // flush changes to index
    } catch (err) { throw new CannotDeleteDataError(err.message) }


    try {
      const changes = await index.writeTree(); // get reference to a set of changes

      const author = nodegit.Signature.now(gitAuthor.name, gitAuthor.email);
      const committer = nodegit.Signature.now(gitAuthor.name, gitAuthor.email);

      // Calling nameToId() for HEAD throws error when this is first commit.
      const head = await nodegit.Reference.nameToId(this._currentRepository, "HEAD").catch(e => false); // get HEAD
      let commit;
      if (!head) {
        // First commit
        throw new DocumentNotFoundError();
      }
      else {
        const parent = await this._currentRepository.getCommit(head as nodegit.Oid); // get the commit of HEAD
        commit = await this._currentRepository.createCommit('HEAD', author, committer, 'message', changes, [parent]);
      }
      commit_sha = commit.tostrS();
    } catch (err) {
      throw new CannotDeleteDataError(err.message);
    }

    return { _id: _id, file_sha: file_sha, commit_sha: commit_sha };
  };

  /**
   * Close database
   * 
   * @remarks 
   * - CRUD operations are not available while closing.
   * 
   * - Queued operations are executed before database is closed.
   * 
   * @param options - The options specify how to close database.
   * @throws {@link DatabaseClosingError}
   * @throws {@link DatabaseCloseTimeoutError}
   */
  async close(options: DatabaseCloseOption = { force: false, timeout: 10000 }) {
    if (this.isClosing) {
      throw new DatabaseClosingError();
    }

    if (this._currentRepository instanceof nodegit.Repository) {
      try {
        if (!options.force) {
          this.isClosing = true;
          const timeoutMsec = options.timeout || 10000;
          const startMsec = Date.now();
          while (this._atomicQueue.length > 0 && this._isAtomicQueueWorking) {
            if (Date.now() - startMsec > timeoutMsec) {
              throw new DatabaseCloseTimeoutError();
            }
            await sleep(100);
          }
        }
      } catch (err) {
        throw err;
      }
      finally {
        this.isClosing = false;
        this._atomicQueue = [];
        this._isAtomicQueueWorking = false;


        if (this._currentRepository.free !== undefined) {
          console.log('Repository.free() is executed in close()');
          this._currentRepository.free();
        }
        this._currentRepository = undefined;
      }
    }
  };

  /**
   * Destroy database
   * 
   * @remarks 
   * - The database is closed automatically before destroying.
   * 
   * - The Git repository is removed from the filesystem.
   * 
   * @throws {@link DatabaseClosingError}
   */
  async destroy() {
    if (this.isClosing) {
      throw new DatabaseClosingError();
    }

    if (this._currentRepository !== undefined) {
      await this.close().catch(err => console.error(err));
    }

    // If the path does not exists, silently does nothing
    await fs.remove(path.resolve(this._initOptions.localDir)).catch(err => console.error(err));
    return true;
  };

  /**
   * Get all the documents in a repository.
   * 
   * @remarks 
    * 
   * @param options - The options specify how to get documents.
   * @returns Promise
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link DocumentNotFoundError}
   * @throws {@link InvalidJsonObjectError}
   */
  async allDocs(options?: AllDocsOptions): Promise<{ total_rows: 0 } | { total_rows: number, commit_sha: string, rows: JsonDocWithMetadata[] }> {
    if (this.isClosing) {
      throw new DatabaseClosingError();
    }

    if (this._currentRepository === undefined) {
      throw new RepositoryNotOpenError();
    }

    // Calling nameToId() for HEAD throws error when this is first commit.
    const head = await nodegit.Reference.nameToId(this._currentRepository, "HEAD").catch(e => false); // get HEAD
    if (!head) {
      return { total_rows: 0 };
    }
    else {
      const commit_sha = (head as nodegit.Oid).tostrS();
      const commit = await this._currentRepository.getCommit(head as nodegit.Oid); // get the commit of HEAD

      const rows: JsonDocWithMetadata[] = [];

      // Breadth-first search
      const directories: nodegit.Tree[] = [];
      const tree = await commit.getTree();

      if (options?.directory) {
        const specifiedTreeEntry = await tree.getEntry(options?.directory);
        if (specifiedTreeEntry && specifiedTreeEntry.isTree()) {
          const specifiedTree = await specifiedTreeEntry.getTree();
          directories.push(specifiedTree);
        }
        else {
          throw new DocumentNotFoundError();
        }
      }
      else {
        directories.push(tree);
      }
      while (directories.length > 0) {
        const dir = directories.shift();
        if (dir === undefined) break;
        const entries = dir.entries();

        // Ascendant (alphabetical order)
        let sortFunc = (a: nodegit.TreeEntry, b: nodegit.TreeEntry) => a.name().localeCompare(b.name());
        // Descendant (alphabetical order)
        if (options?.descendant) {
          sortFunc = (a: nodegit.TreeEntry, b: nodegit.TreeEntry) => -a.name().localeCompare(b.name());
        }
        entries.sort(sortFunc);

        while (entries.length > 0) {
          const entry = entries.shift();
          if (entry === undefined) break;
          if (entry?.isDirectory()) {
            if (options?.recursive) {
              const subtree = await entry.getTree()
              directories.push(subtree);
            }
          }
          else {
            const path = entry.path();
            let documentInBatch: JsonDocWithMetadata = {
              _id: path,
              file_sha: entry.id().tostrS()
            };

            if (options?.include_docs) {
              const blob = await entry.getBlob();
              try {
                const doc = JSON.parse(blob.toString());
                doc._id = path;
                documentInBatch.doc = doc;
              } catch (err) {
                throw new InvalidJsonObjectError(err.message);
              }
            }
            rows.push(documentInBatch);
          }
        }
      }

      return {
        total_rows: rows.length,
        commit_sha,
        rows
      };
    }
  }
}
