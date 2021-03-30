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
import rimraf from 'rimraf';
import { Logger } from 'tslog';
import {
  CannotCreateDirectoryError,
  CannotOpenRepositoryError,
  DatabaseCloseTimeoutError,
  DatabaseClosingError,
  DatabaseExistsError,
  FileRemoveTimeoutError,
  InvalidWorkingDirectoryPathLengthError,
  RemoteAlreadyRegisteredError,
  RepositoryNotFoundError,
  UndefinedDatabaseNameError,
  WorkingDirectoryExistsError,
} from './error';
import { Collection } from './collection';
import { Validator } from './validator';
import {
  AllDocsOptions,
  AllDocsResult,
  CollectionPath,
  DatabaseCloseOption,
  DatabaseInfo,
  DatabaseInfoSuccess,
  DatabaseOption,
  JsonDoc,
  PutOptions,
  PutResult,
  RemoteOptions,
  RemoveOptions,
  RemoveResult,
} from './types';
import { AbstractDocumentDB, CRUDInterface } from './types_gitddb';
import { put_worker, putImpl } from './crud/put';
import { getImpl } from './crud/get';
import { removeImpl } from './crud/remove';
import { allDocsImpl } from './crud/allDocs';
import { Sync, syncImpl } from './remote/sync';
import { createCredential } from './remote/authentication';
import { TaskQueue } from './task_queue';

// let debugMinLevel = 'trace';
const debugMinLevel = 'info';

const databaseName = 'GitDocumentDB';
const databaseVersion = '1.0';
const gitddbVersion = `${databaseName}: ${databaseVersion}`;
const gitddbVersionFileName = '.gitddb/lib_version';

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

const defaultLocalDir = './git-documentdb';

/**
 * Main class of GitDocumentDB
 *
 * @beta
 */
export class GitDocumentDB extends AbstractDocumentDB implements CRUDInterface {
  /**
   * File extension of a repository document
   */
  readonly fileExt = '.json';
  /**
   * Author name and email
   */
  readonly gitAuthor = {
    name: 'GitDocumentDB',
    email: 'gitddb@example.com',
  } as const;

  readonly defaultBranch = 'main';

  private _firstCommitMessage = 'first commit';

  private _localDir: string;
  private _dbName: string;
  private _currentRepository: nodegit.Repository | undefined;
  private _workingDirectory: string;

  private _synchronizers: { [url: string]: Sync } = {};

  private _dbInfo: DatabaseInfo = {
    ok: true,
    is_new: false,
    is_clone: false,
    is_created_by_gitddb: true,
    is_valid_version: true,
  };

  /**
   * Task queue
   */
  taskQueue: TaskQueue;

  /**
   * Name validator
   */
  validator: Validator;

  /**
   * DB is going to close
   */
  isClosing = false;

  /**
   * Logger
   */
  logger: Logger;

  /**
   * Constructor
   *
   * @remarks
   * - The git working directory will be localDir/dbName.
   *
   * @throws {@link InvalidWorkingDirectoryPathLengthError}
   * @throws {@link UndefinedDatabaseNameError}
   */
  constructor (options: DatabaseOption) {
    super();
    if (options.db_name === undefined || options.db_name === '') {
      throw new UndefinedDatabaseNameError();
    }

    this._dbName = options.db_name;
    this._localDir = options.local_dir ?? defaultLocalDir;

    // Get full-path
    this._workingDirectory = path.resolve(this._localDir, this._dbName);

    this.validator = new Validator(this._workingDirectory);

    this.validator.validateDbName(this._dbName);
    this.validator.validateLocalDir(this._localDir);

    if (
      this._workingDirectory.length === 0 ||
      Validator.byteLengthOf(this._workingDirectory) > Validator.maxWorkingDirectoryLength()
    ) {
      throw new InvalidWorkingDirectoryPathLengthError(
        this._workingDirectory,
        0,
        Validator.maxWorkingDirectoryLength()
      );
    }
    this.logger = new Logger({
      name: this._dbName,
      minLevel: debugMinLevel,
      displayDateTime: false,
      displayFunctionName: false,
      displayFilePath: 'hidden',
      requestId: () => this.taskQueue.currentTaskId() ?? '',
    });
    this.taskQueue = new TaskQueue(this.logger);
  }

