/**
 * Type for a JSON document
 *
 * @remarks A document must be a JSON Object that matches the following conditions:
 *
 * - It must have an '_id' key
 *
 * -- '_id' only allows **a to z, A to Z, 0 to 9, and these 8 punctuation marks _ - . ( ) [ ]**.
 *
 * -- '_id' cannot start with an underscore _. (For compatibility with CouchDB/PouchDB)
 *
 * -- '_id' cannot end with a period . (For compatibility with the file system of Windows)
 *
 * - A property name cannot start with an underscore _. (For compatibility with CouchDB/PouchDB)
 *
 * @beta
 */
export type JsonDoc = {
  [key: string]: any;
};

/**
 * Options for put()
 */
export type PutOptions = {
  commit_message?: string;
  collection_path?: string;
};

/**
 * Options for get()
 */
export type GetOptions = {
  collection_path?: string;
};

/**
 * Options for remove()
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
 * @beta
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
 * - id: id of a document
 *
 * - file_sha: SHA-1 hash of Git object (40 characters)
 *
 * - commit_sha: SHA-1 hash of Git commit (40 characters)
 *
 * @beta
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
 * - _id: id of a document
 *
 * - file_sha: SHA-1 hash of Git blob (40 characters)
 *
 * - commit_sha: SHA-1 hash of Git commit (40 characters)
 *
 * @beta
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
 * @beta
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
 * - _id: id of a document
 *
 * - file_sha: SHA-1 hash of Git object (40 characters)
 *
 * - doc: JsonDoc
 *
 * @beta
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
 *  @beta
 */
export type DatabaseCloseOption = {
  force?: boolean;
  timeout?: number;
};

/**
 * Abstract class for CRUD class
 */
export abstract class AbstractDocumentDB {
  abstract workingDir (): string;
  abstract put (document: JsonDoc, options?: PutOptions): Promise<PutResult>;
  abstract get (_id: string, options?: GetOptions): Promise<JsonDoc>;
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
