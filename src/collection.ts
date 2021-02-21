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

  collectionPath () {
    return this._collectionPath;
  }

  getFullPath (path: string | undefined) {
    path = Validator.normalizeCollectionPath(path);
    return this._collectionPath + path;
  }

  put (document: JsonDoc, options?: PutOptions): Promise<PutResult> {
    options ??= {
      commit_message: undefined,
      collection_path: undefined,
    };
    options.collection_path = this.getFullPath(options.collection_path);

    return this._gitDDB.put(document, options);
  }

  get (_id: string, options: GetOptions): Promise<JsonDoc> {
    options ??= {
      collection_path: undefined,
    };
    options.collection_path = this.getFullPath(options.collection_path);

    return this._gitDDB.get(_id, options);
  }

  delete (idOrDoc: string | JsonDoc, options: RemoveOptions): Promise<RemoveResult> {
    return this.remove(idOrDoc, options);
  }

  remove (idOrDoc: string | JsonDoc, options: RemoveOptions): Promise<RemoveResult> {
    options ??= {
      commit_message: undefined,
      collection_path: undefined,
    };
    options.collection_path = this.getFullPath(options.collection_path);

    return this._gitDDB.remove(idOrDoc, options);
  }

  allDocs (options: AllDocsOptions): Promise<AllDocsResult> {
    options ??= {
      include_docs: undefined,
      descending: undefined,
      sub_directory: undefined,
      recursive: undefined,
      collection_path: undefined,
    };
    options.collection_path = this.getFullPath(options.collection_path);

    return this._gitDDB.allDocs(options);
  }
}
