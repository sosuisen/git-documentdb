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

export class Collection {
  public collectionPath = '';
  public gitDDB: AbstractDocumentDB;

  /**
   * normalized collectionPath has trailing slash, no heading slash, otherwise the path is ''.
   */
  static normalizeCollectionPath (collectionPath: string | undefined) {
    if (collectionPath === undefined || collectionPath === '') {
      return '';
    }

    // Remove heading slash
    if (collectionPath.startsWith('/')) {
      collectionPath = collectionPath.slice(0, 1);
    }
    // Add trailing slash
    if (!collectionPath.endsWith('/')) {
      collectionPath += '/';
    }

    return collectionPath;
  }

  constructor (_gitDDB: AbstractDocumentDB, _collectionPath: string) {
    this.gitDDB = _gitDDB;
    this.collectionPath = Collection.normalizeCollectionPath(_collectionPath);
  }

  getFullPath (path: string | undefined) {
    path = Collection.normalizeCollectionPath(path);
    return this.collectionPath + path;
  }

  put (document: JsonDoc, options?: PutOptions): Promise<PutResult> {
    options ??= {
      commit_message: undefined,
      collection_path: undefined,
    };
    options.collection_path = this.getFullPath(options.collection_path);

    return this.gitDDB.put(document, options);
  }

  get (_id: string, options: GetOptions): Promise<JsonDoc> {
    options ??= {
      collection_path: undefined,
    };
    options.collection_path = this.getFullPath(options.collection_path);

    return this.gitDDB.get(_id, options);
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

    return this.gitDDB.remove(idOrDoc, options);
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

    return this.gitDDB.allDocs(options);
  }
}
