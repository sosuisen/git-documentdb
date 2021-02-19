export class Collection {
  static normalizeCollectionPath (collectionPath: string) {
    // Remove slashes on both ends
    if (collectionPath !== '/') {
      if (collectionPath.startsWith('/')) {
        collectionPath = collectionPath.slice(1);
      }
      if (collectionPath.endsWith('/')) {
        collectionPath = collectionPath.slice(0, -1);
      }
    }
    return collectionPath;
  }

  constructor (public collectionPath: string) {}
}
