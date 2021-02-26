import { UndefinedDocumentIdError } from './error';
import {
  AbstractDocumentDB,
  AllDocsOptions,
  AllDocsResult,
  CollectionPath,
  GetOptions,
  JsonDoc,
  PutOptions,
  PutResult,
  RemoveOptions,
  RemoveResult,
} from './types';
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
 *
 * // Both are completely the same.
 * gitDDB.get({ _id: '1' }, { collection_path: 'Sapporo' }); // returns { _id: '1', name: 'Yuzuki' }.
 * gitDDB.collection('Sapporo').get({ _id: '1' }); // returns { _id: '1', name: 'Yuzuki' }.
 * ```
 * @public
 */
export class Collection {
  private _collectionPath: CollectionPath = '';
  private _gitDDB: AbstractDocumentDB;

  /**
   * @throws {@link InvalidCollectionPathCharacterError}
   * @throws {@link InvalidCollectionPathLengthError}
   */
  constructor (_gitDDB: AbstractDocumentDB, _collectionPath: CollectionPath) {
    this._gitDDB = _gitDDB;
    this._collectionPath = Validator.normalizeCollectionPath(_collectionPath);
    const validator = new Validator(this._gitDDB.workingDir());
    validator.validateCollectionPath(this._collectionPath);
  }

  private _getFullPath (path: string | undefined) {
    path = Validator.normalizeCollectionPath(path);
    return this._collectionPath + path;
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
   * @param document - This is a {@link JsonDoc}, but _id property is set or overwritten by _id argument.
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
      return this._gitDDB
        .put(_id, document, options)
        .then(res => {
          res.id = orgId;
          return res;
        })
        .finally(() => {
          document._id = orgId;
        });
    }
    else if (typeof idOrDoc === 'object') {
      if (idOrDoc._id) {
        const orgId = idOrDoc._id;
        const _id = this._collectionPath + orgId;
        const document = idOrDoc as JsonDoc;
        options = docOrOptions;
        return this._gitDDB
          .put(_id, document, options)
          .then(res => {
            res.id = orgId;
            return res;
          })
          .finally(() => {
            document._id = orgId;
          });
      }
    }

    return Promise.reject(new UndefinedDocumentIdError());
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
   * @throws {@link InvalidCollectionPathCharacterError}
   * @throws {@link InvalidCollectionPathLengthError}
   */
  get (docId: string, options?: GetOptions): Promise<JsonDoc> {
    options ??= {
      collection_path: undefined,
    };
    options.collection_path = this._getFullPath(options.collection_path);

    return this._gitDDB.get(docId, options);
  }

  /**
   * This is an alias of {@link Collection.remove}
   */
  delete (idOrDoc: string | JsonDoc, options?: RemoveOptions): Promise<RemoveResult> {
    return this.remove(idOrDoc, options);
  }

  /**
   * Remove a document
   *
   * @remarks
   * - This is equivalent to call collection('/').remove().
   *
   * @param _id - id of a target document
   * @param commitMessage - Default is `remove: ${_id}`.
   *
   * @throws {@link DatabaseClosingError}
   * @throws {@link RepositoryNotOpenError}
   * @throws {@link UndefinedDocumentIdError}
   * @throws {@link DocumentNotFoundError}
   * @throws {@link CannotDeleteDataError}
   * @throws {@link InvalidIdCharacterError}
   * @throws {@link InvalidIdLengthError}
   * @throws {@link InvalidCollectionPathCharacterError}
   * @throws {@link InvalidCollectionPathLengthError}
   */
  remove (idOrDoc: string | JsonDoc, options?: RemoveOptions): Promise<RemoveResult> {
    options ??= {
      commit_message: undefined,
      collection_path: undefined,
    };
    options.collection_path = this._getFullPath(options.collection_path);

    return this._gitDDB.remove(idOrDoc, options);
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
    options ??= {
      include_docs: undefined,
      descending: undefined,
      sub_directory: undefined,
      recursive: undefined,
      collection_path: undefined,
    };
    options.collection_path = this._getFullPath(options.collection_path);

    return this._gitDDB.allDocs(options);
  }
}
