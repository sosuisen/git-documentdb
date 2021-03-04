import nodegit from '@sosuisen/nodegit';
import {
  AllDocsOptions,
  AllDocsResult,
  JsonDoc,
  PutOptions,
  PutResult,
  RemoveOptions,
  RemoveResult,
} from './types';
import { Validator } from './validator';

/**
 * Interface for GitDocumentDB CRUD
 *
 * @internal
 */
export interface CRUDInterface {
  put(jsonDoc: JsonDoc, options?: PutOptions): Promise<PutResult>;
  put(
    _id: string,
    document: { [key: string]: any },
    options?: PutOptions
  ): Promise<PutResult>;

  get(docId: string): Promise<JsonDoc>;
  delete(id: string, options?: RemoveOptions): Promise<RemoveResult>;
  delete(jsonDoc: JsonDoc, options?: RemoveOptions): Promise<RemoveResult>;

  remove(id: string, options?: RemoveOptions): Promise<RemoveResult>;
  remove(jsonDoc: JsonDoc, options?: RemoveOptions): Promise<RemoveResult>;

  allDocs(options?: AllDocsOptions): Promise<AllDocsResult>;
}

/**
 * Abstract class for GitDocumentDB body
 *
 * @internal
 */
export abstract class AbstractDocumentDB {
  abstract fileExt: string;
  abstract gitAuthor: {
    name: string;
    email: string;
  };

  abstract workingDir (): string;
  abstract isClosing: boolean;
  abstract getRepository (): nodegit.Repository | undefined;
  abstract _validator: Validator;
  abstract _pushToTaskQueue (func: () => Promise<void>): void;
  abstract _put_concurrent (
    _id: string,
    data: string,
    commitMessage: string
  ): Promise<PutResult>;

  abstract _remove_concurrent (_id: string, commitMessage: string): Promise<RemoveResult>;
}
