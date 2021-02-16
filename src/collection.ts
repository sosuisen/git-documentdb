export class Collection {
  static normalizeDirpath(dirpath: string) {
    if (!dirpath.startsWith('/')) {
      dirpath = '/' + dirpath;
    }
    if (!dirpath.endsWith('/')) {
      dirpath += '/';
    }
    return dirpath;
  }

  constructor(public dirpath: string){}
}