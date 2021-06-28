/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import { CollectionOptions, CollectionPath } from './types';
import { CRUDInterface } from './types_crud_interface';
import { SyncEventInterface } from './types_sync';

export type ICollection = CollectionInterface &
  CRUDInterface &
  SyncEventInterface & {
    /***********************************************
     * Public properties (readonly)
     ***********************************************/
    options: CollectionOptions;
    collectionPath: string;
    parent: ICollection | undefined;

    /***********************************************
     * Public methods
     ***********************************************/
    generateId(): string;
  };

export interface CollectionInterface {
  collection(collectionPath: CollectionPath, options?: CollectionOptions): ICollection;
  getCollections(dirPath: string): Promise<ICollection[]>;
}
