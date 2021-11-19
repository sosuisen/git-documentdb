/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import fs from 'fs';

import { readTree, resolveRef } from '@sosuisen/isomorphic-git';
import { monotonicFactory, ULID } from 'ulid';
import { Err } from './error';
import {
  CollectionOptions,
  CollectionPath,
  DeleteOptions,
  DeleteResult,
  DeleteResultBinary,
  DeleteResultJsonDoc,
  DeleteResultText,
  Doc,
  DocType,
  FatDoc,
  FindOptions,
  GetOptions,
  HistoryOptions,
  JsonDoc,
  PutOptions,
  PutResult,
  PutResultBinary,
  PutResultJsonDoc,
  PutResultText,
  SyncCallback,
  SyncEvent,
} from './types';
import { GitDDBInterface } from './types_gitddb';
import { Validator } from './validator';
import { GIT_DOCUMENTDB_METADATA_DIR } from './const';
import { getImpl } from './crud/get';
import { getHistoryImpl } from './crud/history';
import { deleteImpl } from './crud/delete';
import { findImpl } from './crud/find';
import { putImpl } from './crud/put';
import { SyncInterface } from './types_sync';
import { ICollection } from './types_collection';

/**
 * Documents under a collectionPath are gathered together in a collection.
 *
 * @remarks
 * In a collection API, shortId (shortName) is used instead of _id (name).
 *
 * - shortId is a file path whose collectionPath and extension are omitted. (_id = collectionPath + shortId)
 *
 * - shortName is a file path whose collectionPath is omitted. (name = collectionPath + shortName)
 *
 * @example
 * ```
 * const gitDDB = new GitDocumentDB({ db_name: 'db01' });
 *
 * // Both put git_documentdb/db01/Nara/flower.json: { _id: 'Nara/flower', name: 'cherry blossoms' }.
 * gitDDB.put({ _id: 'Nara/flower', name: 'cherry blossoms' });
 * gitDDB.collection('Nara').put({ _id: 'flower', name: 'cherry blossoms' })
 *
 * // Notice that APIs return different _id values despite the same source file.
 * gitDDB.get({ _id: 'Nara/flower' }); // returns { _id: 'Nara/flower', name: 'cherry blossoms' }.
 * gitDDB.collection('Nara').get({ _id: 'flower' }); // returns { _id: 'flower', name: 'cherry blossoms' }.
 * ```
 * @public
 */
export class Collection implements ICollection {
  private _gitDDB: GitDDBInterface;

  private _monoID: ULID;

  /***********************************************
   * Public properties (readonly)
   ***********************************************/
  private _options: CollectionOptions;
  /**
   * Get a clone of collection options
   *
   * @readonly
   * @public
   */
  get options (): CollectionOptions {
    return { ...this._options };
  }

  private _collectionPath: CollectionPath = '';
  /**
   * Normalized path of a collection
   *
   * @remarks
   * collectionPath is '' or path strings that have a trailing slash and no heading slash. '/' is not allowed. Backslash \\ or yen ¥ is replaced with slash /.
   * @public
   */
  get collectionPath (): string {
    return this._parent === undefined
      ? this._collectionPath
      : this._parent.collectionPath + this._collectionPath;
  }

  private _parent: ICollection | undefined;
  /**
   * Parent collection
   *
   * @remarks
   * Child collection inherits Parent's CollectionOptions.
   *
   * @public
   */
  get parent (): ICollection | undefined {
    return this._parent as ICollection | undefined;
  }

  /**
   * Constructor
   *
   * @param collectionPathFromParent - A relative collectionPath from a parent collection.
   * @param parent - A parent collection of this collection.
   *
   * @throws {@link Err.InvalidCollectionPathCharacterError}
   * @throws {@link Err.InvalidCollectionPathLengthError}
   *
   * @public
   */
  constructor (
    gitDDB: GitDDBInterface,
    collectionPathFromParent?: CollectionPath,
    parent?: ICollection,
    options?: CollectionOptions
  ) {
    this._gitDDB = gitDDB;
    this._collectionPath = Validator.normalizeCollectionPath(collectionPathFromParent);
    this._gitDDB.validator.validateCollectionPath(this.collectionPath);

    if (parent === undefined) {
      this._parent = undefined;
      options ??= {
        namePrefix: '',
        debounceTime: undefined,
      };
      options.debounceTime ??= -1;
    }
    else {
      this._parent = parent;
    }
    this._options = { ...parent?.options!, ...options };

    if (this._options.idGenerator !== undefined) {
      this._monoID = this._options.idGenerator;
    }
    else {
      this._monoID = monotonicFactory();
    }
  }

