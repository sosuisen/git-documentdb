/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import nodegit from '@sosuisen/nodegit';
import git from 'isomorphic-git';
import fs from 'fs-extra';
import rimraf from 'rimraf';
import { Logger, TLogLevelName } from 'tslog';
import { ulid } from 'ulid';
import { Err } from './error';
import { Collection } from './collection';
import { Validator } from './validator';
import {
  CollectionOptions,
  CollectionPath,
  DatabaseCloseOption,
  DatabaseInfo,
  DatabaseOpenResult,
  DatabaseOptions,
  DeleteOptions,
  DeleteResult,
  DeleteResultJsonDoc,
  Doc,
  DocType,
  FatDoc,
  FindOptions,
  GetOptions,
  HistoryOptions,
  JsonDoc,
  NormalizedCommit,
  OpenOptions,
  PutOptions,
  PutResult,
  PutResultJsonDoc,
  RemoteOptions,
  Schema,
  SyncCallback,
  SyncEvent,
  SyncResult,
} from './types';
import { GitDDBInterface } from './types_gitddb';
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
  GIT_DOCUMENTDB_APP_INFO_ID,
  GIT_DOCUMENTDB_INFO_ID,
  JSON_EXT,
  PUT_APP_INFO_MESSAGE,
  SET_DATABASE_ID_MESSAGE,
} from './const';
import { normalizeCommit, toSortedJSONString } from './utils';
import { SyncEventInterface, SyncInterface } from './types_sync';
import { CRUDInterface } from './types_crud_interface';
import { CollectionInterface, ICollection } from './types_collection';

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
 *
 * @public
 */
