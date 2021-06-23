/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import fs from 'fs';

import { readTree, resolveRef } from 'isomorphic-git';
import { monotonicFactory, ULID } from 'ulid';
import {
  InvalidDocTypeError,
  InvalidJsonFileExtensionError,
  InvalidJsonObjectError,
  RepositoryNotOpenError,
  UndefinedDocumentIdError,
  // Descendant's errors must be imported for TSDoc
  // eslint-disable-next-line sort-imports
  InvalidIdCharacterError,
  InvalidIdLengthError,
  DatabaseClosingError,
  TaskCancelError,
  UndefinedDBError,
  CannotCreateDirectoryError,
  CannotWriteDataError,
} from './error';
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
} from './types';
import { CRUDInterface, IDocumentDB } from './types_gitddb';
import { Validator } from './validator';
import { toSortedJSONString } from './utils';
import { GIT_DOCUMENTDB_METADATA_DIR, JSON_EXT } from './const';
import { getImpl } from './crud/get';
import { getHistoryImpl } from './crud/history';
import { deleteImpl } from './crud/delete';
import { findImpl } from './crud/find';
import { putImpl } from './crud/put';

/**
 * Documents under a collectionPath are gathered together in a collection.
 *
 * @remarks
 * In a collection API, shortId (shortName) is used instead of _id (name).
 *
 * - shortId is a file path whose collectionPath and .json extension are omitted. (_id = collectionPath + shortId)
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
 * // Notice that APIs return different _id values in spite of the same source file.
 * gitDDB.get({ _id: 'Nara/flower' }); // returns { _id: 'Nara/flower', name: 'cherry blossoms' }.
 * gitDDB.collection('Nara').get({ _id: 'flower' }); // returns { _id: 'flower', name: 'cherry blossoms' }.
 * ```
 */
export class Collection implements CRUDInterface {
  private _collectionPath: CollectionPath = '';

  private _gitDDB: CRUDInterface & IDocumentDB;

  private _monoID: ULID;

  /**
   * Prefix of auto generated _id or name
   */
  public namePrefix = '';

  /**
   * Generate new _id as monotonic ULID
   *
   * @remarks
   * See https://github.com/ulid/javascript
   *
   * @returns 26 Base32 alphabets
   */
  public generateId () {
    return this.namePrefix + this._monoID(Date.now());
  }

  /**
   * @throws {@link InvalidCollectionPathCharacterError}
   * @throws {@link InvalidCollectionPathLengthError}
   */
  constructor (
    gitDDB: CRUDInterface & IDocumentDB,
    collectionPath?: CollectionPath,
    options?: CollectionOptions
  ) {
    this._gitDDB = gitDDB;
    this._collectionPath = Validator.normalizeCollectionPath(collectionPath);
    this._gitDDB.validator.validateCollectionPath(this._collectionPath);
    this._monoID = monotonicFactory();

    this.namePrefix = options?.namePrefix ?? this.namePrefix;
  }

  /**
   * Get the collections directly under the specified dirPath.
   *
   * @param dirPath - Default is ''.
   * @returns Array of Collections which does not include ''
   * @throws {@link RepositoryNotOpenError}
   */
  static async getCollections (
    gitDDB: CRUDInterface & IDocumentDB,
    dirPath = ''
  ): Promise<Collection[]> {
    if (!gitDDB.isOpened()) {
      throw new RepositoryNotOpenError();
    }
    dirPath = Validator.normalizeCollectionPath(dirPath);
    dirPath = dirPath.slice(0, -1);

    const commitOid = await resolveRef({ fs, dir: gitDDB.workingDir(), ref: 'main' });

    const treeResult = await readTree({
      fs,
      dir: gitDDB.workingDir(),
      oid: commitOid,
      filepath: dirPath,
    }).catch(() => undefined);

    const rootTree = treeResult?.tree ?? [];

    const collections: Collection[] = [];

    for (const entry of rootTree) {
      const fullDocPath = dirPath !== '' ? `${dirPath}/${entry.path}` : entry.path;
      if (entry.type === 'tree') {
        if (fullDocPath !== GIT_DOCUMENTDB_METADATA_DIR) {
          collections.push(new Collection(gitDDB, fullDocPath));
        }
      }
    }
    return collections;
  }

  /**
   * Get normalized path of collection
   *
   * @returns '' or path strings that has a trailing slash and no heading slash. '/' is not allowed. Backslash \ or yen ¥ is replaced with slash /.
   */
  collectionPath () {
    return this._collectionPath;
  }

