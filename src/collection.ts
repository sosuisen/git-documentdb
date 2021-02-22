import {
  AbstractDocumentDB,
  AllDocsOptions,
  AllDocsResult,
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
  private _collectionPath = '';
  private _gitDDB: AbstractDocumentDB;

  /*
   * @throws {@link InvalidCollectionPathCharacterError}
   * @throws {@link InvalidCollectionPathLengthError}
   */
  constructor (_gitDDB: AbstractDocumentDB, _collectionPath: string) {
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
   * @param document -  See {@link JsonDoc} for restriction
   * @param commitMessage - Default is `put: ${document._id}`.
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
  put (document: JsonDoc, options?: PutOptions): Promise<PutResult> {
    options ??= {
      commit_message: undefined,
      collection_path: undefined,
    };
    options.collection_path = this._getFullPath(options.collection_path);

    return this._gitDDB.put(document, options);
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
