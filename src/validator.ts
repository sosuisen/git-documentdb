/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import { MAX_FILE_PATH_LENGTH } from './const';
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
import { CollectionPath, JsonDoc } from './types';

/**
 * @internal
 */
export class Validator {
  private _workingDirectory: string;
  constructor (_workingDir: string) {
    this._workingDirectory = _workingDir;
  }

  static byteLengthOf = (str: string) => {
    return Buffer.byteLength(str);
  };

  /**
   * Normalized collectionPath is '' or path strings that has a trailing slash and no heading slash.
   * '/' is not allowed.
   * Backslash \\ or yen ¥ is replaced with slash /.
   */
  static normalizeCollectionPath (
    collectionPath: CollectionPath | undefined
  ): CollectionPath {
    if (collectionPath === undefined || collectionPath === '') {
      return '';
    }
    collectionPath = collectionPath.replace(/\\/g, '/');
    collectionPath = collectionPath.replace(/¥/g, '/');

    // Integrate consecutive slash
    collectionPath = collectionPath.replace(/\/+/g, '/');
    if (collectionPath === '/') {
      return '';
    }

    // Remove heading slash
    if (collectionPath.startsWith('/')) {
      collectionPath = collectionPath.slice(1);
    }

    // Set only one trailing slash
    if (!collectionPath.endsWith('/')) {
      collectionPath += '/';
    }

    return collectionPath;
  }

  /**
   * Return max length of working directory path
   */
  static maxWorkingDirectoryLength () {
    // Trailing slash of workingDirectory is omitted.
    // Full path is `${_workingDirectory}/a.json`
    const minimumMemberLength = 7; // '/a.json'
    return MAX_FILE_PATH_LENGTH - minimumMemberLength;
  }

  /**
   * Return max length of collectionPath
   */
  maxCollectionPathLength () {
    // Suppose that collectionPath is normalized.
    // Trailing slash of workingDirectory is omitted.
    // Full path is `${_workingDirectory}/${collectionPath}${fileName}.json`
    const minIdLength = 6; // 'a.json'
    return MAX_FILE_PATH_LENGTH - this._workingDirectory.length - 1 - minIdLength;
  }

  /**
   * Return max length of _id
   *
   * @remarks
   * _id means `${collectionPath}/${fileName}`
   */
  maxIdLength () {
    // Suppose that collectionPath is normalized.
    // Trailing slash of workingDirectory is omitted.
    // Full path is `${_workingDirectory}/${collectionPath}${fileName}.json`
    const extLength = 5; // '.json'
    return MAX_FILE_PATH_LENGTH - this._workingDirectory.length - 1 - extLength;
  }

  /**
   * Return false if given name equals Windows reserved filename
   */
  testWindowsReservedFileName (
    name: string,
    options?: {
      allow_directory_dot?: boolean;
    }
  ) {
    options ??= {
      allow_directory_dot: undefined,
    };
    options.allow_directory_dot ??= false;

    if (
      name.match(
        /^(CON|PRN|AUX|NUL|COM1|COM2|COM3|COM4|COM5|COM6|COM7|COM8|COM9|LPT1|LPT2|LPT3|LPT4|LPT5|LPT6|LPT7|LPT8|LPT9)$/
      )
    ) {
      return false;
    }
    if (!options.allow_directory_dot && (name === '.' || name === '..')) {
      return false;
    }

    return true;
  }

