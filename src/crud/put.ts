import path from 'path';
import fs from 'fs-extra';
import nodegit from '@sosuisen/nodegit';
import { JsonDoc, PutOptions, PutResult } from '../types';
import { AbstractDocumentDB } from '../types_gitddb';
import {
  CannotCreateDirectoryError,
  CannotWriteDataError,
  DatabaseClosingError,
  InvalidJsonObjectError,
  RepositoryNotOpenError,
  UndefinedDocumentIdError,
} from '../error';
import { toSortedJSONString } from '../utils';

/**
 * Implementation of put()
 *
 * @internal
 */
export function putImpl (
  this: AbstractDocumentDB,
  idOrDoc: string | JsonDoc,
  docOrOptions: { [key: string]: any } | PutOptions,
  options?: PutOptions
): Promise<PutResult> {
  if (this.isClosing) {
    return Promise.reject(new DatabaseClosingError());
  }

  if (this.getRepository() === undefined) {
    return Promise.reject(new RepositoryNotOpenError());
  }

  let _id = '';
  let document: JsonDoc = {};
  if (typeof idOrDoc === 'string') {
    _id = idOrDoc;
    if (typeof docOrOptions === 'object') {
      document = docOrOptions;
    }
    else {
      return Promise.reject(new InvalidJsonObjectError());
    }
  }
  else if (typeof idOrDoc === 'object') {
    _id = idOrDoc._id;
    document = idOrDoc;
    options = docOrOptions;

    if (_id === undefined) {
      return Promise.reject(new UndefinedDocumentIdError());
    }
  }
  else {
    return Promise.reject(new UndefinedDocumentIdError());
  }

  try {
    this._validator.validateId(_id);
  } catch (err) {
    return Promise.reject(err);
  }

  let data = '';
  try {
    data = JSON.stringify(document);
  } catch (err) {
    // not json
    return Promise.reject(new InvalidJsonObjectError());
  }

  // Must clone doc before rewriting _id
  const clone = JSON.parse(data);
  // _id of JSON document in Git repository includes just a filename.
  clone._id = path.basename(_id);

  try {
    this._validator.validateDocument(clone);
  } catch (err) {
    return Promise.reject(err);
  }

  data = toSortedJSONString(clone);

  options ??= {
    commit_message: undefined,
  };

  options.commit_message ??= `put: ${_id}`;

  // put() must be serial.
  return new Promise((resolve, reject) => {
    this._pushToSerialQueue(() =>
      this._put_concurrent(_id, data, options!.commit_message!)
        .then(result => {
          resolve(result);
        })
        .catch(err => reject(err))
    );
  });
}

/**
 * Implementation of _put_concurrent()
 *
 * @internal
 */
export async function _put_concurrent_impl (
  this: AbstractDocumentDB,
  _id: string,
  data: string,
  commitMessage: string
): Promise<PutResult> {
  const _currentRepository = this.getRepository();
  if (_currentRepository === undefined) {
    return Promise.reject(new RepositoryNotOpenError());
  }

  let file_sha, commit_sha: string;
  const filename = _id + this.fileExt;
  const filePath = path.resolve(this.workingDir(), filename);
  const dir = path.dirname(filePath);

  try {
    await fs.ensureDir(dir).catch((err: Error) => {
      return Promise.reject(new CannotCreateDirectoryError(err.message));
    });
    await fs.writeFile(filePath, data);

    const index = await _currentRepository.refreshIndex(); // read latest index

    await index.addByPath(filename); // stage
    await index.write(); // flush changes to index
    const changes = await index.writeTree(); // get reference to a set of changes

    const entry = index.getByPath(filename, 0); // https://www.nodegit.org/api/index/#STAGE
    file_sha = entry.id.tostrS();

    const author = nodegit.Signature.now(this.gitAuthor.name, this.gitAuthor.email);
    const committer = nodegit.Signature.now(this.gitAuthor.name, this.gitAuthor.email);

    // Calling nameToId() for HEAD throws error when this is first commit.
    const head = await nodegit.Reference.nameToId(_currentRepository, 'HEAD').catch(
      e => false
    ); // get HEAD
    let commit;
    if (!head) {
      // First commit
      commit = await _currentRepository.createCommit(
        'HEAD',
        author,
        committer,
        commitMessage,
        changes,
        []
      );
    }
    else {
      const parent = await _currentRepository.getCommit(head as nodegit.Oid); // get the commit of HEAD
      commit = await _currentRepository.createCommit(
        'HEAD',
        author,
        committer,
        commitMessage,
        changes,
        [parent]
      );
    }
    commit_sha = commit.tostrS();
  } catch (err) {
    return Promise.reject(new CannotWriteDataError(err.message));
  }
  // console.log(commitId.tostrS());

  return {
    ok: true,
    id: _id,
    file_sha: file_sha,
    commit_sha: commit_sha,
  };
}