import nodegit from 'nodegit';
import fs from 'fs-extra';
import path from 'path';

type dbOption = {
  dbName: string,
  localPath: string,
};

export class GitDocumentDB {
  private _initOptions: dbOption;
  private _currentRepository: nodegit.Repository | undefined;

  constructor(_option: dbOption) {
    this._initOptions = _option;
  }


  /**
   * Create a database or open an existing one.
   */
  open = async (): Promise<{ isNew: boolean }> => {
    const pathToRepo = path.resolve(this._initOptions.localPath, this._initOptions.dbName);
    this._currentRepository = await nodegit.Repository.open(pathToRepo).catch(err => err);
    /*
      nodegit.Repository.open() returns:
        error message if the path does not exist,
        empty Repository if the path is directory that is not a git working directory.
    */

    if (!(this._currentRepository instanceof nodegit.Repository)) {
      // console.debug(`Create new repository: ${pathToRepo}`);
      const isBare = 0;    
      this._currentRepository = await nodegit.Repository.init(pathToRepo, isBare).catch(err => { throw new Error(err) });
      return { isNew: true };
    };

    return { isNew: false };
  }

  isOpened = () => {
    return this._currentRepository === undefined ? false: true;
  }
  
  put = (doc: object) => {
    return doc;
  };

  get = (id: string) => {
    const doc = { id: 'prof01', name: 'mari'};
    return doc;
  };

  delete = (id: string) => {
    const doc = { id: 'prof01', name: 'mari' };
    return doc;
  };

  close = () => {
    if (this._currentRepository instanceof nodegit.Repository) {
      if (!this._currentRepository.isEmpty()){
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
    await fs.remove(path.resolve(this._initOptions.localPath)).catch(err => console.error(err));
    return true;
  };
}