  /***********************************************
   * Public methods
   ***********************************************/

  /**
   * Generate new _id as monotonic ULID
   *
   * @remarks
   * See https://github.com/ulid/javascript
   *
   * @returns 26 Base32 alphabets
   *
   * @public
   */
  generateId (seedTime?: number) {
    if (seedTime === undefined) {
      seedTime = Date.now();
    }
    return this._options.namePrefix + this._monoID(seedTime);
  }

  /**
   * Get a collection
   *
   * @param collectionPath - relative path from this.collectionPath. Sub-directories are also permitted. e.g. 'pages', 'pages/works'.
   *
   * @remarks
   * - Notice that this function just read an existing directory. It does not make a new sub-directory.
   *
   * @returns A child collection of this collection
   *
   * @public
   */
  collection (collectionPath: CollectionPath, options?: CollectionOptions): ICollection {
    return new Collection(this._gitDDB, collectionPath, this, options) as ICollection;
  }

  /**
   * Get collections directly under the specified dirPath.
   *
   * @param dirPath - dirPath is a relative path from collectionPath. Default is ''.
   * @returns Array of Collections which does not include ''.
   *
   * @public
   */
  async getCollections (dirPath = ''): Promise<ICollection[]> {
    dirPath = Validator.normalizeCollectionPath(this.collectionPath + dirPath);
    dirPath = dirPath.slice(0, -1);

    const commitOid = await resolveRef({ fs, dir: this._gitDDB.workingDir, ref: 'main' });

    const treeResult = await readTree({
      fs,
      dir: this._gitDDB.workingDir,
      oid: commitOid,
      filepath: dirPath,
    }).catch(() => undefined);

    const rootTree = treeResult?.tree ?? [];

    const collections: Collection[] = [];

    for (const entry of rootTree) {
      const fullDocPath = dirPath !== '' ? `${dirPath}/${entry.path}` : entry.path;
      if (entry.type === 'tree') {
        if (fullDocPath !== GIT_DOCUMENTDB_METADATA_DIR) {
          collections.push(new Collection(this._gitDDB, fullDocPath));
        }
      }
    }
    return collections as ICollection[];
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
   * - The saved file path is `${GitDocumentDB#workingDir}/${Collection#collectionPath}${jsonDoc._id}${extension}`.
   *
   * - If _id is undefined, it is automatically generated.
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
   * @param shortId - shortId is a file path whose collectionPath and extension are omitted.
   *
   * @remarks
   * - The saved file path is `${GitDocumentDB#workingDir}/${Collection#collectionPath}/${shortId}${extension}`.
   *
   * - If shortId is undefined, it is automatically generated.
   *
   * - _id property of a JsonDoc is automatically set or overwritten by a shortId parameter.
   *
   * - An update operation is not skipped even if no change occurred on a specified document.
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
    shortId: string | undefined | null,
    jsonDoc: JsonDoc,
    options?: PutOptions
  ): Promise<PutResultJsonDoc>;

  /**
   * Overload only for internal call
   *
   * @internal
   */
  put (
    shortIdOrDoc: string | undefined | null | JsonDoc,
    jsonDocOrOptions?: JsonDoc | PutOptions,
    options?: PutOptions
  ): Promise<PutResultJsonDoc>;

