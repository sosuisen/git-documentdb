/**
 * Type for a JSON document that is stored in a database
 *
 * @remarks A document must be a JSON Object that matches the following conditions:
 *
 * - It must have an '_id' key that shows id of a document
 *
 * - _id allows UTF-8 string excluding OS reserved filenames and following characters: \< \> : " \\ | ? * \\0
 *
 * - _id cannot start with an underscore _ and slash /.
 *
 * - Each part of path that is separated by slash cannot end with a period . (e.g. 'users/pages./items' is disallowed.)
 *
 * - Key cannot start with an underscore _.
 *
 * @example
 * ```
 * {
 *   _id: 'profile01',
 *   location: 'Sapporo',
 *   age: '16'
 * }
 * ```
 * @public
 */
export type JsonDoc = {
  [key: string]: any;
};

/**
 * Options for put()
 *
 * @remarks
 * - commit_message: internal commit message. default is 'put: path/to/the/file'
 * - collection_path: If set, specified directories are omitted from the a filepath in a document id. See {@link Collection}.
 * @public
 */
export type PutOptions = {
  commit_message?: string;
  collection_path?: string;
};

/**
 * Options for get()
 *
 * @remarks
 * - collection_path: If set, specified directories are omitted from the a filepath in a document id. See {@link Collection}.
 * @public
 */
export type GetOptions = {
  collection_path?: string;
};

/**
 * Options for remove()
 *
 * @remarks
 * - commit_message: internal commit message. default is 'remove: path/to/the/file'
 * - collection_path: If set, specified directories are omitted from the a filepath in a document id. See {@link Collection}.
 * @public
 */
export type RemoveOptions = {
  commit_message?: string;
  collection_path?: string;
};

/**
 * Options for allDocs()
 *
 * @remarks
 * - include_docs: Include the document itself in each row in the doc property. Otherwise you only get the _id and file_sha properties. Default is false.
 *
 * - descending: Sort results in rows by descendant. Default is false (ascendant).
 *
 * - sub_directory: Only get the documents under the specified sub directory.
 *
 * - recursive: Get documents recursively from all sub directories. Default is false.
 *
 * - collection_path: If set, specified directories are omitted from the a filepath in a document id. See {@link Collection}.
 *
 * @public
 */
export type AllDocsOptions = {
  include_docs?: boolean;
  descending?: boolean;
  sub_directory?: string;
  recursive?: boolean;
  collection_path?: string;
};

/**
 * Result of put()
 *
 * @remarks
 * - ok: ok shows always true. Exception is thrown when error occurs.
 *
 * - id: id of a document. (You might be confused. Underscored '_id' is used only in a {@link JsonDoc} type. In other cases, 'id' is used. This is a custom of PouchDB/CouchDB.)
 *
 * - file_sha: SHA-1 hash of Git object (40 characters)
 *
 * - commit_sha: SHA-1 hash of Git commit (40 characters)
 *
 * @public
 */
export type PutResult = {
  ok: true;
  id: string;
  file_sha: string;
  commit_sha: string;
};

/**
 * Result of remove()
 *
 * @remarks
 * - ok: ok shows always true. Exception is thrown when error occurs.
 *
 * - id: id of a document. (You might be confused. Underscored '_id' is used only in a {@link JsonDoc} type. In other cases, 'id' is used. This is a custom of PouchDB/CouchDB.)
 *
 * - file_sha: SHA-1 hash of Git blob (40 characters)
 *
 * - commit_sha: SHA-1 hash of Git commit (40 characters)
 *
 * @public
 */
export type RemoveResult = {
  ok: true;
  id: string;
  file_sha: string;
  commit_sha: string;
};

/**
 * Result of allDocs()
 *
 * @remarks
 * - total_rows: number of documents
 *
 * - commit_sha: SHA-1 hash of the last Git commit (40 characters). 'commit_sha' is undefined if total_rows equals 0.
 *
 * - rows: Array of documents. 'rows' is undefined if total_rows equals 0.
 *
 * @public
 */
export type AllDocsResult = {
  total_rows: number;
  commit_sha?: string;
  rows?: JsonDocWithMetadata[];
};

/**
 * Type for a JSON document with metadata
 *
 * @remarks
 * - id: id of a document. (You might be confused. Underscored '_id' is used only in a {@link JsonDoc} type. In other cases, 'id' is used. This is a custom of PouchDB/CouchDB.)
 *
 * - file_sha: SHA-1 hash of Git object (40 characters)
 *
 * - doc: JsonDoc which has a '_id' value. The value of 'id' and 'doc._id' are the same.
 *
 * @public
 */
export type JsonDocWithMetadata = {
  id: string;
  file_sha: string;
  doc?: JsonDoc;
};

/**
 * How to close database
 *
 * @remarks
 * - force: Clear queued operations immediately.
 *
 * - timeout: Clear queued operation after timeout(msec). Default is 10000.
 *
 * @public
 */
export type DatabaseCloseOption = {
  force?: boolean;
  timeout?: number;
};

/**
 * Abstract class for CRUD class
 *
 * @internal
 */
export abstract class AbstractDocumentDB {
  abstract workingDir (): string;
  abstract put (document: JsonDoc, options?: PutOptions): Promise<PutResult>;
  abstract get (docId: string, options?: GetOptions): Promise<JsonDoc>;
  abstract delete (
    idOrDoc: string | JsonDoc,
    options?: RemoveOptions
  ): Promise<RemoveResult>;

  abstract remove (
    idOrDoc: string | JsonDoc,
    options?: RemoveOptions
  ): Promise<RemoveResult>;

  abstract allDocs (options?: AllDocsOptions): Promise<AllDocsResult>;
}