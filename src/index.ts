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
import {
  AllDocsOptions,
  AllDocsResult,
  CollectionPath,
  DatabaseCloseOption,
  JsonDoc,
  JsonDocWithMetadata,
  PutOptions,
  PutResult,
  RemoveOptions,
  RemoveResult,
} from './types';
import { AbstractDocumentDB, CRUDInterface } from './types_gitddb';
import { _put_concurrent_impl, putImpl } from './crud/put';
import { getImpl } from './crud/get';
import { _remove_concurrent_impl, removeImpl } from './crud/remove';

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

  private _localDir: string;
  private _dbName: string;
  private _currentRepository: nodegit.Repository | undefined;
  private _workingDirectory: string;

  // @ts-ignore
  private _serialQueue: (() => Promise<void>)[];
  private _isSerialQueueWorking = false;

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
   * Serial queue
   * @internal
   */
  public _pushToSerialQueue (func: () => Promise<void>) {
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

    this._serialQueue = [];

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
      // console.debug(`Create new repository: ${pathToRepo}`);
      const isBare = 0;
      const options: RepositoryInitOptions = {
        description: defaultDescription,
        initialHead: 'main',
      };
      this._dbInfo.is_new = true;
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
        this._dbInfo.is_created_by_gitddb = false;
        this._dbInfo.is_valid_version = false;
        return '';
      });
    if (description === '') return this._dbInfo;

    if (new RegExp('^' + databaseName).test(description)) {
      this._dbInfo.is_created_by_gitddb = true;
      if (new RegExp('^' + defaultDescription).test(description)) {
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
   * Add a document (overload)
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
   * @remarks
   * This method is used only for internal use.
   * But it is published for test purpose.
   *
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link CannotCreateDirectoryError}
   * @throws {@link CannotWriteDataError}
   *
   * @internal
   */
  _put_concurrent = _put_concurrent_impl;

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
  get = getImpl;

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
   * @remarks
   * This method is used only for internal use.
   * But it is published for test purpose.
   *
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link DocumentNotFoundError}
   * @throws {@link CannotDeleteDataError}
   *
   * @internal
   */
  _remove_concurrent = _remove_concurrent_impl;

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

    let collection_path = '';
    if (options?.collection_path) {
      collection_path = Validator.normalizeCollectionPath(options.collection_path);
      try {
        this._validator.validateCollectionPath(collection_path);
      } catch (err) {
        return Promise.reject(err);
      }
    }

    if (collection_path !== '') {
      const specifiedTreeEntry = await tree
        .getEntry(options!.collection_path!)
        .catch(e => null);
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
          let _id = entry.path().replace(new RegExp(this.fileExt + '$'), '');
          const reg = new RegExp('^' + collection_path);
          _id = _id.replace(reg, '');
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