  /**
   * Create and open a repository
   *
   * @remarks
   *  - If localDir does not exist, create it.
   *
   *  - create() also opens the repository. create() followed by open() has no effect.
   *
   * @returns Database information
   *
   * @throws {@link DatabaseClosingError}
   * @throws {@link DatabaseExistsError}
   * @throws {@link WorkingDirectoryExistsError}
   * @throws {@link CannotCreateDirectoryError}
   * @throws {@link CannotCloneRepositoryError}
   */
  async create (remoteOptions?: RemoteOptions): Promise<DatabaseInfo> {
    if (this.isClosing) {
      return Promise.reject(new DatabaseClosingError());
    }
    if (this.isOpened()) {
      throw new DatabaseExistsError();
    }

    if (fs.existsSync(this._workingDirectory)) {
      throw new WorkingDirectoryExistsError();
    }

    /**
     * Create directory
     */
    await fs.ensureDir(this._workingDirectory).catch((err: Error) => {
      return Promise.reject(new CannotCreateDirectoryError(err.message));
    });

    if (remoteOptions?.remote_url === undefined) {
      this._dbInfo = await this._createRepository();
      return this._dbInfo;
    }

    // Clone repository if remoteURL exists
    this._currentRepository = await this._cloneRepository(remoteOptions);

    if (this._currentRepository === undefined) {
      // Clone failed. Create remote repository..
      this._dbInfo = await this._createRepository();
    }
    else {
      // this.logger.warn('Clone succeeded.');
      /**
       * TODO: validate db
       */
      (this._dbInfo as DatabaseInfoSuccess).is_clone = true;
    }

    /**
     * Check and sync repository if exists
     */

    await this._setDbInfo();

    if (remoteOptions?.remote_url !== undefined) {
      if (
        (this._dbInfo as DatabaseInfoSuccess).is_created_by_gitddb &&
        (this._dbInfo as DatabaseInfoSuccess).is_valid_version
      ) {
        // Can synchronize
        /**
         * TODO:
         * Handle behavior_for_no_merge_base in sync()
         */
        await this.sync(remoteOptions);
      }
    }

    return this._dbInfo;
  }

  /**
   * Open an existing repository
   *
   * @remarks
   *  - GitDocumentDB can load a git repository that is not created by the git-documentdb module.
   *  However, correct behavior is not guaranteed.
   *
   * @returns Database information
   */
  async open (): Promise<DatabaseInfo> {
    const dbInfoError = (err: Error) => {
      this._dbInfo = {
        ok: false,
        error: err,
      };
      return this._dbInfo;
    };

    if (this.isClosing) {
      return dbInfoError(new DatabaseClosingError());
    }
    if (this.isOpened()) {
      (this._dbInfo as DatabaseInfoSuccess).is_new = false;
      return this._dbInfo;
    }

    /**
     * Reset
     */
    this._synchronizers = {};
    this._dbInfo = {
      ok: true,
      is_new: false,
      is_clone: false,
      is_created_by_gitddb: true,
      is_valid_version: true,
    };
    this.taskQueue.clear();

    /**
     * nodegit.Repository.open() throws an error if the specified repository does not exist.
     * open() also throws an error if the path is invalid or not writable,
     */
    try {
      this._currentRepository = await nodegit.Repository.open(this._workingDirectory);
    } catch (err) {
      const gitDir = this._workingDirectory + '/.git/';
      if (!fs.existsSync(gitDir)) {
        return dbInfoError(new RepositoryNotFoundError(gitDir));
      }
      return dbInfoError(new CannotOpenRepositoryError(err));
    }

    await this._setDbInfo();

    return this._dbInfo;
  }