  /**
   * Insert a JSON document if not exists. Otherwise, update it.
   *
   * @param jsonDoc - JsonDoc whose _id is shortId. shortId is a file path whose collectionPath and .json extension are omitted.
   *
   * @remarks
   * - The saved file path is `${GitDocumentDB#workingDir()}/${Collection#collectionPath()}${jsonDoc._id}.json`.
   *
   * - If _id is undefined, it is automatically generated.
   *
   * @throws {@link InvalidJsonObjectError}
   *
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
  put (jsonDoc: JsonDoc, options?: PutOptions): Promise<PutResultJsonDoc>;

  /**
   * Insert a JSON document if not exists. Otherwise, update it.
   *
   * @param shortId - shortId is a file path whose collectionPath and .json extension are omitted.
   *
   * @remarks
   * - The saved file path is `${GitDocumentDB#workingDir()}/${Collection#collectionPath()}/${shortId}.json`.
   *
   * - If shortId is undefined, it is automatically generated.
   *
   * - _id property of a JsonDoc is automatically set or overwritten by shortId parameter.
   *
   * - An update operation is not skipped even if no change occurred on a specified data.
   *
   * @throws {@link InvalidJsonObjectError}
   *
   * @throws {@link InvalidIdCharacterError} (from validateDocument, validateId)
   * @throws {@link InvalidIdLengthError} (from validateDocument, validateId)
   * @throws {@link InvalidCollectionPathCharacterError} (from validateDocument, validateId)
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
    shortId: string | undefined | null,
    jsonDoc: JsonDoc,
    options?: PutOptions
  ): Promise<PutResultJsonDoc>;

  /**
   * Overload only for internal call
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
    let shortName: string;
    let fullDocPath: string;
    let jsonDoc: JsonDoc;

    // Resolve overloads
    if (
      typeof shortIdOrDoc === 'string' ||
      shortIdOrDoc === undefined ||
      shortIdOrDoc === null
    ) {
      if (!shortIdOrDoc) shortIdOrDoc = this.generateId();
      shortId = shortIdOrDoc;
      _id = this._collectionPath + shortId;
      shortName = shortId + JSON_EXT;
      jsonDoc = jsonDocOrOptions as JsonDoc;
      fullDocPath = this._collectionPath + shortName;
    }
    else {
      if (!shortIdOrDoc._id) shortIdOrDoc._id = this.generateId();
      shortId = shortIdOrDoc._id;
      _id = this._collectionPath + shortId;
      shortName = shortId + JSON_EXT;
      fullDocPath = this._collectionPath + shortName;
      jsonDoc = shortIdOrDoc as JsonDoc;
      options = jsonDocOrOptions as PutOptions;
    }

    // JSON
    let clone;
    try {
      clone = JSON.parse(JSON.stringify(jsonDoc));
    } catch (err) {
      return Promise.reject(new InvalidJsonObjectError(shortId));
    }
    clone._id = _id;
    const data = toSortedJSONString(clone);
    try {
      this._gitDDB.validator.validateId(shortId);
      this._gitDDB.validator.validateDocument(clone);
    } catch (err) {
      return Promise.reject(err);
    }

    return putImpl(this._gitDDB, fullDocPath, data, options).then(res => {
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
   * @param jsonDoc - JsonDoc whose _id is shortId. shortId is a file path whose collectionPath and .json extension are omitted.
   *
   * @remarks
   * - Throws SameIdExistsError when a document which has the same _id exists. It might be better to use put() instead of insert().
   *
   * - If _id is undefined, it is automatically generated.
   *
   * - The saved file path is `${GitDocumentDB#workingDir()}/${Collection#collectionPath()}/${jsonDoc._id}.json`.
   *
   * @param jsonDoc - See {@link JsonDoc} for restriction.
   *
   * @throws {@link InvalidJsonObjectError}
   *
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
  insert (jsonDoc: JsonDoc, options?: PutOptions): Promise<PutResultJsonDoc>;

  /**
   * Insert a JSON document
   *
   * @param shortId - shortId is a file path whose collectionPath and .json extension are omitted.
   *
   * @remarks
   * - Throws SameIdExistsError when a data which has the same _id exists. It might be better to use put() instead of insert().
   *
   * - The saved file path is `${GitDocumentDB#workingDir()}/${Collection#collectionPath()}/${shortId}.json`.
   *
   * - If shortId is undefined, it is automatically generated.
   *
   * - _id property of a JsonDoc is automatically set or overwritten by shortId parameter.
   *
   * @throws {@link InvalidJsonObjectError}
   *
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
      options ??= {};
      options.insertOrUpdate = 'insert';
    }
    else {
      jsonDocOrOptions ??= {};
      (jsonDocOrOptions as PutOptions).insertOrUpdate = 'insert';
    }

    return this.put(shortIdOrDoc, jsonDocOrOptions, options);
  }

  /**
   * Update a JSON document
   *
   * @param jsonDoc - JsonDoc whose _id is shortId. shortId is a file path whose collectionPath and .json extension are omitted.
   *
   * @remarks
   * - Throws DocumentNotFoundError if the document does not exist. It might be better to use put() instead of update().
   *
   * - The saved file path is `${GitDocumentDB#workingDir()}/${Collection#collectionPath()}/${jsonDoc._id}.json`.
   *
   * - If _id is undefined, it is automatically generated.
   *
   * - An update operation is not skipped even if no change occurred on a specified document.
   *
   * @throws {@link InvalidJsonObjectError}
   *
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
  update (jsonDoc: JsonDoc, options?: PutOptions): Promise<PutResultJsonDoc>;

  /**
   * Update a JSON document
   *
   * @param shortId - shortId is a file path whose collectionPath and .json extension are omitted.
   *
   * @remarks
   * - Throws DocumentNotFoundError if the data does not exist. It might be better to use put() instead of update().
   *
   * - The saved file path is `${GitDocumentDB#workingDir()}/${Collection#collectionPath()}/${shortId}.json`.
   *
   * - If shortId is undefined, it is automatically generated.
   *
   * - An update operation is not skipped even if no change occurred on a specified data.
   *
   * @throws {@link InvalidJsonObjectError}
   *
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
      options ??= {};
      options.insertOrUpdate = 'update';
    }
    else {
      jsonDocOrOptions ??= {};
      (jsonDocOrOptions as PutOptions).insertOrUpdate = 'update';
    }

    return this.put(shortIdOrDoc, jsonDocOrOptions, options);
  }

  /**
   * Insert a data if not exists. Otherwise, update it.
   *
   * @param shortName - shortName is a file path whose collectionPath is omitted. shortName of JsonDoc must ends with .json extension.
   *
   * @remarks
   * - The saved file path is `${GitDocumentDB#workingDir()}/${Collection#collectionPath()}/${shortName}.json`.
   *
   * - If shortName is undefined, it is automatically generated.
   *
   * - _id property of a JsonDoc is automatically set or overwritten by shortName parameter whose .json extension is omitted.
   *
   * - An update operation is not skipped even if no change occurred on a specified data.
   *
   * @throws {@link InvalidJsonFileExtensionError}
   * @throws {@link InvalidJsonObjectError}
   *
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
  // eslint-disable-next-line complexity
  putFatDoc (
    shortName: string | undefined | null,
    doc: JsonDoc | Uint8Array | string,
    options?: PutOptions
  ): Promise<PutResult> {
    let shortId: string;
    let fullDocPath: string;
    let data: Uint8Array | string;
    let docType: DocType;

    // Resolve overloads
    if (typeof doc === 'string') {
      if (!shortName) shortName = this.generateId();
      docType = 'text';
      data = doc;
      fullDocPath = this._collectionPath + shortName;
    }
    else if (doc instanceof Uint8Array) {
      if (!shortName) shortName = this.generateId();
      docType = 'binary';
      data = doc;
      fullDocPath = this._collectionPath + shortName;
    }
    else if (typeof doc === 'object') {
      if (!shortName) shortName = this.generateId() + JSON_EXT;
      docType = 'json';
      // JsonDoc
      if (!shortName.endsWith(JSON_EXT)) {
        return Promise.reject(new InvalidJsonFileExtensionError());
      }
      shortId = shortName.replace(new RegExp(JSON_EXT + '$'), '');
      fullDocPath = this._collectionPath + shortName;

      // Validate JSON
      let clone;
      try {
        clone = JSON.parse(JSON.stringify(doc));
      } catch (err) {
        return Promise.reject(new InvalidJsonObjectError(shortId));
      }
      clone._id = this._collectionPath + shortId;
      data = toSortedJSONString(clone);
      try {
        this._gitDDB.validator.validateDocument(clone);
      } catch (err) {
        return Promise.reject(err);
      }
    }
    else {
      return Promise.reject(new InvalidDocTypeError(typeof doc));
    }

    try {
      this._gitDDB.validator.validateId(shortName);
    } catch (err) {
      return Promise.reject(err);
    }

    return putImpl(this._gitDDB, fullDocPath, data, options).then(res => {
      if (docType === 'json') {
        const putResult: PutResultJsonDoc = {
          ...res,
          name: shortName!,
          type: 'json',
          _id: shortId,
        };
        return putResult;
      }
      else if (docType === 'text') {
        const putResult: PutResultText = {
          ...res,
          name: shortName!,
          type: 'text',
        };
        return putResult;
      }
      else if (docType === 'binary') {
        const putResult: PutResultBinary = {
          ...res,
          name: shortName!,
          type: 'binary',
        };
        return putResult;
      }
      return Promise.reject(new InvalidDocTypeError(typeof doc));
    });
  }

  /**
   * Insert a data
   *
   * @param shortName - shortName is a file path whose collectionPath is omitted. shortName of JsonDoc must ends with .json extension.
   *
   * @remarks
   * - Throws SameIdExistsError when a data which has the same _id exists. It might be better to use put() instead of insert().
   *
   * - The saved file path is `${GitDocumentDB#workingDir()}/${Collection#collectionPath()}/${shortName}.json`.
   *
   * - If shortName is undefined, it is automatically generated.
   *
   * - _id property of a JsonDoc is automatically set or overwritten by shortName parameter whose .json extension is omitted.
   *
   * @throws {@link InvalidJsonObjectError}
   *
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
  insertFatDoc (
    shortName: string | undefined | null,
    doc: JsonDoc | string | Uint8Array,
    options?: PutOptions
  ): Promise<PutResult> {
    // Resolve overloads
    options ??= {};
    options.insertOrUpdate = 'insert';

    return this.putFatDoc(shortName, doc, options);
  }

  /**
   * Update a data
   *
   * @param shortName - shortName is a file path whose collectionPath is omitted. shortName of JsonDoc must ends with .json extension.
   *
   * @remarks
   * - Throws DocumentNotFoundError if the data does not exist. It might be better to use put() instead of update().
   *
   * - The saved file path is `${GitDocumentDB#workingDir()}/${Collection#collectionPath()}/${shortName}.json`.
   *
   * - If shortName is undefined, it is automatically generated.
   *
   * - _id property of a JsonDoc is automatically set or overwritten by shortName parameter whose .json extension is omitted.
   *
   * - An update operation is not skipped even if no change occurred on a specified data.
   *
   * @throws {@link InvalidJsonObjectError}
   *
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
  updateFatDoc (
    shortName: string | undefined | null,
    doc: JsonDoc | string | Uint8Array,
    options?: PutOptions
  ): Promise<PutResult> {
    // Resolve overloads
    options ??= {};
    options.insertOrUpdate = 'update';

    return this.putFatDoc(shortName, doc, options);
  }

  /**
   * Get a JSON document
   *
   * @param shortId - shortId is a file path whose collectionPath and .json extension are omitted.
   *
   * @returns
   *  - undefined if not exists.
   *
   *  - JsonDoc may not have _id property if it was not created by GitDocumentDB.
   *
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link InvalidJsonObjectError}
   */
  get (_id: string): Promise<JsonDoc | undefined> {
    const shortName = _id + JSON_EXT;
    return getImpl(this._gitDDB, shortName, this._collectionPath, {
      forceDocType: 'json',
    }) as Promise<JsonDoc | undefined>;
  }

