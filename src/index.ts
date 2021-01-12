import nodegit from 'nodegit';
import fs from 'fs-extra';
import path from 'path';
import { CannotCreateDirectoryError } from './error';

const gitAuthor = {
  name: 'GitDocumentDB',
  email: 'system@gdd.localhost',
};

type dbOption = {
  dbName: string,
  localDir: string,
};

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

  constructor(_option: dbOption) {
    this._initOptions = _option;
    this._workingDirectory = path.resolve(this._initOptions.localDir, this._initOptions.dbName);
  }


  /**
   * Create a database or open an existing one.
   * If localDir does not exist, it is created.
   * @throws CannotCreateDirectoryError 
   */
  open = async (): Promise<{ isNew: boolean }> => {
    await fs.ensureDir(this._initOptions.localDir).catch((err:Error) => { throw new CannotCreateDirectoryError();});

    this._currentRepository = await nodegit.Repository.open(this._workingDirectory).catch(err => err);
    /*
      nodegit.Repository.open() returns:
        error message if the path does not exist,
        empty Repository if the path is directory that is not a git working directory.
    */
    if (!(this._currentRepository instanceof nodegit.Repository)) {
      // console.debug(`Create new repository: ${pathToRepo}`);
      const isBare = 0;
      const options: RepositoryInitOptions = {
        flags: repositoryInitOptionFlags.GIT_REPOSITORY_INIT_MKDIR,
        initialHead: 'main',
      };
      // @ts-ignore
      this._currentRepository = await nodegit.Repository.initExt(this._workingDirectory, options).catch(err => { throw new Error(err) });
      return { isNew: true };
    };

    return { isNew: false };
  }

  isOpened = () => {
    return this._currentRepository === undefined ? false : true;
  }

  put = async (doc: { [key: string]: string }) => {
    if (this._currentRepository === undefined) {
      throw new Error('Repository is closed');
    }
    if (doc['id'] === undefined) {
      throw new Error('id not exists');
    }
    else {
      const filePath = path.resolve(this._workingDirectory, doc.id);
      await fs.writeFile(filePath, JSON.stringify(doc));

      const index = await this._currentRepository.refreshIndex(); // read latest index

      await index.addByPath(doc.id); // stage
      await index.write(); // flush changes to index
      const changes = await index.writeTree(); // get reference to a set of changes

      const author = nodegit.Signature.now(gitAuthor.name, gitAuthor.email);
      const committer = nodegit.Signature.now(gitAuthor.name, gitAuthor.email);

      // Calling nameToId() for HEAD throws error when this is first commit.
      const head = await nodegit.Reference.nameToId(this._currentRepository, "HEAD").catch(e => false); // get HEAD
      let commitId;
      if (!head) {
        // First commit
        commitId = await this._currentRepository.createCommit('HEAD', author, committer, 'message', changes, []);
      }
      else {
        const parent = await this._currentRepository.getCommit(head as nodegit.Oid); // get the commit of HEAD
        commitId = await this._currentRepository.createCommit('HEAD', author, committer, 'message', changes, [parent]);
      }
      // console.log(commitId.tostrS());
      return commitId.tostrS();
    }
  }

  get = (id: string) => {
    const doc = { id: 'prof01', name: 'mari' };
    return doc;
  };

  delete = (id: string) => {
    const doc = { id: 'prof01', name: 'mari' };
    return doc;
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