  /**
   * Return false if given name includes Windows invalid filename character
   */
  testWindowsInvalidFileNameCharacter (
    name: string,
    options?: {
      allow_slash?: boolean;
      allow_drive_letter?: boolean;
      allow_directory_dot?: boolean;
    }
  ) {
    options ??= {
      allow_slash: undefined,
      allow_drive_letter: undefined,
      allow_directory_dot: undefined,
    };
    options.allow_slash ??= false;
    options.allow_drive_letter ??= false;
    options.allow_directory_dot ??= false;

    let regStr = `<>:"|?*\0`;
    if (!options.allow_slash) {
      regStr += `/`;
      regStr += `\\\\`;
      regStr += `¥`;
    }
    const regExp = new RegExp(`[${regStr}]`);

    if (options.allow_drive_letter) {
      name = name.replace(/^[A-Za-z]:/, '');
    }

    if (name.match(regExp)) {
      return false;
    }

    // Do not end with space or period.
    if (options.allow_directory_dot) {
      if (name !== '.' && name !== '..' && name.endsWith('.')) {
        return false;
      }
    }
    else if (name.endsWith('.')) {
      return false;
    }

    if (name.endsWith(' ')) {
      return false;
    }
    return true;
  }

  /**
   * Validate localDir
   *
   * @remarks
   * - A directory name allows Unicode characters excluding OS reserved filenames and following characters: \< \> : " | ? * \\0
   *
   * - A colon is generally disallowed, but a drive letter followed by a colon is allowed.
   *
   * - A directory name cannot end with a period or a white space, but the current directory . and the parent directory .. are allowed.
   *
   * - A trailing slash could be omitted.
   *
   * @throws {@link InvalidLocalDirCharacterError}
   */
  validateLocalDir (localDir: string) {
    localDir = localDir.replace(/\\/g, '/');
    localDir = localDir.replace(/¥/g, '/');

    // Integrate consecutive slash
    localDir = localDir.replace(/\/+/g, '/');

    // Remove heading and trailing slash
    if (localDir.startsWith('/')) {
      localDir = localDir.slice(1);
    }
    if (localDir.endsWith('/')) {
      localDir = localDir.slice(0, -1);
    }
    // localDir is formatted like 'a/b/c'
    const arr = localDir.split('/');
    arr.forEach(part => {
      // allowDirectoryDot
      // '/./a/b/c','a/b/c/.', 'a/b/c/./' are all valid.
      if (
        !this.testWindowsReservedFileName(part, { allow_directory_dot: true }) ||
        !this.testWindowsInvalidFileNameCharacter(part, {
          allow_drive_letter: true,
          allow_directory_dot: true,
        })
      ) {
        throw new InvalidLocalDirCharacterError(part);
      }
    });
  }

  /**
   * Validate dbName
   *
   * @remarks
   * - dbName allows Unicode characters excluding OS reserved filenames and following characters: \< \> : " ¥ / \\ | ? * \\0
   *
   * - dbName cannot end with a period or a white space.
   *
   * - dbName does not allow '.' and '..'.
   *
   * @throws {@link InvalidDbNameCharacterError}
   */
  validateDbName (dbName: string) {
    if (
      !this.testWindowsReservedFileName(dbName) ||
      !this.testWindowsInvalidFileNameCharacter(dbName)
    ) {
      throw new InvalidDbNameCharacterError(dbName);
    }
  }

