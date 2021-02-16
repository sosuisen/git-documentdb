import path from "path";
import { Collection } from "./collection";
import { MAX_WINDOWS_PATH_LENGTH } from "./const";
import { InvalidDirpathCharacterError, InvalidDirpathLengthError, InvalidIdCharacterError, InvalidKeyLengthError } from "./main";

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
   * Validate dirpath
   * 
   * @remarks
   * - dirpath only allows **a to z, A to Z, 0 to 9, and these 8 punctuation marks _ - . / ( ) [ ]**.
   *
   * - dirpath cannot end with a period . (For compatibility with the file system of Windows)
   *
   *  - A length of an dirpath value must be equal to or less than MAX_LENGTH_OF_KEY(64).
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
   * - '_id' cannot start with an underscore _. (For compatibility with PouchDB and CouchDB)
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


}