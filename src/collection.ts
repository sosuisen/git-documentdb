/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import { UndefinedDocumentIdError } from './error';
import {
  AllDocsOptions,
  AllDocsResult,
  CollectionPath,
  JsonDoc,
  PutOptions,
  PutResult,
  RemoveOptions,
  RemoveResult,
} from './types';
import { CRUDInterface, IDocumentDB } from './types_gitddb';
import { Validator } from './validator';

/**
 * Documents are gathered together in collections.
 *
 * @remarks
 * Collection is a sugar syntax of filepath representation.
 *
 * Use Collection to omit directories from the filepath.
 *
 * Both filepath representation (like PouchDB) and collection put the same file on the same location in a Git repository.
 *
 * @example
 * ```
 * const gitDDB = new GitDocumentDB({ local_dir: 'gddb_data', db_name: 'db01' });
 *
 * // Both put 'gddb_data/db01/Sapporo/1.json' in which JSON document has { _id: '1', name: 'Yuzuki' }.
 * gitDDB.put({ _id: 'Sapporo/1', name: 'Yuzuki' });
 * gitDDB.collection('Sapporo').put({ _id: '1', name: 'Yuzuki' })
 *
 * // Notice that APIs return different _id values in spite of the same source file.
 * gitDDB.get({ _id: 'Sapporo/1' }); // returns { _id: 'Sapporo/1', name: 'Yuzuki' }.
 * gitDDB.collection('Sapporo').get({ _id: '1' }); // returns { _id: '1', name: 'Yuzuki' }.
 * ```
 */
export class Collection implements CRUDInterface {
  private _collectionPath: CollectionPath = '';
  private _gitDDB: CRUDInterface & IDocumentDB;

  /**
   * @throws {@link InvalidCollectionPathCharacterError}
   * @throws {@link InvalidCollectionPathLengthError}
   */
  constructor (_gitDDB: CRUDInterface & IDocumentDB, _collectionPath: CollectionPath) {
    this._gitDDB = _gitDDB;
    this._collectionPath = Validator.normalizeCollectionPath(_collectionPath);
    const validator = new Validator(this._gitDDB.workingDir());
    validator.validateCollectionPath(this._collectionPath);
  }

  collectionPath () {
    return this._collectionPath;
  }

  /**
   * Add a document
   *
   * @remarks
   * - put() does not check a write permission of your file system (unlike open()).
   *
   * - Saved file path is `${workingDir()}/${document._id}.json`. {@link InvalidIdLengthError} will be thrown if the path length exceeds the maximum length of a filepath on the device.
   *
   * @param jsonDoc -  See {@link JsonDoc} for restriction
   *
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link UndefinedDocumentIdError}
   * @throws {@link InvalidJsonObjectError}
   * @throws {@link CannotWriteDataError}
   * @throws {@link CannotCreateDirectoryError}
   * @throws {@link InvalidIdCharacterError}
   * @throws {@link InvalidIdLengthError}
   * @throws {@link InvalidCollectionPathCharacterError}
   * @throws {@link InvalidCollectionPathLengthError}
   */
  put (jsonDoc: JsonDoc, options?: PutOptions): Promise<PutResult>;
  /**
   * Add a document
   *
   * @remarks
   * - put() does not check a write permission of your file system (unlike open()).
   *
   * - Saved file path is `${workingDir()}/${document._id}.json`. {@link InvalidIdLengthError} will be thrown if the path length exceeds the maximum length of a filepath on the device.
   *
   * @param _id - _id property of a document is set or overwritten by this _id argument.
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
   * @throws {@link InvalidCollectionPathCharacterError}
   * @throws {@link InvalidCollectionPathLengthError}
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
  ): Promise<PutResult> {
    if (typeof idOrDoc === 'string') {
      const orgId = idOrDoc;
      const _id = this._collectionPath + orgId;
      const document = docOrOptions as { [key: string]: any };
      return this._gitDDB.put(_id, document, options).then(res => {
        res.id = orgId;
        return res;
      });
    }
    else if (typeof idOrDoc === 'object') {
      if (idOrDoc._id) {
        const orgId = idOrDoc._id;
        const _id = this._collectionPath + orgId;
        const document = idOrDoc as JsonDoc;
        options = docOrOptions;
        return this._gitDDB.put(_id, document, options).then(res => {
          res.id = orgId;
          return res;
        });
      }
    }

    return Promise.reject(new UndefinedDocumentIdError());
  }

  /**
   * Create a document
   *
   * @privateRemarks
   *
   * This is 'overload 1' referred to in test/create.test.ts
   *
   * @remarks
   * - Throws SameIdExistsError when a document which has the same id exists. It might be better to use put() instead of create().
   *
   * - create() does not check a write permission of your file system (unlike open()).
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
   * @throws {@link SameIdExistsError}
   *
   */
  create (jsonDoc: JsonDoc, options?: PutOptions): Promise<PutResult>;
  /**
   * Create a document
   *
   * @privateRemarks
   *
   * This is 'overload 2' referred to in test/create.test.ts
   *
   * @remarks
   * - Throws SameIdExistsError when a document which has the same id exists. It might be better to use put() instead of create().
   *
   * - create() does not check a write permission of your file system (unlike open()).
   *
   * - Saved file path is `${workingDir()}/${document._id}.json`. {@link InvalidIdLengthError} will be thrown if the path length exceeds the maximum length of a filepath on the device.
   *
   * @param id - _id property of a document
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
   * @throws {@link SameIdExistsError}
   *
   */
  create (
    id: string,
    document: { [key: string]: any },
    options?: PutOptions
  ): Promise<PutResult>;