  // eslint-disable-next-line complexity
  put (
    shortIdOrDoc: string | undefined | null | JsonDoc,
    jsonDocOrOptions?: JsonDoc | PutOptions,
    options?: PutOptions
  ): Promise<PutResultJsonDoc> {
    let shortId: string;
    let _id: string;
    let jsonDoc: JsonDoc;

    // Resolve overloads
    if (
      typeof shortIdOrDoc === 'string' ||
      shortIdOrDoc === undefined ||
      shortIdOrDoc === null
    ) {
      if (!shortIdOrDoc) shortIdOrDoc = this.generateId();
      shortId = shortIdOrDoc;
      _id = this.collectionPath + shortId;
      jsonDoc = jsonDocOrOptions as JsonDoc;
    }
    else {
      if (!shortIdOrDoc._id) shortIdOrDoc._id = this.generateId();
      shortId = shortIdOrDoc._id;
      _id = this.collectionPath + shortId;
      jsonDoc = shortIdOrDoc as JsonDoc;
      options = jsonDocOrOptions as PutOptions;
    }

    // JSON
    let clone;
    try {
      clone = JSON.parse(JSON.stringify(jsonDoc));
    } catch (err) {
      return Promise.reject(new Err.InvalidJsonObjectError(shortId));
    }
    clone._id = _id;
    const { extension, data } = this._gitDDB.serializeFormat.serialize(clone);
    const shortName = shortId + extension;
    try {
      this._gitDDB.validator.validateId(shortId);
      this._gitDDB.validator.validateDocument(clone);
    } catch (err) {
      return Promise.reject(err);
    }

    options ??= {
      debounceTime: undefined,
    };
    options.debounceTime ??= this._options.debounceTime;

    return putImpl(
      this._gitDDB,
      this.collectionPath,
      shortId,
      shortName,
      data,
      options
    ).then(res => {
      const putResult: PutResultJsonDoc = {
        ...res,
        _id: shortId,
        name: shortName,
        type: 'json',
      };
      return putResult;
    });
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
   * - The saved file path is `${GitDocumentDB#workingDir}/${Collection#collectionPath}/${jsonDoc._id}${extension}`.
   *
   * @param jsonDoc - See {@link JsonDoc} for restriction.
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
   * @param shortId - shortId is a file path whose collectionPath and extension are omitted.
   *
   * @remarks
   * - Throws SameIdExistsError when a document that has the same _id exists. It might be better to use put() instead of insert().
   *
   * - The saved file path is `${GitDocumentDB#workingDir}/${Collection#collectionPath}/${shortId}${extension}`.
   *
   * - If shortId is undefined, it is automatically generated.
   *
   * - _id property of a JsonDoc is automatically set or overwritten by shortId parameter.
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
    shortId: string | undefined | null,
    jsonDoc: JsonDoc,
    options?: PutOptions
  ): Promise<PutResultJsonDoc>;

  /**
   * @internal
   */
  insert (
    shortIdOrDoc: string | undefined | null | JsonDoc,
    jsonDocOrOptions?: JsonDoc | PutOptions,
    options?: PutOptions
  ): Promise<PutResultJsonDoc>;

  insert (
    shortIdOrDoc: string | undefined | null | JsonDoc,
    jsonDocOrOptions?: JsonDoc | PutOptions,
    options?: PutOptions
  ): Promise<PutResultJsonDoc> {
    // Resolve overloads
    if (
      typeof shortIdOrDoc === 'string' ||
      shortIdOrDoc === undefined ||
      shortIdOrDoc === null
    ) {
      options ??= {
        debounceTime: undefined,
      };
      options.insertOrUpdate = 'insert';
      options.debounceTime ??= this._options.debounceTime;
    }
    else {
      jsonDocOrOptions ??= {
        debounceTime: undefined,
      };
      (jsonDocOrOptions as PutOptions).insertOrUpdate = 'insert';
      (jsonDocOrOptions as PutOptions).debounceTime ??= this._options.debounceTime;
    }

    return this.put(shortIdOrDoc, jsonDocOrOptions, options);
  }

