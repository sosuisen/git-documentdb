/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import nodegit from '@sosuisen/nodegit';

import { RepositoryNotOpenError, UndefinedDocumentIdError } from './error';
import {
  AllDocsOptions,
  AllDocsResult,
  CollectionPath,
  DeleteOptions,
  JsonDoc,
  PutOptions,
  PutResult,
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

  /**
   * Get collections whose path start with specified path
   *
   * @param rootPath Default is '/'.
   * @returns Collection[]
   * @throws {@link RepositoryNotOpenError}
   */
  static async getCollections (
    gitDDB: CRUDInterface & IDocumentDB,
    rootPath = '/'
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
    if (rootPath !== '/') {
      const rootEntry = await rootTree.getEntry(rootPath).catch(e => null);
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
   * Insert a document if not exists. Otherwise, update it.
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
   * Insert a document if not exists. Otherwise, update it.
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
   * Insert a document
   *
   * @privateRemarks
   *
   * This is 'overload 1' referred to in test/insert.test.ts
   *
   * @remarks
   * - Throws SameIdExistsError when a document which has the same id exists. It might be better to use put() instead of insert().
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
  insert (jsonDoc: JsonDoc, options?: PutOptions): Promise<PutResult>;
  /**
   * Insert a document
   *
   * @privateRemarks
   *
   * This is 'overload 2' referred to in test/insert.test.ts
   *
   * @remarks
   * - Throws SameIdExistsError when a document which has the same id exists. It might be better to use put() instead of insert().
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
  insert (
    id: string,
    document: { [key: string]: any },
    options?: PutOptions
  ): Promise<PutResult>;

  insert (
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
          insertOrUpdate: 'insert',
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
            insertOrUpdate: 'insert',
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
          insertOrUpdate: 'update',
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
            insertOrUpdate: 'update',
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
   * This is an alias of delete()
   */
  remove (id: string, options?: DeleteOptions): Promise<RemoveResult>;
  /**
   * This is an alias of delete()
   */
  remove (jsonDoc: JsonDoc, options?: DeleteOptions): Promise<RemoveResult>;
  remove (idOrDoc: string | JsonDoc, options?: DeleteOptions): Promise<RemoveResult> {
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
  delete (id: string, options?: DeleteOptions): Promise<RemoveResult>;
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
  delete (jsonDoc: JsonDoc, options?: DeleteOptions): Promise<RemoveResult>;
  delete (idOrDoc: string | JsonDoc, options?: DeleteOptions): Promise<RemoveResult> {
    if (typeof idOrDoc === 'string') {
      const orgId = idOrDoc;
      const _id = this._collectionPath + orgId;
      return this._gitDDB.delete(_id, options).then(res => {
        res.id = orgId;
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
