/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import nodegit from '@sosuisen/nodegit';
import fs, { remove, rmdir } from 'fs-extra';
import {
  CannotCreateDirectoryError,
  CannotDeleteDataError,
  CannotWriteDataError,
  DatabaseCloseTimeoutError,
  DatabaseClosingError,
  DocumentNotFoundError,
  InvalidJsonObjectError,
  InvalidWorkingDirectoryPathLengthError,
  RepositoryNotOpenError,
  UndefinedDatabaseNameError,
  UndefinedDocumentIdError,
} from './error';
import { Collection } from './collection';
import { Validator } from './validator';
import { JsonDoc } from './types';

const gitAuthor = {
  name: 'GitDocumentDB',
  email: 'system@gdd.localhost',
};

const COLLECTION_CONFIG_FILE = '.collection';

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
/*
const repositoryInitOptionFlags = {
  GIT_REPOSITORY_INIT_BARE: 1,
  GIT_REPOSITORY_INIT_NO_REINIT: 2,
  GIT_REPOSITORY_INIT_NO_DOTGIT_DIR: 4,
  GIT_REPOSITORY_INIT_MKDIR: 8,
  GIT_REPOSITORY_INIT_MKPATH: 16,
  GIT_REPOSITORY_INIT_EXTERNAL_TEMPLATE: 32,
  GIT_REPOSITORY_INIT_RELATIVE_GITLINK: 64,
};
*/

/**
 * Database location
 *
 * @remarks
 * - localDir: Local directory path for the databases of GitDocumentDB. Default is './gitddb'.
 *
 * - dbName: Name of a git repository
 *
 * @beta
 */
export type DatabaseOption = {
  localDir?: string;
  dbName: string;
};

const defaultLocalDir = './gitddb';

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
  isNew: boolean;
  isCreatedByGitDDB: boolean;
  isValidVersion: boolean;
};

/**
 * How to get documents
 *
 * @remarks
 * - include_docs: Include the document itself in each row in the doc property. Otherwise you only get the _id and file_sha properties. Default is false.
 *
 * - descending: Sort results in rows by descendant. Default is false (ascendant).
 *
 * - directory: Only get the documents under the specified sub directory.
 *
 * - recursive: Get documents recursively from all sub directories. Default is false.
 *
 * @beta
 */
export type AllDocsOptions = {
  include_docs?: boolean;
  descending?: boolean;
  directory?: string;
  recursive?: boolean;
};

/**
 * Result of put()
 *
 * @remarks
 * - id: id of a document
 *
 * - file_sha: SHA-1 hash of Git object (40 characters)
 *
 * - commit_sha: SHA-1 hash of Git commit (40 characters)
 *
 * @beta
 */
export type PutResult = {
  ok: true;
  id: string;
  path: string;
  file_sha: string;
  commit_sha: string;
};

/**
 * Result of delete()
 *
 * @remarks
 * - _id: id of a document
 *
 * - file_sha: SHA-1 hash of Git blob (40 characters)
 *
 * - commit_sha: SHA-1 hash of Git commit (40 characters)
 *
 * @beta
 */
export type DeleteResult = {
  ok: true;
  id: string;
  file_sha: string;
  commit_sha: string;
};

/**
 * Result of allDocs()
 *
 * @remarks
 * - total_rows: number of documents
 *
 * - commit_sha: SHA-1 hash of the last Git commit (40 characters). 'commit_sha' is undefined if total_rows equals 0.
 *
 * - rows: Array of documents. 'rows' is undefined if total_rows equals 0.
 *
 * @beta
 */
export type AllDocsResult = {
  total_rows: number;
  commit_sha?: string;
  rows?: JsonDocWithMetadata[];
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
  id: string;
  file_sha: string;
  doc?: JsonDoc;
};

/**
 * How to close database
 *
 * @remarks
 * - force: Clear queued operations immediately.
 *
 * - timeout: Clear queued operation after timeout(msec). Default is 10000.
 *
 *  @beta
 */
export type DatabaseCloseOption = {
  force?: boolean;
  timeout?: number;
};

const fileExt = '.json';

const sleep = (msec: number) => new Promise(resolve => setTimeout(resolve, msec));

/**
 * Main class of GitDocumentDB
 *
 * @beta
 */
