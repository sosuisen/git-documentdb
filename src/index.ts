import nodegit from 'nodegit';
import fs from 'fs-extra';
import path from 'path';
import { CannotCreateDirectoryError, CannotWriteDataError, UndefinedDocumentIdError, DocumentNotFoundError, InvalidJsonObjectError, InvalidKeyCharacterError, InvalidKeyLengthError, InvalidWorkingDirectoryPathLengthError, RepositoryNotOpenError } from './error';
import { MAX_LENGTH_OF_KEY, MAX_LENGTH_OF_WORKING_DIRECTORY_PATH } from './const';

const gitAuthor = {
  name: 'GitDocumentDB',
  email: 'system@gdd.localhost',
};

type dbOption = {
  dbName: string,
  localDir: string,
};

const databaseName = 'GitDocumentDB';
const databaseVersion = '1.0';
const defaultDescription = `${databaseName}: ${databaseVersion}`;

interface RepositoryInitOptions {
  description?: string;
  initialHead?: string;
  flags?: number; // https://libgit2.org/libgit2/#HEAD/type/git_repository_init_flag_t
  mode?: number; // https://libgit2.org/libgit2/#HEAD/type/git_repository_init_mode_t
  originUrl?: string;
  templatePath?: string;
  version?: number;
  workdirPath?: string;
}

const repositoryInitOptionFlags = {
  GIT_REPOSITORY_INIT_BARE: 1,
  GIT_REPOSITORY_INIT_NO_REINIT: 2,
  GIT_REPOSITORY_INIT_NO_DOTGIT_DIR: 4,
  GIT_REPOSITORY_INIT_MKDIR: 8,
  GIT_REPOSITORY_INIT_MKPATH: 16,
  GIT_REPOSITORY_INIT_EXTERNAL_TEMPLATE: 32,
  GIT_REPOSITORY_INIT_RELATIVE_GITLINK: 64,
};


/**
 * @module Class
 */
export class GitDocumentDB {
  private _initOptions: dbOption;
  private _currentRepository: nodegit.Repository | undefined;
  private _workingDirectory: string;

  /**
   * Constructor
   * @param _option
   * <pre>
   *{ 
   *  localDir: &lt;Local directory path for the databases of GitDocumentDB&gt;, 
   *  dbName: &lt;Name of a git repository&gt;
   *}
   *</pre>
   *  The git working directory will be localDir/dbName.<br>
   *  The length of the working directory path must be equal to or lesser than MAX_LENGTH_OF_WORKING_DIRECTORY_PAT(195).
   *  <br><br>
   *  GitDocumentDB can load a git repository that is not created by git-documentdb module,
   *  however correct behavior is not guaranteed.
   * @throws *InvalidWorkingDirectoryPathLengthError*
   */
  constructor(_option: dbOption) {
    this._initOptions = _option;
    // Get full-path
    this._workingDirectory = path.resolve(this._initOptions.localDir, this._initOptions.dbName);
    if (this._workingDirectory.length === 0 || this._workingDirectory.length > MAX_LENGTH_OF_WORKING_DIRECTORY_PATH) {
      throw new InvalidWorkingDirectoryPathLengthError();
    }
  }

  workingDir = () => {
    return this._workingDirectory;
  }

  /**
   * Create a repository or open an existing one.
   * If localDir does not exist, it is created.
   * @throws *CannotCreateDirectoryError* You may not have write permission.
   * @returns 
   * - isNew: Is a repository newly created or existing?<br>
   * - isCreatedByGitDDB: Is a repository created by git-documentDB or other methods?<br>
   * - isValidVersion: Is a repository version equaled to the current databaseVersion of git-documentDB?<br>
   * The version is described in .git/description.
   */
  open = async () => {

    await fs.ensureDir(this._initOptions.localDir).catch((err: Error) => { throw new CannotCreateDirectoryError(err.message); });

    const result = {
      isNew: false,
      isCreatedByGitDDB: true,
      isValidVersion: true,
    }
    /** 
     * nodegit.Repository.open() throws an error if the specified repository does not exist.
     * open() also throws an error if the path is invalid or not writable, 
     * however this case has been already checked in fs.ensureDir.
     */
    this._currentRepository = await nodegit.Repository.open(this._workingDirectory).catch(async (err) => {
      // console.debug(`Create new repository: ${pathToRepo}`);
      const isBare = 0;
      const options: RepositoryInitOptions = {
        description: defaultDescription,
        flags: repositoryInitOptionFlags.GIT_REPOSITORY_INIT_MKDIR,
        initialHead: 'main',
      };
      result.isNew = true;
      // @ts-ignore
      return await nodegit.Repository.initExt(this._workingDirectory, options).catch(err => { throw new Error(err) });
    });

    // Check git description
    const description = await fs.readFile(path.resolve(this._workingDirectory, '.git', 'description'), 'utf8')
      .catch(err => {
        result.isCreatedByGitDDB = false;
        result.isValidVersion = false;
        return '';
      });
    if ((new RegExp('^' + databaseName)).test(description)) {
      result.isCreatedByGitDDB = true;
      if ((new RegExp('^' + defaultDescription)).test(description)) {
        result.isValidVersion = true;
      }
      else {
        // console.warn('Database version is invalid.');
        result.isValidVersion = false;
      }
    }
    else {
      // console.warn('Database is not created by git-documentdb.');
      result.isCreatedByGitDDB = false;
      result.isValidVersion = false;
    }
    return result;
  }

  isOpened = () => {
    return this._currentRepository === undefined ? false : true;
  }

