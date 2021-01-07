
export class GitDocumentDB {

  /**
   * Create a database of opens an existing one.
   */
  constructor(databaseName: string) {

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
    return true;
  }
}