  /**
   * Update a JSON document
   *
   * @param jsonDoc - JsonDoc whose _id is shortId. shortId is a file path whose collectionPath and extension are omitted.
   *
   * @remarks
   * - Throws DocumentNotFoundError if a specified document does not exist. It might be better to use put() instead of update().
   *
   * - The saved file path is `${GitDocumentDB#workingDir}/${Collection#collectionPath}/${jsonDoc._id}${extension}`.
   *
   * - If _id is undefined, it is automatically generated.
   *
   * - An update operation is not skipped even if no change occurred on a specified document.
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
   * @param shortId - shortId is a file path whose collectionPath and extension are omitted.
   *
   * @remarks
   * - Throws DocumentNotFoundError if a specified data does not exist. It might be better to use put() instead of update().
   *
   * - The saved file path is `${GitDocumentDB#workingDir}/${Collection#collectionPath}/${shortId}${extension}`.
   *
   * - An update operation is not skipped even if no change occurred on a specified data.
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

  /**
   * @internal
   */
  update (
    shortIdOrDoc: string | undefined | null | JsonDoc,
    jsonDocOrOptions?: JsonDoc | PutOptions,
    options?: PutOptions
  ): Promise<PutResultJsonDoc>;

  update (
    shortIdOrDoc: string | undefined | null | JsonDoc,
    jsonDocOrOptions?: JsonDoc | PutOptions,
    options?: PutOptions
  ): Promise<PutResultJsonDoc> {
    // Resolve overloads
    if (
      typeof shortIdOrDoc === 'string' ||
      shortIdOrDoc === undefined ||
      shortIdOrDoc === null
    ) {
      options ??= {
        debounceTime: undefined,
      };
      options.insertOrUpdate = 'update';
      options.debounceTime ??= this._options.debounceTime;
    }
    else {
      jsonDocOrOptions ??= {
        debounceTime: undefined,
      };
      (jsonDocOrOptions as PutOptions).insertOrUpdate = 'update';
      (jsonDocOrOptions as PutOptions).debounceTime ??= this._options.debounceTime;
    }

    return this.put(shortIdOrDoc, jsonDocOrOptions, options);
  }