  /**
   * Get a FatDoc
   *
   * @param shortName - shortName is a file path whose collectionPath is omitted.
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
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link InvalidJsonObjectError}
   */
  getFatDoc (shortName: string, getOptions?: GetOptions): Promise<FatDoc | undefined> {
    return getImpl(this._gitDDB, shortName, this._collectionPath, getOptions, {
      withMetadata: true,
    }) as Promise<FatDoc | undefined>;
  }

  /**
   * Get a Doc which has specified oid
   *
   * @fileOid - Object ID (SHA-1 hash) that represents a Git object. (See https://git-scm.com/docs/git-hash-object )
   *
   * @remarks
   *  - undefined if not exists.
   *
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link InvalidJsonObjectError}
   */
  getDocByOid (fileOid: string, docType: DocType = 'binary'): Promise<Doc | undefined> {
    return getImpl(
      this._gitDDB,
      '',
      this._collectionPath,
      { forceDocType: docType },
      {
        withMetadata: false,
        oid: fileOid,
      }
    ) as Promise<Doc | undefined>;
  }

  /**
   * Get a back number of a JSON document
   *
   * @param shortId - shortId is a file path whose collectionPath and .json extension are omitted.
   * @param backNumber - Specify a number to go back to old revision. Default is 0.
   * When backNumber equals 0, the latest revision is returned.
   * See {@link getHistory} for the array of revisions.
   *
   * @param historyOptions: The array of revisions is filtered by HistoryOptions.filter.
   *
   * @remarks
   *  - undefined if a document does not exists or a document is deleted.
   *
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link InvalidJsonObjectError}
   */
  getBackNumber (
    _id: string,
    backNumber: number,
    historyOptions?: HistoryOptions
  ): Promise<JsonDoc | undefined> {
    const shortName = _id + JSON_EXT;
    return getImpl(
      this._gitDDB,
      shortName,
      this._collectionPath,
      { forceDocType: 'json' },
      {
        withMetadata: false,
        backNumber: backNumber,
      },
      historyOptions
    ) as Promise<JsonDoc | undefined>;
  }