  /**
   * @throws *InvalidKeyCharacterError*
   * @throws *InvalidKeyLengthError* 
   */
  validateKey = (id: string) => {
    if (id.match(/[^a-zA-Z0-9_\-\.\(\)\[\]\/]/) || id.match(/\.$/)) {
      throw new InvalidKeyCharacterError();
    }
    if (id.length === 0 || id.length > MAX_LENGTH_OF_KEY) {
      throw new InvalidKeyLengthError();
    }
  }

  /**
   * put() add a set of key and its value to the database.<br>
   * <br>
   * NOTE: put() does not check a write permission of your file system (unlike open()).
   * @param document
   * A document must be a JSON Object that matches the following conditions:<br>
   * It must have an '_id' key, which value only allows **a to z, A to Z, 0 to 9, and these 8 punctuation marks _ - . / ( ) [ ]**.<br>
   * Do not use a period at the end of an '_id' value.<br>
   * A length of an '_id' value must be equal to or less than MAX_LENGTH_OF_KEY(64).
   * @returns
   * Promise that returns a commit hash (40 character SHA-1 checksum)
   * @throws *RepositoryNotOpen*
   * @throws *InvalidJsonObjectError*
   * @throws *DocumentIdNotFoundError*
   * @throws *InvalidKeyCharacterError*
   * @throws *InvalidKeyLengthError* 
   * @throws *CannotWriteDataError*
   * @throws *CannotCreateDirectoryError*
   */
  put = async (document: { [key: string]: string }) => {
    if (this._currentRepository === undefined) {
      throw new RepositoryNotOpenError();
    }

    if (document === undefined) {
      throw new InvalidJsonObjectError();
    }

    if (document['_id'] === undefined) {
      throw new UndefinedDocumentIdError();
    }

    try {
      this.validateKey(document._id);
    } catch (err) { throw err; }

    const _id = document._id;
    let data = '';
    try {
      delete document.id;
      data = JSON.stringify(document);
    } catch (err) {
      // not json
      throw new InvalidJsonObjectError();
    }

    let file_sha, commit_sha: string;
    try {
      const filePath = path.resolve(this._workingDirectory, _id);
      const dir = path.dirname(filePath);
      await fs.ensureDir(dir).catch((err: Error) => { throw new CannotCreateDirectoryError(err.message); });
      await fs.writeFile(filePath, data);

      const index = await this._currentRepository.refreshIndex(); // read latest index

      await index.addByPath(_id); // stage
      await index.write(); // flush changes to index
      const changes = await index.writeTree(); // get reference to a set of changes

      const entry = index.getByPath(_id, 0); // https://www.nodegit.org/api/index/#STAGE
      file_sha = entry.id.tostrS();

      const author = nodegit.Signature.now(gitAuthor.name, gitAuthor.email);
      const committer = nodegit.Signature.now(gitAuthor.name, gitAuthor.email);

      // Calling nameToId() for HEAD throws error when this is first commit.
      const head = await nodegit.Reference.nameToId(this._currentRepository, "HEAD").catch(e => false); // get HEAD
      let commit;
      if (!head) {
        // First commit
        commit = await this._currentRepository.createCommit('HEAD', author, committer, 'message', changes, []);
      }
      else {
        const parent = await this._currentRepository.getCommit(head as nodegit.Oid); // get the commit of HEAD
        commit = await this._currentRepository.createCommit('HEAD', author, committer, 'message', changes, [parent]);
      }
      commit_sha = commit.tostrS();
    } catch (err) {
      throw new CannotWriteDataError(err.message);
    }
    // console.log(commitId.tostrS());
    return { _id: _id, file_sha: file_sha, commit_sha: commit_sha };

  }

  /**
   * 
   * @param _id 
   * @throw *RepositoryNotOpenError*
   * @throw *DocumentIdNotFoundError* 
   * @throw *DocumentNotFoundError*
   * @throw *InvalidJsonObjectError*
   */
  get = async (_id: string) => {
    if (this._currentRepository === undefined) {
      throw new RepositoryNotOpenError();
    }

    if (_id === undefined) {
      throw new UndefinedDocumentIdError();
    }

    // Calling nameToId() for HEAD throws error when this is first commit.
    const head = await nodegit.Reference.nameToId(this._currentRepository, "HEAD").catch(e => false); // get HEAD
    let document;
    if (!head) {
      throw new DocumentNotFoundError();
    }
    else {
      const commit = await this._currentRepository.getCommit(head as nodegit.Oid); // get the commit of HEAD
      const entry = await commit.getEntry(_id);
      if (entry) {
        const blob = await entry.getBlob();
        try {
          document = JSON.parse(blob.toString());
          document['_id'] = _id;
        } catch (e) {
          throw new InvalidJsonObjectError();
        }
      }
      else {
        throw new DocumentNotFoundError();
      }
    }
    return document;
  };

  delete = async (_id: string) => {
    const doc = { _id: 'prof01', name: 'mari' };
    return Promise.resolve(doc);
  };

  close = () => {
    if (this._currentRepository instanceof nodegit.Repository) {
      if (this._currentRepository.free !== undefined) {
        console.log('Repository.free() is executed in close()');
        this._currentRepository.free();
      }
      this._currentRepository = undefined;
    }
    return true;
  };

  destroy = async () => {
    if (this._currentRepository !== undefined) {
      this.close();
    }

    // If the path does not exists, silently does nothing
    await fs.remove(path.resolve(this._initOptions.localDir)).catch(err => console.error(err));
    return true;
  };
}