  private async _createRepository () {
    /**
     * Create a repository followed by first commit
     */
    const options: RepositoryInitOptions = {
      initialHead: this.defaultBranch,
    };
    (this._dbInfo as DatabaseInfoSuccess).is_new = true;
    this._currentRepository = await nodegit.Repository.initExt(
      this._workingDirectory,
      // @ts-ignore
      options
    ).catch(err => {
      return Promise.reject(err);
    });

    // First commit
    await put_worker(
      this,
      gitddbVersionFileName,
      '',
      gitddbVersion,
      this._firstCommitMessage
    );
    return this._dbInfo;
  }

  private async _cloneRepository (remoteOptions?: RemoteOptions) {
    /**
     * TODO: Handle exceptions
     * If repository exists and cannot clone, you have not permission.
     * Only 'pull' is allowed.
     */
    if (remoteOptions !== undefined && remoteOptions.remote_url !== undefined) {
      const remote = new Sync(this, remoteOptions);
      return await nodegit.Clone.clone(remoteOptions?.remote_url, this.workingDir(), {
        fetchOpts: {
          callbacks: createCredential(remoteOptions),
        },
      }).catch(err => {
        this.logger.debug(
          `Error in _cloneRepository(): ${remoteOptions.remote_url}, ` + err
        );
        return undefined;
      });
    }

    return undefined;
  }

  private async _setDbInfo () {
    const version = await fs
      .readFile(path.resolve(this._workingDirectory, gitddbVersionFileName), 'utf8')
      .catch(() => {
        (this._dbInfo as DatabaseInfoSuccess).is_created_by_gitddb = false;
        (this._dbInfo as DatabaseInfoSuccess).is_valid_version = false;
        return undefined;
      });
    if (version === undefined) return this._dbInfo;

    if (new RegExp('^' + databaseName).test(version)) {
      (this._dbInfo as DatabaseInfoSuccess).is_created_by_gitddb = true;
      if (new RegExp('^' + gitddbVersion).test(version)) {
        (this._dbInfo as DatabaseInfoSuccess).is_valid_version = true;
      }
      else {
        (this._dbInfo as DatabaseInfoSuccess).is_valid_version = false;
        /**
         * TODO: Need migration
         */
      }
    }
    else {
      (this._dbInfo as DatabaseInfoSuccess).is_created_by_gitddb = false;
      (this._dbInfo as DatabaseInfoSuccess).is_valid_version = false;
    }
  }

  /**
   * Get dbName
   */
  dbName () {
    return this._dbName;
  }

  /**
   * Get a full path of the current Git working directory
   *
   * @returns Full path of the directory (trailing slash is omitted)
   */
  workingDir () {
    return this._workingDirectory;
  }

  /**
   * Get a current repository
   * @remarks Be aware that direct operation of the current repository can corrupt the database.
   */
  repository (): nodegit.Repository | undefined {
    return this._currentRepository;
  }

  /**
   * Get a collection
   *
   * @remarks
   * - Notice that this function does not make a sub-directory under the working directory.
   *
   * @param collectionPath - path from localDir. Sub-directories are also permitted. e.g. 'pages', 'pages/works'.
   */
  collection (collectionPath: CollectionPath) {
    return new Collection(this, collectionPath);
  }

  /**
   * Test if a database is opened
   */
  isOpened () {
    return this._currentRepository !== undefined;
  }

  /**
   * Close a database
   *
   * @remarks
   * - New CRUD operations are not available while closing.
   *
   * - Queued operations are executed before the database is closed.
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
    // Stop remote
    Object.values(this._synchronizers).forEach(_sync => _sync.close());

    // Wait taskQueue
    if (this._currentRepository instanceof nodegit.Repository) {
      try {
        this.isClosing = true;
        if (options.force) {
          this.taskQueue.clear();
        }
        const timeoutMsec = options.timeout || 10000;
        const isTimeout = await this.taskQueue.waitCompletion(timeoutMsec);

        if (isTimeout) {
          return Promise.reject(new DatabaseCloseTimeoutError());
        }
      } finally {
        this.isClosing = false;
        this.taskQueue.clear();

        /**
         * The types are wrong. Repository does not have free() method.
         * See https://github.com/nodegit/nodegit/issues/1817#issuecomment-776844425
         * https://github.com/nodegit/nodegit/pull/1570
         *
         * Use cleanup() instead.
         * http://carlosmn.github.io/libgit2/#v0.23.0/group/repository/git_repository__cleanup
         */
        // this._currentRepository.free();

