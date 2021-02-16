import path from "path";
import { Collection } from "./collection";
import { MAX_WINDOWS_PATH_LENGTH } from "./const";
import { InvalidDbNameCharacterError, InvalidDirpathCharacterError, InvalidDirpathLengthError, InvalidIdCharacterError, InvalidKeyLengthError, InvalidLocalDirCharacterError, InvalidPropertyNameInDocumentError } from "./error";
import { JsonDoc } from "./types";

export class Validator {
  private _workingDirectory: string;
  constructor(_workingDir: string){
    this._workingDirectory = _workingDir;
  }

  /**
   * Return max length of working directory path
   */
  static maxWorkingDirectoryLength() {
    // Trailing slash of workingDirectory is omitted.
    // Minimum path is `${_workingDirectory}/a.json`
    const minimumMemberLength = 7; // '/a.json'
    return MAX_WINDOWS_PATH_LENGTH - minimumMemberLength;
  }
  
  /**
   * Return max length of collectionName
   * 
   * @remarks
   * This is an alias of maxDirpath().
   */
  maxCollectionNameLength() {
    return this.maxDirpathLength.apply(this);
  }
  
  /**
   * Return max length of dirpath
   */
  maxDirpathLength() {
    // Suppose that dirpath has leading and trailing slashes.
    // Trailing slash of workingDirectory is omitted.
    // Full path is `${_workingDirectory}${dirpath}${_id}.json`
    const minIdLength = 6; // 'a.json'
    return MAX_WINDOWS_PATH_LENGTH - this._workingDirectory.length - minIdLength;
  }

  /**
   * Return max length of key
   * 
   * @remarks
   * key means `${dirpath}${_id}`
   */
  maxKeyLength() {
    // Suppose that dirpath has leading and trailing slashes.
    // Trailing slash of workingDirectory is omitted.
    // Full path is `${_workingDirectory}${dirpath}${_id}.json`
    const extLength = 5; // '.json'
    return MAX_WINDOWS_PATH_LENGTH - this._workingDirectory.length - extLength;
  }

  /**
   * Validate localDir
   * 
   * @remarks
   * - localDir cannot end with a period . (For compatibility with the file system of Windows)
   *
   * @throws {@link InvalidDbNameCharacterError}
   */
  validateLocalDir(localDir: string) {
    if (localDir.match(/\.$/)) {
      throw new InvalidLocalDirCharacterError();
    }
  }
  /**
   * Validate dbName
   * 
   * @remarks
   * - dbName allows UTF-8 characters excluding 
   * - dbName disallows slash / characters.
   *
   * - dbName cannot end with a period . (For compatibility with the file system of Windows)
   *
   * @throws {@link InvalidDbNameCharacterError}
   */
  validateDbName(dbName: string) {
    if (dbName.match(/\//) || dbName.match(/\.$/)) {
      throw new InvalidDbNameCharacterError();
    }
  }

  /**
   * Validate dirpath
   * 
   * @remarks
   * - dirpath only allows **a to z, A to Z, 0 to 9, and these 8 punctuation marks _ - . / ( ) [ ]**.
   *
   * - dirpath cannot end with a period . (For compatibility with the file system of Windows)
   *
   * @throws {@link InvalidDirpathCharacterError}
   * @throws {@link InvalidDirpathLengthError}
   */
   validateDirpath(dirpath: string) {
    const normalized = Collection.normalizeDirpath(dirpath);
    if (normalized.match(/[^a-zA-Z0-9_\-\.\(\)\[\]\/]/) || normalized.match(/\.$/)) {
      throw new InvalidDirpathCharacterError();
    }
    const minimumDirPathLength = 1; // minimum is '/'
    if(normalized.length < minimumDirPathLength || normalized.length > this.maxDirpathLength()) {
      throw new InvalidDirpathLengthError(normalized, minimumDirPathLength, this.maxDirpathLength());
    }
  }

  /**
   * Validate id
   * 
   * @remarks 
   * - '_id' only allows **a to z, A to Z, 0 to 9, and these 8 punctuation marks _ - . ( ) [ ]**.
   *
   * - '_id' cannot start with an underscore _. (For compatibility with CouchDB/PouchDB)
   * 
   * - '_id' cannot end with a period . (For compatibility with the file system of Windows)
   *
   * @throws {@link InvalidIdCharacterError}
   */
  validateId(id: string) {
    if (id.match(/[^a-zA-Z0-9_\-\.\(\)\[\]]/) || id.match(/\.$/) || id.match(/^\_/)) {
      throw new InvalidIdCharacterError();
    }
  }

  /**
   * Validate key
   * 
   * @remarks 
   * key means `${dirpath}${_id}`
   * 
   * @throws {@link InvalidIdCharacterError}
   * @throws {@link InvalidDirpathCharacterError}
   * @throws {@link InvalidDirpathLengthError}
   * @throws {@link InvalidKeyLengthError}
   */
   validateKey(key: string) {
    this.validateId(path.basename(key));
    this.validateDirpath(path.dirname(key));

    // Example of a minimum key is '/a'
    const minimumKeyLength = 2;
    if (key.length < minimumKeyLength || key.length > this.maxKeyLength()) {
      throw new InvalidKeyLengthError(key, minimumKeyLength, this.maxKeyLength());
    }
  }

  /**
   * Validate document
   * 
   * @remarks
   * - A property name cannot start with an underscore _. (For compatibility with CouchDB/PouchDB)
   * 
   * @throws {@link InvalidPropertyNameInDocumentError}
   */
  validateDocument(doc: JsonDoc) {
    const reservedKeys: { [key: string]: true } = {
      _id: true,
    };
    /**
     * NOTE: Keys which starts with underscore
     * https://docs.couchdb.org/en/latest/api/document/common.html
     *
     * const reservedKeysInResponse = {
     *  _rev: true,
     *  _attachments: true,
     *  _deleted: true,      
     *  _conflicts: true,
     *  _deleted_conflicts: true,
     *  _local_seq: true,
     *  _revs_info: true,
     *  _revisions: true,
     * };
     */
    Object.keys(doc).forEach(key => {
      if (!reservedKeys[key] && key.startsWith('_')) {
        throw new InvalidPropertyNameInDocumentError();
      } 
    })
  }


}