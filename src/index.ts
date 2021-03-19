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
import { Logger } from 'tslog';
import {
  CannotCreateDirectoryError,
  DatabaseCloseTimeoutError,
  DatabaseClosingError,
  InvalidWorkingDirectoryPathLengthError,
  RemoteAlreadyRegisteredError,
  UndefinedDatabaseNameError,
} from './error';
import { Collection } from './collection';
import { Validator } from './validator';
import {
  AllDocsOptions,
  AllDocsResult,
  CollectionPath,
  DatabaseCloseOption,
  DatabaseInfo,
  DatabaseOption,
  DatabaseStatistics,
  JsonDoc,
  PutOptions,
  PutResult,
  RemoteOptions,
  RemoveOptions,
  RemoveResult,
  Task,
} from './types';
import { AbstractDocumentDB, CRUDInterface } from './types_gitddb';
import { put_worker, putImpl } from './crud/put';
import { getImpl } from './crud/get';
import { removeImpl } from './crud/remove';
import { allDocsImpl } from './crud/allDocs';
import { RemoteAccess, syncImpl } from './crud/remote_access';
import { ConsoleStyle, sleep } from './utils';
const ulid = monotonicFactory();

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

const defaultLocalDir = './gitddb';

/**
 * Main class of GitDocumentDB
 *
 * @beta
 */
export class GitDocumentDB extends AbstractDocumentDB implements CRUDInterface {
  /**
   * File extension of a repository document
   */
  public readonly fileExt = '.json';
  /**
   * Author name and email
   */
  public readonly gitAuthor = {
    name: 'GitDocumentDB',
    email: 'gitddb@example.com',
  } as const;

  public readonly defaultBranch = 'main';

  private _firstCommitMessage = 'first commit';

  private _localDir: string;
  private _dbName: string;
  private _currentRepository: nodegit.Repository | undefined;
  private _workingDirectory: string;

  // @ts-ignore
  private _taskQueue: Task[];

  private _isTaskQueueWorking = false;
  private _setIsTaskQueueWorking (bool: boolean, taskId?: string) {
    if (taskId !== undefined) {
      // logger.debug(bool + ', by: ' + taskId);
    }
    this._isTaskQueueWorking = bool;
  }

  private _currentTask: Task | undefined = undefined;

  private _remotes: { [url: string]: RemoteAccess } = {};
  /**
   * @internal
   */
  public _validator: Validator;

  /**
   * DB is going to close
   */
  isClosing = false;

  private _dbInfo: DatabaseInfo = {
    is_new: false,
    is_clone: false,
    is_created_by_gitddb: true,
    is_valid_version: true,
  };

  /**
   * DB Statistics
   */
  private _statistics: DatabaseStatistics = {
    taskCount: {
      put: 0,
      remove: 0,
      push: 0,
      sync: 0,
    },
  };

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

    this._validator = new Validator(this._workingDirectory);

