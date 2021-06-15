/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import nodegit from '@sosuisen/nodegit';
import { putImpl } from './crud/put';

import {
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
  CollectionPath,
  DeleteOptions,
  DeleteResult,
  Doc,
  FatDoc,
  FindOptions,
  GetOptions,
  HistoryOptions,
  JsonDoc,
  PutOptions,
  PutResult,
} from './types';
import { CRUDInterface, IDocumentDB } from './types_gitddb';
import { Validator } from './validator';
import { toSortedJSONString } from './utils';
import { GIT_DOCUMENTDB_METADATA_DIR, JSON_EXT } from './const';
import { getImpl } from './crud/get';
import { getHistoryImpl } from './crud/history';
import { deleteImpl } from './crud/delete';
import { findImpl } from './crud/find';

/**
 * Documents are gathered together in collections.
 *
 * @remarks
 * In a collection, its collectionPath is omitted from _id. (The _id stored in the Git repository is the one before it was omitted.)
 *
 * @example
 * ```
 * const gitDDB = new GitDocumentDB({ db_name: 'db01' });
 *
 * // Both put gddb_data/db01/Sapporo/1.json: { _id: '1', name: 'Yuzuki' }.
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

  private _isJsonDocCollection: boolean;

  /**
   * @param isJsonDocCollection - (true) The collection manages only JsonDoc. (false) The collection manages any file types.
   *
   * @remarks
   * - If isJsonDocCollection is true, JsonDoc id default type. There is no '.json' at the end of _id. e.g.) _id is 'foo', 'bar'.
   *
   * - If isJsonDocCollection is false, any file types are available. _id param must be a full filename if it has an extension. e.g) _id is 'foo.json', 'baz.jpg', 'README.md'.
   *
   * - Be careful that _id in JsonDoc does not always have trailing '.json'.
   *
   * @throws {@link InvalidCollectionPathCharacterError}
   * @throws {@link InvalidCollectionPathLengthError}
   */
  constructor (
    gitDDB: CRUDInterface & IDocumentDB,
    collectionPath?: CollectionPath,
    isJsonDocCollection = true
  ) {
    this._gitDDB = gitDDB;
    this._collectionPath = Validator.normalizeCollectionPath(collectionPath);
    this._gitDDB.validator.validateCollectionPath(this._collectionPath);
    this._isJsonDocCollection = isJsonDocCollection;
  }

  /**
   * Get collections whose collectionPath start with specified root.
   *
   * @param rootCollectionPath - Default is ''.
   * @returns Array of Collections which does not include ''
   * @throws {@link RepositoryNotOpenError}
   */
  static async getCollections (
    gitDDB: CRUDInterface & IDocumentDB,
    rootCollectionPath = ''
  ): Promise<Collection[]> {
    const repos = gitDDB.repository();
    if (repos === undefined) {
      throw new RepositoryNotOpenError();
    }
    const head = await nodegit.Reference.nameToId(repos, 'HEAD').catch(e => false); // get HEAD
    if (!head) {
      return [];
    }
    const commit = await repos.getCommit(head as nodegit.Oid); // get the commit of HEAD
    let rootTree = await commit.getTree();

    const collections: Collection[] = [];
    if (rootCollectionPath !== '') {
      const rootEntry = await rootTree.getEntry(rootCollectionPath).catch(e => null);
      if (rootEntry === null || !rootEntry.isTree()) {
        return [];
      }
      rootTree = await rootEntry.getTree();
    }
    const entries = rootTree.entries(); // returns entry by alphabetical order
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (entry.isDirectory()) {
        if (entry.path() !== GIT_DOCUMENTDB_METADATA_DIR) {
          collections.push(new Collection(gitDDB, entry.path()));
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
   * isJsonDocCollection
   */
  isJsonDocCollection () {
    return this._isJsonDocCollection;
  }

  /**
   * Insert a JSON document if not exists. Otherwise, update it.
   *
   * @remarks
   * - The saved file path is `${workingDir()}/${jsonDoc._id}.json`.
   *
   * @param jsonDoc - See {@link JsonDoc} for restriction.
   *
   * @throws {@link UndefinedDocumentIdError} from
   * @throws {@link InvalidJsonObjectError}
   * @throws {@link UndefinedDocumentIdError} (from validateDocument)
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
  put (jsonDoc: JsonDoc, options?: PutOptions): Promise<PutResult>;

  /**
   * Insert a data if not exists. Otherwise, update it.
   *
   * @remarks
   * - The saved file path is `${workingDir()}/${_id}`. If data is JsonDoc, trailing '.json' is added to the file path.
   *
   * - _id property of a JsonDoc is automatically set or overwritten by _id parameter.
   *
   * - This overload method always accept JsonDoc, Buffer and string regardless of isJsonDocCollection.
   *
   * @param _id
   * @param data - {@link JsonDoc} or Buffer or string.
   *
   * @throws {@link UndefinedDocumentIdError}
   * @throws {@link InvalidJsonObjectError}
   *
   * @throws {@link UndefinedDocumentIdError} from validateDocument
   * @throws {@link InvalidIdCharacterError} from validateDocument, validateId
   * @throws {@link InvalidIdLengthError}
   * (from validateDocument, validateId)
   * @throws {@link InvalidCollectionPathCharacterError}
   * (from validateDocument, validateId)
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
    data: JsonDoc | Buffer | string,
    options?: PutOptions
  ): Promise<PutResult>;

  /**
   * Overload only to be called from insert() and update()
   * @internal
   */
  put (
    shortIdOrDoc: string | JsonDoc,
    dataOrOptions?: JsonDoc | Buffer | string | PutOptions,
    options?: PutOptions
  ): Promise<PutResult>;

  // eslint-disable-next-line complexity
  put (
    shortIdOrDoc: string | JsonDoc,
    dataOrOptions?: JsonDoc | Buffer | string | PutOptions,
    options?: PutOptions
  ): Promise<PutResult> {
    let shortId: string;
    let fullDocPath: string;
    let data: JsonDoc | Buffer | string;
    let bufferOrString: Buffer | string;

    // Resolve overloads
    if (typeof shortIdOrDoc === 'string') {
      shortId = shortIdOrDoc;
      data = dataOrOptions as JsonDoc | Buffer | string;
      fullDocPath = this._collectionPath + shortId;
      if (typeof data === 'object' && !(data instanceof Buffer)) {
        // JSON
        if (!fullDocPath.endsWith(JSON_EXT)) {
          fullDocPath += JSON_EXT;
        }
      }
    }
    else if (shortIdOrDoc?._id) {
      shortId = shortIdOrDoc._id;
      fullDocPath = this._collectionPath + shortId + JSON_EXT;
      data = shortIdOrDoc as JsonDoc;
      options = dataOrOptions as PutOptions;
    }
    else {
      return Promise.reject(new UndefinedDocumentIdError());
    }

    // Validate
    if (typeof data === 'object' && !(data instanceof Buffer)) {
      // JSON
      let clone;
      try {
        clone = JSON.parse(JSON.stringify(data));
        clone._id = path.basename(shortId);
        bufferOrString = toSortedJSONString(clone);
      } catch (err) {
        return Promise.reject(new InvalidJsonObjectError(shortId));
      }
      try {
        this._gitDDB.validator.validateId(shortId);
        this._gitDDB.validator.validateDocument(clone);
      } catch (err) {
        return Promise.reject(err);
      }
    }
    else {
      try {
        this._gitDDB.validator.validateId(shortId);
      } catch (err) {
        return Promise.reject(err);
      }

      bufferOrString = data;
    }

    return putImpl(this._gitDDB, fullDocPath, bufferOrString, options).then(res => {
      const putResult = { ...res, _id: shortId };
      return putResult;
    });
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
   * - The saved file path is `${workingDir()}/${jsonDoc._id}.json`.
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
   * - The saved file path is `${workingDir()}/${_id}`. If data is JsonDoc, trailing '.json' is added to the file path.
   *
   * - _id property of a JsonDoc is automatically set or overwritten by _id parameter.
   *
   * - This overload method always accept JsonDoc, Buffer and string regardless of isJsonDocCollection.
   *
   * @param _id - '.json' is automatically completed when you omit it for JsonDoc _id.
   * @param data - {@link JsonDoc} or Buffer or string.
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
    data: JsonDoc | Buffer | string,
    options?: PutOptions
  ): Promise<PutResult>;

  insert (
    shortIdOrDoc: string | JsonDoc,
    dataOrOptions?: JsonDoc | Buffer | string | PutOptions,
    options?: PutOptions
  ): Promise<PutResult> {
    options ??= {};
    options.insertOrUpdate = 'insert';
    return this.put(shortIdOrDoc, dataOrOptions, options);
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
   * - The saved file path is `${workingDir()}/${jsonDoc._id}.json`.
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
   * - The saved file path is `${workingDir()}/${_id}`. If data is JsonDoc, trailing '.json' is added to the file path.
   *
   * - A update operation is not skipped even if no change occurred on a specified data.
   *
   * - This overload method always accept JsonDoc, Buffer and string regardless of isJsonDocCollection.
   *
   * @param id - _id property of a document
   * @param data - {@link JsonDoc} or Buffer or string.
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
    data: JsonDoc | Buffer | string,
    options?: PutOptions
  ): Promise<PutResult>;

  update (
    shortIdOrDoc: string | JsonDoc,
    dataOrOptions?: JsonDoc | Buffer | string | PutOptions,
    options?: PutOptions
  ): Promise<PutResult> {
    options ??= {};
    options.insertOrUpdate = 'update';
    return this.put(shortIdOrDoc, dataOrOptions, options);
  }

  /**
   * Get a JSON document or data
   *
   * @returns
   *  - undefined if not exists.
   *
   *  - JsonDoc if isJsonDocCollection is true or the file extension is '.json'.
   *
   *  - Buffer or string if isJsonDocCollection is false.
   *
   *  - getOptions.forceDocType always overwrite return type.
   *
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link InvalidJsonObjectError}
   */
  get (_id: string, getOptions?: GetOptions): Promise<Doc | undefined> {
    return getImpl(
      this._gitDDB,
      _id,
      this._collectionPath,
      this.isJsonDocCollection(),
      getOptions
    );
  }

  /**
   * Get a FatDoc
   *
   * @returns
   *  - undefined if not exists.
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
  getFatDoc (_id: string, getOptions?: GetOptions): Promise<FatDoc | undefined> {
    return getImpl(
      this._gitDDB,
      _id,
      this._collectionPath,
      this.isJsonDocCollection(),
      getOptions,
      {
        withMetadata: true,
      }
    ) as Promise<FatDoc | undefined>;
  }

  /**
   * Get a FatDoc which has specified oid
   *
   * @remarks
   *  - undefined if not exists.
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
  getByOid (
    _id: string,
    fileOid: string,
    getOptions?: GetOptions
  ): Promise<FatDoc | undefined> {
    return getImpl(
      this._gitDDB,
      _id,
      this._collectionPath,
      this.isJsonDocCollection(),
      getOptions,
      {
        withMetadata: true,
        oid: fileOid,
      }
    ) as Promise<FatDoc | undefined>;
  }

  /**
   * Get a back number of a document
   *
   * @param backNumber - Specify a number to go back to old revision. Default is 0. When backNumber equals 0, a document in the current DB is returned.
   * When backNumber is 0 and a document has been deleted in the current DB, it returns undefined.
   *
   * @remarks
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
  getBackNumber (
    _id: string,
    backNumber: number,
    historyOptions?: HistoryOptions,
    getOptions?: GetOptions
  ): Promise<FatDoc | undefined> {
    return getImpl(
      this._gitDDB,
      _id,
      this._collectionPath,
      this.isJsonDocCollection(),
      getOptions,
      {
        withMetadata: true,
        backNumber: backNumber,
      },
      historyOptions
    ) as Promise<FatDoc | undefined>;
  }

  /**
   * Get revision history of a document
   *
   * @remarks
   * - By default, revisions are sorted by reverse chronological order. However, keep in mind that Git dates may not be consistent across repositories.
   *
   *  @returns Array of FatDoc or undefined.
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
  getHistory (
    _id: string,
    historyOptions?: HistoryOptions,
    getOptions?: GetOptions
  ): Promise<(FatDoc | undefined)[]> {
    return getHistoryImpl(
      this._gitDDB,
      _id,
      this._collectionPath,
      this.isJsonDocCollection(),
      historyOptions,
      getOptions
    );
  }

  /**
   * Delete a document
   *
   * @throws {@link UndefinedDocumentIdError}
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError} (from deleteImpl, deleteWorker)
   * @throws {@link TaskCancelError}
   *
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
   * @throws {@link UndefinedDocumentIdError}
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError} (from deleteImpl, deleteWorker)
   * @throws {@link TaskCancelError}
   *
   * @throws {@link UndefinedDBError} (from deleteWorker)
   * @throws {@link DocumentNotFoundError} (from deleteWorker)
   * @throws {@link CannotDeleteDataError} (from deleteWorker)
   */
  delete (jsonDoc: JsonDoc, options?: DeleteOptions): Promise<DeleteResult>;

  delete (shortIdOrDoc: string | JsonDoc, options?: DeleteOptions): Promise<DeleteResult>;

  delete (shortIdOrDoc: string | JsonDoc, options?: DeleteOptions): Promise<DeleteResult> {
    let shortId: string;
    let fullDocPath: string;
    if (typeof shortIdOrDoc === 'string') {
      shortId = shortIdOrDoc;
      fullDocPath = this._collectionPath + shortId;
      if (this.isJsonDocCollection()) {
        fullDocPath += JSON_EXT;
      }
    }
    else if (shortIdOrDoc._id) {
      shortId = shortIdOrDoc._id;
      fullDocPath = this._collectionPath + shortId;
    }
    else {
      return Promise.reject(new UndefinedDocumentIdError());
    }

    return deleteImpl(this._gitDDB, fullDocPath, options).then(res => {
      const deleteResult = { ...res, _id: shortId };
      return deleteResult;
    });
  }

  /**
   * Get all the documents
   *
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link InvalidJsonObjectError}
   */
  find (options?: FindOptions): Promise<FatDoc[]> {
    return findImpl(this._gitDDB, this._collectionPath, this._isJsonDocCollection, options);
  }
}