        this._currentRepository.cleanup();
        this._currentRepository = undefined;

        this._synchronizers = {};
      }
    }
  }

  /**
   * Destroy a database
   *
   * @remarks
   * - {@link GitDocumentDB.close} is called automatically before destroying.
   *
   * - options.force is true if undefined.
   *
   * - The Git repository and the working directory are removed from the filesystem.
   *
   * - local_dir (which is specified in constructor) is not removed.
   *
   * - destroy() can remove a database that has not been created yet if a working directory exists.
   *
   * @param options - The options specify how to close database.
   * @throws {@link DatabaseClosingError}
   * @throws {@link DatabaseCloseTimeoutError}
   * @throws {@link FileRemoveTimeoutError}
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
    }
    // If the path does not exist, remove() silently does nothing.
    // https://github.com/jprichardson/node-fs-extra/blob/master/docs/remove.md
    //      await fs.remove(this._workingDirectory).catch(err => {

    await new Promise<void>((resolve, reject) => {
      // Set timeout because rimraf sometimes does not catch EPERM error.
      setTimeout(() => {
        reject(new FileRemoveTimeoutError());
      }, 7000);
      rimraf(this._workingDirectory, error => {
        if (error) {
          reject(error);
        }
        resolve();
      });
    });

    return {
      ok: true,
    };
  }

  /**
   * Add a document
   *
   * @privateRemarks
   *
   * This is 'overload 1' referred to in test/put.test.ts
   *
   * @remarks
   * - put() does not check a write permission of your file system (unlike open()).
   *
   * - Saved file path is `${workingDir()}/${document._id}.json`. {@link InvalidIdLengthError} will be thrown if the path length exceeds the maximum length of a filepath on the device.
   *
   * - A put operation is not skipped when no change occurred on a specified document.
   *
   * @param jsonDoc - See {@link JsonDoc} for restriction
   *
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link UndefinedDocumentIdError}
   * @throws {@link InvalidJsonObjectError}
   * @throws {@link CannotWriteDataError}
   * @throws {@link CannotCreateDirectoryError}
   * @throws {@link InvalidIdCharacterError}
   * @throws {@link InvalidIdLengthError}
   */
  put (jsonDoc: JsonDoc, options?: PutOptions): Promise<PutResult>;
  /**
    * Add a document
    *
    * @privateRemarks
    *
    * This is 'overload 2' referred to in test/put.test.ts
    *
    * @remarks
    * - put() does not check a write permission of your file system (unlike open()).
    *
    * - Saved file path is `${workingDir()}/${document._id}.json`. {@link InvalidIdLengthError} will be thrown if the path length exceeds the maximum length of a filepath on the device.
    
    * - A put operation is not skipped when no change occurred on a specified document.
    *
    * @param _id - _id property of a document
    * @param document - This is a {@link JsonDoc}, but _id property is ignored.
    *
    * @throws {@link DatabaseClosingError}
    * @throws {@link RepositoryNotOpenError}
    * @throws {@link UndefinedDocumentIdError}
    * @throws {@link InvalidJsonObjectError}
    * @throws {@link CannotWriteDataError}
    * @throws {@link CannotCreateDirectoryError}
    * @throws {@link InvalidIdCharacterError}
    * @throws {@link InvalidIdLengthError}
    */
  put (
    _id: string,
    document: { [key: string]: any },
    options?: PutOptions
  ): Promise<PutResult>;

  put (
    idOrDoc: string | JsonDoc,
    docOrOptions: { [key: string]: any } | PutOptions,
    options?: PutOptions
  ) {
    return putImpl.call(this, idOrDoc, docOrOptions, options);
  }

  /**
   * Get a document
   *
   * @param docId - id of a target document
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link UndefinedDocumentIdError}
   * @throws {@link DocumentNotFoundError}
   * @throws {@link InvalidJsonObjectError}
   * @throws {@link InvalidIdCharacterError}
   * @throws {@link InvalidIdLengthError}
   */
  get (docId: string): Promise<JsonDoc> {
    // Do not use 'get = getImpl;' because api-extractor(TsDoc) recognizes this not as a function but a property.
    return getImpl.call(this, docId);
  }

  /**
   * This is an alias of remove()
   */
  delete (id: string, options?: RemoveOptions): Promise<RemoveResult>;
  /**
   * This is an alias of remove()
   */
  delete (jsonDoc: JsonDoc, options?: RemoveOptions): Promise<RemoveResult>;
  delete (idOrDoc: string | JsonDoc, options?: RemoveOptions): Promise<RemoveResult> {
    return removeImpl.call(this, idOrDoc, options);
  }

  /**
   * Remove a document
   *
   * @param id - id of a target document
   *
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link UndefinedDocumentIdError}
   * @throws {@link DocumentNotFoundError}
   * @throws {@link CannotDeleteDataError}
   * @throws {@link InvalidIdCharacterError}
   * @throws {@link InvalidIdLengthError}
   */
  remove (id: string, options?: RemoveOptions): Promise<RemoveResult>;
  /**
   * Remove a document
   *
   * @param jsonDoc - Target document
   *
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link UndefinedDocumentIdError}
   * @throws {@link DocumentNotFoundError}
   * @throws {@link CannotDeleteDataError}
   * @throws {@link InvalidIdCharacterError}
   * @throws {@link InvalidIdLengthError}
   */
  remove (jsonDoc: JsonDoc, options?: RemoveOptions): Promise<RemoveResult>;
  remove (idOrDoc: string | JsonDoc, options?: RemoveOptions): Promise<RemoveResult> {
    return removeImpl.call(this, idOrDoc, options);
  }

  /**
   * Get all the documents
   *
   * @remarks
   *
   * @param options - The options specify how to get documents.
   *
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link InvalidJsonObjectError}
   * @throws {@link InvalidCollectionPathCharacterError}
   * @throws {@link InvalidCollectionPathLengthError}
   */
  allDocs (options?: AllDocsOptions): Promise<AllDocsResult> {
    // Do not use 'allDocs = allDocsImpl;' because api-extractor(TsDoc) recognizes this not as a function but a property.
    return allDocsImpl.call(this, options);
  }

  /**
   * getRemoteURLs
   */
  getRemoteURLs (): string[] {
    return Object.keys(this._synchronizers);
  }

  /**
   * getRemote
   */
  getRemote (remoteURL: string) {
    return this._synchronizers[remoteURL];
  }

  /**
   * removeRemote
   */
  removeRemote (remoteURL: string) {
    this._synchronizers[remoteURL].cancel();
    delete this._synchronizers[remoteURL];
  }

  /**
   * Synchronization
   *
   * @remarks
   * Do not register the same remote repository again. Call removeRemote() before register it again.
   */
  async sync (remoteURL: string, options?: RemoteOptions): Promise<Sync>;
  async sync (options?: RemoteOptions): Promise<Sync>;
  async sync (
    remoteUrlOrOption?: string | RemoteOptions,
    options?: RemoteOptions
  ): Promise<Sync> {
    if (typeof remoteUrlOrOption === 'string') {
      options ??= {};
      options.remote_url = remoteUrlOrOption;
    }
    else {
      options = remoteUrlOrOption;
    }

    if (
      options?.remote_url !== undefined &&
      this._synchronizers[options?.remote_url] !== undefined
    ) {
      throw new RemoteAlreadyRegisteredError(options.remote_url);
    }
    const remote = await syncImpl.call(this, options);
    this._synchronizers[remote.remoteURL()] = remote;
    return remote;
  }
}