  /**
   * Insert data if not exists. Otherwise, update it.
   *
   * @param shortName - shortName is a file path whose collectionPath is omitted. shortName of JsonDoc must ends with extension.
   *
   * @remarks
   * - The saved file path is `${GitDocumentDB#workingDir}/${Collection#collectionPath}/${shortName}${extension}`.
   *
   * - If shortName is undefined, it is automatically generated.
   *
   * - _id property of a JsonDoc is automatically set or overwritten by shortName parameter whose extension is omitted.
   *
   * - An update operation is not skipped even if no change occurred on a specified data.
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
  // eslint-disable-next-line complexity
  putFatDoc (
    shortName: string | undefined | null,
    doc: JsonDoc | Uint8Array | string,
    options?: PutOptions
  ): Promise<PutResult> {
    let shortId: string | undefined;
    let data: Uint8Array | string;
    let docType: DocType;

    // Resolve overloads
    if (typeof doc === 'string') {
      if (!shortName) shortName = this.generateId();
      docType = 'text';
      data = doc;
    }
    else if (doc instanceof Uint8Array) {
      if (!shortName) shortName = this.generateId();
      docType = 'binary';
      data = doc;
    }
    else if (typeof doc === 'object') {
      const extension = this._gitDDB.serializeFormat.extension(doc);
      if (!shortName) shortName = this.generateId() + extension;
      docType = 'json';
      // JsonDoc
      if (!shortName.endsWith(extension)) {
        return Promise.reject(new Err.InvalidJsonFileExtensionError());
      }
      shortId = shortName.replace(new RegExp(extension + '$'), '');

      // Validate JSON
      let clone;
      try {
        clone = JSON.parse(JSON.stringify(doc));
      } catch (err) {
        return Promise.reject(new Err.InvalidJsonObjectError(shortId));
      }
      clone._id = this.collectionPath + shortId;
      data = this._gitDDB.serializeFormat.serialize(clone).data;

      try {
        this._gitDDB.validator.validateDocument(clone);
      } catch (err) {
        return Promise.reject(err);
      }
    }
    else {
      return Promise.reject(new Err.InvalidDocTypeError(typeof doc));
    }

    try {
      this._gitDDB.validator.validateId(shortName);
    } catch (err) {
      return Promise.reject(err);
    }

    options ??= {
      debounceTime: undefined,
    };
    options.debounceTime ??= this._options.debounceTime;

    return putImpl(
      this._gitDDB,
      this.collectionPath,
      shortId,
      shortName,
      data,
      options
    ).then(res => {
      if (docType === 'json') {
        const putResult: PutResultJsonDoc = {
          ...res,
          type: 'json',
          _id: shortId!,
        };
        return putResult;
      }
      else if (docType === 'text') {
        const putResult: PutResultText = {
          ...res,
          type: 'text',
        };
        return putResult;
      }
      else if (docType === 'binary') {
        const putResult: PutResultBinary = {
          ...res,
          type: 'binary',
        };
        return putResult;
      }
      return Promise.reject(new Err.InvalidDocTypeError(typeof doc));
    });
  }

  /**
   * Insert a data
   *
   * @param shortName - shortName is a file path whose collectionPath is omitted. shortName of JsonDoc must ends with extension.
   *
   * @remarks
   * - Throws SameIdExistsError when data that has the same _id exists. It might be better to use put() instead of insert().
   *
   * - The saved file path is `${GitDocumentDB#workingDir}/${Collection#collectionPath}/${shortName}${extension}`.
   *
   * - If shortName is undefined, it is automatically generated.
   *
   * - _id property of a JsonDoc is automatically set or overwritten by shortName parameter whose extension is omitted.
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
    shortName: string | undefined | null,
    doc: JsonDoc | string | Uint8Array,
    options?: PutOptions
  ): Promise<PutResult> {
    // Resolve overloads
    options ??= {
      debounceTime: undefined,
    };
    options.insertOrUpdate = 'insert';
    options.debounceTime ??= this._options.debounceTime;

    return this.putFatDoc(shortName, doc, options);
  }

  /**
   * Update a data
   *
   * @param shortName - shortName is a file path whose collectionPath is omitted. shortName of JsonDoc must ends with extension.
   *
   * @remarks
   * - Throws DocumentNotFoundError if a specified data does not exist. It might be better to use put() instead of update().
   *
   * - The saved file path is `${GitDocumentDB#workingDir}/${Collection#collectionPath}/${shortName}${extension}`.
   *
   * - _id property of a JsonDoc is automatically set or overwritten by shortName parameter whose extension is omitted.
   *
   * - An update operation is not skipped even if no change occurred on a specified data.
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
    shortName: string | undefined | null,
    doc: JsonDoc | string | Uint8Array,
    options?: PutOptions
  ): Promise<PutResult> {
    // Resolve overloads
    options ??= {
      debounceTime: undefined,
    };
    options.insertOrUpdate = 'update';
    options.debounceTime ??= this._options.debounceTime;

    return this.putFatDoc(shortName, doc, options);
  }

  /**
   * Get a JSON document
   *
   * @param shortId - shortId is a file path whose collectionPath and extension are omitted.
   *
   * @returns
   *  - undefined if a specified document does not exist.
   *
   *  - JsonDoc may not have _id property when an app other than GitDocumentDB creates it.
   *
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @public
   */
  async get (_id: string): Promise<JsonDoc | undefined> {
    const shortName = _id + this._gitDDB.serializeFormat.firstExtension;
    const result = (await getImpl(
      this._gitDDB,
      shortName,
      this.collectionPath,
      this._gitDDB.serializeFormat,
      {
        forceDocType: 'json',
      }
    )) as Promise<JsonDoc | undefined>;
    if (
      result === undefined &&
      this._gitDDB.serializeFormat.secondExtension !== undefined
    ) {
      return getImpl(
        this._gitDDB,
        shortName,
        this.collectionPath,
        this._gitDDB.serializeFormat,
        {
          forceDocType: 'json',
        }
      ) as Promise<JsonDoc | undefined>;
    }
    return result;
  }

