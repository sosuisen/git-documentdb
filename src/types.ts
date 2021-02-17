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