  /**
   * Get a back number of a data
   *
   * @param shortName - shortName is a file path whose collectionPath is omitted.
   * @param backNumber - Specify a number to go back to old revision. Default is 0.
   * When backNumber equals 0, the latest revision is returned.
   * See {@link getHistory} for the array of revisions.
   *
   * @param historyOptions: The array of revisions is filtered by HistoryOptions.filter.
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
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link InvalidJsonObjectError}
   */
  getFatDocBackNumber (
    shortName: string,
    backNumber: number,
    historyOptions?: HistoryOptions,
    getOptions?: GetOptions
  ): Promise<FatDoc | undefined> {
    return getImpl(
      this._gitDDB,
      shortName,
      this._collectionPath,
      getOptions,
      {
        withMetadata: true,
        backNumber: backNumber,
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
   * @param shortId - shortId is a file path whose collectionPath and .json extension is omitted.
   * @param historyOptions: The array of revisions is filtered by HistoryOptions.filter.
   *
   * @example
   * ```
   * commit 01 to 08 were committed in order. file_v1 and file_v2 are two revisions of a file.
   *
   * commit 08: not exists
   * commit 07: deleted
   * commit 06: file_v2
   * commit 05: deleted
   * commit 04: file_v2
   * commit 03: file_v1
   * commit 02: file_v1
   * commit 01: not exists
   *
   * file_v1 was newly inserted in commit 02.
   * The file was not changed in commit 03.
   * The file was updated to file_v2 in commit 04
   * The file was deleted in commit 05.
   * The same file (file_v2) was inserted again in commit 06.
   * The file was deleted again in commit 07, so the file does not exist in commit 08.
   *
   * Here, getHistory() will return [undefined, file_v2, undefined, file_v2, file_v1].
   *
   * NOTE:
   * - Consecutive values are combined into one.
   * - Commits before the first insert are ignored.
   * Thus, the history is not [undefined, undefined, file_v2, undefined, file_v2, file_v1, file_v1, undefined].
   * ```
   * @returns Array of JsonDoc or undefined.
   *  - undefined if the document does not exists or the document is deleted.
   *
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link InvalidJsonObjectError}
   */
  getHistory (
    _id: string,
    historyOptions?: HistoryOptions
  ): Promise<(JsonDoc | undefined)[]> {
    const shortName = _id + JSON_EXT;
    return getHistoryImpl(
      this._gitDDB,
      shortName,
      this._collectionPath,
      historyOptions,
      { forceDocType: 'json' },
      false
    ) as Promise<(JsonDoc | undefined)[]>;
  }

  /**
   * Get revision history of a data
   *
   * @param shortName - shortName is a file path whose collectionPath is omitted.
   *
   * @remarks
   * See {@link getHistory} for detailed examples.
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
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link InvalidJsonObjectError}
   */
  getFatDocHistory (
    shortName: string,
    historyOptions?: HistoryOptions,
    getOptions?: GetOptions
  ): Promise<(FatDoc | undefined)[]> {
    return getHistoryImpl(
      this._gitDDB,
      shortName,
      this._collectionPath,
      historyOptions,
      getOptions,
      true
    ) as Promise<(FatDoc | undefined)[]>;
  }

  /**
   * Delete a JSON document
   *
   * @param shortId - shortId is a file path whose collectionPath and .json extension is omitted.
   *
   * @throws {@link UndefinedDocumentIdError}
   * @throws {@link DatabaseClosingError} (from deleteImpl)
   * @throws {@link TaskCancelError} (from deleteImpl)
   *
   * @throws {@link RepositoryNotOpenError} (from deleteWorker)
   * @throws {@link UndefinedDBError} (from deleteWorker)
   * @throws {@link DocumentNotFoundError} (from deleteWorker)
   * @throws {@link CannotDeleteDataError} (from deleteWorker)
   */
  delete (_id: string, options?: DeleteOptions): Promise<DeleteResultJsonDoc>;

  /**
   * Delete a document by _id property in JsonDoc
   *
   * @param jsonDoc - JsonDoc whose _id is shortId. Only the _id property is referenced. shortId is a file path whose collectionPath and .json extension are omitted.
   *
   * @throws {@link UndefinedDocumentIdError}
   * @throws {@link DatabaseClosingError} (from deleteImpl)
   * @throws {@link TaskCancelError} (from deleteImpl)
   *
   * @throws {@link RepositoryNotOpenError} (from deleteWorker)
   * @throws {@link UndefinedDBError} (from deleteWorker)
   * @throws {@link DocumentNotFoundError} (from deleteWorker)
   * @throws {@link CannotDeleteDataError} (from deleteWorker)
   */
  delete (jsonDoc: JsonDoc, options?: DeleteOptions): Promise<DeleteResultJsonDoc>;

  delete (
    shortIdOrDoc: string | JsonDoc,
    options?: DeleteOptions
  ): Promise<DeleteResultJsonDoc>;

  delete (
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
      return Promise.reject(new UndefinedDocumentIdError());
    }
    const shortName = shortId + JSON_EXT;
    const fullDocPath = this._collectionPath + shortName;

    return deleteImpl(this._gitDDB, fullDocPath, options).then(res => {
      const deleteResult: PutResultJsonDoc = {
        ...res,
        _id: shortId,
        name: shortName,
        type: 'json',
      };
      return deleteResult;
    });
  }

  /**
   * Delete a data
   *
   * @param shortName - shortName is a file path whose collectionPath is omitted.
   *
   * @throws {@link UndefinedDocumentIdError}
   * @throws {@link DatabaseClosingError} (from deleteImpl)
   * @throws {@link TaskCancelError} (from deleteImpl)
   *
   * @throws {@link RepositoryNotOpenError} (from deleteWorker)
   * @throws {@link UndefinedDBError} (from deleteWorker)
   * @throws {@link DocumentNotFoundError} (from deleteWorker)
   * @throws {@link CannotDeleteDataError} (from deleteWorker)
   */
  deleteFatDoc (shortName: string, options?: DeleteOptions): Promise<DeleteResult> {
    if (shortName === undefined) {
      return Promise.reject(new UndefinedDocumentIdError());
    }
    const fullDocPath = this._collectionPath + shortName;

    const docType: DocType = fullDocPath.endsWith('.json') ? 'json' : 'text';
    if (docType === 'text') {
      // TODO: select binary or text by .gitattribtues
    }

    return deleteImpl(this._gitDDB, fullDocPath, options).then(res => {
      // NOTE: Cannot detect JsonDoc whose file path does not end with '.json'
      if (docType === 'json') {
        const shortId = shortName.replace(new RegExp(JSON_EXT + '$'), '');
        const deleteResult: DeleteResultJsonDoc = {
          ...res,
          name: shortName,
          type: 'json',
          _id: shortId,
        };
        return deleteResult;
      }
      else if (docType === 'text') {
        const deleteResult: DeleteResultText = {
          ...res,
          name: shortName,
          type: 'text',
        };
        return deleteResult;
      }
      else if (docType === 'binary') {
        const deleteResult: DeleteResultBinary = {
          ...res,
          name: shortName,
          type: 'binary',
        };
        return deleteResult;
      }
      // Not occur
      return Promise.reject(new InvalidDocTypeError(docType));
    });
  }

  /**
   * Get all the JSON documents
   *
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link InvalidJsonObjectError}
   */
  find (options?: FindOptions): Promise<JsonDoc[]> {
    options ??= {};
    options.forceDocType ??= 'json';
    return findImpl(this._gitDDB, this._collectionPath, true, false, options) as Promise<
      JsonDoc[]
    >;
  }

  /**
   * Get all the data
   *
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link InvalidJsonObjectError}
   */
  findFatDoc (options?: FindOptions): Promise<FatDoc[]> {
    return findImpl(this._gitDDB, this._collectionPath, false, true, options) as Promise<
      FatDoc[]
    >;
  }
}