export class GitDocumentDB
  implements GitDDBInterface, CRUDInterface, CollectionInterface, SyncEventInterface {
  /***********************************************
   * Private properties
   ***********************************************/
  private _currentRepository: nodegit.Repository | undefined;

  private _synchronizers: { [url: string]: Sync } = {};

  private _dbOpenResult: DatabaseOpenResult = {
    dbId: '',
    creator: '',
    version: '',
    isNew: false,
    isCreatedByGitDDB: true,
    isValidVersion: true,
  };

  /***********************************************
   * Public properties (readonly)
   ***********************************************/

  /**
   * Default Git branch
   *
   * @readonly
   * @public
   */
  readonly defaultBranch = 'main';

  private _localDir: string;
  /**
   * A local directory path that stores repositories of GitDocumentDB
   *
   * @readonly
   * @public
   */
  get localDir (): string {
    return this._localDir;
  }

  private _dbName: string;
  /**
   * A name of a git repository
   *
   * @readonly
   * @public
   */
  get dbName (): string {
    return this._dbName;
  }

  private _workingDir: string;
  /**
   * Get a full path of the current Git working directory
   *
   * @returns A full path whose trailing slash is omitted
   *
   * @readonly
   * @public
   */
  get workingDir () {
    return this._workingDir;
  }

  /**
   * Get dbId
   *
   * @readonly
   * @public
   */
  get dbId () {
    return this._dbOpenResult.dbId;
  }

  private _logger!: Logger; // Use definite assignment assertion
  /**
   * Get logger
   *
   * @readonly
   * @public
   */
  get logger (): Logger {
    return this._logger;
  }

  private _schema!: Schema;
  /**
   * Schema for specific document type
   *
   * @readonly
   * @public
   */
  get schema (): Schema {
    return this._schema;
  }

  private _taskQueue: TaskQueue;
  /**
   * Task queue
   *
   * @readonly
   * @public
   */
  get taskQueue (): TaskQueue {
    return this._taskQueue;
  }

  private _isClosing = false;
  /**
   * DB is going to close
   *
   * @readonly
   * @public
   */
  get isClosing (): boolean {
    return this._isClosing;
  }

  private _validator: Validator;
  /**
   * Name validator
   *
   * @readonly
   * @public
   */
  get validator (): Validator {
    return this._validator;
  }

  private _rootCollection: Collection;
  /**
   * Default collection whose collectionPath is ''
   *
   * @readonly
   * @public
   */
  get rootCollection (): ICollection {
    return this._rootCollection as ICollection;
  }

  /***********************************************
   * Public properties
   ***********************************************/

  private _logLevel!: TLogLevelName;
  /**
   * logLevel ('silly' | 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal')
   *
   * @public
   */
  get logLevel (): TLogLevelName {
    return this._logLevel;
  }

  set logLevel (level: TLogLevelName) {
    this._logLevel = level;
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
   * Author name and email for commit
   *
   * @public
   */
  author = {
    name: 'GitDocumentDB',
    email: 'gitddb@localhost',
  };

  /**
   * Committer name and email for commit
   *
   * @public
   */
  committer = {
    name: 'GitDocumentDB',
    email: 'gitddb@localhost',
  };

  /**
   * Constructor
   *
   * @remarks
   * - The Git working directory will be `${options.localDir}/${options.dbName}`.
   *
   * @throws {@link Err.InvalidWorkingDirectoryPathLengthError}
   * @throws {@link Err.UndefinedDatabaseNameError}
   *
   * @public
   */
  constructor (options: DatabaseOptions & CollectionOptions) {
    if (options.dbName === undefined || options.dbName === '') {
      throw new Err.UndefinedDatabaseNameError();
    }

    this._dbName = options.dbName;
    this._localDir = options.localDir ?? DEFAULT_LOCAL_DIR;

    this._schema = options.schema ?? {
      json: {
        idOfSubtree: undefined,
        plainTextProperties: undefined,
      },
    };

    // Get full-path
    this._workingDir = path.resolve(this._localDir, this._dbName);

    this._validator = new Validator(this._workingDir);

    this.validator.validateDbName(this._dbName);
    this.validator.validateLocalDir(this._localDir);

    if (
      this._workingDir.length === 0 ||
      Validator.byteLengthOf(this._workingDir) > Validator.maxWorkingDirectoryLength()
    ) {
      throw new Err.InvalidWorkingDirectoryPathLengthError(
        this._workingDir,
        0,
        Validator.maxWorkingDirectoryLength()
      );
    }

    this._taskQueue = new TaskQueue(this.logger);

    // Set logLevel after initializing taskQueue.
    this.logLevel = options.logLevel ?? DEFAULT_LOG_LEVEL;

    const collectionOptions = {
      namePrefix: options?.namePrefix ?? '',
    };
    this._rootCollection = new Collection(this, '', undefined, collectionOptions);
  }

  /***********************************************
   * Private methods
   ***********************************************/

  /**
   * @internal
   */
  private async _createRepository () {
    /**
     * Create a repository followed by first commit
     */
    const options: RepositoryInitOptions = {
      initialHead: this.defaultBranch,
    };
    this._dbOpenResult.isNew = true;

    this._currentRepository = await nodegit.Repository.initExt(
      this._workingDir,
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
      '',
      GIT_DOCUMENTDB_INFO_ID + JSON_EXT,
      toSortedJSONString(info),
      FIRST_COMMIT_MESSAGE
    );
    this._dbOpenResult = { ...this._dbOpenResult, ...info };
  }

  /***********************************************
   * Public methods
   ***********************************************/

  /**
   * Open or create a Git repository
   *
   * @remarks
   *  - GitDocumentDB can load a git repository that is not created by the git-documentdb module.
   *  However, correct behavior is not guaranteed.
   *
   * @returns Database information
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.CannotCreateDirectoryError}
   * @throws {@link Err.CannotOpenRepositoryError}
   * @throws {@link Err.RepositoryNotFoundError} may occurs when openOptions.createIfNotExists is false.
   *
   * @public
   */
  async open (openOptions?: OpenOptions): Promise<DatabaseOpenResult> {
    if (this.isClosing) {
      throw new Err.DatabaseClosingError();
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
    await fs.ensureDir(this._workingDir).catch((err: Error) => {
      throw new Err.CannotCreateDirectoryError(err.message);
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
      isCreatedByGitDDB: true,
      isValidVersion: true,
    };
    this.taskQueue.clear();

    /**
     * nodegit.Repository.open() throws an error if the specified repository does not exist.
     * open() also throws an error if the path is invalid or not writable,
     */
    try {
      this._currentRepository = await nodegit.Repository.open(this._workingDir);
    } catch (err) {
      const gitDir = this._workingDir + '/.git/';
      if (fs.existsSync(gitDir)) {
        // Cannot open though .git directory exists.
        throw new Err.CannotOpenRepositoryError(this._workingDir);
      }
      if (openOptions.createIfNotExists) {
        await this._createRepository().catch(e => {
          throw new Err.CannotCreateRepositoryError(e.message);
        });
      }
      else {
        throw new Err.RepositoryNotFoundError(gitDir);
      }
    }

    await this.loadDbInfo();
    return this._dbOpenResult;
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
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.DatabaseCloseTimeoutError}
   *
   * @public
   */
  async close (options?: DatabaseCloseOption): Promise<void> {
    if (this.isClosing) {
      return Promise.reject(new Err.DatabaseClosingError());
    }
    // Stop remote
    Object.values(this._synchronizers).forEach(sync => sync.close());

    options ??= { force: undefined, timeout: undefined };
    options.force ??= false;
    options.timeout ??= 10000;

    // Wait taskQueue
    if (this._currentRepository instanceof nodegit.Repository) {
      try {
        this._isClosing = true;
        if (!options.force) {
          const isTimeout = await this.taskQueue.waitCompletion(options.timeout);
          if (isTimeout) {
            return Promise.reject(new Err.DatabaseCloseTimeoutError());
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

        this._isClosing = false;
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
   * @param options - The options specify how to close database.
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.DatabaseCloseTimeoutError}
   * @throws {@link Err.FileRemoveTimeoutError}
   *
   * @public
   */
  async destroy (options: DatabaseCloseOption = {}): Promise<{ ok: true }> {
    if (this.isClosing) {
      return Promise.reject(new Err.DatabaseClosingError());
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
    //      await fs.remove(this._workingDir).catch(err => {

    await new Promise<void>((resolve, reject) => {
      // Set timeout because rimraf sometimes does not catch EPERM error.
      setTimeout(() => {
        reject(new Err.FileRemoveTimeoutError());
      }, FILE_REMOVE_TIMEOUT);
      rimraf(this._workingDir, error => {
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
   * Test if a database is opened
   *
   * @public
   */
  isOpened () {
    return this._currentRepository !== undefined;
  }

  /**
   * Get a collection
   *
   * @param collectionPath - relative path from localDir. Sub-directories are also permitted. e.g. 'pages', 'pages/works'.
   *
   * @remarks
   * - Notice that this function just read existing directory. It does not make a new sub-directory.
   *
   * @returns A child collection of {@link git-documentdb#GitDocumentDB.rootCollection}
   *
   * @public
   */
  collection (collectionPath: CollectionPath, options?: CollectionOptions): Collection {
    return new Collection(this, collectionPath, this.rootCollection, options);
  }

  /**
   * Get collections
   *
   * @param dirPath - Get collections directly under the dirPath. dirPath is a relative path from localDir. Default is ''.
   * @returns Promise\<Collection[]\>
   * @throws {@link Err.RepositoryNotOpenError}
   *
   * @public
   */
  async getCollections (dirPath = ''): Promise<ICollection[]> {
    return await this.rootCollection.getCollections(dirPath);
  }

  /**
   * getRemoteURLs
   *
   * @public
   */
  getRemoteURLs (): string[] {
    return Object.keys(this._synchronizers);
  }

  /**
   * Get synchronizer
   *
   * @public
   */
  getSync (remoteURL: string): Sync {
    return this._synchronizers[remoteURL];
  }

  /**
   * Stop and unregister remote synchronization
   *
   * @public
   */
  removeSync (remoteURL: string) {
    this._synchronizers[remoteURL].pause();
    delete this._synchronizers[remoteURL];
  }

  /**
   * Synchronize with a remote repository
   *
   * @throws {@link Err.UndefinedRemoteURLError} (from Sync#constructor())
   * @throws {@link Err.IntervalTooSmallError}  (from Sync#constructor())
   *
   * @throws {@link Err.RepositoryNotFoundError} (from Sync#syncImpl())
   * @throws {@link Err.RemoteRepositoryConnectError} (from Sync#init())
   * @throws {@link Err.PushWorkerError} (from Sync#init())
   * @throws {@link Err.SyncWorkerError} (from Sync#init())
   *
   * @remarks
   * Register and synchronize with a remote repository. Do not register the same remote repository again. Call unregisterRemote() before register it again.
   *
   * @public
   */
  async sync (options: RemoteOptions): Promise<Sync>;
  /**
   * Synchronize with a remote repository
   *
   * @throws {@link Err.UndefinedRemoteURLError} (from Sync#constructor())
   * @throws {@link Err.IntervalTooSmallError}  (from Sync#constructor())
   *
   * @throws {@link Err.RepositoryNotFoundError} (from Sync#syncAndGetResultImpl())
   * @throws {@link Err.RemoteRepositoryConnectError} (from Sync#init())
   * @throws {@link Err.PushWorkerError} (from Sync#init())
   * @throws {@link Err.SyncWorkerError} (from Sync#init())
   *
   * @remarks
   * Register and synchronize with a remote repository. Do not register the same remote repository again. Call unregisterRemote() before register it again.
   *
   * @public
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
      throw new Err.RemoteAlreadyRegisteredError(options.remoteUrl);
    }

    if (getSyncResult) {
      const [sync, syncResult] = await syncAndGetResultImpl.call(this, options);
      this._synchronizers[sync.remoteURL] = sync;
      return [sync, syncResult];
    }
    const sync = await syncImpl.call(this, options);
    this._synchronizers[sync.remoteURL] = sync;
    return sync;
  }

  /**
   * Get commit object
   *
   * @public
   */
  async getCommit (oid: string): Promise<NormalizedCommit> {
    const readCommitResult = await git.readCommit({ fs, dir: this._workingDir, oid });
    return normalizeCommit(readCommitResult);
  }

  /**
   * Save current author to .git/config
   *
   * @remarks
   * Save GitDocumentDB#author. to user.name and user.email in .git/config
   *
   * @public
   */
  async saveAuthor (): Promise<void> {
    if (this.author?.name !== undefined) {
      await git.setConfig({
        fs,
        dir: this._workingDir,
        path: 'user.name',
        value: this.author.name,
      });
    }
    if (this.author?.email !== undefined) {
      await git.setConfig({
        fs,
        dir: this._workingDir,
        path: 'user.email',
        value: this.author.email,
      });
    }
  }

  /**
   * Load author from .git/config
   *
   * @remarks
   * Load user.name and user.email to GitDocumentDB#author.
   * If not defined in .git/config, do nothing.
   *
   * @public
   */
  async loadAuthor (): Promise<void> {
    const name = await git
      .getConfig({
        fs,
        dir: this._workingDir,
        path: 'user.name',
      })
      .catch(() => undefined);
    this.author.name = name ?? this.author.name;

    const email = await git
      .getConfig({
        fs,
        dir: this._workingDir,
        path: 'user.email',
      })
      .catch(() => undefined);
    this.author.email = email ?? this.author.email;
  }

  /**
   * Save app specific info into .gitddb/app.json
   *
   * @public
   */
  async saveAppInfo (info: { [key: string]: any }) {
    // Do not use this.put() because it increments TaskQueue.statistics.put.
    await putWorker(
      this,
      '',
      GIT_DOCUMENTDB_APP_INFO_ID + JSON_EXT,
      toSortedJSONString(info),
      PUT_APP_INFO_MESSAGE
    );
  }

  /**
   * Load app specific info from .gitddb/app.json
   *
   * @returns JSON object. It returns undefined if not exists.
   *
   * @public
   */
  async loadAppInfo () {
    const info = await this.get(GIT_DOCUMENTDB_APP_INFO_ID).catch(() => undefined);
    if (info?._id) {
      delete info._id;
    }
    return info;
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
        '',
        GIT_DOCUMENTDB_INFO_ID + JSON_EXT,
        toSortedJSONString(info),
        SET_DATABASE_ID_MESSAGE
      );
    }

    this._dbOpenResult.dbId = info.dbId;
    this._dbOpenResult.creator = info.creator;
    this._dbOpenResult.version = info.version;

    if (new RegExp('^' + DATABASE_CREATOR).test(info.creator)) {
      this._dbOpenResult.isCreatedByGitDDB = true;
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
      this._dbOpenResult.isCreatedByGitDDB = false;
      this._dbOpenResult.isValidVersion = false;
    }
  }

  /**
   * Get a current repository
   *
   * @deprecated This will be removed when NodeGit is replaced with isomorphic-git.
   * @public
   */
  repository (): nodegit.Repository | undefined {
    return this._currentRepository;
  }

  /**
   * Set repository
   *
   * @remarks Be aware that it can corrupt the database.
   * @deprecated  This will be removed when NodeGit is replaced with isomorphic-git.
   * @public
   */
  setRepository (repos: nodegit.Repository) {
    this._currentRepository = undefined;
    this._currentRepository = repos;
  }

  /***********************************************
   * Public method (Implementation of CRUDInterface)
   ***********************************************/

  /**
   * Insert a JSON document if not exists. Otherwise, update it.
   *
   * @param jsonDoc - JsonDoc whose _id is shortId. shortId is a file path whose collectionPath and .json extension are omitted.
   *
   * @remarks
   * - The saved file path is `${GitDocumentDB#workingDir}/${jsonDoc._id}.json` on the file system.
   *
   * - If _id is undefined, it is automatically generated.
   *
   * - This is an alias of GitDocumentDB#rootCollection.put()
   *
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @throws {@link Err.InvalidIdCharacterError} (from validateDocument, validateId)
   * @throws {@link Err.InvalidIdLengthError} (from validateDocument, validateId)
   *
   * @throws {@link Err.DatabaseClosingError} (fromm putImpl)
   * @throws {@link Err.TaskCancelError} (from putImpl)
   *
   * @throws {@link Err.UndefinedDBError} (fromm putWorker)
   * @throws {@link Err.RepositoryNotOpenError} (fromm putWorker)
   * @throws {@link Err.CannotCreateDirectoryError} (from putWorker)
   * @throws {@link Err.CannotWriteDataError} (from putWorker)
   *
   * @public
   */
  put (jsonDoc: JsonDoc, options?: PutOptions): Promise<PutResultJsonDoc>;

  /**
   * Insert a JSON document if not exists. Otherwise, update it.
   *
   * @param _id - _id is a file path whose .json extension is omitted.
   *
   * @remarks
   * - The saved file path is `${GitDocumentDB#workingDir}/${_id}.json` on the file system.
   *
   * - If _id is undefined, it is automatically generated.
   *
   * - _id property of a JsonDoc is automatically set or overwritten by _id parameter.
   *
   * - An update operation is not skipped even if no change occurred on a specified data.
   *
   * - This is an alias of GitDocumentDB#rootCollection.put()
   *
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @throws {@link Err.InvalidIdCharacterError} (from validateDocument, validateId)
   * @throws {@link Err.InvalidIdLengthError} (from validateDocument, validateId)
   *
   * @throws {@link Err.DatabaseClosingError} (fromm putImpl)
   * @throws {@link Err.TaskCancelError} (from putImpl)
   *
   * @throws {@link Err.UndefinedDBError} (fromm putWorker)
   * @throws {@link Err.RepositoryNotOpenError} (fromm putWorker)
   * @throws {@link Err.CannotCreateDirectoryError} (from putWorker)
   * @throws {@link Err.CannotWriteDataError} (from putWorker)
   *
   * @public
   */
  put (
    _id: string | undefined | null,
    jsonDoc: JsonDoc,
    options?: PutOptions
  ): Promise<PutResultJsonDoc>;

  put (
    _idOrDoc: string | undefined | null | JsonDoc,
    jsonDocOrOptions?: JsonDoc | PutOptions,
    options?: PutOptions
  ): Promise<PutResultJsonDoc> {
    return this.rootCollection.put(_idOrDoc, jsonDocOrOptions, options);
  }

  /**
   * Insert a JSON document
   *
   * @param jsonDoc - JsonDoc whose _id is shortId. shortId is a file path whose collectionPath and .json extension are omitted.
   *
   * @remarks
   * - Throws SameIdExistsError when a document which has the same _id exists. It might be better to use put() instead of insert().
   *
   * - If _id is undefined, it is automatically generated.
   *
   * - The saved file path is `${GitDocumentDB#workingDir}/${jsonDoc._id}.json` on the file system.
   *
   * - This is an alias of GitDocumentDB#rootCollection.insert()
   *
   * @param jsonDoc - See {@link JsonDoc} for restriction.
   *
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @throws {@link Err.InvalidIdCharacterError} (from validateDocument, validateId)
   * @throws {@link Err.InvalidIdLengthError} (from validateDocument, validateId)
   *
   * @throws {@link Err.DatabaseClosingError} (fromm putImpl)
   * @throws {@link Err.TaskCancelError} (from putImpl)
   *
   * @throws {@link Err.UndefinedDBError} (fromm putWorker)
   * @throws {@link Err.RepositoryNotOpenError} (fromm putWorker)
   * @throws {@link Err.CannotCreateDirectoryError} (from putWorker)
   * @throws {@link Err.CannotWriteDataError} (from putWorker)
   *
   * @throws {@link Err.SameIdExistsError} (from putWorker)
   *
   * @public
   */
  insert (jsonDoc: JsonDoc, options?: PutOptions): Promise<PutResultJsonDoc>;

  /**
   * Insert a JSON document
   *
   * @param _id - _id is a file path whose .json extension is omitted.
   *
   * @remarks
   * - Throws SameIdExistsError when a data which has the same id exists. It might be better to use put() instead of insert().
   *
   * - The saved file path is `${GitDocumentDB#workingDir}/${_id}.json` on the file system.
   *
   * - If _id is undefined, it is automatically generated.
   *
   * - _id property of a JsonDoc is automatically set or overwritten by _id parameter.
   *
   *  - This is an alias of GitDocumentDB#rootCollection.insert()
   *
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @throws {@link Err.InvalidIdCharacterError} (from validateDocument, validateId)
   * @throws {@link Err.InvalidIdLengthError} (from validateDocument, validateId)
   *
   * @throws {@link Err.DatabaseClosingError} (fromm putImpl)
   * @throws {@link Err.TaskCancelError} (from putImpl)
   *
   * @throws {@link Err.UndefinedDBError} (fromm putWorker)
   * @throws {@link Err.RepositoryNotOpenError} (fromm putWorker)
   * @throws {@link Err.CannotCreateDirectoryError} (from putWorker)
   * @throws {@link Err.CannotWriteDataError} (from putWorker)
   *
   * @throws {@link Err.SameIdExistsError} (from putWorker)
   *
   * @public
   */
  insert (
    _id: string | undefined | null,
    jsonDoc: JsonDoc,
    options?: PutOptions
  ): Promise<PutResultJsonDoc>;

  insert (
    _idOrDoc: string | undefined | null | JsonDoc,
    jsonDocOrOptions?: JsonDoc | PutOptions,
    options?: PutOptions
  ): Promise<PutResultJsonDoc> {
    options ??= {};
    options.insertOrUpdate = 'insert';
    return this.rootCollection.insert(_idOrDoc, jsonDocOrOptions, options);
  }

  /**
   * Update a JSON document
   *
   * @param jsonDoc - JsonDoc whose _id is shortId. shortId is a file path whose collectionPath and .json extension are omitted.
   *
   * @remarks
   * - Throws DocumentNotFoundError if the document does not exist. It might be better to use put() instead of update().
   *
   * - If _id is undefined, it is automatically generated.
   *
   * - The saved file path is `${GitDocumentDB#workingDir}/${_id}.json` on the file system.
   *
   * - This is an alias of GitDocumentDB#rootCollection.update()
   *
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @throws {@link Err.InvalidIdCharacterError} (from validateDocument, validateId)
   * @throws {@link Err.InvalidIdLengthError} (from validateDocument, validateId)
   *
   * @throws {@link Err.DatabaseClosingError} (fromm putImpl)
   * @throws {@link Err.TaskCancelError} (from putImpl)
   *
   * @throws {@link Err.UndefinedDBError} (fromm putWorker)
   * @throws {@link Err.RepositoryNotOpenError} (fromm putWorker)
   * @throws {@link Err.CannotCreateDirectoryError} (from putWorker)
   * @throws {@link Err.CannotWriteDataError} (from putWorker)
   *
   * @throws {@link Err.DocumentNotFoundError}
   *
   * @public
   */
  update (jsonDoc: JsonDoc, options?: PutOptions): Promise<PutResultJsonDoc>;

  /**
   * Update a JSON document
   *
   * @param _id - _id is a file path whose .json extension is omitted.
   *
   * @remarks
   * - Throws DocumentNotFoundError if the data does not exist. It might be better to use put() instead of update().
   *
   * - The saved file path is `${GitDocumentDB#workingDir}/${_id}.json` on the file system.
   *
   * - If _id is undefined, it is automatically generated.
   *
   * - An update operation is not skipped even if no change occurred on a specified data.
   *
   * - This is an alias of GitDocumentDB#rootCollection.update()
   *
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @throws {@link Err.InvalidIdCharacterError} (from validateDocument, validateId)
   * @throws {@link Err.InvalidIdLengthError} (from validateDocument, validateId)
   *
   * @throws {@link Err.DatabaseClosingError} (fromm putImpl)
   * @throws {@link Err.TaskCancelError} (from putImpl)
   *
   * @throws {@link Err.UndefinedDBError} (fromm putWorker)
   * @throws {@link Err.RepositoryNotOpenError} (fromm putWorker)
   * @throws {@link Err.CannotCreateDirectoryError} (from putWorker)
   * @throws {@link Err.CannotWriteDataError} (from putWorker)
   *
   * @throws {@link Err.DocumentNotFoundError}
   *
   * @public
   */
  update (
    _id: string | undefined | null,
    jsonDoc: JsonDoc,
    options?: PutOptions
  ): Promise<PutResultJsonDoc>;

  update (
    _idOrDoc: string | undefined | null | JsonDoc,
    jsonDocOrOptions?: JsonDoc | PutOptions,
    options?: PutOptions
  ): Promise<PutResultJsonDoc> {
    return this.rootCollection.update(_idOrDoc, jsonDocOrOptions, options);
  }

  /**
   * Insert a data if not exists. Otherwise, update it.
   *
   * @param name - name is a file path.
   *
   * @remarks
   * - The saved file path is `${GitDocumentDB#workingDir}/${name}.json`.
   *
   * - If name is undefined, it is automatically generated.
   *
   * - _id property of a JsonDoc is automatically set or overwritten by name parameter whose .json extension is removed.
   *
   * - An update operation is not skipped even if no change occurred on a specified data.
   *
   * - This is an alias of GitDocumentDB#rootCollection.putFatDoc()
   *
   * @throws {@link Err.InvalidJsonFileExtensionError}
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @throws {@link Err.InvalidIdCharacterError} (from validateDocument, validateId)
   * @throws {@link Err.InvalidIdLengthError} (from validateDocument, validateId)
   *
   * @throws {@link Err.DatabaseClosingError} (fromm putImpl)
   * @throws {@link Err.TaskCancelError} (from putImpl)
   *
   * @throws {@link Err.UndefinedDBError} (fromm putWorker)
   * @throws {@link Err.RepositoryNotOpenError} (fromm putWorker)
   * @throws {@link Err.CannotCreateDirectoryError} (from putWorker)
   * @throws {@link Err.CannotWriteDataError} (from putWorker)
   *
   * @public
   */
  putFatDoc (
    name: string | undefined | null,
    doc: JsonDoc | Uint8Array | string,
    options?: PutOptions
  ): Promise<PutResult> {
    return this.rootCollection.putFatDoc(name, doc, options);
  }

  /**
   * Insert a data
   *
   * @param name - name is a file path.
   *
   * @remarks
   * - Throws SameIdExistsError when a data which has the same _id exists. It might be better to use put() instead of insert().
   *
   * - The saved file path is `${GitDocumentDB#workingDir}/${name}.json`.
   *
   * - If name is undefined, it is automatically generated.
   *
   * - _id property of a JsonDoc is automatically set or overwritten by name parameter whose .json extension is omitted.
   *
   * - This is an alias of GitDocumentDB#rootCollection.insertFatDoc()
   *
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @throws {@link Err.InvalidIdCharacterError} (from validateDocument, validateId)
   * @throws {@link Err.InvalidIdLengthError} (from validateDocument, validateId)
   *
   * @throws {@link Err.DatabaseClosingError} (fromm putImpl)
   * @throws {@link Err.TaskCancelError} (from putImpl)
   *
   * @throws {@link Err.UndefinedDBError} (fromm putWorker)
   * @throws {@link Err.RepositoryNotOpenError} (fromm putWorker)
   * @throws {@link Err.CannotCreateDirectoryError} (from putWorker)
   * @throws {@link Err.CannotWriteDataError} (from putWorker)
   *
   * @throws {@link Err.SameIdExistsError} (from putWorker)
   *
   * @public
   */
  insertFatDoc (
    name: string | undefined | null,
    doc: JsonDoc | string | Uint8Array,
    options?: PutOptions
  ): Promise<PutResult> {
    return this.rootCollection.insertFatDoc(name, doc, options);
  }

  /**
   * Update a data
   *
   * @param name - name is a file path.
   *
   * @remarks
   * - Throws DocumentNotFoundError if the data does not exist. It might be better to use put() instead of update().
   *
   * - The saved file path is `${GitDocumentDB#workingDir}/${name}.json`.
   *
   * - If name is undefined, it is automatically generated.
   *
   * - _id property of a JsonDoc is automatically set or overwritten by name parameter whose .json extension is omitted.
   *
   * - An update operation is not skipped even if no change occurred on a specified data.
   *
   * - This is an alias of GitDocumentDB#rootCollection.updateFatDoc()
   *
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @throws {@link Err.InvalidIdCharacterError} (from validateDocument, validateId)
   * @throws {@link Err.InvalidIdLengthError} (from validateDocument, validateId)
   *
   * @throws {@link Err.DatabaseClosingError} (fromm putImpl)
   * @throws {@link Err.TaskCancelError} (from putImpl)
   *
   * @throws {@link Err.UndefinedDBError} (fromm putWorker)
   * @throws {@link Err.RepositoryNotOpenError} (fromm putWorker)
   * @throws {@link Err.CannotCreateDirectoryError} (from putWorker)
   * @throws {@link Err.CannotWriteDataError} (from putWorker)
   *
   * @throws {@link Err.DocumentNotFoundError}
   *
   * @public
   */
  updateFatDoc (
    name: string | undefined | null,
    doc: JsonDoc | string | Uint8Array,
    options?: PutOptions
  ): Promise<PutResult> {
    return this.rootCollection.updateFatDoc(name, doc, options);
  }

  /**
   * Get a JSON document
   *
   * @param _id - _id is a file path whose .json extension is omitted.
   *
   * @returns
   * - undefined if not exists.
   *
   * - JsonDoc may not have _id property if it was not created by GitDocumentDB.
   *
   * - This is an alias of GitDocumentDB#rootCollection.get()
   *
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.RepositoryNotOpenError}
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @public
   */
  get (_id: string): Promise<JsonDoc | undefined> {
    return this.rootCollection.get(_id);
  }

  /**
   * Get a FatDoc
   *
   * @param name - name is a file path.
   *
   * @returns
   *  - undefined if not exists.
   *
   *  - FatJsonDoc if the file extension is '.json'. Be careful that JsonDoc may not have _id property if it was not created by GitDocumentDB.
   *
   *  - FatBinaryDoc if described in .gitattribtues, otherwise FatTextDoc.
   *
   *  - getOptions.forceDocType always overwrite return type.
   *
   *  - This is an alias of GitDocumentDB#rootCollection.getFatDoc()
   *
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.RepositoryNotOpenError}
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @public
   */
  getFatDoc (name: string, getOptions?: GetOptions): Promise<FatDoc | undefined> {
    return this.rootCollection.getFatDoc(name, getOptions);
  }

  /**
   * Get a Doc which has specified oid
   *
   * @param fileOid - Object ID (SHA-1 hash) that represents a Git object. (See https://git-scm.com/docs/git-hash-object )
   *
   * @remarks
   *  - undefined if not exists.
   *
   *  - This is an alias of GitDocumentDB#rootCollection.getDocByOid()
   *
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.RepositoryNotOpenError}
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @public
   */
  getDocByOid (fileOid: string, docType: DocType = 'binary'): Promise<Doc | undefined> {
    return this.rootCollection.getDocByOid(fileOid, docType);
  }

  /**
   * Get a back number of a document
   *
   * @param _id - _id is a file path whose .json extension is omitted.
   * @param backNumber - Specify a number to go back to old revision. Default is 0.
   * When backNumber equals 0, the latest revision is returned.
   * See {@link git-documentdb#GitDocumentDB.getHistory} for the array of revisions.
   *
   * @param historyOptions - The array of revisions is filtered by HistoryOptions.filter.
   *
   * @remarks
   *  - undefined if the document does not exists or the document is deleted.
   *
   *  - This is an alias of GitDocumentDB#rootCollection.getBackNumber()
   *
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.RepositoryNotOpenError}
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @public
   */
  getBackNumber (
    _id: string,
    backNumber: number,
    historyOptions?: HistoryOptions
  ): Promise<JsonDoc | undefined> {
    return this.rootCollection.getBackNumber(_id, backNumber, historyOptions);
  }

  /**
   * Get a back number of a data
   *
   * @param name - name is a file path.
   * @param backNumber - Specify a number to go back to old revision. Default is 0.
   * When backNumber equals 0, the latest revision is returned.
   * See {@link git-documentdb#GitDocumentDB.getHistory} for the array of revisions.
   *
   * @param historyOptions - The array of revisions is filtered by HistoryOptions.filter.
   *
   * @remarks
   *  - undefined if a document does not exists or a document is deleted.
   *
   *  - JsonDoc if the file extension is '.json'.  Be careful that JsonDoc may not have _id property if it was not created by GitDocumentDB.
   *
   *  - FatBinaryDoc if described in .gitattribtues, otherwise FatTextDoc.
   *
   *  - getOptions.forceDocType always overwrite return type.
   *
   *  - This is an alias of GitDocumentDB#rootCollection.getFatDocBackNumber()
   *
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.RepositoryNotOpenError}
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @public
   */
  getFatDocBackNumber (
    name: string,
    backNumber: number,
    historyOptions?: HistoryOptions,
    getOptions?: GetOptions
  ): Promise<FatDoc | undefined> {
    return this.rootCollection.getFatDocBackNumber(
      name,
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
   * - This is an alias of GitDocumentDB.rootCollection.getHistory().
   *
   * @param _id - _id is a file path whose .json extension is omitted.
   * @param historyOptions - The array of revisions is filtered by HistoryOptions.filter.
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
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.RepositoryNotOpenError}
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @public
   */
  getHistory (
    _id: string,
    historyOptions?: HistoryOptions
  ): Promise<(JsonDoc | undefined)[]> {
    return this.rootCollection.getHistory(_id, historyOptions);
  }

  /**
   * Get revision history of a data
   *
   * @param name - name is a file path.
   *
   * @remarks
   *  - This is an alias of GitDocumentDB#rootCollection.getFatDocHistory()
   *
   *  - See {@link git-documentdb#GitDocumentDB.getHistory} for detailed examples.
   *
   * @returns Array of FatDoc or undefined.
   *  - undefined if the document does not exists or the document is deleted.
   *
   *  - Array of FatJsonDoc if isJsonDocCollection is true or the file extension is '.json'.  Be careful that JsonDoc may not have _id property if it was not created by GitDocumentDB.
   *
   *  - Array of FatBinaryDoc if described in .gitattribtues, otherwise array of FatTextDoc.
   *
   *  - getOptions.forceDocType always overwrite return type.
   *
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.RepositoryNotOpenError}
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @public
   */
  getFatDocHistory (
    name: string,
    historyOptions?: HistoryOptions,
    getOptions?: GetOptions
  ): Promise<(FatDoc | undefined)[]> {
    return this.rootCollection.getFatDocHistory(name, historyOptions, getOptions);
  }

  /**
   * Delete a JSON document
   *
   * @param _id - _id is a file path whose .json extension is omitted.
   *
   * @remarks
   *  - This is an alias of GitDocumentDB#rootCollection.delete()
   *
   * @throws {@link Err.UndefinedDocumentIdError} (from Collection#delete)
   * @throws {@link Err.DatabaseClosingError} (from deleteImpl)
   * @throws {@link Err.TaskCancelError} (from deleteImpl)
   *
   * @throws {@link Err.RepositoryNotOpenError} (from deleteWorker)
   * @throws {@link Err.UndefinedDBError} (from deleteWorker)
   * @throws {@link Err.DocumentNotFoundError} (from deleteWorker)
   * @throws {@link Err.CannotDeleteDataError} (from deleteWorker)
   *
   * @public
   */
  delete (_id: string, options?: DeleteOptions): Promise<DeleteResultJsonDoc>;

  /**
   * Delete a document by _id property in JsonDoc
   *
   * @param jsonDoc - Only the _id property of the JsonDoc is referenced. _id is a file path whose .json extension is omitted.
   *
   * @remarks
   *  - This is an alias of GitDocumentDB#rootCollection.delete()
   *
   * @throws {@link Err.UndefinedDocumentIdError} (from Collection#delete)
   * @throws {@link Err.DatabaseClosingError} (from deleteImpl)
   * @throws {@link Err.TaskCancelError} (from deleteImpl)
   *
   * @throws {@link Err.RepositoryNotOpenError} (from deleteWorker)
   * @throws {@link Err.UndefinedDBError} (from deleteWorker)
   * @throws {@link Err.DocumentNotFoundError} (from deleteWorker)
   * @throws {@link Err.CannotDeleteDataError} (from deleteWorker)
   *
   * @public
   */
  delete (jsonDoc: JsonDoc, options?: DeleteOptions): Promise<DeleteResultJsonDoc>;
  delete (
    idOrDoc: string | JsonDoc,
    options?: DeleteOptions
  ): Promise<DeleteResultJsonDoc> {
    return this.rootCollection.delete(idOrDoc, options);
  }

  /**
   * Delete a data
   *
   * @param name - name is a file path
   *
   * @remarks
   *  - This is an alias of GitDocumentDB#rootCollection.deleteFatDoc()
   *
   * @throws {@link Err.UndefinedDocumentIdError}
   * @throws {@link Err.DatabaseClosingError} (from deleteImpl)
   * @throws {@link Err.TaskCancelError} (from deleteImpl)
   *
   * @throws {@link Err.RepositoryNotOpenError} (from deleteWorker)
   * @throws {@link Err.UndefinedDBError} (from deleteWorker)
   * @throws {@link Err.DocumentNotFoundError} (from deleteWorker)
   * @throws {@link Err.CannotDeleteDataError} (from deleteWorker)
   *
   * @public
   */
  deleteFatDoc (name: string, options?: DeleteOptions): Promise<DeleteResult> {
    return this.rootCollection.deleteFatDoc(name, options);
  }

  /**
   * Get all the JSON documents
   *
   * @remarks
   *  - This is an alias of GitDocumentDB#rootCollection.find()
   *
   * @param options - The options specify how to get documents.
   *
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.RepositoryNotOpenError}
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @public
   */
  find (options?: FindOptions): Promise<JsonDoc[]> {
    return this.rootCollection.find(options);
  }

  /**
   * Get all the data
   *
   * @param options - The options specify how to get documents.
   *
   * @remarks
   *  - This is an alias of GitDocumentDB#rootCollection.findFatDoc()
   *
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.RepositoryNotOpenError}
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @public
   */
  findFatDoc (options?: FindOptions): Promise<FatDoc[]> {
    return this.rootCollection.findFatDoc(options);
  }

  /***********************************************
   * Public method (Implementation of SyncEventInterface)
   ***********************************************/

  /**
   * Add SyncEvent handler
   *
   * @eventProperty
   * @public
   */
  onSyncEvent (remoteURL: string, event: SyncEvent, callback: SyncCallback): SyncInterface;
  /**
   * Add SyncEvent handler
   *
   * @eventProperty
   * @public
   */
  onSyncEvent (
    sync: SyncInterface,
    event: SyncEvent,
    callback: SyncCallback
  ): SyncInterface;

  onSyncEvent (
    remoteURLorSync: string | SyncInterface,
    event: SyncEvent,
    callback: SyncCallback
  ): SyncInterface {
    return this.rootCollection.onSyncEvent(remoteURLorSync, event, callback);
  }

  /**
   * Remove SyncEvent handler
   *
   * @eventProperty
   * @public
   */
  offSyncEvent (remoteURL: string, event: SyncEvent, callback: SyncCallback): void;
  /**
   * Remove SyncEvent handler
   *
   * @eventProperty
   * @public
   */
  offSyncEvent (sync: SyncInterface, event: SyncEvent, callback: SyncCallback): void;
  offSyncEvent (
    remoteURLorSync: string | SyncInterface,
    event: SyncEvent,
    callback: SyncCallback
  ): void {
    this.rootCollection.offSyncEvent(remoteURLorSync, event, callback);
  }
}