  /**
   * Get a FatDoc data
   *
   * @param shortName - shortName is a file path whose collectionPath is omitted.
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
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @public
   */
  async getFatDoc (
    shortName: string,
    getOptions?: GetOptions
  ): Promise<FatDoc | undefined> {
    const result = (await getImpl(
      this._gitDDB,
      shortName,
      this.collectionPath,
      this._gitDDB.serializeFormat,
      getOptions,
      {
        withMetadata: true,
      }
    )) as Promise<FatDoc | undefined>;
    if (
      result === undefined &&
      this._gitDDB.serializeFormat.secondExtension !== undefined
    ) {
      return getImpl(
        this._gitDDB,
        shortName,
        this.collectionPath,
        this._gitDDB.serializeFormat,
        getOptions,
        {
          withMetadata: true,
        }
      ) as Promise<FatDoc | undefined>;
    }
    return result;
  }

  /**
   * Get a Doc which has specified oid
   *
   * @param fileOid - Object ID (SHA-1 hash) that represents a Git object. (See https://git-scm.com/docs/git-hash-object )
   *
   * @remarks
   *  - undefined if a specified oid does not exist.
   *
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @public
   */
  getDocByOid (fileOid: string, docType: DocType = 'text'): Promise<Doc | undefined> {
    return getImpl(
      this._gitDDB,
      '',
      this.collectionPath,
      this._gitDDB.serializeFormat,
      { forceDocType: docType },
      {
        withMetadata: false,
        oid: fileOid,
      }
    ) as Promise<Doc | undefined>;
  }

  /**
   * Get an old revision of a JSON document
   *
   * @param shortId - shortId is a file path whose collectionPath and extension are omitted.
   * @param revision - Specify a number to go back to old revision. Default is 0.
   * See {@link git-documentdb#Collection.getHistory} for the array of revisions.
   * @param historyOptions - The array of revisions is filtered by HistoryOptions.filter.
   *
   * @remarks
   *  - undefined if a specified document does not exist or it is deleted.
   *
   *  - If serializeFormat is front-matter, this function can't correctly distinguish files that has the same _id but different extension. Use getFatDocOldRevision() instead. e.g.) foo.md and foo.yml
   *
   * @example
   * ```
   * collection.getOldRevision(_shortId, 0); // returns the latest document.
   * collection.getOldRevision(_shortId, 2); // returns a document two revisions older than the latest.
   * ```
   *
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @public
   */
  async getOldRevision (
    shortId: string,
    revision: number,
    historyOptions?: HistoryOptions
  ): Promise<JsonDoc | undefined> {
    let shortName = shortId + this._gitDDB.serializeFormat.firstExtension;
    const result = (await getImpl(
      this._gitDDB,
      shortName,
      this.collectionPath,
      this._gitDDB.serializeFormat,
      { forceDocType: 'json' },
      {
        withMetadata: false,
        revision: revision,
      },
      historyOptions
    )) as Promise<JsonDoc | undefined>;
    if (result === undefined && this._gitDDB.serializeFormat !== undefined) {
      shortName = shortId + this._gitDDB.serializeFormat.secondExtension;
      return getImpl(
        this._gitDDB,
        shortName,
        this.collectionPath,
        this._gitDDB.serializeFormat,
        { forceDocType: 'json' },
        {
          withMetadata: false,
          revision: revision,
        },
        historyOptions
      ) as Promise<JsonDoc | undefined>;
    }
    return result;
  }

  /**
   * Get an old revision of a FatDoc data
   *
   * @param shortName - shortName is a file path whose collectionPath is omitted.
   * @param revision - Specify a number to go back to old revision. Default is 0.
   * See {@link git-documentdb#Collection.getHistory} for the array of revisions.
   * @param historyOptions - The array of revisions is filtered by HistoryOptions.filter.
   *
   * @remarks
   *  - undefined if a specified data does not exist or it is deleted.
   *
   *  - JsonDoc if the file extension is SerializedFormat.extension.  Be careful that JsonDoc may not have _id property when an app other than GitDocumentDB creates it.
   *
   *  - FatBinaryDoc if described in .gitattribtues, otherwise FatTextDoc.
   *
   *  - getOptions.forceDocType always overwrite return type.
   *
   * @example
   * ```
   * collection.getFatDocOldRevision(shortName, 0); // returns the latest FatDoc.
   * collection.getFatDocOldRevision(shortName, 2); // returns a FatDoc two revisions older than the latest.
   * ```
   *
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @public
   */
  getFatDocOldRevision (
    shortName: string,
    revision: number,
    historyOptions?: HistoryOptions,
    getOptions?: GetOptions
  ): Promise<FatDoc | undefined> {
    return getImpl(
      this._gitDDB,
      shortName,
      this.collectionPath,
      this._gitDDB.serializeFormat,
      getOptions,
      {
        withMetadata: true,
        revision: revision,
      },
      historyOptions
    ) as Promise<FatDoc | undefined>;
  }

