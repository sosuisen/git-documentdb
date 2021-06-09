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
import { Logger, TLogLevelName } from 'tslog';
import { ulid } from 'ulid';
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
  DatabaseOpenResult,
  DatabaseOption,
  DeleteOptions,
  DeleteResult,
  JsonDoc,
  JsonDocWithMetadata,
  PutOptions,
  PutResult,
  RemoteOptions,
  Schema,
  SyncResult,
} from './types';
import { CRUDInterface, IDocumentDB } from './types_gitddb';
import { putImpl, putWorker } from './crud/put';
import { getByRevisionImpl, getImpl } from './crud/get';
import { deleteImpl } from './crud/delete';
import { allDocsImpl } from './crud/allDocs';
import { Sync, syncAndGetResultImpl, syncImpl } from './remote/sync';
import { TaskQueue } from './task_queue';
import {
  DATABASE_CREATOR,
  DATABASE_VERSION,
  DEFAULT_LOCAL_DIR,
  DEFAULT_LOG_LEVEL,
  FILE_REMOVE_TIMEOUT,
  FIRST_COMMIT_MESSAGE,
  GIT_DOCUMENTDB_INFO_ID,
  JSON_EXT,
  SET_DATABASE_ID_MESSAGE,
} from './const';
import { cloneRepository } from './remote/clone';
import { getDocHistoryImpl } from './crud/history';
import { toSortedJSONString } from './utils';

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
 * Get database ID
 *
 * @internal
 */
export function generateDatabaseId () {
  return ulid(Date.now());
}

/**
 * Main class of GitDocumentDB
 */
export class GitDocumentDB implements IDocumentDB, CRUDInterface {
  /**
   * Author name and email
   */
  readonly gitAuthor = {
    name: 'GitDocumentDB',
    email: 'gitddb@example.com',
  } as const;

  readonly defaultBranch = 'main';

  private _localDir: string;
  private _dbName: string;

  private _currentRepository: nodegit.Repository | undefined;
  private _workingDirectory: string;

  private _synchronizers: { [url: string]: Sync } = {};

  private _dbOpenResult: DatabaseOpenResult = {
    ok: true,
    dbId: '',
    creator: '',
    version: '',
    isNew: false,
    isClone: false,
    isCreatedByGitddb: true,
    isValidVersion: true,
  };

  private _logLevel: TLogLevelName;

  /**
   * Schema
   */
  schema: Schema;

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
  private _logger!: Logger; // Use definite assignment assertion

  getLogger (): Logger {
    return this._logger;
  }

  setLogLevel (level: TLogLevelName) {
    this._logger = new Logger({
      name: this._dbName,
      minLevel: level as TLogLevelName,
      displayDateTime: false,
      displayFunctionName: false,
      displayFilePath: 'hidden',
    });
    if (this.taskQueue) this.taskQueue.setLogger(this._logger);
  }

  /**
   * Constructor
   *
   * @remarks
   * - The git working directory will be localDir/dbName.
   *
   * @throws {@link InvalidWorkingDirectoryPathLengthError}
   * @throws {@link UndefinedDatabaseNameError}
   *
   */
  constructor (options: DatabaseOption) {
    if (options.dbName === undefined || options.dbName === '') {
      throw new UndefinedDatabaseNameError();
    }

    this._dbName = options.dbName;
    this._localDir = options.localDir ?? DEFAULT_LOCAL_DIR;
    this._logLevel = options.logLevel ?? DEFAULT_LOG_LEVEL;

    this.schema = options.schema ?? {
      json: {
        idOfSubtree: undefined,
        plainTextProperties: undefined,
      },
    };

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
    this.setLogLevel(this._logLevel);
    this.taskQueue = new TaskQueue(this.getLogger());
  }