export class GitDocumentDB {
  private _localDir: string;
  private _dbName: string;
  private _currentRepository: nodegit.Repository | undefined;
  private _workingDirectory: string;

  // @ts-ignore
  private _serialQueue: (() => Promise<void>)[];
  private _isSerialQueueWorking = false;

  private _validator: Validator;

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
   * @throws {@link UndefinedDatabaseNameError}
   */
  constructor (options: DatabaseOption) {
    if (options.dbName === undefined || options.dbName === '') {
      throw new UndefinedDatabaseNameError();
    }
    this._dbName = options.dbName;
    this._localDir = options.localDir ?? defaultLocalDir;

    // Get full-path
    this._workingDirectory = path.resolve(this._localDir, this._dbName);

    this._validator = new Validator(this._workingDirectory);

    this._validator.validateDbName(this._dbName);
    this._validator.validateLocalDir(this._localDir);

    if (
      this._workingDirectory.length === 0 ||
      this._workingDirectory.length > Validator.maxWorkingDirectoryLength()
    ) {
      throw new InvalidWorkingDirectoryPathLengthError(
        this._workingDirectory,
        0,
        Validator.maxWorkingDirectoryLength()
      );
    }
  }

  /**
   * Get a path of the current Git working directory
   *
   * @returns Absolute path of the directory (trailing slash is omitted)
   */
  workingDir () {
    return this._workingDirectory;
  }

  /**
   * Get current repository
   * @remarks Be aware that direct operation of the current repository can corrupt the database.
   */
  getRepository (): nodegit.Repository | undefined {
    return this._currentRepository;
  }

  /**
   * Create a collection or open an existing one.
   *
   * @param collectionName - A name of collection which is represented by the path from localDir. Subdirectories are also permitted. e.g. 'pages', 'pages/works'.
   * collectionName can begin and end with slash, and both can be omitted. e.g. '/pages/', '/pages', 'pages/' and 'pages' show the same collection.
   *
   */
  async collection (collectionName: string) {
    const mkdirResult = await this.mkdir(collectionName);
    return new Collection(mkdirResult.path);
  }

  /**
   * Create a collection or open an existing one.
   *
   * @param collectionPath - A name of collection which is represented by the path from localDir. Subdirectories are also permitted. e.g. 'pages', 'pages/works'.
   * collectionName can begin and end with slash, and both can be omitted. e.g. '/pages/', '/pages', 'pages/' and 'pages' show the same collection.
   * @param commitMessage - Default is `mkdir: ${collectionPath}`
   * @remarks
   *  This is an alias of mkdir()
   */
  async mkdir (collectionPath: string, commitMessage?: string): Promise<PutResult> {
    collectionPath = Collection.normalizeCollectionPath(collectionPath);
    this._validator.validateCollectionPath(collectionPath);

    commitMessage ??= `mkdir: ${collectionPath}`;

    const doc = {
      _id: COLLECTION_CONFIG_FILE,
      path: collectionPath,
    };
    return await this.rawPutJSON(collectionPath, doc, commitMessage);
  }

  /**
   * Serial queue
   */
  private _pushToSerialQueue (func: () => Promise<void>) {
    this._serialQueue.push(func);
    this._execSerialQueue();
  }

  private _execSerialQueue () {
    if (this._serialQueue.length > 0 && !this._isSerialQueueWorking) {
      this._isSerialQueueWorking = true;
      const func = this._serialQueue.shift();
      if (func !== undefined) {
        func().finally(() => {
          this._isSerialQueueWorking = false;
          this._execSerialQueue();
        });
      }
    }
  }