    this._validator.validateDbName(this._dbName);
    this._validator.validateLocalDir(this._localDir);

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
      minLevel: 'trace',
      displayDateTime: false,
      displayFunctionName: false,
      displayFilePath: 'hidden',
      requestId: () => {
        if (this._currentTask?.taskId !== undefined) {
          return this._currentTask?.taskId;
        }
        return '';
      },
    });
  }

  /**
   * Create a repository or open an existing one.
   *
   * @remarks
   *  - If localDir does not exist, it is created.
   *
   *  - GitDocumentDB can load a git repository that is not created by git-documentdb module,
   *  however correct behavior is not guaranteed.
   *
   * @returns Database information
   *
   * @throws {@link CannotCreateDirectoryError} You may not have write permission.
   * @throws {@link DatabaseClosingError}
   */
  async open (remoteURL?: string, remoteOptions?: RemoteOptions): Promise<DatabaseInfo> {
    if (this.isClosing) {
      return Promise.reject(new DatabaseClosingError());
    }
    if (this.isOpened()) {
      this._dbInfo.is_new = false;
      return this._dbInfo;
    }

    /**
     * Reset
     */
    this._taskQueue = [];
    this._currentTask = undefined;
    this._remotes = {};
    this._dbInfo = {
      is_new: false,
      is_clone: false,
      is_created_by_gitddb: true,
      is_valid_version: true,
    };
    this._statistics = {
      taskCount: {
        put: 0,
        remove: 0,
        push: 0,
        sync: 0,
      },
    };

    /**
     * Create directory
     */
    await fs.ensureDir(this._workingDirectory).catch((err: Error) => {
      return Promise.reject(new CannotCreateDirectoryError(err.message));
    });

    /**
     * nodegit.Repository.open() throws an error if the specified repository does not exist.
     * open() also throws an error if the path is invalid or not writable,
     * however this case has been already checked in fs.ensureDir.
     */
    this._currentRepository = await nodegit.Repository.open(this._workingDirectory).catch(
      () => undefined
    );

    /**
     * Create or clone repository if not exists
     */
    if (this._currentRepository === undefined) {
      if (remoteURL === undefined) {
        this._dbInfo = await this._createRepository();
        return this._dbInfo;
      }

      // Clone repository if remoteURL exists
      this._currentRepository = await this._cloneRepository(remoteURL, remoteOptions);

      if (this._currentRepository === undefined) {
        // Clone failed
        this._dbInfo = await this._createRepository();
      }
      else {
        this.logger.warn('Clone succeeded.');
        /**
         * TODO: validate db
         */
        this._dbInfo.is_clone = true;
      }
    }

    /**
     * Check and sync repository if exists
     */
    await this._setDbInfo();

    if (remoteURL !== undefined) {
      if (this._dbInfo.is_created_by_gitddb && this._dbInfo.is_valid_version) {
        // Can synchronize
        /**
         * TODO:
         * sync()内でbehavior_for_no_merge_base の処理をすること
         */
        await this.sync(remoteURL, remoteOptions);
      }
    }

    return this._dbInfo;
  }

  private async _createRepository () {
    /**
     * Create a repository followed by first commit
     */
    const options: RepositoryInitOptions = {
      initialHead: this.defaultBranch,
    };
    this._dbInfo.is_new = true;
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

  private async _cloneRepository (remoteURL: string, remoteOptions?: RemoteOptions) {
    const remote = new RemoteAccess(this, remoteURL, remoteOptions);
    const callbacks = {
      credentials: remote.createCredential(),
    };
    if (process.platform === 'darwin') {
      // @ts-ignore
      this._callbacks.certificateCheck = () => 0;
    }
    /**
     * TODO: Handle exceptions
     * If repository exists and cannot clone, you have not permission.
     * Only 'pull' is allowed.
     */

    return await nodegit.Clone.clone(remoteURL, this.workingDir(), {
      fetchOpts: {
        callbacks,
      },
    }).catch(err => {
      this.logger.debug(err);
      return undefined;
    });
  }

  private async _setDbInfo () {
    const version = await fs
      .readFile(path.resolve(this._workingDirectory, gitddbVersionFileName), 'utf8')
      .catch(() => {
        this._dbInfo.is_created_by_gitddb = false;
        this._dbInfo.is_valid_version = false;
        return undefined;
      });
    if (version === undefined) return this._dbInfo;

    if (new RegExp('^' + databaseName).test(version)) {
      this._dbInfo.is_created_by_gitddb = true;
      if (new RegExp('^' + gitddbVersion).test(version)) {
        this._dbInfo.is_valid_version = true;
      }
      else {
        this._dbInfo.is_valid_version = false;
        /**
         * TODO: Need migration
         */
      }
    }
    else {
      this._dbInfo.is_created_by_gitddb = false;
      this._dbInfo.is_valid_version = false;
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
   * DB Statistics
   */
  statistics () {
    return this._statistics;
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
   * Task queue
   * @internal
   */
  //  Use monotonic ulid for taskId
  public newTaskId = () => {
    return ulid(Date.now());
  };

  public _pushToTaskQueue (task: Task) {
    this._taskQueue.push(task);
    this._execTaskQueue();
  }

  public _unshiftSyncTaskToTaskQueue (task: Task) {
    if (this._taskQueue.length > 0 && this._taskQueue[0].label === 'sync') {
      return;
    }
    this._taskQueue.unshift(task);
    this._execTaskQueue();
  }

  private _execTaskQueue () {
    if (this._taskQueue.length > 0 && !this._isTaskQueueWorking) {
      this._currentTask = this._taskQueue.shift();
      if (this._currentTask !== undefined && this._currentTask.func !== undefined) {
        const label = this._currentTask.label;
        const targetId = this._currentTask.targetId;
        const taskId = this._currentTask.taskId;

        this.logger.debug(
          ConsoleStyle.BgYellow().FgBlack().tag()`Start ${label}(${targetId || ''})`
        );
        this._setIsTaskQueueWorking(true, this._currentTask.taskId);
        this._currentTask.func().finally(() => {
          this._statistics.taskCount[label]++;

          this.logger.debug(
            ConsoleStyle.BgGreen().FgBlack().tag()`End ${label}(${targetId || ''})`
          );
          this._setIsTaskQueueWorking(false, taskId);
          this._execTaskQueue();
        });
      }
    }
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
    // Stop remote
    Object.values(this._remotes).forEach(remote => remote.cancel());

    // Wait taskQueue
    if (this._currentRepository instanceof nodegit.Repository) {
      let isTimeout = false;
      try {
        this.isClosing = true;
        if (options.force) {
          // Clear queue
          this._taskQueue.length = 0;
        }
        const timeoutMsec = options.timeout || 10000;
        const startMsec = Date.now();
        while (this._taskQueue.length > 0 || this._isTaskQueueWorking) {
          if (Date.now() - startMsec > timeoutMsec) {
            this._taskQueue.length = 0;
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
        this._taskQueue = [];

        this._setIsTaskQueueWorking(false);

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

        this._remotes = {};
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
   * @param options - The options specify how to close database.
   * @throws {@link DatabaseClosingError}
   * @throws {@link DatabaseCloseTimeoutError}
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
   * Add a document
   *
   * @privateRemarks
   *
   * This is 'overload 1' referred in test/put.test.ts
   *
   * @remarks
   * - put() does not check a write permission of your file system (unlike open()).
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
   */
  put (jsonDoc: JsonDoc, options?: PutOptions): Promise<PutResult>;
  /**
   * Add a document
   *
   * @privateRemarks
   *
   * This is 'overload 2' referred in test/put.test.ts
   *
   * @remarks
   * - put() does not check a write permission of your file system (unlike open()).
   *
   * - Saved file path is `${workingDir()}/${document._id}.json`. {@link InvalidIdLengthError} will be thrown if the path length exceeds the maximum length of a filepath on the device.
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
    return Object.keys(this._remotes);
  }

  /**
   * getRemote
   */
  getRemote (remoteURL: string) {
    return this._remotes[remoteURL];
  }

  /**
   * removeRemote
   */
  removeRemote (remoteURL: string) {
    this._remotes[remoteURL].cancel();
    delete this._remotes[remoteURL];
  }

  /**
   * Synchronization
   *
   * @remarks
   * Do not register the same remote repository again. Call removeRemote() before register it again.
   */
  async sync (remoteURL: string, options?: RemoteOptions): Promise<RemoteAccess> {
    if (this._remotes[remoteURL] !== undefined) {
      throw new RemoteAlreadyRegisteredError(remoteURL);
    }
    const remote = await syncImpl.call(this, remoteURL, options);
    this._remotes[remoteURL] = remote;
    return remote;
  }
}
