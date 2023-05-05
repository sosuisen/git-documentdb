/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import git from 'isomorphic-git';
import fs from 'fs-extra';
import rimraf from 'rimraf';
import { ILogObject, Logger, TLogLevelName } from 'tslog';
import { ulid } from 'ulid';
import { RemoteEngine } from './remote/remote_engine';
import { SearchEngine } from './search/search_engine';
import { Err } from './error';
import { Collection } from './collection';
import { Validator } from './validator';
import {
  CollectionOptions,
  CollectionPath,
  ColoredLogger,
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
  PluginTypes,
  PutOptions,
  PutResult,
  PutResultJsonDoc,
  RemoteOptions,
  Schema,
  SerializeFormat,
  SerializeFormatLabel,
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
  FILE_CREATE_TIMEOUT,
  FILE_REMOVE_TIMEOUT,
  FIRST_COMMIT_MESSAGE,
  GIT_DOCUMENTDB_INFO_ID,
  JSON_POSTFIX,
  SET_DATABASE_ID_MESSAGE,
} from './const';
import { normalizeCommit, sleep, toSortedJSONString } from './utils';
import { SyncEventInterface, SyncInterface } from './types_sync';
import { CRUDInterface } from './types_crud_interface';
import { CollectionInterface, ICollection } from './types_collection';
import { blobToJsonDoc, readLatestBlob } from './crud/blob';

import * as remote_isomorphic_git from './plugin/remote-isomorphic-git';
import * as search_elasticlunr from './plugin/search-elasticlunr';
import { SerializeFormatFrontMatter, SerializeFormatJSON } from './serialize_format';
import { SearchAPI, SearchResult } from './types_search_api';

/**
 * Get database ID
 *
 * @internal
 */
export function generateDatabaseId () {
  return ulid(Date.now());
}

const INITIAL_DATABASE_OPEN_RESULT: DatabaseOpenResult = {
  dbId: '',
  creator: '',
  version: '',
  isNew: false,
  isCreatedByGitDDB: true,
  isValidVersion: true,
  serialize: 'json',
};

/**
 * Main class of GitDocumentDB
 *
 * @remarks
 * Call open() before using DB.
 *
 * @public
 */
