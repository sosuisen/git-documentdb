/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

export const DATABASE_CREATOR = 'GitDocumentDB';
export const DATABASE_VERSION = '1.0';
export const GIT_DOCUMENTDB_METADATA_DIR = '.gitddb';
export const GIT_DOCUMENTDB_INFO_ID = '.gitddb/info';
export const DEFAULT_LOCAL_DIR = './git-documentdb';

export const FIRST_COMMIT_MESSAGE = 'first commit';
export const SET_DATABASE_ID_MESSAGE = 'set database id';

export const DEFAULT_LOG_LEVEL = 'info';

export const MAX_FILE_PATH_LENGTH = 255;
export const FILE_REMOVE_TIMEOUT = 7000;
export const SHORT_SHA_LENGTH = 7;

export const NETWORK_TIMEOUT = 7000;
export const NETWORK_RETRY = 3;
export const NETWORK_RETRY_INTERVAL = 2000;
export const DEFAULT_SYNC_INTERVAL = 30000;
export const MINIMUM_SYNC_INTERVAL = 3000;
export const DEFAULT_CONFLICT_RESOLUTION_STRATEGY = 'ours-diff';
export const DEFAULT_COMBINE_DB_STRATEGY = 'combine-head-with-theirs';
export const DUPLICATED_FILE_POSTFIX = '-from-';

export const JSON_EXT = '.json';