  /**
   * Get revision history of a JSON document
   *
   * @remarks
   * - By default, revisions are sorted by reverse chronological order. However, keep in mind that Git dates may not be consistent across repositories.
   *
   * - If serializeFormat is front-matter, this function can't work for .yml files. Use getFatDocHistory() instead. e.g.) foo.yml
   *
   * @param shortId - shortId is a file path whose collectionPath and extension is omitted.
   * @param historyOptions - The array of revisions is filtered by HistoryOptions.filter.
   *
   * @returns Array of JsonDoc or undefined if a specified document does not exist or it is deleted.
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
    const shortName = _id + this._gitDDB.serializeFormat.firstExtension;
    return getHistoryImpl(
      this._gitDDB,
      shortName,
      this.collectionPath,
      this._gitDDB.serializeFormat,
      historyOptions,
      { forceDocType: 'json' },
      false
    ) as Promise<(JsonDoc | undefined)[]>;
  }

  /**
   * Get revision history of a FatDoc data
   *
   * @param shortName - shortName is a file path whose collectionPath is omitted.
   *
   * @remarks
   * See {@link git-documentdb#GitDocumentDB.getHistory} for detailed examples.
   *
   * @returns Array of FatDoc or undefined.
   *  - undefined if a specified data does not exist or it is deleted.
   *
   *  - Array of FatJsonDoc if isJsonDocCollection is true or the file extension is SerializeFormat.extension.  Be careful that JsonDoc may not have _id property when an app other than GitDocumentDB creates it.
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
    shortName: string,
    historyOptions?: HistoryOptions,
    getOptions?: GetOptions
  ): Promise<(FatDoc | undefined)[]> {
    return getHistoryImpl(
      this._gitDDB,
      shortName,
      this.collectionPath,
      this._gitDDB.serializeFormat,
      historyOptions,
      getOptions,
      true
    ) as Promise<(FatDoc | undefined)[]>;
  }

  /**
   * Delete a JSON document
   *
   * @param shortId - shortId is a file path whose collectionPath and extension is omitted.
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
   * @param jsonDoc - JsonDoc whose _id is shortId. Only the _id property is referenced. shortId is a file path whose collectionPath and extension are omitted.
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

  /**
   * @internal
   */
  delete (
    shortIdOrDoc: string | JsonDoc,
    options?: DeleteOptions
  ): Promise<DeleteResultJsonDoc>;

  async delete (
    shortIdOrDoc: string | JsonDoc,
    options?: DeleteOptions
  ): Promise<DeleteResultJsonDoc> {
    let shortId: string;
    if (typeof shortIdOrDoc === 'string') {
      shortId = shortIdOrDoc;
    }
    else if (shortIdOrDoc?._id) {
      shortId = shortIdOrDoc._id;
    }
    else {
      return Promise.reject(new Err.UndefinedDocumentIdError());
    }
    let shortName = shortId + this._gitDDB.serializeFormat.firstExtension;

    let trySecondExtension = false;
    const resultOrError = await deleteImpl(
      this._gitDDB,
      this.collectionPath,
      shortId,
      shortName,
      options
    )
      .then(res => {
        const deleteResult: PutResultJsonDoc = {
          ...res,
          _id: shortId,
          type: 'json',
        };
        return deleteResult;
      })
      .catch(err => {
        if (
          err instanceof Err.DocumentNotFoundError &&
          this._gitDDB.serializeFormat.secondExtension !== undefined
        )
          trySecondExtension = true;
        return err;
      });

    if (trySecondExtension) {
      shortName = shortId + this._gitDDB.serializeFormat.secondExtension;
      return deleteImpl(
        this._gitDDB,
        this.collectionPath,
        shortId,
        shortName,
        options
      ).then(res => {
        const deleteResult: PutResultJsonDoc = {
          ...res,
          _id: shortId,
          type: 'json',
        };
        return deleteResult;
      });
    }
    // eslint-disable-next-line promise/catch-or-return
    if (resultOrError instanceof Error) throw resultOrError;

    return resultOrError;
  }