export class GitDocumentDB
  implements
    GitDDBInterface,
    CRUDInterface,
    CollectionInterface,
    SyncEventInterface,
    SearchAPI {
  static plugin (obj: any) {
    const type: PluginTypes = obj.type;
    if (type === 'remote') {
      if (obj.name !== undefined) {
        // @ts-ignore
        RemoteEngine[obj.name] = {};
        Object.keys(obj).forEach(function (id) {
          // Set to Remote object
          // @ts-ignore
          RemoteEngine[obj.name][id] = obj[id];
        });
      }
    }
    else if (type === 'search') {
      if (obj.name !== undefined) {
        // @ts-ignore
        SearchEngine[obj.name] = {};
        Object.keys(obj).forEach(function (id) {
          // Set to Remote object
          // @ts-ignore
          SearchEngine[obj.name][id] = obj[id];
        });
      }
    }
    else {
      Object.keys(obj).forEach(function (id) {
        // Set to Instance property
        // @ts-ignore
        GitDocumentDB.prototype[id] = obj[id];
      });
    }
  }

  /***********************************************
   * Private properties
   ***********************************************/
  private _synchronizers: { [url: string]: Sync } = {};

  private _dbOpenResult: DatabaseOpenResult = {
    ...INITIAL_DATABASE_OPEN_RESULT,
  };

  /***********************************************
   * Public properties (readonly)
   ***********************************************/
  /**
   * Serialize format for json object
   */
  private _serializeFormat!: SerializeFormatJSON | SerializeFormatFrontMatter;
  get serializeFormat () {
    return this._serializeFormat;
  }

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
   * A name of a Git repository
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

  private _tsLogger!: Logger;
  /**
   * Get logger
   *
   * @readonly
   * @public
   */
  get tsLogger (): Logger {
    return this._tsLogger;
  }

  // Use definite assignment assertion
  private _logger: ColoredLogger = {
    silly: (
      mes: string,
      colorTag?: () => (literals: TemplateStringsArray, ...placeholders: any[]) => string
    ) => {
      if (this._logColorEnabled && colorTag !== undefined) {
        this._tsLogger.silly(colorTag()`${mes}`);
      }
      else {
        this._tsLogger.silly(mes);
      }
    },
    debug: (
      mes: string,
      colorTag?: () => (literals: TemplateStringsArray, ...placeholders: any[]) => string
    ) => {
      if (this._logColorEnabled && colorTag !== undefined) {
        this._tsLogger.debug(colorTag()`${mes}`);
      }
      else {
        this._tsLogger.debug(mes);
      }
    },
    trace: (
      mes: string,
      colorTag?: () => (literals: TemplateStringsArray, ...placeholders: any[]) => string
    ) => {
      if (this._logColorEnabled && colorTag !== undefined) {
        this._tsLogger.trace(colorTag()`${mes}`);
      }
      else {
        this._tsLogger.trace(mes);
      }
    },
    info: (
      mes: string,
      colorTag?: () => (literals: TemplateStringsArray, ...placeholders: any[]) => string
    ) => {
      if (this._logColorEnabled && colorTag !== undefined) {
        this._tsLogger.info(colorTag()`${mes}`);
      }
      else {
        this._tsLogger.info(mes);
      }
    },
    warn: (
      mes: string,
      colorTag?: () => (literals: TemplateStringsArray, ...placeholders: any[]) => string
    ) => {
      if (this._logColorEnabled && colorTag !== undefined) {
        this._tsLogger.warn(colorTag()`${mes}`);
      }
      else {
        this._tsLogger.warn(mes);
      }
    },
    error: (
      mes: string,
      colorTag?: () => (literals: TemplateStringsArray, ...placeholders: any[]) => string
    ) => {
      if (this._logColorEnabled && colorTag !== undefined) {
        this._tsLogger.error(colorTag()`${mes}`);
      }
      else {
        this._tsLogger.error(mes);
      }
    },
    fatal: (
      mes: string,
      colorTag?: () => (literals: TemplateStringsArray, ...placeholders: any[]) => string
    ) => {
      if (this._logColorEnabled && colorTag !== undefined) {
        this._tsLogger.fatal(colorTag()`${mes}`);
      }
      else {
        this._tsLogger.fatal(mes);
      }
    },
  };

  /**
   * Get logger
   *
   * @readonly
   * @public
   */
  get logger (): ColoredLogger {
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

  private _logToTransport: ((logObject: ILogObject) => void) | undefined;
  /**
   * logToTransport function for all log levels. See https://tslog.js.org/#/?id=transports
   *
   * @readonly
   * @public
   */
  get logToTransport (): ((logObject: ILogObject) => void) | undefined {
    return this._logToTransport;
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
   * Default collection whose collectionPath is ''.
   *
   * @readonly
   * @public
   */
  get rootCollection (): ICollection {
    return this._rootCollection as ICollection;
  }

  private _logColorEnabled: boolean;

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
    this._tsLogger = new Logger({
      name: this._dbName,
      minLevel: level as TLogLevelName,
      displayDateTime: false,
      displayFunctionName: false,
      displayFilePath: 'hidden',
    });
    if (this.logToTransport) {
      this._tsLogger.attachTransport(
        {
          silly: this.logToTransport,
          debug: this.logToTransport,
          trace: this.logToTransport,
          info: this.logToTransport,
          warn: this.logToTransport,
          error: this.logToTransport,
          fatal: this.logToTransport,
        },
        level
      );
    }
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
  // eslint-disable-next-line complexity
  constructor (options: DatabaseOptions & CollectionOptions) {
    if (options.dbName === undefined || options.dbName === '') {
      throw new Err.UndefinedDatabaseNameError();
    }

    this._dbName = options.dbName;
    this._localDir = options.localDir ?? DEFAULT_LOCAL_DIR;

    this._schema = options.schema ?? {
      json: {
        keyInArrayedObject: undefined,
        plainTextProperties: undefined,
      },
    };

    this._logToTransport = options.logToTransport;

    const format: SerializeFormatLabel = options.serialize ?? 'json';
    if (format === 'front-matter') {
      this._serializeFormat = new SerializeFormatFrontMatter();
    }
    else {
      this._serializeFormat = new SerializeFormatJSON();
    }

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

    this._logColorEnabled = options.logColorEnabled ?? true;

    // @ts-ignore
    SearchEngine[search_elasticlunr.name] = {};
    Object.keys(search_elasticlunr).forEach(function (id) {
      // Set to Search object
      // @ts-ignore
      // eslint-disable-next-line import/namespace
      SearchEngine[search_elasticlunr.name][id] = search_elasticlunr[id];
    });

    const collectionOptions = {
      namePrefix: options?.namePrefix ?? '',
      debounceTime: options?.debounceTime ?? -1,
      idGenerator: options?.idGenerator,
      searchEngineOptions: options?.searchEngineOptions,
    };
    this._rootCollection = new Collection(this, '', undefined, collectionOptions);

    // @ts-ignore
    RemoteEngine[remote_isomorphic_git.name] = {};
    Object.keys(remote_isomorphic_git).forEach(function (id) {
      // Set to Remote object
      // @ts-ignore
      // eslint-disable-next-line import/namespace
      RemoteEngine[remote_isomorphic_git.name][id] = remote_isomorphic_git[id];
    });
  }

  /***********************************************
   * Private methods
   ***********************************************/

  /**
   * Create local repository
   * 
   * @throws {@link Err.CannotCreateDirectoryError}
   *
   * @throws # from putWorker
   * @throws - {@link Err.UndefinedDBError}
   * @throws - {@link Err.CannotCreateDirectoryError}
   * @throws - {@link Err.SameIdExistsError}
   * @throws - {@link Err.DocumentNotFoundError}
   * @throws - {@link Err.CannotWriteDataError}

   * @internal
   */
  private async _createRepository () {
    // First commit
    const info = {
      dbId: generateDatabaseId(),
      creator: DATABASE_CREATOR,
      version: DATABASE_VERSION,
      serialize: this._serializeFormat.format,
    };

    // Retry three times.
    // Creating system files sometimes fail just after installing from Squirrel installer of Electron.
    const retry = 3;
    for (let i = 0; i < retry + 1; i++) {
      // eslint-disable-next-line no-await-in-loop
      const resEnsure = await fs.ensureDir(this._workingDir).catch((err: Error) => {
        if (i >= retry) throw new Err.CannotCreateDirectoryError(err.message);
        return 'cannot_create';
      });
      if (resEnsure === 'cannot_create') {
        // eslint-disable-next-line no-await-in-loop
        await sleep(FILE_CREATE_TIMEOUT);
        this.logger.debug('retrying ensureDir in createRepository');
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const resInit = await git
        .init({ fs, dir: this._workingDir, defaultBranch: this.defaultBranch })
        .catch((err: Error) => {
          if (i >= retry) throw err;
          return 'cannot_init';
        });
      if (resInit === 'cannot_init') {
        // eslint-disable-next-line no-await-in-loop
        await sleep(FILE_CREATE_TIMEOUT);
        this.logger.debug('retrying git.init in createRepository');
        continue;
      }

      // Do not use this.put() because it increments TaskQueue.statistics.put.
      // eslint-disable-next-line no-await-in-loop
      const resPut = await putWorker(
        this,
        '',
        GIT_DOCUMENTDB_INFO_ID + JSON_POSTFIX,
        toSortedJSONString(info),
        FIRST_COMMIT_MESSAGE
      ).catch(err => {
        if (i >= retry) throw err;
        return 'cannot_put';
      });
      if (resPut === 'cannot_put') {
        // eslint-disable-next-line no-await-in-loop
        await sleep(FILE_CREATE_TIMEOUT);
        fs.removeSync(this._workingDir);
        this.logger.debug('retrying putWorker in createRepository');
        continue;
      }

      break;
    }

    this._dbOpenResult.isNew = true;

    this._dbOpenResult = { ...this._dbOpenResult, ...info };
  }

  /***********************************************
   * Public methods
   ***********************************************/

  /**
   * Open or create a Git repository
   *
   * @remarks
   * - Create a new Git repository if a dbName specified in the constructor does not exist.
   *
   * - GitDocumentDB creates a legitimate Git repository and unique metadata under '.gitddb/'.
   *
   * - '.gitddb/' keeps {@link git-documentdb#DatabaseInfo} for combining databases, checking schema and migration.
   *
   * - GitDocumentDB can also load a Git repository that is created by other apps. It almost works; however, correct behavior is not guaranteed if it does not have a valid '.gitddb/'.
   *
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.RepositoryNotFoundError} may occurs when openOptions.createIfNotExists is false.
   *
   * @throws # Errors from _createRepository
   * @throws - {@link Err.CannotCreateDirectoryError}
   *
   * @throws # Errors from putWorker
   * @throws - {@link Err.UndefinedDBError}
   * @throws - {@link Err.CannotCreateDirectoryError}
   * @throws - {@link Err.SameIdExistsError}
   * @throws - {@link Err.DocumentNotFoundError}
   * @throws - {@link Err.CannotWriteDataError}
   *
   * @public
   */
  async open (openOptions?: OpenOptions): Promise<DatabaseOpenResult> {
    if (this.isClosing) {
      throw new Err.DatabaseClosingError();
    }

    if (this.isOpened) {
      this._dbOpenResult.isNew = false;
      return this._dbOpenResult;
    }
    if (openOptions === undefined) {
      openOptions = {
        createIfNotExists: undefined,
      };
    }
    openOptions.createIfNotExists ??= true;

    const gitDir = this._workingDir + '/.git/';
    if (!fs.existsSync(gitDir)) {
      if (openOptions.createIfNotExists) {
        await this._createRepository();
      }
      else {
        throw new Err.RepositoryNotFoundError(gitDir);
      }
    }
    await this.loadDbInfo();

    // Start when no exception
    this._taskQueue.start();

    return this._dbOpenResult;
  }

  /**
   * Close a database
   *
   * @remarks
   * - New CRUD operations are not available while closing.
   *
   * - Queued operations are executed before the database is closed unless it times out.
   *
   * @param options - The options specify how to close database.
   *
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
    try {
      this._isClosing = true;
      if (!options.force) {
        const isTimeout = await this.taskQueue.waitCompletion(options.timeout);
        if (isTimeout) {
          return Promise.reject(new Err.DatabaseCloseTimeoutError());
        }
      }
    } finally {
      this.taskQueue.stop();

      this._synchronizers = {};

      this._dbOpenResult = {
        ...INITIAL_DATABASE_OPEN_RESULT,
      };

      this._isClosing = false;
    }
  }

  /**
   * Destroy a database
   *
   * @remarks
   * - {@link GitDocumentDB.close} is called automatically before destroying.
   *
   * - Default value of options.force is true.
   *
   * - destroy() removes the Git repository and the working directory from the filesystem.
   *
   * - destroy() does not remove localDir (which is specified in constructor).
   *
   * @param options - The options specify how to close database.
   *
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
    // NOTICE: options.force is true by default.
    options.force = options.force ?? true;
    await this.close(options).catch(err => {
      closeError = err;
    });

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
  get isOpened (): boolean {
    return this._dbOpenResult.dbId !== '';
  }

  /**
   * Get a collection
   *
   * @param collectionPath - relative path from localDir. Sub-directories are also permitted. e.g. 'pages', 'pages/works'.
   *
   * @remarks
   * - Notice that this function just read an existing directory. It does not make a new sub-directory.
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
   * @remarks
   * Register and synchronize with a remote repository. Do not register the same remote repository again. Call unregisterRemote() before register it again.
   *
   * @throws {@link Err.RemoteAlreadyRegisteredError}
   *
   * @privateRemarks # from Sync#syncAndGetResultImpl
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.RepositoryNotOpenError}
   *
   * @throws Errors from constructor of {@link Sync} class.
   * @throws Errors from {@link Sync.init}
   *
   * @public
   */
  async sync (options: RemoteOptions): Promise<Sync>;
  /**
   * Synchronize with a remote repository
   *
   * @remarks
   * Register and synchronize with a remote repository. Do not register the same remote repository again. Call unregisterRemote() before register it again.
   *
   * @throws {@link Err.RemoteAlreadyRegisteredError}
   *
   * @privateRemarks # from Sync#syncAndGetResultImpl
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.RepositoryNotOpenError}
   *
   * @throws Errors from constructor of {@link Sync} class.
   * @throws Errors from {@link Sync.init}
   *
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
   * Get a commit object
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
   * Load DatabaseInfo from .gitddb/info.json
   *
   * @throws # Errors from putWorker
   * @throws - {@link Err.UndefinedDBError}
   * @throws - {@link Err.CannotCreateDirectoryError}
   * @throws - {@link Err.SameIdExistsError}
   * @throws - {@link Err.DocumentNotFoundError}
   * @throws - {@link Err.CannotWriteDataError}
   *
   * @internal
   */
  // eslint-disable-next-line complexity
  async loadDbInfo () {
    let info: DatabaseInfo | undefined;

    // Don't use get() because isOpened is false.
    const readBlobResult = await readLatestBlob(
      this.workingDir,
      GIT_DOCUMENTDB_INFO_ID + JSON_POSTFIX
    ).catch(() => undefined);
    if (readBlobResult !== undefined) {
      try {
        info = blobToJsonDoc(
          GIT_DOCUMENTDB_INFO_ID,
          readBlobResult,
          false,
          new SerializeFormatJSON(),
          JSON_POSTFIX
        ) as DatabaseInfo;
      } catch (e) {}
    }

    info ??= {
      dbId: '',
      creator: '',
      version: '',
      serialize: this._serializeFormat.format,
    };

    info.creator ??= '';
    info.version ??= '';

    info.serialize ??= this._serializeFormat.format;

    if (info.serialize !== this._serializeFormat.format) {
      // TODO: Change serialize format
    }

    // Set dbId if not exists.
    if (!info.dbId) {
      info.dbId = generateDatabaseId();
      // Do not use this.put() because it increments TaskQueue.statistics.put.
      await putWorker(
        this,
        '',
        GIT_DOCUMENTDB_INFO_ID + JSON_POSTFIX,
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

  /***********************************************
   * Public method (Implementation of CRUDInterface)
   ***********************************************/

  /**
   * Insert a JSON document if not exists. Otherwise, update it.
   *
   * @param jsonDoc - JsonDoc whose _id is shortId. shortId is a file path whose collectionPath and extension are omitted.
   *
   * @remarks
   * - The saved file path is `${GitDocumentDB#workingDir}/${jsonDoc._id}${extension}` on the file system.
   *
   * - If _id is undefined, it is automatically generated.
   *
   * - This is an alias of GitDocumentDB#rootCollection.put()
   *
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @privateRemarks # Errors from putImpl
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.TaskCancelError}
   *
   * @throws # Errors from validateDocument, validateId
   * @throws - {@link Err.InvalidIdCharacterError}
   * @throws - {@link Err.InvalidIdLengthError}
   *
   * @throws # Errors from putWorker
   * @throws - {@link Err.UndefinedDBError}
   * @throws - {@link Err.CannotCreateDirectoryError}
   * @throws - {@link Err.CannotWriteDataError}
   *
   * @public
   */
  put (jsonDoc: JsonDoc, options?: PutOptions): Promise<PutResultJsonDoc>;

  /**
   * Insert a JSON document if not exists. Otherwise, update it.
   *
   * @param _id - _id is a file path whose extension is omitted.
   *
   * @remarks
   * - The saved file path is `${GitDocumentDB#workingDir}/${_id}${extension}` on the file system.
   *
   * - If _id is undefined, it is automatically generated.
   *
   * - _id property of a JsonDoc is automatically set or overwritten by _id parameter.
   *
   * - An update operation is not skipped even if no change occurred on a specified document.
   *
   * - This is an alias of GitDocumentDB#rootCollection.put()
   *
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @privateRemarks # Errors from putImpl
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.TaskCancelError}
   *
   * @throws # Errors from validateDocument, validateId
   * @throws - {@link Err.InvalidIdCharacterError}
   * @throws - {@link Err.InvalidIdLengthError}
   *
   * @throws # Errors from putWorker
   * @throws - {@link Err.UndefinedDBError}
   * @throws - {@link Err.CannotCreateDirectoryError}
   * @throws - {@link Err.CannotWriteDataError}
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
   * @param jsonDoc - JsonDoc whose _id is shortId. shortId is a file path whose collectionPath and extension are omitted.
   *
   * @remarks
   * - Throws SameIdExistsError when a document that has the same _id exists. It might be better to use put() instead of insert().
   *
   * - If _id is undefined, it is automatically generated.
   *
   * - The saved file path is `${GitDocumentDB#workingDir}/${jsonDoc._id}${extension}` on the file system.
   *
   * - This is an alias of GitDocumentDB#rootCollection.insert()
   *
   * @param jsonDoc - See {@link JsonDoc} for restriction.
   *
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @privateRemarks # Errors from putImpl
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.TaskCancelError}
   *
   * @throws # Errors from validateDocument, validateId
   * @throws - {@link Err.InvalidIdCharacterError}
   * @throws - {@link Err.InvalidIdLengthError}
   *
   * @throws # Errors from putWorker
   * @throws - {@link Err.UndefinedDBError}
   * @throws - {@link Err.CannotCreateDirectoryError}
   * @throws - {@link Err.CannotWriteDataError}
   *
   * @throws - {@link Err.SameIdExistsError}
   *
   * @public
   */
  insert (jsonDoc: JsonDoc, options?: PutOptions): Promise<PutResultJsonDoc>;

  /**
   * Insert a JSON document
   *
   * @param _id - _id is a file path whose extension is omitted.
   *
   * @remarks
   * - Throws SameIdExistsError when a document that has the same id exists. It might be better to use put() instead of insert().
   *
   * - The saved file path is `${GitDocumentDB#workingDir}/${_id}${extension}` on the file system.
   *
   * - If _id is undefined, it is automatically generated.
   *
   * - _id property of a JsonDoc is automatically set or overwritten by _id parameter.
   *
   *  - This is an alias of GitDocumentDB#rootCollection.insert()
   *
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @privateRemarks # Errors from putImpl
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.TaskCancelError}
   *
   * @throws # Errors from validateDocument, validateId
   * @throws - {@link Err.InvalidIdCharacterError}
   * @throws - {@link Err.InvalidIdLengthError}
   *
   * @throws # Errors from putWorker
   * @throws - {@link Err.UndefinedDBError}
   * @throws - {@link Err.CannotCreateDirectoryError}
   * @throws - {@link Err.CannotWriteDataError}
   *
   * @throws - {@link Err.SameIdExistsError}
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
   * @param jsonDoc - JsonDoc whose _id is shortId. shortId is a file path whose collectionPath and extension are omitted.
   *
   * @remarks
   * - Throws DocumentNotFoundError if a specified document does not exist. It might be better to use put() instead of update().
   *
   * - If _id is undefined, it is automatically generated.
   *
   * - The saved file path is `${GitDocumentDB#workingDir}/${_id}extension` on the file system.
   *
   * - This is an alias of GitDocumentDB#rootCollection.update()
   *
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @privateRemarks # Errors from putImpl
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.TaskCancelError}
   *
   * @throws # Errors from validateDocument, validateId
   * @throws - {@link Err.InvalidIdCharacterError}
   * @throws - {@link Err.InvalidIdLengthError}
   *
   * @throws # Errors from putWorker
   * @throws - {@link Err.UndefinedDBError}
   * @throws - {@link Err.CannotCreateDirectoryError}
   * @throws - {@link Err.CannotWriteDataError}
   *
   * @throws - {@link Err.DocumentNotFoundError}
   *
   * @public
   */
  update (jsonDoc: JsonDoc, options?: PutOptions): Promise<PutResultJsonDoc>;

  /**
   * Update a JSON document
   *
   * @param _id - _id is a file path whose extension is omitted.
   *
   * @remarks
   * - Throws DocumentNotFoundError if a specified document does not exist. It might be better to use put() instead of update().
   *
   * - The saved file path is `${GitDocumentDB#workingDir}/${_id}extension` on the file system.
   *
   * - An update operation is not skipped even if no change occurred on a specified document.
   *
   * - This is an alias of GitDocumentDB#rootCollection.update()
   *
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @privateRemarks # Errors from putImpl
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.TaskCancelError}
   *
   * @throws # Errors from validateDocument, validateId
   * @throws - {@link Err.InvalidIdCharacterError}
   * @throws - {@link Err.InvalidIdLengthError}
   *
   * @throws # Errors from putWorker
   * @throws - {@link Err.UndefinedDBError}
   * @throws - {@link Err.CannotCreateDirectoryError}
   * @throws - {@link Err.CannotWriteDataError}
   *
   * @throws - {@link Err.DocumentNotFoundError}
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
   * Insert data if not exists. Otherwise, update it.
   *
   * @param name - name is a file path.
   *
   * @remarks
   * - The saved file path is `${GitDocumentDB#workingDir}/${name}extension`.
   *
   * - If a name parameter is undefined, it is automatically generated.
   *
   * - _id property of a JsonDoc is automatically set or overwritten by name parameter whose extension is removed.
   *
   * - An update operation is not skipped even if no change occurred on a specified data.
   *
   * - This is an alias of GitDocumentDB#rootCollection.putFatDoc()
   *
   * @throws {@link Err.InvalidJsonFileExtensionError}
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @privateRemarks # Errors from putImpl
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.TaskCancelError}
   *
   * @throws # Errors from validateDocument, validateId
   * @throws - {@link Err.InvalidIdCharacterError}
   * @throws - {@link Err.InvalidIdLengthError}
   *
   * @throws # Errors from putWorker
   * @throws - {@link Err.UndefinedDBError}
   * @throws - {@link Err.CannotCreateDirectoryError}
   * @throws - {@link Err.CannotWriteDataError}
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
   * - Throws SameIdExistsError when data that has the same _id exists. It might be better to use put() instead of insert().
   *
   * - The saved file path is `${GitDocumentDB#workingDir}/${name}extension`.
   *
   * - If a name parameter is undefined, it is automatically generated.
   *
   * - _id property of a JsonDoc is automatically set or overwritten by name parameter whose extension is omitted.
   *
   * - This is an alias of GitDocumentDB#rootCollection.insertFatDoc()
   *
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @privateRemarks # Errors from putImpl
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.TaskCancelError}
   *
   * @throws # Errors from validateDocument, validateId
   * @throws - {@link Err.InvalidIdCharacterError}
   * @throws - {@link Err.InvalidIdLengthError}
   *
   * @throws # Errors from putWorker
   * @throws - {@link Err.UndefinedDBError}
   * @throws - {@link Err.CannotCreateDirectoryError}
   * @throws - {@link Err.CannotWriteDataError}
   *
   * @throws - {@link Err.SameIdExistsError}
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
   * - Throws DocumentNotFoundError if a specified data does not exist. It might be better to use put() instead of update().
   *
   * - The saved file path is `${GitDocumentDB#workingDir}/${name}extension`.
   *
   * - _id property of a JsonDoc is automatically set or overwritten by name parameter whose extension is omitted.
   *
   * - An update operation is not skipped even if no change occurred on a specified data.
   *
   * - This is an alias of GitDocumentDB#rootCollection.updateFatDoc()
   *
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @privateRemarks # Errors from putImpl
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.TaskCancelError}
   *
   * @throws # Errors from validateDocument, validateId
   * @throws - {@link Err.InvalidIdCharacterError}
   * @throws - {@link Err.InvalidIdLengthError}
   *
   * @throws # Errors from putWorker
   * @throws - {@link Err.UndefinedDBError}
   * @throws - {@link Err.CannotCreateDirectoryError}
   * @throws - {@link Err.CannotWriteDataError}
   *
   * @throws - {@link Err.DocumentNotFoundError}
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
   * @param _id - _id is a file path whose extension is omitted.
   *
   * @returns
   * - undefined if a specified document does not exist.
   *
   * - JsonDoc may not have _id property when an app other than GitDocumentDB creates it.
   *
   * - This is an alias of GitDocumentDB#rootCollection.get()
   *
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @public
   */
  get (_id: string): Promise<JsonDoc | undefined> {
    return this.rootCollection.get(_id);
  }

  /**
   * Get a FatDoc data
   *
   * @param name - name is a file path.
   *
   * @returns
   *  - undefined if a specified data does not exist.
   *
   *  - FatJsonDoc if the file extension is SerializeFormat.extension. Be careful that JsonDoc may not have _id property when an app other than GitDocumentDB creates it.
   *
   *  - FatBinaryDoc if described in .gitattribtues, otherwise FatTextDoc.
   *
   *  - getOptions.forceDocType always overwrite return type.
   *
   *  - This is an alias of GitDocumentDB#rootCollection.getFatDoc()
   *
   * @throws {@link Err.DatabaseClosingError}
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
   * - undefined if a specified oid does not exist.
   *
   *  - This is an alias of GitDocumentDB#rootCollection.getDocByOid()
   *
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @public
   */
  getDocByOid (fileOid: string, docType: DocType = 'binary'): Promise<Doc | undefined> {
    return this.rootCollection.getDocByOid(fileOid, docType);
  }

  /**
   * Get an old revision of a document
   *
   * @param _id - _id is a file path whose extension is omitted.
   * @param revision - Specify a number to go back to old revision. Default is 0.
   * See {@link git-documentdb#GitDocumentDB.getHistory} for the array of revisions.
   * @param historyOptions - The array of revisions is filtered by HistoryOptions.filter.
   *
   * @remarks
   *  - undefined if a specified document does not exist or it is deleted.
   *
   *  - This is an alias of GitDocumentDB#rootCollection.getOldRevision()
   *
   * @example
   * ```
   * db.getOldRevision(_id, 0); // returns the latest document.
   * db.getOldRevision(_id, 2); // returns a document two revisions older than the latest.
   * ```
   *
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @public
   */
  getOldRevision (
    _id: string,
    revision: number,
    historyOptions?: HistoryOptions
  ): Promise<JsonDoc | undefined> {
    return this.rootCollection.getOldRevision(_id, revision, historyOptions);
  }

  /**
   * Get an old revision of a FatDoc data
   *
   * @param name - name is a file path.
   * @param revision - Specify a number to go back to old revision. Default is 0.
   * See {@link git-documentdb#GitDocumentDB.getHistory} for the array of revisions.
   * @param historyOptions - The array of revisions is filtered by HistoryOptions.filter.
   *
   * @remarks
   *  - undefined if a specified data does not exist or it is deleted.
   *
   *  - JsonDoc if the file extension is SerializeFormat.extension.  Be careful that JsonDoc may not have _id property when an app other than GitDocumentDB creates it.
   *
   *  - FatBinaryDoc if described in .gitattribtues, otherwise FatTextDoc.
   *
   *  - getOptions.forceDocType always overwrite return type.
   *
   *  - This is an alias of GitDocumentDB#rootCollection.getFatDocOldRevision()
   *
   * @example
   * ```
   * db.getFatDocOldRevision(name, 0); // returns the latest FatDoc.
   * db.getFatDocOldRevision(name, 2); // returns a FatDoc two revisions older than the latest.
   * ```
   *
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @public
   */
  getFatDocOldRevision (
    name: string,
    revision: number,
    historyOptions?: HistoryOptions,
    getOptions?: GetOptions
  ): Promise<FatDoc | undefined> {
    return this.rootCollection.getFatDocOldRevision(
      name,
      revision,
      historyOptions,
      getOptions
    );
  }

  /**
   * Get revision history of a document
   *
   * @param _id - _id is a file path whose extension is omitted.
   * @param historyOptions - The array of revisions is filtered by HistoryOptions.filter.
   *
   * @remarks
   * - By default, revisions are sorted by reverse chronological order. However, keep in mind that Git dates may not be consistent across repositories.
   *
   * - This is an alias of GitDocumentDB.rootCollection.getHistory().
   *
   * @returns Array of FatDoc or undefined.
   *  - undefined if a specified document does not exist or it is deleted.
   *
   *  - JsonDoc if isJsonDocCollection is true or the file extension is SerializeFormat.extension.
   *
   *  - Uint8Array or string if isJsonDocCollection is false.
   *
   *  - getOptions.forceDocType always overwrite return type.
   *
   * @example
   * ```
   * Commit-01 to 08 were committed in order. file_v1 and file_v2 are two revisions of a file.
   *
   * - Commit-08: Not exists
   * - Commit-07: deleted
   * - Commit-06: file_v2
   * - Commit-05: deleted
   * - Commit-04: file_v2
   * - Commit-03: file_v1
   * - Commit-02: file_v1
   * - Commit-01: Not exists
   *
   * Commit-02 newly inserted a file (file_v1).
   * Commit-03 did not change about the file.
   * Commit-04 updated the file from file_v1 to file_v2.
   * Commit-05 deleted the file.
   * Commit-06 inserted the deleted file (file_v2) again.
   * Commit-07 deleted the file again.
   * Commit-08 did not change about the file.
   *
   * Here, getHistory() will return [undefined, file_v2, undefined, file_v2, file_v1] as a history.
   *
   * NOTE:
   * - Consecutive same values (commit-02 and commit-03) are combined into one.
   * - getHistory() ignores commit-01 because it was committed before the first insert.
   * Thus, a history is not [undefined, undefined, file_v2, undefined, file_v2, file_v1, file_v1, undefined].
   * ```
   *
   * @throws {@link Err.DatabaseClosingError}
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
   * Get revision history of a FatDoc data
   *
   * @param name - name is a file path.
   *
   * @remarks
   *  - This is an alias of GitDocumentDB#rootCollection.getFatDocHistory()
   *
   *  - See {@link git-documentdb#GitDocumentDB.getHistory} for detailed examples.
   *
   * @returns Array of FatDoc or undefined.
   *  - undefined if a specified data does not exist or it is deleted.
   *
   *  - Array of FatJsonDoc if isJsonDocCollection is true or the file extension is SerializeFormat.extension. Be careful that JsonDoc may not have _id property when an app other than GitDocumentDB creates it.
   *
   *  - Array of FatBinaryDoc if described in .gitattribtues, otherwise array of FatTextDoc.
   *
   *  - getOptions.forceDocType always overwrite return type.
   *
   * @throws {@link Err.DatabaseClosingError}
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
   * @param _id - _id is a file path whose extension is omitted.
   *
   * @remarks
   *  - This is an alias of GitDocumentDB#rootCollection.delete()
   *
   * @throws {@link Err.UndefinedDocumentIdError}
   *
   * @privateRemarks # Errors from deleteImpl
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.TaskCancelError}
   *
   * @throws # Errors from deleteWorker
   * @throws - {@link Err.UndefinedDBError}
   * @throws - {@link Err.DocumentNotFoundError}
   * @throws - {@link Err.CannotDeleteDataError}
   *
   * @public
   */
  delete (_id: string, options?: DeleteOptions): Promise<DeleteResultJsonDoc>;

  /**
   * Delete a document by _id property in JsonDoc
   *
   * @param jsonDoc - Only the _id property of the JsonDoc is referenced. _id is a file path whose extension is omitted.
   *
   * @remarks
   *  - This is an alias of GitDocumentDB#rootCollection.delete()
   *
   * @throws {@link Err.UndefinedDocumentIdError}
   *
   * @privateRemarks # Errors from deleteImpl
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.TaskCancelError}
   *
   * @throws # Errors from deleteWorker
   * @throws - {@link Err.UndefinedDBError}
   * @throws - {@link Err.DocumentNotFoundError}
   * @throws - {@link Err.CannotDeleteDataError}
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
   *
   * @privateRemarks # Errors from deleteImpl
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.TaskCancelError}
   *
   * @throws # Errors from deleteWorker
   * @throws - {@link Err.UndefinedDBError}
   * @throws - {@link Err.DocumentNotFoundError}
   * @throws - {@link Err.CannotDeleteDataError}
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
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @public
   */
  find (options?: FindOptions): Promise<JsonDoc[]> {
    return this.rootCollection.find(options);
  }

  /**
   * Get all the FatDoc data
   *
   * @param options - The options specify how to get documents.
   *
   * @remarks
   *  - This is an alias of GitDocumentDB#rootCollection.findFatDoc()
   *
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @public
   */
  findFatDoc (options?: FindOptions): Promise<FatDoc[]> {
    return this.rootCollection.findFatDoc(options);
  }

  /**
   * search
   */
  search (indexName: string, keyword: string, useOr = false): SearchResult[] {
    return this.rootCollection.search(indexName, keyword, useOr);
  }

  /**
   * rebuildIndex
   */
  rebuildIndex (): Promise<void> {
    return this.rootCollection.rebuildIndex();
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
