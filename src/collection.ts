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
  InvalidDocumentTypeError,
  InvalidJsonObjectError,
  RepositoryNotOpenError,
  UndefinedDocumentIdError,
} from './error';
import {
  AllDocsOptions,
  AllDocsResult,
  CollectionPath,
  DeleteOptions,
  DeleteResult,
  JsonDoc,
  PutOptions,
  PutResult,
  ReadMethod,
} from './types';
import { CRUDInterface, IDocumentDB } from './types_gitddb';
import { Validator } from './validator';
import { toSortedJSONString } from './utils';
import { JSON_EXT } from './const';

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
  private _defaultReadMethod: ReadMethod;
  private _gitDDB: CRUDInterface & IDocumentDB;

  /**
   * @throws {@link InvalidCollectionPathCharacterError}
   * @throws {@link InvalidCollectionPathLengthError}
   */
  constructor (
    gitDDB: CRUDInterface & IDocumentDB,
    collectionPath?: CollectionPath,
    defaultReadMethod: ReadMethod = 'json'
  ) {
    this._gitDDB = gitDDB;
    this._collectionPath = Validator.normalizeCollectionPath(collectionPath);
    this._gitDDB.validator.validateCollectionPath(this._collectionPath);
    this._defaultReadMethod = defaultReadMethod;
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
        if (entry.path() !== '.gitddb') {
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
   * Get defaultReadMethod
   */
  defaultReadMethod () {
    return this._defaultReadMethod;
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
   * @throws {@link InvalidPropertyNameInDocumentError} (from validateDocument)
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
   * @param data - {@link JsonDoc} or Buffer or string. _id property of JsonDoc is ignored.
   *
   * @throws {@link UndefinedDocumentIdError}
   * @throws {@link InvalidJsonObjectError}
   *
   * @throws {@link InvalidPropertyNameInDocumentError} (from validateDocument)
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
    else if (shortIdOrDoc._id) {
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
      this._gitDDB.validator.validateDocument(data);
      try {
        const clone = JSON.parse(JSON.stringify(data));
        clone._id = path.basename(shortId);
        bufferOrString = toSortedJSONString(clone);
      } catch (err) {
        return Promise.reject(new InvalidJsonObjectError(shortId));
      }
    }
    else {
      if (shortId === undefined) {
        return Promise.reject(new UndefinedDocumentIdError());
      }
      this._gitDDB.validator.validateId(shortId);

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
   * - The document will be saved to `${workingDir()}/${jsonDoc._id}.json` on the file system.
   *
   * @param jsonDoc - See {@link JsonDoc} for restriction.
   *
   * @throws {@link UndefinedDocumentIdError}
   * @throws {@link InvalidJsonObjectError}
   *
   * @throws {@link InvalidPropertyNameInDocumentError} (from validateDocument)
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
   * @param data - {@link JsonDoc} or Buffer or string. _id property of JsonDoc is ignored.
   *
   * @throws {@link UndefinedDocumentIdError}
   * @throws {@link InvalidJsonObjectError}
   *
   * @throws {@link InvalidPropertyNameInDocumentError} (from validateDocument)
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
   * - The document will be saved to `${workingDir()}/${jsonDoc._id}.json` on the file system.
   *
   * - A update operation is not skipped even if no change occurred on a specified document.
   *
   * @param jsonDoc - See {@link JsonDoc} for restriction
   *
   * @throws {@link UndefinedDocumentIdError}
   * @throws {@link InvalidJsonObjectError}
   *
   * @throws {@link InvalidPropertyNameInDocumentError} (from validateDocument)
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
   * @throws {@link InvalidPropertyNameInDocumentError} (from validateDocument)
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
   * Get a document
   *
   * @param _id - _id of a target document
   *
   * @returns
   *  - JsonDoc if exists.
   *
   *  - undefined if not exists.
   *
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link UndefinedDocumentIdError}
   * @throws {@link InvalidJsonObjectError}
   * @throws {@link InvalidIdCharacterError}
   * @throws {@link InvalidIdLengthError}
   */
  get (_id: string, backNumber?: number): Promise<JsonDoc | undefined> {
    const colId = this._collectionPath + _id;

    return this._gitDDB.get(colId, backNumber).then(doc => {
      if (doc === undefined) {
        return undefined;
      }
      doc._id = _id;
      return doc;
    });
  }

  /**
   * This is an alias of delete()
   */
  remove (_id: string, options?: DeleteOptions): Promise<DeleteResult>;
  /**
   * This is an alias of delete()
   */
  remove (jsonDoc: JsonDoc, options?: DeleteOptions): Promise<DeleteResult>;
  remove (idOrDoc: string | JsonDoc, options?: DeleteOptions): Promise<DeleteResult> {
    if (typeof idOrDoc === 'string') {
      return this.delete(idOrDoc, options);
    }
    else if (typeof idOrDoc === 'object') {
      return this.delete(idOrDoc, options);
    }
    return Promise.reject(new UndefinedDocumentIdError());
  }

  /**
   * Delete a document
   *
   * @param _id - _id of a target document
   *
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link UndefinedDocumentIdError}
   * @throws {@link DocumentNotFoundError} when the specified document does not exist.
   * @throws {@link CannotDeleteDataError}
   * @throws {@link InvalidIdCharacterError}
   * @throws {@link InvalidIdLengthError}
   * @throws {@link InvalidCollectionPathCharacterError}
   * @throws {@link InvalidCollectionPathLengthError}
   */
  delete (_id: string, options?: DeleteOptions): Promise<DeleteResult>;
  /**
   * Remove a document
   *
   * @param jsonDoc - Target document
   *
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link UndefinedDocumentIdError}
   * @throws {@link DocumentNotFoundError} when the specified document does not exist.
   * @throws {@link CannotDeleteDataError}
   * @throws {@link InvalidIdCharacterError}
   * @throws {@link InvalidIdLengthError}
   * @throws {@link InvalidCollectionPathCharacterError}
   * @throws {@link InvalidCollectionPathLengthError}
   */
  delete (jsonDoc: JsonDoc, options?: DeleteOptions): Promise<DeleteResult>;
  delete (idOrDoc: string | JsonDoc, options?: DeleteOptions): Promise<DeleteResult> {
    if (typeof idOrDoc === 'string') {
      const orgId = idOrDoc;
      const _id = this._collectionPath + orgId;
      return this._gitDDB.delete(_id, options).then(res => {
        res._id = orgId;
        return res;
      });
    }
    else if (typeof idOrDoc === 'object') {
      if (idOrDoc._id) {
        const orgId = idOrDoc._id;
        const _id = this._collectionPath + orgId;
        return this._gitDDB
          .delete(_id, options)
          .then(res => {
            res._id = orgId;
            return res;
          })
          .finally(() => {
            idOrDoc._id = orgId;
          });
      }
    }
    return Promise.reject(new UndefinedDocumentIdError());
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
  async allDocs (options?: AllDocsOptions): Promise<AllDocsResult> {
    options ??= {
      descending: undefined,
      recursive: undefined,
      prefix: undefined,
    };
    options.prefix ??= '';
    options.prefix = this._collectionPath + options.prefix;

    const docs = await this._gitDDB.allDocs(options);
    const reg = new RegExp('^' + this._collectionPath);
    docs.rows?.forEach(fatDoc => {
      fatDoc._id = fatDoc._id.replace(reg, '');
      if (fatDoc.doc && fatDoc.type === 'json') {
        fatDoc.doc._id = fatDoc._id;
      }
    });

    return docs;
  }
}
