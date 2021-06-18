/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import fs from 'fs';

import { readTree, resolveRef } from 'isomorphic-git';
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
import { putImpl } from './crud/put';

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
   * Get the collections directly under the specified path.
   *
   * @param rootCollectionPath - Default is ''.
   * @returns Array of Collections which does not include ''
   * @throws {@link RepositoryNotOpenError}
   */
  static async getCollections (
    gitDDB: CRUDInterface & IDocumentDB,
    rootCollectionPath = ''
  ): Promise<Collection[]> {
    if (!gitDDB.isOpened()) {
      throw new RepositoryNotOpenError();
    }
    rootCollectionPath = Validator.normalizeCollectionPath(rootCollectionPath);
    rootCollectionPath = rootCollectionPath.slice(0, -1);

    const commitOid = await resolveRef({ fs, dir: gitDDB.workingDir(), ref: 'main' });

    const treeResult = await readTree({
      fs,
      dir: gitDDB.workingDir(),
      oid: commitOid,
      filepath: rootCollectionPath,
    }).catch(() => undefined);

    const rootTree = treeResult?.tree ?? [];

    const collections: Collection[] = [];

    for (const entry of rootTree) {
      const fullDocPath =
        rootCollectionPath !== '' ? `${rootCollectionPath}/${entry.path}` : entry.path;
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
   * - This overload method always accept JsonDoc, Uint8Array and string regardless of isJsonDocCollection.
   *
   * @param _id
   * @param data - {@link JsonDoc} or Uint8Array or string.
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
    data: JsonDoc | Uint8Array | string,
    options?: PutOptions
  ): Promise<PutResult>;

  /**
   * Overload only to be called from insert() and update()
   * @internal
   */
  put (
    shortIdOrDoc: string | JsonDoc,
    dataOrOptions?: JsonDoc | Uint8Array | string | PutOptions,
    options?: PutOptions
  ): Promise<PutResult>;

  // eslint-disable-next-line complexity
  put (
    shortIdOrDoc: string | JsonDoc,
    dataOrOptions?: JsonDoc | Uint8Array | string | PutOptions,
    options?: PutOptions
  ): Promise<PutResult> {
    let shortId: string;
    let fullDocPath: string;
    let data: JsonDoc | Uint8Array | string;
    let bufferOrString: Uint8Array | string;

    // Resolve overloads
    if (typeof shortIdOrDoc === 'string') {
      shortId = shortIdOrDoc;
      data = dataOrOptions as JsonDoc | Uint8Array | string;
      fullDocPath = this._collectionPath + shortId;
    }
    else if (shortIdOrDoc?._id) {
      shortId = shortIdOrDoc._id;
      fullDocPath = this._collectionPath + shortId;
      data = shortIdOrDoc as JsonDoc;
      options = dataOrOptions as PutOptions;
    }
    else {
      return Promise.reject(new UndefinedDocumentIdError());
    }

    // Validate
    if (
      !this._isJsonDocCollection &&
      typeof data === 'object' &&
      !(data instanceof Uint8Array)
    ) {
      // Need .json
      if (!shortId.endsWith(JSON_EXT)) {
        return Promise.reject(new InvalidIdCharacterError(shortId));
      }
      shortId = shortId.replace(new RegExp(JSON_EXT + '$'), '');
    }

    if (typeof data === 'object' && !(data instanceof Uint8Array)) {
      // JSON
      let clone;
      try {
        clone = JSON.parse(JSON.stringify(data));
      } catch (err) {
        return Promise.reject(new InvalidJsonObjectError(shortId));
      }
      clone._id = fullDocPath;
      if (this._isJsonDocCollection) {
        fullDocPath += JSON_EXT;
      }
      bufferOrString = toSortedJSONString(clone);
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
   * - This overload method always accept JsonDoc, Uint8Array and string regardless of isJsonDocCollection.
   *
   * @param _id - '.json' is automatically completed when you omit it for JsonDoc _id.
   * @param data - {@link JsonDoc} or Uint8Array or string.
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
    // Resolve overloads
    if (typeof shortIdOrDoc === 'string') {
      options ??= {};
      options.insertOrUpdate = 'insert';
    }
    else if (shortIdOrDoc?._id) {
      dataOrOptions ??= {};
      (dataOrOptions as PutOptions).insertOrUpdate = 'insert';
    }
    else {
      return Promise.reject(new UndefinedDocumentIdError());
    }

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
   * - This overload method always accept JsonDoc, Uint8Array and string regardless of isJsonDocCollection.
   *
   * @param id - _id property of a document
   * @param data - {@link JsonDoc} or Uint8Array or string.
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
    // Resolve overloads
    if (typeof shortIdOrDoc === 'string') {
      options ??= {};
      options.insertOrUpdate = 'update';
    }
    else if (shortIdOrDoc?._id) {
      dataOrOptions ??= {};
      (dataOrOptions as PutOptions).insertOrUpdate = 'update';
    }
    else {
      return Promise.reject(new UndefinedDocumentIdError());
    }

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
   *  - JsonDoc may not have _id property if it was not created by GitDocumentDB.
   *
   *  - Uint8Array or string if isJsonDocCollection is false.
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
   *  - FatJsonDoc if isJsonDocCollection is true or the file extension is '.json'. Be careful that JsonDoc may not have _id property if it was not created by GitDocumentDB.
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
  getByOid (fileOid: string, getOptions?: GetOptions): Promise<Doc | undefined> {
    return getImpl(
      this._gitDDB,
      '',
      this._collectionPath,
      this.isJsonDocCollection(),
      getOptions,
      {
        withMetadata: false,
        oid: fileOid,
      }
    ) as Promise<Doc | undefined>;
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
   *  - FatJsonDoc if isJsonDocCollection is true or the file extension is '.json'.  Be careful that JsonDoc may not have _id property if it was not created by GitDocumentDB.
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
   * @returns Array of FatDoc or undefined.
   *  - undefined if the document does not exists or the document is deleted.
   *
   *  - FatJsonDoc if isJsonDocCollection is true or the file extension is '.json'.  Be careful that JsonDoc may not have _id property if it was not created by GitDocumentDB.
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
    }
    else if (shortIdOrDoc._id) {
      shortId = shortIdOrDoc._id;
      fullDocPath = this._collectionPath + shortId;
    }
    else {
      return Promise.reject(new UndefinedDocumentIdError());
    }
    if (this.isJsonDocCollection()) {
      fullDocPath += JSON_EXT;
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
