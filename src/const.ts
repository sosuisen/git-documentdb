/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

export const MAX_FILE_PATH_LENGTH = 255;
export const FILE_REMOVE_TIMEOUT = 7000;
export const SHORT_SHA_LENGTH = 7;
export const NETWORK_TIMEOUT = 7000;
export const NETWORK_RETRY = 3;
export const NETWORK_RETRY_INTERVAL = 2000;
export const DEFAULT_SYNC_INTERVAL = 30000;
export const MINIMUM_SYNC_INTERVAL = 3000;
export const DEFAULT_CONFLICT_RESOLUTION_STRATEGY = 'ours-diff';
export const DUPLICATED_FILE_POSTFIX = '-from-';
