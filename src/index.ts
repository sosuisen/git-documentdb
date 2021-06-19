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
  CannotCreateRepositoryError,
  CannotOpenRepositoryError,
  DatabaseCloseTimeoutError,
  DatabaseClosingError,
  FileRemoveTimeoutError,
  InvalidWorkingDirectoryPathLengthError,
  RemoteAlreadyRegisteredError,
  RepositoryNotFoundError,
  UndefinedDatabaseNameError,
} from './error';
import { Collection } from './collection';
import { Validator } from './validator';
import {
  CollectionPath,
  DatabaseCloseOption,
  DatabaseInfo,
  DatabaseOpenResult,
  DatabaseOptions,
  DeleteOptions,
  DeleteResult,
  Doc,
  FatDoc,
  FindOptions,
  GetOptions,
  HistoryOptions,
  JsonDoc,
  OpenOptions,
  PutOptions,
  PutResult,
  RemoteOptions,
  Schema,
  SyncResult,
} from './types';
import { CRUDInterface, IDocumentDB } from './types_gitddb';
import { putWorker } from './crud/put';
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
  author = {
    name: 'GitDocumentDB',
    email: 'gitddb@example.com',
  };

  committer = {
    name: 'GitDocumentDB',
    email: 'gitddb@example.com',
  };

  readonly defaultBranch = 'main';

  private _localDir: string;
  private _dbName: string;

  private _currentRepository: nodegit.Repository | undefined;
  private _workingDirectory: string;

  private _synchronizers: { [url: string]: Sync } = {};

  private _dbOpenResult: DatabaseOpenResult = {
    dbId: '',
    creator: '',
    version: '',
    isNew: false,
    isCreatedByGitddb: true,
    isValidVersion: true,
  };

  private _logLevel: TLogLevelName;

  private _fullCollection: Collection;

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
  constructor (options: DatabaseOptions) {
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

    this._fullCollection = new Collection(this);
  }

  /**
   * Open or create a Git repository
   *
   * @remarks
   *  - GitDocumentDB can load a git repository that is not created by the git-documentdb module.
   *  However, correct behavior is not guaranteed.
   *
   * @returns Database information
   * @throws {@link DatabaseClosingError}
   * @throws {@link CannotCreateDirectoryError}
   * @throws {@link CannotOpenRepositoryError}
   * @throws {@link RepositoryNotFoundError} may occurs when openOptions.createIfNotExists is false.
   */
  async open (openOptions?: OpenOptions): Promise<DatabaseOpenResult> {
    if (this.isClosing) {
      throw new DatabaseClosingError();
    }
    if (this.isOpened()) {
      this._dbOpenResult.isNew = false;
      return this._dbOpenResult;
    }
    if (openOptions === undefined) {
      openOptions = {
        createIfNotExists: undefined,
      };
    }
    openOptions.createIfNotExists ??= true;

    /**
     * Create directory
     */
    await fs.ensureDir(this._workingDirectory).catch((err: Error) => {
      throw new CannotCreateDirectoryError(err.message);
    });

    /**
     * Reset
     */
    this._synchronizers = {};
    this._dbOpenResult = {
      dbId: '',
      creator: '',
      version: '',
      isNew: false,
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
      if (fs.existsSync(gitDir)) {
        // Cannot open though .git directory exists.
        throw new CannotOpenRepositoryError(this._workingDirectory);
      }
      if (openOptions.createIfNotExists) {
        await this._createRepository().catch(e => {
          throw new CannotCreateRepositoryError(e.message);
        });
      }
      else {
        throw new RepositoryNotFoundError(gitDir);
      }
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
    this._dbOpenResult.isNew = true;

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
      GIT_DOCUMENTDB_INFO_ID + JSON_EXT,
      toSortedJSONString(info),
      FIRST_COMMIT_MESSAGE
    );
    this._dbOpenResult = { ...this._dbOpenResult, ...info };
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

    // Set dbId if not exists.
    if (!info.dbId) {
      info.dbId = generateDatabaseId();
      // Do not use this.put() because it increments TaskQueue.statistics.put.
      await putWorker(
        this,
        GIT_DOCUMENTDB_INFO_ID + JSON_EXT,
        toSortedJSONString(info),
        SET_DATABASE_ID_MESSAGE
      );
    }

    this._dbOpenResult.dbId = info.dbId;
    this._dbOpenResult.creator = info.creator;
    this._dbOpenResult.version = info.version;

    if (new RegExp('^' + DATABASE_CREATOR).test(info.creator)) {
      this._dbOpenResult.isCreatedByGitddb = true;
      if (new RegExp('^' + DATABASE_VERSION).test(info.version)) {
        this._dbOpenResult.isValidVersion = true;
      }
      else {
        this._dbOpenResult.isValidVersion = false;
        /**
         * TODO: Need migration
         */
      }
    }
    else {
      this._dbOpenResult.isCreatedByGitddb = false;
      this._dbOpenResult.isValidVersion = false;
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
    return this._dbOpenResult.dbId;
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
   * - localDir (which is specified in constructor) is not removed.
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
   * Insert a JSON document if not exists. Otherwise, update it.
   *
   * @remarks
   * - The document will be saved to `${workingDir()}/${jsonDoc._id}.json` on the file system.
   *
   * @param jsonDoc - See {@link JsonDoc} for restriction.
   *
   * @throws {@link UndefinedDocumentIdError}
   * @throws {@link InvalidJsonObjectError}
   *
   * @throws {@link UndefinedDocumentIdError} (from validateDocument)
   * @throws {@link InvalidIdCharacterError} (from validateDocument, validateId)
   * @throws {@link InvalidIdLengthError} (from validateDocument, validateId)
   *
   * @throws {@link DatabaseClosingError} (fromm putImpl)
   * @throws {@link TaskCancelError} (from putImpl)
   *
   * @throws {@link UndefinedDBError} (fromm putWorker)
   * @throws {@link RepositoryNotOpenError} (fromm putWorker)
   * @throws {@link CannotCreateDirectoryError} (from putWorker)
   * @throws {@link CannotWriteDataError} (from putWorker)
   */
  put (jsonDoc: JsonDoc, options?: PutOptions): Promise<PutResult>;

  /**
   * Insert a data if not exists. Otherwise, update it.
   *
   * @remarks
   * - The data will be saved to `${workingDir()}/${_id}` on the file system.
   *
   * - _id property of a JsonDoc is automatically set or overwritten by _id parameter.
   *
   * @param _id - '.json' is automatically completed when you omit it for JsonDoc _id.
   * @param data - {@link JsonDoc} or Uint8Array or string. _id property of JsonDoc is ignored.
   *
   * @throws {@link UndefinedDocumentIdError}
   * @throws {@link InvalidJsonObjectError}
   *
   * @throws {@link UndefinedDocumentIdError} (from validateDocument)
   * @throws {@link InvalidIdCharacterError} (from validateDocument, validateId)
   * @throws {@link InvalidIdLengthError} (from validateDocument, validateId)
   *
   * @throws {@link DatabaseClosingError} (fromm putImpl)
   * @throws {@link TaskCancelError} (from putImpl)
   *
   * @throws {@link UndefinedDBError} (fromm putWorker)
   * @throws {@link RepositoryNotOpenError} (fromm putWorker)
   * @throws {@link CannotCreateDirectoryError} (from putWorker)
   * @throws {@link CannotWriteDataError} (from putWorker)
   */
  put (
    _id: string,
    data: JsonDoc | Uint8Array | string,
    options?: PutOptions
  ): Promise<PutResult>;

  put (
    shortIdOrDoc: string | JsonDoc,
    dataOrOptions?: JsonDoc | Uint8Array | string | PutOptions,
    options?: PutOptions
  ): Promise<PutResult> {
    return this._fullCollection.put(shortIdOrDoc, dataOrOptions, options);
  }

  /**
   * Insert a JSON document
   *
   * @privateRemarks
   *
   * This is 'overload 1' referred to in test/insert.test.ts
   *
   * @remarks
   * - Throws SameIdExistsError when a document which has the same _id exists. It might be better to use put() instead of insert().
   *
   * - The document will be saved to `${workingDir()}/${jsonDoc._id}.json` on the file system.
   *
   * @param jsonDoc - See {@link JsonDoc} for restriction.
   *
   * @throws {@link UndefinedDocumentIdError}
   * @throws {@link InvalidJsonObjectError}
   *
   * @throws {@link UndefinedDocumentIdError} (from validateDocument)
   * @throws {@link InvalidIdCharacterError} (from validateDocument, validateId)
   * @throws {@link InvalidIdLengthError} (from validateDocument, validateId)
   *
   * @throws {@link DatabaseClosingError} (fromm putImpl)
   * @throws {@link TaskCancelError} (from putImpl)
   *
   * @throws {@link UndefinedDBError} (fromm putWorker)
   * @throws {@link RepositoryNotOpenError} (fromm putWorker)
   * @throws {@link CannotCreateDirectoryError} (from putWorker)
   * @throws {@link CannotWriteDataError} (from putWorker)
   *
   * @throws {@link SameIdExistsError} (from putWorker)
   */
  insert (jsonDoc: JsonDoc, options?: PutOptions): Promise<PutResult>;

  /**
   * Insert a data
   *
   * @privateRemarks
   *
   * This is 'overload 2' referred to in test/insert.test.ts
   *
   * @remarks
   * - Throws SameIdExistsError when a data which has the same id exists. It might be better to use put() instead of insert().
   *
   * - The data will be saved to `${workingDir()}/${_id}` on the file system.
   *
   * - _id property of a JsonDoc is automatically set or overwritten by _id parameter.
   *
   * @param _id - '.json' is automatically completed when you omit it for JsonDoc _id.
   * @param data - {@link JsonDoc} or Uint8Array or string. _id property of JsonDoc is ignored.
   *
   * @throws {@link UndefinedDocumentIdError}
   * @throws {@link InvalidJsonObjectError}
   *
   * @throws {@link UndefinedDocumentIdError} (from validateDocument)
   * @throws {@link InvalidIdCharacterError} (from validateDocument, validateId)
   * @throws {@link InvalidIdLengthError} (from validateDocument, validateId)
   *
   * @throws {@link DatabaseClosingError} (fromm putImpl)
   * @throws {@link TaskCancelError} (from putImpl)
   *
   * @throws {@link UndefinedDBError} (fromm putWorker)
   * @throws {@link RepositoryNotOpenError} (fromm putWorker)
   * @throws {@link CannotCreateDirectoryError} (from putWorker)
   * @throws {@link CannotWriteDataError} (from putWorker)
   *
   * @throws {@link SameIdExistsError} (from putWorker)
   */
  insert (
    _id: string,
    data: JsonDoc | Uint8Array | string,
    options?: PutOptions
  ): Promise<PutResult>;

  insert (
    shortIdOrDoc: string | JsonDoc,
    dataOrOptions?: JsonDoc | Uint8Array | string | PutOptions,
    options?: PutOptions
  ): Promise<PutResult> {
    options ??= {};
    options.insertOrUpdate = 'insert';
    return this._fullCollection.insert(shortIdOrDoc, dataOrOptions, options);
  }

  /**
   * Update a JSON document
   *
   * @privateRemarks
   *
   * This is 'overload 1' referred to in test/update.test.ts
   *
   * @remarks
   * - Throws DocumentNotFoundError if the document does not exist. It might be better to use put() instead of update().
   *
   * - The document will be saved to `${workingDir()}/${jsonDoc._id}.json` on the file system.
   *
   * - A update operation is not skipped even if no change occurred on a specified document.
   *
   * @param jsonDoc - See {@link JsonDoc} for restriction
   *
   * @throws {@link UndefinedDocumentIdError}
   * @throws {@link InvalidJsonObjectError}
   *
   * @throws {@link UndefinedDocumentIdError} (from validateDocument)
   * @throws {@link InvalidIdCharacterError} (from validateDocument, validateId)
   * @throws {@link InvalidIdLengthError} (from validateDocument, validateId)
   *
   * @throws {@link DatabaseClosingError} (fromm putImpl)
   * @throws {@link TaskCancelError} (from putImpl)
   *
   * @throws {@link UndefinedDBError} (fromm putWorker)
   * @throws {@link RepositoryNotOpenError} (fromm putWorker)
   * @throws {@link CannotCreateDirectoryError} (from putWorker)
   * @throws {@link CannotWriteDataError} (from putWorker)
   *
   * @throws {@link DocumentNotFoundError}
   *
   */
  update (jsonDoc: JsonDoc, options?: PutOptions): Promise<PutResult>;
  /**
   * Update a data
   *
   * @privateRemarks
   *
   * This is 'overload 2' referred to in test/put.test.ts
   *
   * @remarks
   * - Throws DocumentNotFoundError if the data does not exist. It might be better to use put() instead of update().
   *
   * - The data will be saved to `${workingDir()}/${_id}` on the file system.
   *
   * - A update operation is not skipped even if no change occurred on a specified data.
   *
   * @param id - _id property of a document
   * @param document - This is a {@link JsonDoc}, but _id property is ignored.
   *
   * @throws {@link UndefinedDocumentIdError}
   * @throws {@link InvalidJsonObjectError}
   *
   * @throws {@link UndefinedDocumentIdError} (from validateDocument)
   * @throws {@link InvalidIdCharacterError} (from validateDocument, validateId)
   * @throws {@link InvalidIdLengthError} (from validateDocument, validateId)
   *
   * @throws {@link DatabaseClosingError} (fromm putImpl)
   * @throws {@link TaskCancelError} (from putImpl)
   *
   * @throws {@link UndefinedDBError} (fromm putWorker)
   * @throws {@link RepositoryNotOpenError} (fromm putWorker)
   * @throws {@link CannotCreateDirectoryError} (from putWorker)
   * @throws {@link CannotWriteDataError} (from putWorker)
   *
   * @throws {@link DocumentNotFoundError}
   */
  update (
    _id: string,
    data: JsonDoc | Uint8Array | string,
    options?: PutOptions
  ): Promise<PutResult>;

  update (
    shortIdOrDoc: string | JsonDoc,
    dataOrOptions?: JsonDoc | Uint8Array | string | PutOptions,
    options?: PutOptions
  ): Promise<PutResult> {
    return this._fullCollection.update(shortIdOrDoc, dataOrOptions, options);
  }

  /**
   * Get a JSON document or data
   *
   * @param _id - '.json' is automatically completed when you omit it for JsonDoc _id.
   *
   * @returns
   *  - undefined if not exists.
   *
   *  - JsonDoc if the collection's readMethod is 'json'(default is 'json')
   *     or the file extension is '.json'.
   *
   *  - Uint8Array or string if the collections. readMethods is 'file'.
   *
   *  - getOptions.forceDocType always overwrite return type.
   *
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link InvalidJsonObjectError}
   */
  get (_id: string, getOptions?: GetOptions): Promise<Doc | undefined> {
    return this._fullCollection.get(_id, getOptions);
  }

  /**
   * Get a FatDoc
   *
   * @param _id - '.json' is automatically completed when you omit it for JsonDoc _id.
   *
   * @returns
   *  - undefined if not exists.
   *
   *  - FatJsonDoc if the collection's readMethod is 'json'(default is 'json')
   *     or the file extension is '.json'.
   *
   *  - FatBinaryDoc or FatTextDoc if the collections. readMethods is 'file'.
   *
   *  - getOptions.forceDocType always overwrite return type.
   *
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link InvalidJsonObjectError}
   */
  getFatDoc (_id: string, getOptions?: GetOptions): Promise<FatDoc | undefined> {
    return this._fullCollection.getFatDoc(_id, getOptions);
  }

  /**
  /**
   * Get a Doc which has specified oid
   *
   * @remarks
   *  - undefined if not exists.
   *
   *  - JsonDoc if isJsonDocCollection is true or the file extension is '.json'. Be careful that JsonDoc may not have _id property if it was not created by GitDocumentDB.
   *
   *  - Uint8Array or string if isJsonDocCollection is false.
   *
   *  - getOptions.forceDocType always overwrite return type.
   *
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link InvalidJsonObjectError}
   */
  getDocByOid (fileOid: string, getOptions?: GetOptions): Promise<Doc | undefined> {
    return this._fullCollection.getDocByOid(fileOid, getOptions);
  }

  /**
   * Get a back number of a document
   *
   * @param backNumber - Specify a number to go back to old revision. Default is 0.
   * When backNumber equals 0, the latest revision is returned.
   * See {@link getHistory} for the array of revisions.
   *
   * @param historyOptions: The array of revisions is filtered by HistoryOptions.filter.
   *
   * @remarks
   *  - undefined if the document does not exists or the document is deleted.
   *
   *  - JsonDoc if isJsonDocCollection is true or the file extension is '.json'.
   *
   *  - Uint8Array or string if isJsonDocCollection is false.
   *
   *  - getOptions.forceDocType always overwrite return type.
   *
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link InvalidJsonObjectError}
   */
  getBackNumber (
    _id: string,
    backNumber: number,
    historyOptions?: HistoryOptions,
    getOptions?: GetOptions
  ): Promise<Doc | undefined> {
    return this._fullCollection.getBackNumber(_id, backNumber, historyOptions, getOptions);
  }

  /**
   * {@link getBackNumber} that returns FatDoc
   *
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link InvalidJsonObjectError}
   */
  getFatDocBackNumber (
    _id: string,
    backNumber: number,
    historyOptions?: HistoryOptions,
    getOptions?: GetOptions
  ): Promise<FatDoc | undefined> {
    return this._fullCollection.getFatDocBackNumber(
      _id,
      backNumber,
      historyOptions,
      getOptions
    );
  }

  /**
   * Get revision history of a document
   *
   * @remarks
   * - By default, revisions are sorted by reverse chronological order. However, keep in mind that Git dates may not be consistent across repositories.
   *
   * @param historyOptions: The array of revisions is filtered by HistoryOptions.filter.
   *
   * @example
   * ```
   * commit 01 to 07 were committed in order. file_v1 and file_v2 are two revisions of a file.
   *
   * commit 07: not exists
   * commit 06: deleted
   * commit 05: file_v2
   * commit 04: deleted
   * commit 03: file_v2
   * commit 02: file_v1
   * commit 01: file_v1
   *
   * file_v1 was newly inserted in 01.
   * The file was not changed in 02.
   * The file was updated to file_v2 in 03
   * The file was deleted in 04.
   * The same file (file_v2) was inserted again in 05.
   * The file was deleted again in 06, so the file does not exist in 07.
   *
   * Here, getHistory() will return [undefined, file_v2, undefined, file_v2, file_v1].
   * Be careful that consecutive values are combined into one.
   * (Thus, it will not return [undefined, undefined, file_v2, undefined, file_v2, file_v1, file_v1].)
   * ```
   * @returns Array of FatDoc or undefined.
   *  - undefined if the document does not exists or the document is deleted.
   *
   *  - JsonDoc if isJsonDocCollection is true or the file extension is '.json'.
   *
   *  - Uint8Array or string if isJsonDocCollection is false.
   *
   *  - getOptions.forceDocType always overwrite return type.
   *
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link InvalidJsonObjectError}
   */
  getHistory (
    _id: string,
    historyOptions?: HistoryOptions,
    getOptions?: GetOptions
  ): Promise<(Doc | undefined)[]> {
    return this._fullCollection.getHistory(_id, historyOptions, getOptions);
  }

  /**
   * {@link getHistory} that returns FatDoc[]
   *
   * @returns Array of FatDoc or undefined.
   *  - undefined if the document does not exists or the document is deleted.
   *
   *  - FatJsonDoc if isJsonDocCollection is true or the file extension is '.json'.
   *
   *  - FatBinaryDoc or FatTextDoc if isJsonDocCollection is false.
   *
   *  - getOptions.forceDocType always overwrite return type.
   *
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link InvalidJsonObjectError}
   */
  getFatDocHistory (
    _id: string,
    historyOptions?: HistoryOptions,
    getOptions?: GetOptions
  ): Promise<(FatDoc | undefined)[]> {
    return this._fullCollection.getFatDocHistory(_id, historyOptions, getOptions);
  }

  /**
   * Delete a document
   *
   * @throws {@link UndefinedDocumentIdError} (from Collection#delete)
   * @throws {@link DatabaseClosingError} (from deleteImpl)
   * @throws {@link TaskCancelError} (from deleteImpl)
   *
   * @throws {@link RepositoryNotOpenError} (from deleteWorker)
   * @throws {@link UndefinedDBError} (from deleteWorker)
   * @throws {@link DocumentNotFoundError} (from deleteWorker)
   * @throws {@link CannotDeleteDataError} (from deleteWorker)
   */
  delete (_id: string, options?: DeleteOptions): Promise<DeleteResult>;

  /**
   * Delete a document by _id property in JsonDoc
   *
   * @param jsonDoc - Only the _id property in JsonDoc is referenced.
   *
   * @throws {@link UndefinedDocumentIdError} (from Collection#delete)
   * @throws {@link DatabaseClosingError} (from deleteImpl)
   * @throws {@link TaskCancelError} (from deleteImpl)
   *
   * @throws {@link RepositoryNotOpenError} (from deleteWorker)
   * @throws {@link UndefinedDBError} (from deleteWorker)
   * @throws {@link DocumentNotFoundError} (from deleteWorker)
   * @throws {@link CannotDeleteDataError} (from deleteWorker)
   */
  delete (jsonDoc: JsonDoc, options?: DeleteOptions): Promise<DeleteResult>;
  delete (idOrDoc: string | JsonDoc, options?: DeleteOptions): Promise<DeleteResult> {
    return this._fullCollection.delete(idOrDoc, options);
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
   */
  find (options?: FindOptions): Promise<Doc[]> {
    return this._fullCollection.find(options);
  }

  /**
   * {@link find} that returns FatDoc[]
   *
   * @remarks
   *
   * @param options - The options specify how to get documents.
   *
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link InvalidJsonObjectError}
   */
  findFatDoc (options?: FindOptions): Promise<FatDoc[]> {
    return this._fullCollection.findFatDoc(options);
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
