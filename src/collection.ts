export class Collection {
  static normalizeCollectionPath (collectionPath: string) {
    if (!collectionPath.endsWith('/')) {
      collectionPath += '/';
    }
    return collectionPath;
  }

  constructor (public collectionPath: string) {}
}
