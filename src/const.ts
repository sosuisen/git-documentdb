/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

/**
 * @public
 */
export const DATABASE_CREATOR = 'GitDocumentDB';
/**
 * @public
 */
export const DATABASE_VERSION = '1.0';
/**
 * @public
 */
export const DEFAULT_COMBINE_DB_STRATEGY = 'combine-head-with-theirs';
/**
 * @public
 */
export const DEFAULT_CONFLICT_RESOLUTION_STRATEGY = 'ours-diff';
/**
 * @public
 */
export const DEFAULT_LOCAL_DIR = './git-documentdb';

/**
 * @public
 */
export const DEFAULT_LOG_LEVEL = 'info';
/**
 * @public
 */
export const DEFAULT_SYNC_INTERVAL = 30000;
/**
 * @public
 */
export const DUPLICATED_FILE_POSTFIX = '-from-';
/**
 * @public
 */
export const FILE_CREATE_TIMEOUT = 2000;
/**
 * @public
 */
export const FILE_REMOVE_TIMEOUT = 7000;
/**
 * @public
 */
export const FIRST_COMMIT_MESSAGE = 'first commit';
/**
 * @public
 */
export const GIT_DOCUMENTDB_INFO_ID = '.gitddb/info';
/**
 * @public
 */
export const GIT_DOCUMENTDB_METADATA_DIR = '.gitddb';
/**
 * @public
 */
export const JSON_POSTFIX = '.json';
/**
 * @public
 */
export const FRONT_MATTER_POSTFIX = '.md';
/**
 * @public
 */
export const YAML_POSTFIX = '.yml';
/**
 * @public
 */
export const MAX_FILE_PATH_LENGTH = 255;
/**
 * @public
 */
export const MINIMUM_SYNC_INTERVAL = 3000;
/**
 * @public
 */
export const NETWORK_RETRY = 3;
/**
 * @public
 */
export const NETWORK_RETRY_INTERVAL = 2000;
/**
 * @public
 */
export const NETWORK_TIMEOUT = 7000;
/**
 * @public
 */
export const PUT_APP_INFO_MESSAGE = 'put appinfo';
/**
 * @public
 */
export const SET_DATABASE_ID_MESSAGE = 'set database id';
/**
 * @public
 */
export const SHORT_SHA_LENGTH = 7;