  /**
   * Create and open a repository
   *
   * @remarks
   *  - If localDir does not exist, create it.
   *
   *  - createDB() also opens the repository. createDB() followed by open() has no effect.
   *
   * @returns Database information
   *
   * @throws {@link DatabaseClosingError}
   * @throws {@link DatabaseExistsError}
   * @throws {@link WorkingDirectoryExistsError}
   * @throws {@link CannotCreateDirectoryError}
   * @throws {@link CannotConnectError}
   *
   */
  async createDB (remoteOptions?: RemoteOptions): Promise<DatabaseOpenResult> {
    if (this.isClosing) {
      throw new DatabaseClosingError();
    }
    if (this.isOpened()) {
      throw new DatabaseExistsError();
    }

    if (fs.existsSync(this._workingDirectory)) {
      // Throw exception if not empty
      if (fs.readdirSync(this._workingDirectory).length !== 0) {
        throw new WorkingDirectoryExistsError();
      }
    }

    /**
     * Create directory
     */
    await fs.ensureDir(this._workingDirectory).catch((err: Error) => {
      throw new CannotCreateDirectoryError(err.message);
    });

    this._dbOpenResult = {
      ok: true,
      dbId: '',
      creator: '',
      version: '',
      isNew: false,
      isClone: false,
      isCreatedByGitddb: true,
      isValidVersion: true,
    };

    if (remoteOptions?.remoteUrl === undefined) {
      this._dbOpenResult = await this._createRepository();
      return this._dbOpenResult;
    }

    // Clone repository if remoteURL exists
    this._currentRepository = await cloneRepository(
      this.workingDir(),
      remoteOptions,
      this.getLogger()
    ).catch((err: Error) => {
      throw err;
    });

    if (this._currentRepository === undefined) {
      // Clone failed. Try to create remote repository in sync().
      // Please check is_clone flag if you would like to know whether clone is succeeded or not.
      this._dbOpenResult = await this._createRepository();
    }
    else {
      // this.logger.warn('Clone succeeded.');
      /**
       * TODO: validate db
       */
      (this._dbOpenResult as DatabaseInfoSuccess).isClone = true;
    }

    /**
     * Check and sync repository if exists
     */

    await this.loadDbInfo();

    if (remoteOptions?.remoteUrl !== undefined) {
      if (
        (this._dbOpenResult as DatabaseInfoSuccess).isCreatedByGitddb &&
        (this._dbOpenResult as DatabaseInfoSuccess).isValidVersion
      ) {
        // Can synchronize
        /**
         * TODO:
         * Handle combine_db_strategy in sync()
         */
        await this.sync(remoteOptions);
      }
    }

    return this._dbOpenResult;
  }

