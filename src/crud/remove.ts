import path from 'path';
import fs from 'fs-extra';
import nodegit from '@sosuisen/nodegit';
import { AbstractDocumentDB } from '../types_gitddb';
import {
  CannotDeleteDataError,
  DatabaseClosingError,
  DocumentNotFoundError,
  RepositoryNotOpenError,
  UndefinedDocumentIdError,
} from '../error';
import { JsonDoc, RemoveOptions, RemoveResult } from '../types';

/**
 * Implementation of remove()
 *
 * @internal
 */
export function removeImpl (
  this: AbstractDocumentDB,
  idOrDoc: string | JsonDoc,
  options?: RemoveOptions
): Promise<RemoveResult> {
  let _id: string;
  if (typeof idOrDoc === 'string') {
    _id = idOrDoc;
  }
  else if (idOrDoc?._id) {
    _id = idOrDoc._id;
  }
  else {
    return Promise.reject(new UndefinedDocumentIdError());
  }

  if (this.isClosing) {
    return Promise.reject(new DatabaseClosingError());
  }

  if (this.getRepository() === undefined) {
    return Promise.reject(new RepositoryNotOpenError());
  }

  try {
    this._validator.validateId(_id);
  } catch (err) {
    return Promise.reject(err);
  }

  options ??= {
    commit_message: undefined,
  };
  options.commit_message ??= `remove: ${_id}`;

  // delete() must be serial.
  return new Promise((resolve, reject) => {
    this._pushToSerialQueue(() =>
      this._remove_concurrent(_id, options!.commit_message!)
        .then((result: RemoveResult) => resolve(result))
        .catch((err: Error) => reject(err))
    );
  });
}

/**
 * Implementation of _remove_concurrent()
 *
 * @internal
 */
export async function _remove_concurrent_impl (
  this: AbstractDocumentDB,
  _id: string,
  commitMessage: string
): Promise<RemoveResult> {
  const _currentRepository = this.getRepository();

  if (_currentRepository === undefined) {
    return Promise.reject(new RepositoryNotOpenError());
  }

  let file_sha, commit_sha: string;
  const filename = _id + this.fileExt; // key starts with a slash. Remove heading slash to remove the file under the working directory
  const filePath = path.resolve(this.workingDir(), filename);

  let index;
  try {
    index = await _currentRepository.refreshIndex();
    const entry = index.getByPath(filename, 0); // https://www.nodegit.org/api/index/#STAGE
    if (entry === undefined) {
      return Promise.reject(new DocumentNotFoundError());
    }
    file_sha = entry.id.tostrS();

    await index.removeByPath(filename); // stage
    await index.write(); // flush changes to index
  } catch (err) {
    return Promise.reject(new CannotDeleteDataError(err.message));
  }

  try {
    const changes = await index.writeTree(); // get reference to a set of changes

    const author = nodegit.Signature.now(this.gitAuthor.name, this.gitAuthor.email);
    const committer = nodegit.Signature.now(this.gitAuthor.name, this.gitAuthor.email);

    const head = await nodegit.Reference.nameToId(_currentRepository, 'HEAD');
    const parent = await _currentRepository.getCommit(head as nodegit.Oid); // get the commit of HEAD
    const commit = await _currentRepository.createCommit(
      'HEAD',
      author,
      committer,
      commitMessage,
      changes,
      [parent]
    );

    commit_sha = commit.tostrS();

    await fs.remove(filePath);

    // remove parent directory recursively if empty
    const dirname = path.dirname(filename);
    const dirs = dirname.split(/[/\\¥]/);
    for (let i = 0; i < dirs.length; i++) {
      const dirpath =
        i === 0
          ? path.resolve(this.workingDir(), ...dirs)
          : path.resolve(this.workingDir(), ...dirs.slice(0, -i));
      // eslint-disable-next-line no-await-in-loop
      await fs.rmdir(dirpath).catch(e => {
        /* not empty */
      });
    }
  } catch (err) {
    return Promise.reject(new CannotDeleteDataError(err.message));
  }

  return {
    ok: true,
    id: _id,
    file_sha,
    commit_sha,
  };
}
