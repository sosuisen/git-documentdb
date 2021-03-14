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

const databaseName = 'GitDocumentDB';
const databaseVersion = '1.0';
const gitddbVersion = `${databaseName}: ${databaseVersion}`;
const gitddbVersionFileName = '.gitddb/version';

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
 * OS specific options. <b>It is recommended to use ASCII characters and case-insensitive names for cross-platform.</b>
 *
 * ```
 * * local_dir: Local directory path that stores repositories of GitDocumentDB.
 *   - Default is './gitddb'.
 *   - A directory name allows Unicode characters excluding OS reserved filenames and following characters: < > : " | ? * \0.
 *   - A colon : is generally not allowed, but a drive letter followed by a colon is allowed. e.g.) C: D:
 *   - A directory name cannot end with a period or a white space, but the current directory . and the parent directory .. are allowed.
 *   - A trailing slash / could be omitted.
 *
 * * db_name: Name of a git repository
 *   - dbName allows Unicode characters excluding OS reserved filenames and following characters: < > : " ¥ / \ | ? * \0.
 *   - dbName cannot end with a period or a white space.
 *   - dbName does not allow '.' and '..'.
 * ```
 * @beta
 */
export type DatabaseOption = {
  local_dir?: string;
  db_name: string;
};

const defaultLocalDir = './gitddb';

/**
 * Database information
 *
 * @remarks
 * - is_new: Whether a repository is newly created or existing.
 *
 * - is_created_by_gitddb: Whether a repository is created by GitDocumentDB or other means.
 *
 * - is_valid_version: Whether a repository version equals to the current databaseVersion of GitDocumentDB.
 *   The version is described in .git/description.
 *
 * @beta
 */
export type DatabaseInfo = {
  is_new: boolean;
  is_created_by_gitddb: boolean;
  is_valid_version: boolean;
};

const sleep = (msec: number) => new Promise(resolve => setTimeout(resolve, msec));

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

  private _dbInfo = {
    is_new: false,
    is_created_by_gitddb: true,
    is_valid_version: true,
  };

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
  getRepository (): nodegit.Repository | undefined {
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
   * Task queue
   * @internal
   */
  public _pushToTaskQueue (task: Task) {
    this._taskQueue.push(task);
    this._execTaskQueue();
  }

  public _unshiftSyncTaskToTaskQueue (task: Task) {
    this._taskQueue.unshift(task);
    this._execTaskQueue();
  }

  private _execTaskQueue () {
    if (this._taskQueue.length > 0 && !this._isTaskQueueWorking) {
      this._isTaskQueueWorking = true;
      this._currentTask = this._taskQueue.shift();
      if (this._currentTask !== undefined && this._currentTask.func !== undefined) {
        this._currentTask.func().finally(() => {
          this._isTaskQueueWorking = false;
          this._execTaskQueue();
        });
      }
    }
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
  async open (): Promise<DatabaseInfo> {
    if (this.isClosing) {
      return Promise.reject(new DatabaseClosingError());
    }
    if (this.isOpened()) {
      this._dbInfo.is_new = false;
      return this._dbInfo;
    }

    this._taskQueue = [];
    this._currentTask = undefined;

    this._remotes = {};

    await fs.ensureDir(this._workingDirectory).catch((err: Error) => {
      return Promise.reject(new CannotCreateDirectoryError(err.message));
    });
    this._dbInfo = {
      is_new: false,
      is_created_by_gitddb: true,
      is_valid_version: true,
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

    // Check gitddb version
    const version = await fs
      .readFile(path.resolve(this._workingDirectory, '.gitddb', 'version'), 'utf8')
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
        // console.warn('Database version is invalid.');
        this._dbInfo.is_valid_version = false;
      }
    }
    else {
      // console.warn('Database is not created by git-documentdb.');
      this._dbInfo.is_created_by_gitddb = false;
      this._dbInfo.is_valid_version = false;
    }

    return this._dbInfo;
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
    Object.values(this._remotes).forEach(remote => remote.cancel());
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
        this._isTaskQueueWorking = false;

        /**
         * The types are wrong. Repository does not have free() method.
         * See https://github.com/nodegit/nodegit/issues/1817#issuecomment-776844425
         * https://github.com/nodegit/nodegit/pull/1570
         *
         */
        // this._currentRepository.free();

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
   * getRemote
   */
  getRemoteURLs (): string[] {
    return Object.keys(this._remotes);
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