  /**
   * Create a repository or open an existing one.
   *
   * @remarks If localDir does not exist, it is created.
   *
   * @returns Database information
   * @throws {@link CannotCreateDirectoryError} You may not have write permission.
   * @throws {@link DatabaseClosingError}
   */
  async open (): Promise<DatabaseInfo> {
    if (this.isClosing) {
      return Promise.reject(new DatabaseClosingError());
    }
    if (this.isOpened()) {
      this._dbInfo.isNew = false;
      return this._dbInfo;
    }

    this._serialQueue = [];

    await fs.ensureDir(this._workingDirectory).catch((err: Error) => {
      return Promise.reject(new CannotCreateDirectoryError(err.message));
    });
    this._dbInfo = {
      isNew: false,
      isCreatedByGitDDB: true,
      isValidVersion: true,
    };

    /**
     * nodegit.Repository.open() throws an error if the specified repository does not exist.
     * open() also throws an error if the path is invalid or not writable,
     * however this case has been already checked in fs.ensureDir.
     */
    this._currentRepository = await nodegit.Repository.open(this._workingDirectory).catch(
      () => undefined
    );
    if (this._currentRepository === undefined) {
      // console.debug(`Create new repository: ${pathToRepo}`);
      const isBare = 0;
      const options: RepositoryInitOptions = {
        description: defaultDescription,
        initialHead: 'main',
      };
      this._dbInfo.isNew = true;
      this._currentRepository = await nodegit.Repository.initExt(
        this._workingDirectory,
        // @ts-ignore
        options
      ).catch(err => {
        return Promise.reject(err);
      });
    }

    // Check git description
    const description = await fs
      .readFile(path.resolve(this._workingDirectory, '.git', 'description'), 'utf8')
      .catch(() => {
        this._dbInfo.isCreatedByGitDDB = false;
        this._dbInfo.isValidVersion = false;
        return '';
      });
    if (description === '') return this._dbInfo;

    if (new RegExp('^' + databaseName).test(description)) {
      this._dbInfo.isCreatedByGitDDB = true;
      if (new RegExp('^' + defaultDescription).test(description)) {
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

    return this._dbInfo;
  }

  /**
   * Test if database is opened
   */
  isOpened () {
    return this._currentRepository !== undefined;
  }

  /**
   * Add a document into a root collection
   *
   * @remarks
   * - put() does not check a write permission of your file system (unlike open()).
   *
   * - Saved file path is `${workingDirectory()}/${document._id}.json`. put() throws InvalidIdLengthError if the path length exceeds the maximum length of a filepath on the device.
   *
   * @param document -  See {@link JsonDoc} for restriction
   * @param commitMessage - Default is `put: ${document._id}`
   * @returns Promise that returns a set of _id, blob hash and commit hash
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link InvalidJsonObjectError}
   * @throws {@link UndefinedDocumentIdError}
   * @throws {@link InvalidIdCharacterError}
   * @throws {@link InvalidIdLengthError}
   * @throws {@link CannotWriteDataError}
   * @throws {@link CannotCreateDirectoryError}
   */
  put (document: JsonDoc, commitMessage?: string): Promise<PutResult> {
    return this.rawPutJSON('/', document, commitMessage);
  }

  /**
   * Add a document into a database
   *
   * @remarks
   * rawPutJSON() does not check a write permission of your file system (unlike open()).
   *
   * @param document -  See {@link JsonDoc} for restriction
   * @param commitMessage - Default is `put: ${document._id}`
   * @returns Promise that returns a set of _id, blob hash and commit hash
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link InvalidJsonObjectError}
   * @throws {@link UndefinedDocumentIdError}
   * @throws {@link InvalidIdCharacterError}
   * @throws {@link InvalidIdLengthError}
   * @throws {@link CannotWriteDataError}
   * @throws {@link CannotCreateDirectoryError}
   */
  rawPutJSON (
    collectionPath: string,
    document: JsonDoc,
    commitMessage?: string
  ): Promise<PutResult> {
    if (this.isClosing) {
      return Promise.reject(new DatabaseClosingError());
    }

    if (this._currentRepository === undefined) {
      return Promise.reject(new RepositoryNotOpenError());
    }

    if (document === undefined) {
      return Promise.reject(new InvalidJsonObjectError());
    }

    commitMessage ??= `put: ${document?._id}`;

    // put() must be serial.
    return new Promise((resolve, reject) => {
      this._pushToSerialQueue(() =>
        this._put_concurrent(collectionPath, document, commitMessage!)
          .then(result => {
            resolve(result);
          })
          .catch(err => reject(err))
      );
    });
  }

  /**
   * This method is used only for internal use.
   * It is published for test purpose.
   * @internal
   */
  async _put_concurrent (
    collectionPath: string,
    document: JsonDoc,
    commitMessage: string
  ): Promise<PutResult> {
    if (this._currentRepository === undefined) {
      return Promise.reject(new RepositoryNotOpenError());
    }

    if (document._id === undefined) {
      return Promise.reject(new UndefinedDocumentIdError());
    }
    collectionPath = Collection.normalizeCollectionPath(collectionPath);
    const key = collectionPath + document._id;
    try {
      this._validator.validateKey(key);
    } catch (err) {
      return Promise.reject(err);
    }

    try {
      this._validator.validateDocument(document);
    } catch (err) {
      return Promise.reject(err);
    }

    let data = '';
    try {
      data = JSON.stringify(document);
    } catch (err) {
      // not json
      return Promise.reject(new InvalidJsonObjectError());
    }

    let file_sha, commit_sha: string;
    try {
      const filename = key.slice(1) + fileExt; // key starts with a slash. Remove heading slash to put the file under the working directory
      const filePath = path.resolve(this._workingDirectory, filename);
      const dir = path.dirname(filePath);
      await fs.ensureDir(dir).catch((err: Error) => {
        return Promise.reject(new CannotCreateDirectoryError(err.message));
      });
      await fs.writeFile(filePath, data);

      const index = await this._currentRepository.refreshIndex(); // read latest index

      await index.addByPath(filename); // stage
      await index.write(); // flush changes to index
      const changes = await index.writeTree(); // get reference to a set of changes

      const entry = index.getByPath(filename, 0); // https://www.nodegit.org/api/index/#STAGE
      file_sha = entry.id.tostrS();

      const author = nodegit.Signature.now(gitAuthor.name, gitAuthor.email);
      const committer = nodegit.Signature.now(gitAuthor.name, gitAuthor.email);

      // Calling nameToId() for HEAD throws error when this is first commit.
      const head = await nodegit.Reference.nameToId(this._currentRepository, 'HEAD').catch(
        e => false
      ); // get HEAD
      let commit;
      if (!head) {
        // First commit
        commit = await this._currentRepository.createCommit(
          'HEAD',
          author,
          committer,
          commitMessage,
          changes,
          []
        );
      }
      else {
        const parent = await this._currentRepository.getCommit(head as nodegit.Oid); // get the commit of HEAD
        commit = await this._currentRepository.createCommit(
          'HEAD',
          author,
          committer,
          commitMessage,
          changes,
          [parent]
        );
      }
      commit_sha = commit.tostrS();
    } catch (err) {
      return Promise.reject(new CannotWriteDataError(err.message));
    }
    // console.log(commitId.tostrS());
    return {
      ok: true,
      path: collectionPath,
      id: document._id,
      file_sha: file_sha,
      commit_sha: commit_sha,
    };
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
  async get (_id: string): Promise<JsonDoc> {
    if (this.isClosing) {
      return Promise.reject(new DatabaseClosingError());
    }

    if (this._currentRepository === undefined) {
      return Promise.reject(new RepositoryNotOpenError());
    }

    if (_id === undefined) {
      return Promise.reject(new UndefinedDocumentIdError());
    }

    // Calling nameToId() for HEAD throws error when this is first commit.
    const head = await nodegit.Reference.nameToId(this._currentRepository, 'HEAD').catch(
      e => false
    ); // get HEAD
    let document;
    if (!head) {
      return Promise.reject(new DocumentNotFoundError());
    }

    const commit = await this._currentRepository.getCommit(head as nodegit.Oid); // get the commit of HEAD
    const filename = _id + fileExt;
    const entry = await commit.getEntry(filename).catch(err => {
      return Promise.reject(new DocumentNotFoundError(err.message));
    });
    const blob = await entry.getBlob();
    try {
      document = (JSON.parse(blob.toString()) as unknown) as JsonDoc;
      // _id in a document may differ from _id in a filename by mistake.
      // _id in a file is SSOT.
      // Overwrite _id in a document by _id in a filename just to be sure.
      document._id = _id;
    } catch (e) {
      return Promise.reject(new InvalidJsonObjectError());
    }

    return document;
  }

  /**
   * Delete a document
   * @remarks
   *   This is an alias of remove()
   */
  delete (key: string | JsonDoc, commitMessage?: string): Promise<DeleteResult> {
    // @ts-ignore
    return this.remove(key, commitMessage);
  }

  /**
   * Delete a document
   *
   * @param _id - id of a target document
   * @param commitMessage - Default is `delete: ${_id}`
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link UndefinedDocumentIdError}
   * @throws {@link CannotDeleteDataError}
   * @throws {@link DocumentNotFoundError}
   *
   */
  remove (key: string | JsonDoc, commitMessage?: string): Promise<DeleteResult> {
    if (this.isClosing) {
      return Promise.reject(new DatabaseClosingError());
    }

    if (this._currentRepository === undefined) {
      return Promise.reject(new RepositoryNotOpenError());
    }

    if (key === undefined) {
      return Promise.reject(new UndefinedDocumentIdError());
    }

    let _id: string;
    if (typeof key === 'string') {
      _id = key;
    }
    else if (key._id) {
      _id = key._id;
    }
    else {
      return Promise.reject(new UndefinedDocumentIdError());
    }

    commitMessage ??= `delete: ${_id}`;

    // delete() must be serial.
    return new Promise((resolve, reject) => {
      this._pushToSerialQueue(() =>
        this._remove_concurrent(_id, commitMessage!)
          .then(result => resolve(result))
          .catch(err => reject(err))
      );
    });
  }

  /**
   * This method is used only for internal use.
   * It is published for test purpose.
   * @internal
   */
  async _remove_concurrent (_id: string, commitMessage: string): Promise<DeleteResult> {
    if (this._currentRepository === undefined) {
      return Promise.reject(new RepositoryNotOpenError());
    }

    if (_id === undefined) {
      return Promise.reject(new UndefinedDocumentIdError());
    }

    let file_sha, commit_sha: string;
    const filename = _id + fileExt;

    let index;
    try {
      index = await this._currentRepository.refreshIndex();
      const entry = index.getByPath(filename, 0); // https://www.nodegit.org/api/index/#STAGE
      if (entry === undefined) {
        return Promise.reject(new DocumentNotFoundError());
      }
      file_sha = entry.id.tostrS();

      await index.removeByPath(filename); // stage
      await index.write(); // flush changes to index
    } catch (err) {
      return Promise.reject(new CannotDeleteDataError(err.message));
    }

    try {
      const changes = await index.writeTree(); // get reference to a set of changes

      const author = nodegit.Signature.now(gitAuthor.name, gitAuthor.email);
      const committer = nodegit.Signature.now(gitAuthor.name, gitAuthor.email);

      // Calling nameToId() for HEAD throws error when this is first commit.
      const head = await nodegit.Reference.nameToId(this._currentRepository, 'HEAD').catch(
        e => false
      ); // get HEAD

      if (!head) {
        // First commit
        return Promise.reject(new DocumentNotFoundError());
      }

      const parent = await this._currentRepository.getCommit(head as nodegit.Oid); // get the commit of HEAD
      const commit = await this._currentRepository.createCommit(
        'HEAD',
        author,
        committer,
        commitMessage,
        changes,
        [parent]
      );

      commit_sha = commit.tostrS();

      const filePath = path.resolve(this._workingDirectory, filename);
      await remove(filePath);
      // remove parent directory if empty
      await rmdir(path.dirname(filePath)).catch(e => {
        /* not empty */
      });
    } catch (err) {
      return Promise.reject(new CannotDeleteDataError(err.message));
    }

    return { ok: true, id: _id, file_sha: file_sha, commit_sha: commit_sha };
  }

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
  async close (
    options: DatabaseCloseOption = { force: false, timeout: 10000 }
  ): Promise<void> {
    if (this.isClosing) {
      return Promise.reject(new DatabaseClosingError());
    }
    if (this._currentRepository instanceof nodegit.Repository) {
      let isTimeout = false;
      try {
        this.isClosing = true;
        if (options.force) {
          // Clear queue
          this._serialQueue.length = 0;
        }
        const timeoutMsec = options.timeout || 10000;
        const startMsec = Date.now();
        while (this._serialQueue.length > 0 || this._isSerialQueueWorking) {
          if (Date.now() - startMsec > timeoutMsec) {
            this._serialQueue.length = 0;
            isTimeout = true;
          }
          // eslint-disable-next-line no-await-in-loop
          await sleep(100);
        }
        if (isTimeout) {
          return Promise.reject(new DatabaseCloseTimeoutError());
        }
      } finally {
        this.isClosing = false;
        this._serialQueue = [];
        this._isSerialQueueWorking = false;

        /**
         * The types are wrong. Repository does not have free() method.
         * See https://github.com/nodegit/nodegit/issues/1817#issuecomment-776844425
         * https://github.com/nodegit/nodegit/pull/1570
         *
         */
        // this._currentRepository.free();

        this._currentRepository = undefined;
      }
    }
  }

  /**
   * Destroy database
   *
   * @remarks
   * - The database is closed automatically before destroying.
   *
   * - options.force is true if undefined.
   *
   * - The Git repository is removed from the filesystem.
   *
   * - localDir (which is specified in constructor) is not removed.
   *
   * @param options - The options specify how to close database.
   * @throws {@link DatabaseClosingError}
   */
  async destroy (options: DatabaseCloseOption = {}): Promise<{ ok: true }> {
    if (this.isClosing) {
      return Promise.reject(new DatabaseClosingError());
    }

    if (this._currentRepository !== undefined) {
      // NOTICE: options.force is true by default.
      options.force = options.force ?? true;
      await this.close(options).catch(err => {
        throw err;
      });

      // If the path does not exist, remove() silently does nothing.
      // https://github.com/jprichardson/node-fs-extra/blob/master/docs/remove.md
      await fs.remove(this._workingDirectory).catch(err => {
        throw err;
      });
    }

    return {
      ok: true,
    };
  }

  /**
   * Get all the documents in a repository.
   *
   * @remarks
   *
   * @param options - The options specify how to get documents.
   * @returns Promise
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link InvalidJsonObjectError}
   */
  // eslint-disable-next-line complexity
  async allDocs (options?: AllDocsOptions): Promise<AllDocsResult> {
    if (this.isClosing) {
      return Promise.reject(new DatabaseClosingError());
    }

    if (this._currentRepository === undefined) {
      return Promise.reject(new RepositoryNotOpenError());
    }

    // Calling nameToId() for HEAD throws error when this is first commit.
    const head = await nodegit.Reference.nameToId(this._currentRepository, 'HEAD').catch(
      e => false
    ); // get HEAD
    if (!head) {
      return { total_rows: 0 };
    }

    const commit_sha = (head as nodegit.Oid).tostrS();
    const commit = await this._currentRepository.getCommit(head as nodegit.Oid); // get the commit of HEAD

    const rows: JsonDocWithMetadata[] = [];

    // Breadth-first search
    const directories: nodegit.Tree[] = [];
    const tree = await commit.getTree();

    if (options?.directory) {
      const specifiedTreeEntry = await tree.getEntry(options?.directory).catch(e => null);
      if (specifiedTreeEntry && specifiedTreeEntry.isTree()) {
        const specifiedTree = await specifiedTreeEntry.getTree();
        directories.push(specifiedTree);
      }
      else {
        return { total_rows: 0 };
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
      let sortFunc = (a: nodegit.TreeEntry, b: nodegit.TreeEntry) =>
        a.name().localeCompare(b.name());
      // Descendant (alphabetical order)
      if (options?.descending) {
        sortFunc = (a: nodegit.TreeEntry, b: nodegit.TreeEntry) =>
          -a.name().localeCompare(b.name());
      }
      entries.sort(sortFunc);

      while (entries.length > 0) {
        const entry = entries.shift();
        if (entry === undefined) break;
        if (entry?.isDirectory()) {
          if (options?.recursive) {
            // eslint-disable-next-line no-await-in-loop
            const subtree = await entry.getTree();
            directories.push(subtree);
          }
        }
        else {
          const _id = entry.path().replace(new RegExp(fileExt + '$'), '');
          const documentInBatch: JsonDocWithMetadata = {
            id: _id,
            file_sha: entry.id().tostrS(),
          };

          if (options?.include_docs) {
            // eslint-disable-next-line no-await-in-loop
            const blob = await entry.getBlob();
            // eslint-disable-next-line max-depth
            try {
              const doc = JSON.parse(blob.toString());
              doc._id = _id;
              documentInBatch.doc = doc;
            } catch (err) {
              return Promise.reject(new InvalidJsonObjectError(err.message));
            }
          }
          rows.push(documentInBatch);
        }
      }
    }

    return {
      total_rows: rows.length,
      commit_sha,
      rows,
    };
  }
}