  create (
    idOrDoc: string | JsonDoc,
    docOrOptions: { [key: string]: any } | PutOptions,
    options?: PutOptions
  ) {
    if (typeof idOrDoc === 'string') {
      const orgId = idOrDoc;
      const _id = this._collectionPath + orgId;
      const document = docOrOptions as { [key: string]: any };
      return this._gitDDB
        .put(_id, document, {
          ...options,
          createOrUpdate: 'create',
        })
        .then(res => {
          res.id = orgId;
          return res;
        });
    }
    else if (typeof idOrDoc === 'object') {
      if (idOrDoc._id) {
        const orgId = idOrDoc._id;
        const _id = this._collectionPath + orgId;
        const document = idOrDoc as JsonDoc;
        options = docOrOptions;
        return this._gitDDB
          .put(_id, document, {
            ...options,
            createOrUpdate: 'create',
          })
          .then(res => {
            res.id = orgId;
            return res;
          });
      }
    }
  }

  /**
   * Update a document
   *
   * @privateRemarks
   *
   * This is 'overload 1' referred to in test/update.test.ts
   *
   * @remarks
   * - Throws DocumentNotFoundError if the document does not exist. It might be better to use put() instead of update().
   *
   * - update() does not check a write permission of your file system (unlike open()).
   *
   * - Saved file path is `${workingDir()}/${document._id}.json`. {@link InvalidIdLengthError} will be thrown if the path length exceeds the maximum length of a filepath on the device.
   *
   * - A update operation is not skipped when no change occurred on a specified document.
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
   * @throws {@link DocumentNotFoundError}
   *
   */
  update (jsonDoc: JsonDoc, options?: PutOptions): Promise<PutResult>;
  /**
   * Update a document
   *
   * @privateRemarks
   *
   * This is 'overload 2' referred to in test/put.test.ts
   *
   * @remarks
   * - Throws DocumentNotFoundError if the document does not exist. It might be better to use put() instead of update().
   *
   * - update() does not check a write permission of your file system (unlike open()).
   *
   * - Saved file path is `${workingDir()}/${document._id}.json`. {@link InvalidIdLengthError} will be thrown if the path length exceeds the maximum length of a filepath on the device.
   *
   * - A update operation is not skipped when no change occurred on a specified document.
   *
   * @param id - _id property of a document
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
   * @throws {@link DocumentNotFoundError}
   *
   */
  update (
    id: string,
    document: { [key: string]: any },
    options?: PutOptions
  ): Promise<PutResult>;

  update (
    idOrDoc: string | JsonDoc,
    docOrOptions: { [key: string]: any } | PutOptions,
    options?: PutOptions
  ) {
    if (typeof idOrDoc === 'string') {
      const orgId = idOrDoc;
      const _id = this._collectionPath + orgId;
      const document = docOrOptions as { [key: string]: any };
      return this._gitDDB
        .put(_id, document, {
          ...options,
          createOrUpdate: 'update',
        })
        .then(res => {
          res.id = orgId;
          return res;
        });
    }
    else if (typeof idOrDoc === 'object') {
      if (idOrDoc._id) {
        const orgId = idOrDoc._id;
        const _id = this._collectionPath + orgId;
        const document = idOrDoc as JsonDoc;
        options = docOrOptions;
        return this._gitDDB
          .put(_id, document, {
            ...options,
            createOrUpdate: 'update',
          })
          .then(res => {
            res.id = orgId;
            return res;
          });
      }
    }
  }

  /**
   * Get a document
   *
   * @param docId - id of a target document
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
  get (docId: string, backNumber?: number): Promise<JsonDoc | undefined> {
    const _id = this._collectionPath + docId;

    return this._gitDDB.get(_id, backNumber).then(doc => {
      if (doc === undefined) {
        return undefined;
      }
      doc._id = docId;
      return doc;
    });
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
    if (typeof idOrDoc === 'string') {
      return this.remove(idOrDoc, options);
    }
    else if (typeof idOrDoc === 'object') {
      return this.remove(idOrDoc, options);
    }
    return Promise.reject(new UndefinedDocumentIdError());
  }

  /**
   * Remove a document
   *
   * @param id - id of a target document
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
  remove (id: string, options?: RemoveOptions): Promise<RemoveResult>;
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
  remove (jsonDoc: JsonDoc, options?: RemoveOptions): Promise<RemoveResult>;
  remove (idOrDoc: string | JsonDoc, options?: RemoveOptions): Promise<RemoveResult> {
    if (typeof idOrDoc === 'string') {
      const orgId = idOrDoc;
      const _id = this._collectionPath + orgId;
      return this._gitDDB.remove(_id, options).then(res => {
        res.id = orgId;
        return res;
      });
    }
    else if (typeof idOrDoc === 'object') {
      if (idOrDoc._id) {
        const orgId = idOrDoc._id;
        const _id = this._collectionPath + orgId;
        return this._gitDDB
          .remove(_id, options)
          .then(res => {
            res.id = orgId;
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
      include_docs: undefined,
      descending: undefined,
      recursive: undefined,
      prefix: undefined,
    };
    options.prefix ??= '';
    options.prefix = this._collectionPath + options.prefix;

    const docs = await this._gitDDB.allDocs(options);
    const reg = new RegExp('^' + this._collectionPath);
    docs.rows?.forEach(docWithMetadata => {
      docWithMetadata.id = docWithMetadata.id.replace(reg, '');
      if (docWithMetadata.doc) {
        docWithMetadata.doc._id = docWithMetadata.id;
      }
    });

    return docs;
  }
}
