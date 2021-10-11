/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import Blob from 'cross-blob';
import { MAX_FILE_PATH_LENGTH } from './const';
import { Err } from './error';
import { CollectionPath, JsonDoc } from './types';

/**
 * Validator Class
 *
 * @public
 */
export class Validator {
  private _workingDirectory: string;
  constructor (workingDir: string) {
    this._workingDirectory = workingDir;
  }

  static byteLengthOf = (str: string) => {
    return new Blob([str], { type: 'text/plain' }).size;
  };

  /**
   * Normalized collectionPath is '' or path strings that have a trailing slash and no heading slash.
   * Root ('/') is not allowed.
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
   * Return the max length of working directory path
   */
  static maxWorkingDirectoryLength () {
    // Trailing slash of workingDirectory is omitted.
    // Full path is `${_workingDirectory}/a.json`
    // Don't care about '.md' for simplicity.
    const minimumMemberLength = 7; // '/a.json'
    return MAX_FILE_PATH_LENGTH - minimumMemberLength;
  }

  /**
   * Return the max length of collectionPath
   */
  maxCollectionPathLength () {
    // Suppose that collectionPath is normalized.
    // Trailing slash of workingDirectory is omitted.
    // Full path is `${_workingDirectory}/${collectionPath}${shortId}.json`
    // Don't care about '.md' for simplicity.
    const minIdLength = 6; // 'a.json'
    return MAX_FILE_PATH_LENGTH - this._workingDirectory.length - 1 - minIdLength;
  }

  /**
   * Return the max length of _id
   *
   * @remarks
   * _id means `${collectionPath}/${shortId}`
   */
  maxIdLength () {
    // Suppose that collectionPath is normalized.
    // Trailing slash of workingDirectory is omitted.
    // Full path is `${_workingDirectory}/${collectionPath}${shortId}.json`
    // Don't care about '.md' for simplicity.
    const extLength = 5; // '.json'
    return MAX_FILE_PATH_LENGTH - this._workingDirectory.length - 1 - extLength;
  }

  /**
   * Return false if the given name equals Windows reserved filename
   */
  testWindowsReservedFileName (
    name: string,
    options?: {
      allowDirectoryDot?: boolean;
    }
  ) {
    options ??= {
      allowDirectoryDot: undefined,
    };
    options.allowDirectoryDot ??= false;

    if (
      name.match(
        /^(CON|PRN|AUX|NUL|COM1|COM2|COM3|COM4|COM5|COM6|COM7|COM8|COM9|LPT1|LPT2|LPT3|LPT4|LPT5|LPT6|LPT7|LPT8|LPT9)$/
      )
    ) {
      return false;
    }
    if (!options.allowDirectoryDot && (name === '.' || name === '..')) {
      return false;
    }

    return true;
  }

  /**
   * Return false if the given name includes Windows invalid filename character
   */
  // eslint-disable-next-line complexity
  testWindowsInvalidFileNameCharacter (
    name: string,
    options?: {
      allowSlash?: boolean;
      allowDriveLetter?: boolean;
      allowDirectoryDot?: boolean;
      allowDot?: boolean;
      allowLastSpace?: boolean;
    }
  ) {
    options ??= {
      allowSlash: undefined,
      allowDriveLetter: undefined,
      allowDirectoryDot: undefined,
      allowDot: undefined,
      allowLastSpace: undefined,
    };
    options.allowSlash ??= false;
    options.allowDriveLetter ??= false;
    options.allowDirectoryDot ??= false;
    options.allowDot ??= false;
    options.allowLastSpace ??= false;

    let regStr = `<>:"|?*\0`;
    if (!options.allowSlash) {
      regStr += `/`;
      regStr += `\\\\`;
      regStr += `¥`;
    }
    const regExp = new RegExp(`[${regStr}]`);

    if (options.allowDriveLetter) {
      name = name.replace(/^[A-Za-z]:/, '');
    }

    if (name.match(regExp)) {
      return false;
    }

    // Do not end with space or period.
    if (options.allowDot) {
      // nop
    }
    else if (options.allowDirectoryDot) {
      if (name !== '.' && name !== '..' && name.endsWith('.')) {
        return false;
      }
    }
    else if (name.endsWith('.')) {
      return false;
    }

    if (!options.allowLastSpace && name.endsWith(' ')) {
      return false;
    }
    return true;
  }

