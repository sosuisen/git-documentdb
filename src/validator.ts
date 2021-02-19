import path from 'path';
import { Collection } from './collection';
import { MAX_WINDOWS_PATH_LENGTH } from './const';
import {
  InvalidCollectionPathCharacterError,
  InvalidCollectionPathLengthError,
  InvalidDbNameCharacterError,
  InvalidIdCharacterError,
  InvalidIdLengthError,
  InvalidLocalDirCharacterError,
  InvalidPropertyNameInDocumentError,
  UndefinedDocumentIdError,
} from './error';
import { JsonDoc } from './types';

export class Validator {
  private _workingDirectory: string;
  constructor (_workingDir: string) {
    this._workingDirectory = _workingDir;
  }

  /**
   * Return max length of working directory path
   */
  static maxWorkingDirectoryLength () {
    // Trailing slash of workingDirectory is omitted.
    // Minimum path is `${_workingDirectory}/a.json`
    const minimumMemberLength = 7; // '/a.json'
    return MAX_WINDOWS_PATH_LENGTH - minimumMemberLength;
  }

  /**
   * Return max length of collectionPath
   */
  maxCollectionPathLength () {
    // Suppose that collectionPath is normalized (slashes on both ends are removed).
    // Trailing slash of workingDirectory is omitted.
    // Full path is `${_workingDirectory}/${collectionPath}/${fileName}.json`
    const minIdLength = 6; // 'a.json'
    return MAX_WINDOWS_PATH_LENGTH - this._workingDirectory.length - 2 - minIdLength;
  }

  /**
   * Return max length of _id
   *
   * @remarks
   * _id means `${collectionPath}/${fileName}`
   */
  maxIdLength () {
    // Suppose that collectionPath is normalized (slashes on both ends are removed).
    // Trailing slash of workingDirectory is omitted.
    // Full path is `${_workingDirectory}/${collectionPath}/${fileName}.json`
    const extLength = 5; // '.json'
    return MAX_WINDOWS_PATH_LENGTH - this._workingDirectory.length - 1 - extLength;
  }

  /**
   * Return false if given name equals Windows reserved filename
   */
  testWindowsReservedFileName (name: string) {
    if (
      name.match(
        /^(CON|PRN|AUX|NUL|COM1|COM2|COM3|COM4|COM5|COM6|COM7|COM8|COM9|LPT1|LPT2|LPT3|LPT4|LPT5|LPT6|LPT7|LPT8|LPT9)$/
      ) ||
      name === '.' ||
      name === '..'
    ) {
      return false;
    }
    return true;
  }

  /**
   * Return false if given name includes Windows invalid filename character
   */
  testWindowsInvalidFileNameCharacter (
    name: string,
    options?: { allowSlash?: boolean; allowDriveLetter?: boolean }
  ) {
    options ??= { allowSlash: false, allowDriveLetter: false };
    options.allowSlash ??= false;
    options.allowDriveLetter ??= false;

    let regStr = `<>:"\\|?*\0`;
    if (!options.allowSlash) {
      regStr += `/`;
    }
    const regExp = new RegExp(`[${regStr}]`);

    if (options.allowDriveLetter) {
      name = name.replace(/^[A-Za-z]:/, '');
    }

    if (name.match(regExp)) {
      return false;
    }

    // Do not end with period.
    if (name.endsWith('.')) {
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
  validateLocalDir (localDir: string) {
    if (
      !this.testWindowsReservedFileName(localDir) ||
      !this.testWindowsInvalidFileNameCharacter(localDir, {
        allowSlash: true,
        allowDriveLetter: true,
      })
    ) {
      throw new InvalidLocalDirCharacterError();
    }
  }

  /**
   * Validate dbName
   *
   * @remarks
   * - dbName allows UTF-8 string excluding OS reserved filenames and following characters: < > : " / \ | ? * \0
   *
   * - dbName cannot end with a period .
   *
   * @throws {@link InvalidDbNameCharacterError}
   */
  validateDbName (dbName: string) {
    if (
      !this.testWindowsReservedFileName(dbName) ||
      !this.testWindowsInvalidFileNameCharacter(dbName)
    ) {
      throw new InvalidDbNameCharacterError();
    }
  }

  /**
   * Validate collectionPath
   *
   * @remarks
   * - collectionPath allows UTF-8 string excluding OS reserved filenames and following characters: < > : " \ | ? * \0
   *
   * - Cannot start with slash. Trailing slash could be omitted. e.g. 'pages' and 'pages/' show the same collection.
   *
   * - Each part of collectionPath that is separated by slash cannot end with a period . (e.g. '/users./' is disallowed.)
   *
   * @throws {@link InvalidCollectionPathCharacterError}
   * @throws {@link InvalidCollectionPathLengthError}
   */
  validateCollectionPath (collectionPath: string) {
    if (collectionPath.startsWith('/')) {
      throw new InvalidCollectionPathCharacterError();
    }
    // Add trailing slash
    const normalized = Collection.normalizeCollectionPath(collectionPath);
    if (normalized !== '/') {
      const arr = normalized.split('/');
      arr.forEach(part => {
        if (
          !this.testWindowsReservedFileName(part) ||
          !this.testWindowsInvalidFileNameCharacter(part) ||
          part === ''
        ) {
          throw new InvalidCollectionPathCharacterError();
        }
      });
    }
    const minimumCollectionPathLength = 1; // minimum is '/'
    if (
      normalized.length < minimumCollectionPathLength ||
      normalized.length > this.maxCollectionPathLength()
    ) {
      throw new InvalidCollectionPathLengthError(
        normalized,
        minimumCollectionPathLength,
        this.maxCollectionPathLength()
      );
    }
  }

  /**
   * Validate file name
   *
   * @remarks
   * - file name allows UTF-8 string excluding following characters: < > : " / \ | ? * \0a
   *
   * - file name cannot start with an underscore _.
   *
   * - file name cannot end with a period .
   *
   * @throws {@link InvalidIdCharacterError}
   */
  private _validateFileName (id: string) {
    if (!this.testWindowsInvalidFileNameCharacter(id) || id.startsWith('_')) {
      throw new InvalidIdCharacterError();
    }
  }

  /**
   * Validate _id
   *
   * @throws {@link InvalidIdCharacterError}
   * @throws {@link InvalidCollectionPathCharacterError}
   * @throws {@link InvalidCollectionPathLengthError}
   * @throws {@link InvalidKeyLengthError}
   */
  validateId (key: string) {
    this._validateFileName(path.basename(key));
    this.validateCollectionPath(path.dirname(key));

    // Example of a minimum _id is 'a'
    const minimumIdLength = 1;
    if (key.length < minimumIdLength || key.length > this.maxIdLength()) {
      throw new InvalidIdLengthError(key, minimumIdLength, this.maxIdLength());
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
  validateDocument (doc: JsonDoc) {
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
    });
  }
}
