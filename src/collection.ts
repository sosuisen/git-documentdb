export class Collection {

  /**
   * normalized collectionPath has trailing slash, no heading slash, otherwise the path is ''.
   */
  static normalizeCollectionPath (collectionPath: string | undefined) {
    if (collectionPath === undefined || collectionPath === '') {
      return '';
    }

    // Remove heading slash
    if (collectionPath.startsWith('/')) {
      collectionPath = collectionPath.slice(0, 1);
    }
    // Add trailing slash
    if (!collectionPath.endsWith('/')) {
      collectionPath += '/';
    }

    return collectionPath;
  }

  constructor (public collectionPath: string) {}
}