  /**
   * Validate collectionPath
   *
   * @remarks
   * - A directory name allows Unicode characters excluding OS reserved filenames and following characters: \< \> : " | ? * \\0
   *
   * - A directory name cannot end with a period or a white space.
   *
   * - A directory name does not allow '.' and '..'.
   *
   * - collectionPath cannot start with a slash / or an underscore _.
   *
   * - Trailing slash could be omitted. e.g.) 'pages' and 'pages/' show the same collection.
   *
   * @throws {@link InvalidCollectionPathCharacterError}
   * @throws {@link InvalidCollectionPathLengthError}
   */
  validateCollectionPath (collectionPath: string) {
    if (collectionPath === '') {
      return;
    }

    if (collectionPath.startsWith('_')) {
      throw new InvalidCollectionPathCharacterError('_');
    }

    if (collectionPath.startsWith('/')) {
      throw new InvalidCollectionPathCharacterError('/');
    }

    const normalized = Validator.normalizeCollectionPath(collectionPath);

    const trailingSlashRemoved = normalized.slice(0, -1);
    const arr = trailingSlashRemoved.split('/');
    arr.forEach(part => {
      if (
        !this.testWindowsReservedFileName(part) ||
        !this.testWindowsInvalidFileNameCharacter(part)
      ) {
        throw new InvalidCollectionPathCharacterError(part);
      }
    });

    const minimumCollectionPathLength = 0; // minimum is ''
    if (
      Validator.byteLengthOf(normalized) < minimumCollectionPathLength ||
      Validator.byteLengthOf(normalized) > this.maxCollectionPathLength()
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
   * - file name allows Unicode characters excluding following characters: \< \> : " ¥ / \\ | ? * \\0
   *
   * - file name cannot start with an underscore _.
   *
   * @throws {@link InvalidIdCharacterError}
   */
  private _validateFileName (id: string) {
    if (!this.testWindowsInvalidFileNameCharacter(id) || id.startsWith('_')) {
      throw new InvalidIdCharacterError(id);
    }
  }

  /**
   * Validate _id
   *
   * _id = collectionPath + fileName
   *
   * @remarks
   * - _id allows Unicode characters excluding OS reserved filenames and following characters: \< \> : " | ? * \\0
   *
   * - _id cannot start with a slash and an underscore _.
   *
   * - A directory name cannot end with a period or a white space.
   *
   * - A directory name does not allow '.' and '..'.
   *
   * @throws {@link InvalidIdCharacterError}
   * @throws {@link InvalidCollectionPathCharacterError}
   * @throws {@link InvalidCollectionPathLengthError}
   * @throws {@link InvalidIdLengthError}
   */
  validateId (_id: string) {
    const baseName = path.basename(_id);
    // basename returns '' if _id is '/'.
    // basename also returns '' if _id is '\' only on Windows
    if (baseName === '') {
      throw new InvalidIdCharacterError(_id);
    }
    // basename returns a last directory name if _id ends with a slash.
    // e.g.) basename('/users/pages/') returns 'pages'.
    if (_id.endsWith('/')) {
      throw new InvalidIdCharacterError(_id);
    }

    this._validateFileName(path.basename(_id));
    const dirName = path.dirname(_id);
    // dirname returns '.' if _id does not include slashes.
    // dirname also returns '.' if _id is './xxx'
    if (dirName !== '.' || _id.startsWith('./')) {
      this.validateCollectionPath(path.dirname(_id));
    }

    // Example of a minimum _id is 'a'
    const minimumIdLength = 1;
    if (
      Validator.byteLengthOf(_id) < minimumIdLength ||
      Validator.byteLengthOf(_id) > this.maxIdLength()
    ) {
      throw new InvalidIdLengthError(_id, minimumIdLength, this.maxIdLength());
    }
  }

  /**
   * Validate document
   *
   * @remarks
   * - Key cannot start with an underscore _. (For compatibility with CouchDB/PouchDB)
   *
   * @throws {@link InvalidPropertyNameInDocumentError}
   * @throws {@link UndefinedDocumentIdError}
   * @throws {@link InvalidIdCharacterError}
   * @throws {@link InvalidIdLengthError}
   */
  validateDocument (doc: JsonDoc) {
    if (doc._id === undefined) {
      throw new UndefinedDocumentIdError();
    }
    this.validateId(doc._id);

    const reservedKeys: { [key: string]: true } = {
      _id: true,
      _deleted: true,
    };
    /**
     * NOTE: Keys which starts with underscore
     * https://docs.couchdb.org/en/latest/api/document/common.html
     *
     * const reservedKeysInResponse = {
     *  _rev: true,
     *  _attachments: true,
     *  _conflicts: true,
     *  _deleted_conflicts: true,
     *  _local_seq: true,
     *  _revs_info: true,
     *  _revisions: true,
     * };
     */
    Object.keys(doc).forEach(key => {
      if (!reservedKeys[key] && key.startsWith('_')) {
        throw new InvalidPropertyNameInDocumentError(key);
      }
    });
  }
}
