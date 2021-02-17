import path from "path";
import { Collection } from "./collection";
import { MAX_WINDOWS_PATH_LENGTH } from "./const";
import { InvalidDbNameCharacterError, InvalidCollectionPathCharacterError, InvalidCollectionPathLengthError, InvalidIdCharacterError, InvalidKeyLengthError, InvalidLocalDirCharacterError, InvalidPropertyNameInDocumentError, UndefinedDocumentIdError } from "./error";
import { JsonDoc } from "./types";

export class Validator {
  private _workingDirectory: string;
  constructor(_workingDir: string) {
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
   * This is an alias of maxCollectionPath().
   */
  maxCollectionNameLength() {
    return this.maxCollectionPathLength.apply(this);
  }

  /**
   * Return max length of collectionPath
   */
  maxCollectionPathLength() {
    // Suppose that collectionPath has leading and trailing slashes.
    // Trailing slash of workingDirectory is omitted.
    // Full path is `${_workingDirectory}${collectionPath}${_id}.json`
    const minIdLength = 6; // 'a.json'
    return MAX_WINDOWS_PATH_LENGTH - this._workingDirectory.length - minIdLength;
  }

  /**
   * Return max length of key
   * 
   * @remarks
   * key means `${collectionPath}${_id}`
   */
  maxKeyLength() {
    // Suppose that collectionPath has leading and trailing slashes.
    // Trailing slash of workingDirectory is omitted.
    // Full path is `${_workingDirectory}${collectionPath}${_id}.json`
    const extLength = 5; // '.json'
    return MAX_WINDOWS_PATH_LENGTH - this._workingDirectory.length - extLength;
  }


  /**
   * Return false if given name equals Windows reserved filename
   */
  testWindowsReservedFileName(name: string) {
    if (name.match(/^(CON|PRN|AUX|NUL|COM1|COM2|COM3|COM4|COM5|COM6|COM7|COM8|COM9|LPT1|LPT2|LPT3|LPT4|LPT5|LPT6|LPT7|LPT8|LPT9)$/)
      || name === '.' || name === '..') {
      return false;
    }
    return true;
  }

  /**
   * Return false if given name includes Windows invalid filename character
   */
  testWindowsInvalidFileNameCharacter(name: string, options?: { allowSlash?: boolean, allowDriveLetter?: boolean }) {
    options ??= { allowSlash: false, allowDriveLetter: false };
    options.allowSlash ??= false;
    options.allowDriveLetter ??= false;

    let regStr = `<>:"\\\|\?\*\0`;
    if (!options.allowSlash) {
      regStr += `\/`;
    }
    const regExp = new RegExp(`[${regStr}]`);

    if (options.allowDriveLetter) {
      name = name.replace(/^[a-zA-Z]:/, '');
    }

    if (name.match(regExp)) {
      return false;
    }

    // Do not end with period.
    if (name.match(/\.$/)) {
      return false;
    }
    return true;
  }


  /**
   * Validate localDir
   * 
   * @remarks
   * - localDir allows UTF-8 string excluding OS reserved filenames and following characters: < > : " | ? * \0
   * 
   * -- A colon is generally disallowed, however a drive letter followed by a colon is allowed.
   *
   * - localDir cannot end with a period .
   *
   * @throws {@link InvalidLocalDirCharacterError}
   */
  validateLocalDir(localDir: string) {
    if (!this.testWindowsReservedFileName(localDir) || !this.testWindowsInvalidFileNameCharacter(localDir, { allowSlash: true, allowDriveLetter: true })) {
      throw new InvalidLocalDirCharacterError();
    }
  }

  /**
   * Validate dbName
   * 
   * @remarks
   * - dbName allows UTF-8 string excluding OS reserved filenames and following characters: < > : " \ | ? * \0
   *
   * - dbName cannot end with a period .
   *
   * @throws {@link InvalidDbNameCharacterError}
   */
  validateDbName(dbName: string) {
    if (!this.testWindowsReservedFileName(dbName) || !this.testWindowsInvalidFileNameCharacter(dbName)) {
      throw new InvalidDbNameCharacterError();
    }
  }

  /**
   * Validate collectionPath
   * 
   * @remarks
   * - collectionPath allows UTF-8 string excluding OS reserved filenames and following characters: < > : " | ? * \0
   *
   * - Each part of collectionPath that is separated by slash cannot end with a period . (e.g. '/users./' is disallowed.)
   *
   * @throws {@link InvalidCollectionPathCharacterError}
   * @throws {@link InvalidCollectionPathLengthError}
   */
  validateCollectionPath(collectionPath: string) {
    // Add heading slash and trailing slash
    const normalized = Collection.normalizeCollectionPath(collectionPath);
    if (normalized !== '/') {
      const arr = normalized.split('/');
      arr.forEach(part => {
        if (!this.testWindowsReservedFileName(part) || !this.testWindowsInvalidFileNameCharacter(part) || part === '') {
          throw new InvalidCollectionPathCharacterError();
        }
      });
    }
    const minimumCollectionPathLength = 1; // minimum is '/'
    if (normalized.length < minimumCollectionPathLength || normalized.length > this.maxCollectionPathLength()) {
      throw new InvalidCollectionPathLengthError(normalized, minimumCollectionPathLength, this.maxCollectionPathLength());
    }
  }

  /**
   * Validate id
   * 
   * @remarks 
   * - id allows UTF-8 string excluding following characters: < > : " \ | ? * \0* 
   *
   * - id cannot start with an underscore _.
   * 
   * - id cannot end with a period .
   *
   * @throws {@link InvalidIdCharacterError}
   */
  validateId(id: string) {
    if (!this.testWindowsInvalidFileNameCharacter(id) || id.match(/^\_/)) {
      throw new InvalidIdCharacterError();
    }
  }

  /**
   * Validate key
   * 
   * @remarks 
   * key means `${collectionPath}${_id}`
   * 
   * @throws {@link InvalidIdCharacterError}
   * @throws {@link InvalidCollectionPathCharacterError}
   * @throws {@link InvalidCollectionPathLengthError}
   * @throws {@link InvalidKeyLengthError}
   */
  validateKey(key: string) {
    this.validateId(path.basename(key));
    this.validateCollectionPath(path.dirname(key));

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
   * @throws {@link UndefinedDocumentIdError}
   * @throws {@link InvalidIdCharacterError}* 
   */
  validateDocument(doc: JsonDoc) {
    if (doc._id === undefined) {
      throw new UndefinedDocumentIdError();
    }
    this.validateId(doc._id);

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