  /**
   * Delete a data
   *
   * @param shortName - shortName is a file path whose collectionPath is omitted.
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
  deleteFatDoc (shortName: string, options?: DeleteOptions): Promise<DeleteResult> {
    if (shortName === undefined) {
      return Promise.reject(new Err.UndefinedDocumentIdError());
    }

    const docType: DocType = this._gitDDB.serializeFormat.hasObjectExtension(shortName)
      ? 'json'
      : 'text';
    if (docType === 'text') {
      // TODO: select binary or text by .gitattribtues
    }
    const shortId = this._gitDDB.serializeFormat.removeExtension(shortName);

    return deleteImpl(this._gitDDB, this.collectionPath, shortId, shortName, options).then(
      res => {
        // NOTE: Cannot detect JsonDoc whose file path does not end with SerializeFormat.extension
        if (docType === 'json') {
          const deleteResult: DeleteResultJsonDoc = {
            ...res,
            type: 'json',
            _id: shortId,
          };
          return deleteResult;
        }
        else if (docType === 'text') {
          const deleteResult: DeleteResultText = {
            ...res,
            type: 'text',
          };
          return deleteResult;
        }
        else if (docType === 'binary') {
          const deleteResult: DeleteResultBinary = {
            ...res,
            type: 'binary',
          };
          return deleteResult;
        }
        // Not occur
        return Promise.reject(new Err.InvalidDocTypeError(docType));
      }
    );
  }

  /**
   * Get all the JSON documents
   *
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @public
   */
  find (options?: FindOptions): Promise<JsonDoc[]> {
    options ??= {};
    options.forceDocType ??= 'json';
    return findImpl(
      this._gitDDB,
      this.collectionPath,
      this._gitDDB.serializeFormat,
      true,
      false,
      options
    ) as Promise<JsonDoc[]>;
  }

  /**
   * Get all the FatDoc data
   *
   * @throws {@link Err.DatabaseClosingError}
   * @throws {@link Err.InvalidJsonObjectError}
   *
   * @public
   */
  findFatDoc (options?: FindOptions): Promise<FatDoc[]> {
    return findImpl(
      this._gitDDB,
      this.collectionPath,
      this._gitDDB.serializeFormat,
      false,
      true,
      options
    ) as Promise<FatDoc[]>;
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

  /**
   * @internal
   */
  onSyncEvent (
    remoteURLorSync: string | SyncInterface,
    event: SyncEvent,
    callback: SyncCallback
  ): SyncInterface;

  onSyncEvent (
    remoteURLorSync: string | SyncInterface,
    event: SyncEvent,
    callback: SyncCallback
  ): SyncInterface {
    let sync;
    if (typeof remoteURLorSync === 'string') {
      sync = this._gitDDB.getSync(remoteURLorSync);
    }
    else {
      sync = remoteURLorSync;
    }
    if (sync === undefined) {
      throw new Err.UndefinedSyncError();
    }
    return sync.on(event, callback, this.collectionPath);
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
  /**
   * @internal
   */
  offSyncEvent (
    remoteURLorSync: string | SyncInterface,
    event: SyncEvent,
    callback: SyncCallback
  ): void;

  offSyncEvent (
    remoteURLorSync: string | SyncInterface,
    event: SyncEvent,
    callback: SyncCallback
  ): void {
    let sync;
    if (typeof remoteURLorSync === 'string') {
      sync = this._gitDDB.getSync(remoteURLorSync);
    }
    else {
      sync = remoteURLorSync;
    }
    if (sync === undefined) {
      throw new Err.UndefinedSyncError();
    }
    sync.off(event, callback);
  }
}