  /**
   * Open an existing repository
   *
   * @remarks
   *  - GitDocumentDB can load a git repository that is not created by the git-documentdb module.
   *  However, correct behavior is not guaranteed.
   *
   * @returns Database information
   *
   */
  async open (): Promise<DatabaseOpenResult> {
    const dbInfoError = (err: Error) => {
      this._dbOpenResult = {
        ok: false,
        error: err,
      };
      return this._dbOpenResult;
    };

    if (this.isClosing) {
      return dbInfoError(new DatabaseClosingError());
    }
    if (this.isOpened()) {
      (this._dbOpenResult as DatabaseInfoSuccess).isNew = false;
      return this._dbOpenResult;
    }

    /**
     * Reset
     */
    this._synchronizers = {};
    this._dbOpenResult = {
      ok: true,
      dbId: '',
      creator: '',
      version: '',
      isNew: false,
      isClone: false,
      isCreatedByGitddb: true,
      isValidVersion: true,
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

    await this.loadDbInfo();
    return this._dbOpenResult;
  }

  private async _createRepository () {
    /**
     * Create a repository followed by first commit
     */
    const options: RepositoryInitOptions = {
      initialHead: this.defaultBranch,
    };
    (this._dbOpenResult as DatabaseInfoSuccess).isNew = true;

    this._currentRepository = await nodegit.Repository.initExt(
      this._workingDirectory,
      // @ts-ignore
      options
    ).catch(err => {
      return Promise.reject(err);
    });

    // First commit
    const info = {
      dbId: generateDatabaseId(),
      creator: DATABASE_CREATOR,
      version: DATABASE_VERSION,
    };
    // Do not use this.put() because it increments TaskQueue.statistics.put.
    await putWorker(
      this,
      GIT_DOCUMENTDB_INFO_ID,
      JSON_EXT,
      toSortedJSONString(info),
      FIRST_COMMIT_MESSAGE
    );
    this._dbOpenResult = { ...this._dbOpenResult, ...info };
    return this._dbOpenResult;
  }

  /**
   * Load DatabaseInfo from .gitddb/info.json
   *
   * @internal
   */
  async loadDbInfo () {
    let info = (await this.get(GIT_DOCUMENTDB_INFO_ID).catch(
      () => undefined
    )) as DatabaseInfo;

    info ??= {
      dbId: '',
      creator: '',
      version: '',
    };

    info.creator ??= '';
    info.version ??= '';

    // Set db_id if not exists.
    if (info.dbId === '') {
      info.dbId = generateDatabaseId();
      // Do not use this.put() because it increments TaskQueue.statistics.put.
      await putWorker(
        this,
        GIT_DOCUMENTDB_INFO_ID,
        JSON_EXT,
        toSortedJSONString(info),
        SET_DATABASE_ID_MESSAGE
      );
    }

    (this._dbOpenResult as DatabaseInfo).dbId = info.dbId;
    (this._dbOpenResult as DatabaseInfo).creator = info.creator;
    (this._dbOpenResult as DatabaseInfo).version = info.version;

    if (new RegExp('^' + DATABASE_CREATOR).test(info.creator)) {
      (this._dbOpenResult as DatabaseInfoSuccess).isCreatedByGitddb = true;
      if (new RegExp('^' + DATABASE_VERSION).test(info.version)) {
        (this._dbOpenResult as DatabaseInfoSuccess).isValidVersion = true;
      }
      else {
        (this._dbOpenResult as DatabaseInfoSuccess).isValidVersion = false;
        /**
         * TODO: Need migration
         */
      }
    }
    else {
      (this._dbOpenResult as DatabaseInfoSuccess).isCreatedByGitddb = false;
      (this._dbOpenResult as DatabaseInfoSuccess).isValidVersion = false;
    }
  }

  /**
   * Get dbName
   *
   */
  dbName () {
    return this._dbName;
  }

  /**
   * Get dbId
   *
   */
  dbId () {
    if (this._dbOpenResult.ok === true) {
      return this._dbOpenResult.dbId;
    }
    return '';
  }

  /**
   * Get a full path of the current Git working directory
   *
   * @returns Full path of the directory (trailing slash is omitted)
   *
   */
  workingDir () {
    return this._workingDirectory;
  }

  /**
   * Get a current repository
   */
  repository (): nodegit.Repository | undefined {
    return this._currentRepository;
  }

  /**
   * Set repository
   * @remarks Be aware that it can corrupt the database.
   */
  setRepository (repos: nodegit.Repository) {
    this._currentRepository = undefined;
    this._currentRepository = repos;
  }

  /**
   * Get a collection
   *
   * @remarks
   * - Notice that this function does not make a sub-directory under the working directory.
   *
   * @param collectionPath - path from localDir. Sub-directories are also permitted. e.g. 'pages', 'pages/works'.
   *
   */
  collection (collectionPath: CollectionPath) {
    return new Collection(this, collectionPath);
  }

  /**
   * Get collections
   *
   * @param rootPath Get collections directly under the path.
   * @returns Promise<Collection[]>
   * @throws {@link RepositoryNotOpenError}
   */
  async getCollections (rootPath?: string): Promise<Collection[]> {
    return await Collection.getCollections(this, rootPath);
  }

  /**
   * Test if a database is opened
   *
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
   *
   */
  async close (options?: DatabaseCloseOption): Promise<void> {
    if (this.isClosing) {
      return Promise.reject(new DatabaseClosingError());
    }
    // Stop remote
    Object.values(this._synchronizers).forEach(sync => sync.close());

    options ??= { force: undefined, timeout: undefined };
    options.force ??= false;
    options.timeout ??= 10000;

    // Wait taskQueue
    if (this._currentRepository instanceof nodegit.Repository) {
      try {
        this.isClosing = true;
        if (!options.force) {
          const isTimeout = await this.taskQueue.waitCompletion(options.timeout);
          if (isTimeout) {
            return Promise.reject(new DatabaseCloseTimeoutError());
          }
        }
      } finally {
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

        this.isClosing = false;
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
   *
   */
  async destroy (options: DatabaseCloseOption = {}): Promise<{ ok: true }> {
    if (this.isClosing) {
      return Promise.reject(new DatabaseClosingError());
    }

    let closeError: Error | undefined;
    if (this._currentRepository !== undefined) {
      // NOTICE: options.force is true by default.
      options.force = options.force ?? true;
      await this.close(options).catch(err => {
        closeError = err;
      });
    }
    // If the path does not exist, remove() silently does nothing.
    // https://github.com/jprichardson/node-fs-extra/blob/master/docs/remove.md
    //      await fs.remove(this._workingDirectory).catch(err => {

    await new Promise<void>((resolve, reject) => {
      // Set timeout because rimraf sometimes does not catch EPERM error.
      setTimeout(() => {
        reject(new FileRemoveTimeoutError());
      }, FILE_REMOVE_TIMEOUT);
      rimraf(this._workingDirectory, error => {
        if (error) {
          reject(error);
        }
        resolve();
      });
    });

    if (closeError instanceof Error) {
      throw closeError;
    }

    return {
      ok: true,
    };
  }

  /**
   * Insert a document if not exists. Otherwise, update it.
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
   *
   */
  put (jsonDoc: JsonDoc, options?: PutOptions): Promise<PutResult>;
  /**
    * Insert a document if not exists. Otherwise, update it.
    *
    * @remarks
    * - put() does not check a write permission of your file system (unlike open()).
    *
    * - Saved file path is `${workingDir()}/${document._id}.json`. {@link InvalidIdLengthError} will be thrown if the path length exceeds the maximum length of a filepath on the device.
    
    * - A put operation is not skipped when no change occurred on a specified document.
    *
    * @param id - _id property of a document
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
    * 
       */
  put (
    id: string,
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
   * Insert a document
   *
   * @remarks
   * - Throws SameIdExistsError when a document which has the same id exists. It might be better to use put() instead of insert().
   *
   * - insert() does not check a write permission of your file system (unlike open()).
   *
   * - Saved file path is `${workingDir()}/${document._id}.json`. {@link InvalidIdLengthError} will be thrown if the path length exceeds the maximum length of a filepath on the device.
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
   * @throws {@link SameIdExistsError}
   *
   */
  insert (jsonDoc: JsonDoc, options?: PutOptions): Promise<PutResult>;
  /**
   * Insert a document
   *
   * @remarks
   * - Throws SameIdExistsError when a document which has the same id exists. It might be better to use put() instead of insert().
   *
   * - insert() does not check a write permission of your file system (unlike open()).
   *
   * - Saved file path is `${workingDir()}/${document._id}.json`. {@link InvalidIdLengthError} will be thrown if the path length exceeds the maximum length of a filepath on the device.
   *
   * @param id - _id property of a document
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
   * @throws {@link SameIdExistsError}
   *
   */
  insert (
    id: string,
    document: { [key: string]: any },
    options?: PutOptions
  ): Promise<PutResult>;

  insert (
    idOrDoc: string | JsonDoc,
    docOrOptions: { [key: string]: any } | PutOptions,
    options?: PutOptions
  ) {
    if (typeof idOrDoc === 'object') {
      docOrOptions = { ...docOrOptions, insertOrUpdate: 'insert' };
    }

    return putImpl.call(this, idOrDoc, docOrOptions, {
      ...options,
      insertOrUpdate: 'insert',
    });
  }

  /**
   * Update a document
   *
   * @remarks
   * - Throws DocumentNotFoundError if the document does not exist. It might be better to use put() instead of update().
   *
   * - update() does not check a write permission of your file system (unlike open()).
   *
   * - Saved file path is `${workingDir()}/${document._id}.json`. {@link InvalidIdLengthError} will be thrown if the path length exceeds the maximum length of a filepath on the device.
   *
   * - A update operation is not skipped when no change occurred on a specified document.
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
   * @throws {@link DocumentNotFoundError}
   *
   */
  update (jsonDoc: JsonDoc, options?: PutOptions): Promise<PutResult>;
  /**
   * Update a document
   *
   * @remarks
   * - Throws DocumentNotFoundError if the document does not exist. It might be better to use put() instead of update().
   *
   * - update() does not check a write permission of your file system (unlike open()).
   *
   * - Saved file path is `${workingDir()}/${document._id}.json`. {@link InvalidIdLengthError} will be thrown if the path length exceeds the maximum length of a filepath on the device.
   *
   * - A update operation is not skipped when no change occurred on a specified document.
   *
   * @param id - _id property of a document
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
   * @throws {@link DocumentNotFoundError}
   *
   */
  update (
    id: string,
    document: { [key: string]: any },
    options?: PutOptions
  ): Promise<PutResult>;

  update (
    idOrDoc: string | JsonDoc,
    docOrOptions: { [key: string]: any } | PutOptions,
    options?: PutOptions
  ) {
    if (typeof idOrDoc === 'object') {
      docOrOptions = { ...docOrOptions, insertOrUpdate: 'update' };
    }

    return putImpl.call(this, idOrDoc, docOrOptions, {
      ...options,
      insertOrUpdate: 'update',
    });
  }

  /**
   * Get a document
   *
   * @param docId - id of a target document
   * @param backNumber - Specify a number to go back to old revision. Default is 0. When backNumber equals 0, a document in the current DB is returned.
   * When backNumber is 0 and a document has been deleted in the current DB, it returns undefined.
   *
   * @returns
   *  - JsonDoc if exists.
   *
   *  - undefined if not exists.
   *
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link UndefinedDocumentIdError}
   * @throws {@link InvalidJsonObjectError}
   * @throws {@link InvalidIdCharacterError}
   * @throws {@link InvalidIdLengthError}
   * @throws {@link CorruptedRepositoryError}
   * @throws {@link InvalidBackNumberError}
   */
  get (docId: string, backNumber?: number): Promise<JsonDoc | undefined> {
    // Do not use 'get = getImpl;' because api-extractor(TsDoc) recognizes this not as a function but a property.
    return getImpl.call(this, docId, { backNumber, withMetadata: false });
  }

  /**
   * Get a document with metadata
   *
   * @param docId - id of a target document
   * @param backNumber - Specify a number to go back to old revision. Default is 0. When backNumber is 0, a document in the current DB is returned.
   * When backNumber is 0 and a document has been deleted in the current DB, it returns undefined.
   *
   * @returns
   *  - JsonDocWithMetadata if exists.
   *
   *  - undefined if not exists.
   *
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link UndefinedDocumentIdError}
   * @throws {@link InvalidJsonObjectError}
   * @throws {@link InvalidIdCharacterError}
   * @throws {@link InvalidIdLengthError}
   * @throws {@link CorruptedRepositoryError}
   * @throws {@link InvalidBackNumberError}
   */
  getDocWithMetaData (
    docId: string,
    backNumber?: number
  ): Promise<JsonDocWithMetadata | undefined> {
    return (getImpl.call(this, docId, {
      backNumber,
      withMetadata: true,
    }) as unknown) as Promise<JsonDocWithMetadata>;
  }

  /**
   * Get a specific revision of a document
   *
   * @param - fileSHA SHA-1 hash of Git object (40 characters)
   *
   * @returns
   *  - JsonDoc if exists.
   *
   *  - undefined if not exists.
   *
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link UndefinedFileSHAError}
   * @throws {@link InvalidJsonObjectError}
   * @throws {@link CannotGetEntryError}
   */
  getByRevision (fileSHA: string): Promise<JsonDoc | undefined> {
    return getByRevisionImpl.call(this, fileSHA);
  }

  /**
   * Get revision history of a file from new to old
   *
   * @param - docId - id of a target document
   * @returns Array of fileSHA (NOTE: getDocHistory returns empty array if document does not exist in history.)
   *
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link UndefinedDocumentIdError}
   * @throws {@link InvalidIdCharacterError}
   * @throws {@link InvalidCollectionPathCharacterError}
   * @throws {@link InvalidCollectionPathLengthError}
   * @throws {@link InvalidIdLengthError}
   * @throws {@link CannotGetEntryError}
   */
  getDocHistory (docID: string): Promise<string[]> {
    return getDocHistoryImpl.call(this, docID);
  }

  /**
   * Remove a document
   *
   * @param id - id of a target document
   *
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link UndefinedDocumentIdError}
   * @throws {@link DocumentNotFoundError} when the specified document does not exist.
   * @throws {@link CannotDeleteDataError}
   * @throws {@link InvalidIdCharacterError}
   * @throws {@link InvalidIdLengthError}
   *
   */
  delete (id: string, options?: DeleteOptions): Promise<DeleteResult>;
  /**
   * Remove a document
   *
   * @param jsonDoc - Target document
   *
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link UndefinedDocumentIdError}
   * @throws {@link DocumentNotFoundError} when the specified document does not exist.
   * @throws {@link CannotDeleteDataError}
   * @throws {@link InvalidIdCharacterError}
   * @throws {@link InvalidIdLengthError}
   *
   */
  delete (jsonDoc: JsonDoc, options?: DeleteOptions): Promise<DeleteResult>;
  delete (idOrDoc: string | JsonDoc, options?: DeleteOptions): Promise<DeleteResult> {
    return deleteImpl.call(this, idOrDoc, options);
  }

  /**
   * This is an alias of remove()
   */

  remove (id: string, options?: DeleteOptions): Promise<DeleteResult>;
  /**
   * This is an alias of remove()
   */
  remove (jsonDoc: JsonDoc, options?: DeleteOptions): Promise<DeleteResult>;
  remove (idOrDoc: string | JsonDoc, options?: DeleteOptions): Promise<DeleteResult> {
    return deleteImpl.call(this, idOrDoc, options);
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
   *
   */
  allDocs (options?: AllDocsOptions): Promise<AllDocsResult> {
    // Do not use 'allDocs = allDocsImpl;' because api-extractor(TsDoc) recognizes this not as a function but a property.
    return allDocsImpl.call(this, options);
  }

  /**
   * getRemoteURLs
   *
   */
  getRemoteURLs (): string[] {
    return Object.keys(this._synchronizers);
  }

  /**
   * Get synchronizer
   *
   */
  getSynchronizer (remoteURL: string): Sync {
    return this._synchronizers[remoteURL];
  }

  /**
   * Stop and unregister remote synchronization
   *
   */
  unregisterRemote (remoteURL: string) {
    this._synchronizers[remoteURL].cancel();
    delete this._synchronizers[remoteURL];
  }

  /**
   * Synchronize with a remote repository
   *
   * @throws {@link UndefinedRemoteURLError} (from Sync#constructor())
   * @throws {@link IntervalTooSmallError}  (from Sync#constructor())
   *
   * @throws {@link RepositoryNotFoundError} (from Sync#syncImpl())
   * @throws {@link RemoteRepositoryConnectError} (from Sync#init())
   * @throws {@link PushWorkerError} (from Sync#init())
   * @throws {@link SyncWorkerError} (from Sync#init())
   *
   * @remarks
   * Register and synchronize with a remote repository. Do not register the same remote repository again. Call unregisterRemote() before register it again.
   */
  async sync (options: RemoteOptions): Promise<Sync>;
  /**
   * Synchronize with a remote repository
   *
   * @throws {@link UndefinedRemoteURLError} (from Sync#constructor())
   * @throws {@link IntervalTooSmallError}  (from Sync#constructor())
   *
   * @throws {@link RepositoryNotFoundError} (from Sync#syncAndGetResultImpl())
   * @throws {@link RemoteRepositoryConnectError} (from Sync#init())
   * @throws {@link PushWorkerError} (from Sync#init())
   * @throws {@link SyncWorkerError} (from Sync#init())
   *
   * @remarks
   * Register and synchronize with a remote repository. Do not register the same remote repository again. Call unregisterRemote() before register it again.
   */
  async sync (options: RemoteOptions, getSyncResult: boolean): Promise<[Sync, SyncResult]>;

  async sync (
    options: RemoteOptions,
    getSyncResult?: boolean
  ): Promise<Sync | [Sync, SyncResult]> {
    if (
      options.remoteUrl !== undefined &&
      this._synchronizers[options?.remoteUrl] !== undefined
    ) {
      throw new RemoteAlreadyRegisteredError(options.remoteUrl);
    }

    if (getSyncResult) {
      const [sync, syncResult] = await syncAndGetResultImpl.call(this, options);
      this._synchronizers[sync.remoteURL()] = sync;
      return [sync, syncResult];
    }
    const sync = await syncImpl.call(this, options);
    this._synchronizers[sync.remoteURL()] = sync;
    return sync;
  }
}