  /**
   * Validate localDir
   *
   * @remarks
   *```
   * - A directory name allows Unicode characters except for OS reserved filenames and the following characters: \< \> : " | ? * \\0
   * - A colon is generally disallowed, but a drive letter followed by a colon is allowed.
   * - A directory name cannot end with a period or a white space but the current directory . and the parent directory .. are allowed.
   * - A trailing slash could be omitted.
   *```
   * @throws {@link Err.InvalidLocalDirCharacterError}
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
        !this.testWindowsReservedFileName(part, { allowDirectoryDot: true }) ||
        !this.testWindowsInvalidFileNameCharacter(part, {
          allowDriveLetter: true,
          allowDirectoryDot: true,
        })
      ) {
        throw new Err.InvalidLocalDirCharacterError(part);
      }
    });
  }

  /**
   * Validate dbName
   *
   * @remarks
   *```
   * - dbName allows Unicode characters except for OS reserved filenames and the following characters: \< \> : " ¥ / \\ | ? * \\0
   * - dbName cannot end with a period or a white space.
   * - dbName does not allow '.' and '..'.
   *```
   * @throws {@link Err.InvalidDbNameCharacterError}
   */
  validateDbName (dbName: string) {
    if (
      !this.testWindowsReservedFileName(dbName) ||
      !this.testWindowsInvalidFileNameCharacter(dbName)
    ) {
      throw new Err.InvalidDbNameCharacterError(dbName);
    }
  }

  /**
   * Validate collectionPath
   *
   * @remarks CollectionPath must be NULL string or paths that match the following conditions:
   *```
   * - CollectionPath can include paths separated by slashes.
   * - A directory name in paths allows Unicode characters except for OS reserved filenames and the following characters: \< \> : " | ? * \\0
   * - **It is recommended to use ASCII characters and case-insensitive names for cross-platform.**
   * - A directory name in paths cannot end with a period or a white space.
   * - A directory name in paths does not allow '.' and '..'.
   * - CollectionPath cannot start with a slash.
   * - Trailing slash could be omitted. e.g.) 'pages' and 'pages/' show the same CollectionPath.
   *```
   *
   * @throws {@link Err.InvalidCollectionPathCharacterError}
   * @throws {@link Err.InvalidCollectionPathLengthError}
   */
  validateCollectionPath (collectionPath: string) {
    if (collectionPath === '') {
      return;
    }

    if (collectionPath.startsWith('/')) {
      throw new Err.InvalidCollectionPathCharacterError('/');
    }

    const normalized = Validator.normalizeCollectionPath(collectionPath);

    const trailingSlashRemoved = normalized.slice(0, -1);
    const arr = trailingSlashRemoved.split('/');
    arr.forEach(part => {
      if (
        !this.testWindowsReservedFileName(part) ||
        !this.testWindowsInvalidFileNameCharacter(part)
      ) {
        throw new Err.InvalidCollectionPathCharacterError(part);
      }
    });

    const minimumCollectionPathLength = 0; // minimum is ''
    if (
      Validator.byteLengthOf(normalized) < minimumCollectionPathLength ||
      Validator.byteLengthOf(normalized) > this.maxCollectionPathLength()
    ) {
      throw new Err.InvalidCollectionPathLengthError(
        normalized,
        minimumCollectionPathLength,
        this.maxCollectionPathLength()
      );
    }
  }

  /**
   * Validate _id
   *
   * _id = collectionPath + shortId (not including postfix '.json')
   *
   * @remarks Spec of _id is described at {@link JsonDoc}.
   * @throws {@link Err.InvalidIdCharacterError}
   * @throws {@link Err.InvalidCollectionPathCharacterError}
   * @throws {@link Err.InvalidCollectionPathLengthError}
   * @throws {@link Err.InvalidIdLengthError}
   */
  validateId (_id: string) {
    const baseName = path.basename(_id);
    // basename returns '' if _id is '/'.
    // basename also returns '' if _id is '\' only on Windows
    if (baseName === '') {
      throw new Err.InvalidIdCharacterError(_id);
    }
    // basename returns a last directory name if _id ends with a slash.
    // e.g.) basename('/users/pages/') returns 'pages'.
    if (_id.endsWith('/')) {
      throw new Err.InvalidIdCharacterError(_id);
    }

    if (
      !this.testWindowsInvalidFileNameCharacter(baseName, {
        allowDot: true,
        allowLastSpace: true,
      })
    ) {
      throw new Err.InvalidIdCharacterError(_id);
    }

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
      throw new Err.InvalidIdLengthError(_id, minimumIdLength, this.maxIdLength());
    }
  }

  /**
   * Validate document
   *
   * @throws {@link Err.UndefinedDocumentIdError}
   * @throws {@link Err.InvalidIdCharacterError}
   * @throws {@link Err.InvalidIdLengthError}
   */
  validateDocument (doc: JsonDoc) {
    if (doc._id === undefined) {
      throw new Err.UndefinedDocumentIdError();
    }
    this.validateId(doc._id);
  }
}
