// Copyright (c) Hidekazu Kubota. This source code is licensed under the Mozilla Public License Version 2.0 found in the LICENSE file in the root directory of this source tree.

/**
 * Offline-first DocumentDB using Git
 *
 * @remarks GitDocumentDB stores a document into Git repository.
 * It is managed by PouchDB-like offline-first API.
 * A database can be synchronized with remote Git repository.
 *
 * @packageDocumentation
 */

export * from './collection';
export * from './error';
export * from './index';
export * from './types';
export * from './validator';
