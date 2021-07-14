import nodePath, { basename } from 'path';
import git, { TreeEntry, WalkerEntry } from 'isomorphic-git';
import fs from 'fs-extra';
import { DEFAULT_CONFLICT_RESOLUTION_STRATEGY, JSON_EXT } from '../const';
import { Err } from '../error';
import {
  AcceptedConflict,
  ChangedFile,
  ConflictResolutionStrategies,
  ConflictResolutionStrategyLabels,
  DocType,
  FatDoc,
  IJsonPatch,
  JsonDoc,
} from '../types';
import { GitDDBInterface } from '../types_gitddb';
import { getFatDocFromData, writeBlobToFile } from './worker_utils';
import { toSortedJSONString, utf8decode } from '../utils';
import { JsonDiff } from './json_diff';
import { SyncInterface } from '../types_sync';

function getStrategy (
  strategy: ConflictResolutionStrategies | undefined,
  oursDoc?: FatDoc,
  theirsDoc?: FatDoc
) {
  const defaultStrategy: ConflictResolutionStrategies = DEFAULT_CONFLICT_RESOLUTION_STRATEGY;
  if (strategy === undefined) {
    strategy = defaultStrategy;
  }
  else if (
    strategy !== 'ours-diff' &&
    strategy !== 'theirs-diff' &&
    strategy !== 'ours' &&
    strategy !== 'theirs'
  ) {
    // Strategy may be a function
    strategy = strategy(oursDoc, theirsDoc);
    if (strategy === undefined) {
      strategy = defaultStrategy;
    }
  }
  return strategy;
}

/**
 * @throws {@link Err.InvalidConflictResolutionStrategyError}
 */
function getMergedJsonDoc (
  jsonDiff: JsonDiff,
  jsonPatch: IJsonPatch,
  strategy: ConflictResolutionStrategyLabels,
  base: JsonDoc | undefined,
  ours: JsonDoc,
  theirs: JsonDoc
): string {
  let result: { [key: string]: string };
  if (strategy === 'ours') {
    result = ours;
  }
  else if (strategy === 'theirs') {
    result = theirs;
  }
  else if (strategy === 'ours-diff') {
    result = jsonPatch.patch(
      ours,
      jsonDiff.diff(base, ours),
      theirs,
      jsonDiff.diff(base, theirs),
      strategy
    );
  }
  else if (strategy === 'theirs-diff') {
    result = jsonPatch.patch(
      ours,
      jsonDiff.diff(base, ours),
      theirs,
      jsonDiff.diff(base, theirs),
      strategy
    );
  }
  else {
    throw new Err.InvalidConflictResolutionStrategyError();
  }
  return toSortedJSONString(result);
}

/**
 * @throws {@link Err.InvalidConflictResolutionStrategyError}
 */
function getMergedTextDoc (
  strategy: ConflictResolutionStrategyLabels,
  base: string | undefined,
  ours: string,
  theirs: string
): string {
  if (strategy === 'ours') {
    return ours;
  }
  else if (strategy === 'theirs') {
    return theirs;
  }
  else if (strategy === 'ours-diff') {
    // TODO: implement diff and patch
    return ours;
  }
  else if (strategy === 'theirs-diff') {
    // TODO: implement diff and patch
    return theirs;
  }

  throw new Err.InvalidConflictResolutionStrategyError();
}

/**
 * @throws {@link Err.InvalidConflictResolutionStrategyError}
 */
function getMergedBinaryDoc (
  strategy: ConflictResolutionStrategyLabels,
  ours: Uint8Array,
  theirs: Uint8Array
): Uint8Array {
  if (strategy === 'ours') {
    return ours;
  }
  else if (strategy === 'theirs') {
    return theirs;
  }

  throw new Err.InvalidConflictResolutionStrategyError();
}

/**
 * @throws {@link Err.InvalidDocTypeError}
 * @throws {@link Err.InvalidConflictResolutionStrategyError}
 */
function getMergedDocument (
  jsonDiff: JsonDiff,
  jsonPatch: IJsonPatch,
  strategy: ConflictResolutionStrategyLabels,
  base: Uint8Array | undefined,
  ours: Uint8Array,
  theirs: Uint8Array,
  docType: DocType
): string | Uint8Array {
  if (docType === 'json') {
    const oursDoc = JSON.parse(utf8decode(ours));
    const theirsDoc = JSON.parse(utf8decode(theirs));
    let baseDoc: JsonDoc | undefined;
    if (base) {
      baseDoc = JSON.parse(utf8decode(base));
    }
    else {
      baseDoc = undefined;
    }
    return getMergedJsonDoc(jsonDiff, jsonPatch, strategy, baseDoc, oursDoc, theirsDoc);
  }
  else if (docType === 'text') {
    const oursDoc = utf8decode(ours);
    const theirsDoc = utf8decode(theirs);
    let baseDoc: string | undefined;
    if (base) {
      baseDoc = utf8decode(base);
    }
    else {
      baseDoc = undefined;
    }
    return getMergedTextDoc(strategy, baseDoc, oursDoc, theirsDoc);
  }
  else if (docType === 'binary') {
    return getMergedBinaryDoc(strategy, ours, theirs);
  }

  throw new Err.InvalidDocTypeError(docType);
}

export async function merge (
  gitDDB: GitDDBInterface,
  sync: SyncInterface,
  baseCommitOid: string,
  oursCommitOid: string,
  theirsCommitOid: string
): Promise<[string, ChangedFile[], ChangedFile[], AcceptedConflict[]]> {
  const acceptedConflicts: AcceptedConflict[] = [];
  const localChanges: ChangedFile[] = [];
  const remoteChanges: ChangedFile[] = [];

  const strategy = sync.options.conflictResolutionStrategy!;
  const results = await git.walk({
    fs,
    dir: gitDDB.workingDir,
    trees: [
      git.TREE({ ref: baseCommitOid }),
      git.TREE({ ref: oursCommitOid }),
      git.TREE({ ref: theirsCommitOid }),
    ],
    // @ts-ignore
    // eslint-disable-next-line complexity
    map: async function (fullDocPath, [base, ours, theirs]) {
      const baseType = base === null ? undefined : await base.type();
      if (baseType === 'tree') {
        return {
          mode: (await base!.mode()).toString(8),
          path: basename(fullDocPath),
          oid: await base!.oid(),
          type: await base!.type(),
        };
      }

      const oursType = ours === null ? undefined : await ours.type();
      if (oursType === 'tree') {
        return {
          mode: (await ours!.mode()).toString(8),
          path: basename(fullDocPath),
          oid: await ours!.oid(),
          type: await ours!.type(),
        };
      }

      const theirsType = theirs === null ? undefined : await theirs.type();
      if (theirsType === 'tree') {
        return {
          mode: (await theirs!.mode()).toString(8),
          path: basename(fullDocPath),
          oid: await theirs!.oid(),
          type: await theirs!.type(),
        };
      }

      const [treeEntry, localChange, remoteChange, conflict] = await threeWayMerge(
        gitDDB,
        sync,
        strategy,
        fullDocPath,
        base,
        ours,
        theirs
      );

      if (localChange !== undefined) {
        localChanges.push(localChange);
      }
      if (remoteChange !== undefined) {
        remoteChanges.push(remoteChange);
      }
      if (conflict !== undefined) {
        acceptedConflicts.push(conflict);
      }

      if (treeEntry === undefined) {
        return;
      }
      return treeEntry;
    },
    reduce: async (parent, children) => {
      if (!parent) return;

      if (parent.type === 'tree') {
        if (children.length === 0) return;

        const newTreeOid = await git.writeTree({
          fs,
          dir: gitDDB.workingDir,
          tree: children,
        });
        // eslint-disable-next-line require-atomic-updates
        parent.oid = newTreeOid;
      }
      return parent;
    },
  });

  const mergedTreeOid = results.oid;

  return [mergedTreeOid, localChanges, remoteChanges, acceptedConflicts];
}

/**
 * 3-way merge
 *
 * @throws {@link Err.InvalidConflictStateError}
 *
 * @throws {@link Err.InvalidDocTypeError}
 * @throws {@link Err.InvalidConflictResolutionStrategyError}
 *
 * @throws {@link Err.CannotDeleteDataError}
 * @throws {@link Err.CannotCreateDirectoryError} (from writeBlobToFile)
 * @throws {@link Err.InvalidJsonObjectError} (from getFatDocFromData, getFatDocFromReadBlobResult)
 *
 */
// eslint-disable-next-line complexity
export async function threeWayMerge (
  gitDDB: GitDDBInterface,
  sync: SyncInterface,
  conflictResolutionStrategy: ConflictResolutionStrategies,
  fullDocPath: string,
  base: WalkerEntry | null,
  ours: WalkerEntry | null,
  theirs: WalkerEntry | null
): Promise<
  [
    TreeEntry | undefined,
    ChangedFile | undefined,
    ChangedFile | undefined,
    AcceptedConflict | undefined
  ]
> {
  const docType: DocType = fullDocPath.endsWith('.json') ? 'json' : 'text';
  if (docType === 'text') {
    // TODO: select binary or text by .gitattribtues
  }

  // 2 x 2 x 2 cases
  if (!base && !ours && !theirs) {
    // This case must not occurred.
    throw new Err.InvalidConflictStateError(
      'Neither a base entry nor a local entry nor a remote entry exists.'
    );
  }
  else if (!base && !ours && theirs) {
    // A new file has been inserted into theirs.
    // Write it to the working directory.
    // Write it to the index.
    console.log(' #case 1 - Accept theirs (insert): ' + fullDocPath);
    const theirsData = (await theirs.content())!;
    const theirsFatDoc = await getFatDocFromData(theirsData, fullDocPath, docType);
    await writeBlobToFile(gitDDB.workingDir, fullDocPath, theirsData);
    await git.add({ fs, dir: gitDDB.workingDir, filepath: fullDocPath });
    return [
      {
        mode: (await theirs.mode()).toString(8),
        path: basename(fullDocPath),
        oid: await theirs.oid(),
        type: 'blob',
      },
      {
        operation: 'insert',
        new: theirsFatDoc,
      },
      undefined,
      undefined,
    ];
  }
  else if (!base && ours && !theirs) {
    // A new file has been inserted into ours.
    // It has already been created on the working directory.
    // It has already been added to the index.
    console.log(' #case 2 - Accept ours (insert): ' + fullDocPath);
    const oursData = (await ours.content())!;
    const oursFatDoc = await getFatDocFromData(oursData, fullDocPath, docType);
    return [
      {
        mode: (await ours.mode()).toString(8),
        path: basename(fullDocPath),
        oid: await ours.oid(),
        type: 'blob',
      },
      undefined,
      {
        operation: 'insert',
        new: oursFatDoc,
      },
      undefined,
    ];
  }
  else if (!base && ours && theirs) {
    const oursOid = await ours.oid();
    const theirsOid = await theirs.oid();
    if (oursOid === theirsOid) {
      // The same filenames with exactly the same contents are inserted on both local and remote.
      // It has already been created on the both working directory.
      // It has already been added to the both index.
      console.log(' #case 3 - Accept both (insert): ' + fullDocPath);
      return [
        {
          mode: (await ours.mode()).toString(8),
          path: basename(fullDocPath),
          oid: oursOid,
          type: 'blob',
        },
        undefined,
        undefined,
        undefined,
      ];
    }

    // ! Conflict
    const oursData = (await ours.content())!;
    const theirsData = (await theirs.content())!;
    const oursFatDoc = await getFatDocFromData(oursData, fullDocPath, docType);
    const theirsFatDoc = await getFatDocFromData(theirsData, fullDocPath, docType);
    const strategy = await getStrategy(
      conflictResolutionStrategy,
      oursFatDoc,
      theirsFatDoc
    );
    let mode = '';
    if (strategy === 'ours' || strategy === 'ours-diff') {
      console.log(' #case 4 - Conflict. Accept ours (insert): ' + fullDocPath);
      mode = (await ours.mode()).toString(8);
    }
    else if (strategy === 'theirs' || strategy === 'theirs-diff') {
      console.log(' #case 5 - Conflict. Accept theirs (insert): ' + fullDocPath);
      mode = (await theirs.mode()).toString(8);
    }

    let resultFatDoc: FatDoc;
    let localChange: ChangedFile | undefined;
    let remoteChange: ChangedFile | undefined;
    if (strategy === 'ours') {
      // Can skip getMergedDocument().
      resultFatDoc = oursFatDoc;

      localChange = undefined;
      remoteChange = {
        operation: 'update',
        old: theirsFatDoc,
        new: oursFatDoc,
      };
    }
    else if (strategy === 'theirs') {
      // Can skip getMergedDocument().
      resultFatDoc = theirsFatDoc;
      await writeBlobToFile(gitDDB.workingDir, fullDocPath, theirsData);
      await git.add({ fs, dir: gitDDB.workingDir, filepath: fullDocPath });
      localChange = {
        operation: 'update',
        old: oursFatDoc,
        new: theirsFatDoc,
      };
      remoteChange = undefined;
    }
    else {
      // Diff and patch
      const data = await getMergedDocument(
        sync.jsonDiff,
        sync.jsonPatch,
        strategy,
        undefined,
        oursData,
        theirsData,
        docType
      );
      resultFatDoc = await getFatDocFromData(data, fullDocPath, docType);
      await writeBlobToFile(gitDDB.workingDir, fullDocPath, data);
      await git.add({ fs, dir: gitDDB.workingDir, filepath: fullDocPath });
      localChange = {
        operation: 'update',
        old: oursFatDoc,
        new: resultFatDoc,
      };
      remoteChange = {
        operation: 'update',
        old: theirsFatDoc,
        new: resultFatDoc,
      };
    }

    const acceptedConflict: AcceptedConflict = {
      fatDoc: resultFatDoc,
      strategy,
      operation: strategy.endsWith('-diff') ? 'insert-merge' : 'insert',
    };

    return [
      {
        mode,
        path: basename(fullDocPath),
        oid: resultFatDoc.fileOid,
        type: 'blob',
      },
      localChange,
      remoteChange,
      acceptedConflict,
    ];
  }
  else if (base && !ours && !theirs) {
    // The same files have been removed from both local and remote.
    console.log(' #case 6 - Accept both (delete): ' + fullDocPath);
    return [undefined, undefined, undefined, undefined];
  }
  else if (base && !ours && theirs) {
    const baseOid = await base.oid();
    const theirsOid = await theirs.oid();
    const theirsData = (await theirs.content())!;
    const theirsFatDoc = await getFatDocFromData(theirsData, fullDocPath, docType);

    if (baseOid === theirsOid) {
      // A file has been removed from ours.
      console.log(' #case 7 - Accept ours (delete): ' + fullDocPath);
      return [
        undefined,
        undefined,
        {
          operation: 'delete',
          old: theirsFatDoc,
        },
        undefined,
      ];
    }

    // ! Conflict

    const strategy = await getStrategy(conflictResolutionStrategy, undefined, theirsFatDoc);

    if (strategy === 'ours' || strategy === 'ours-diff') {
      console.log(' #case 8 - Conflict. Accept ours (delete): ' + fullDocPath);
      const baseData = (await base.content())!;
      const baseFatDoc = await getFatDocFromData(baseData, fullDocPath, docType);
      const acceptedConflict: AcceptedConflict = {
        fatDoc: baseFatDoc,
        strategy: strategy,
        operation: 'delete',
      };
      return [
        undefined,
        undefined,
        {
          operation: 'delete',
          old: theirsFatDoc,
        },
        acceptedConflict,
      ];
    }
    else if (strategy === 'theirs' || strategy === 'theirs-diff') {
      console.log(' #case 9 - Conflict. Accept theirs (update): ' + fullDocPath);
      const acceptedConflict: AcceptedConflict = {
        fatDoc: theirsFatDoc,
        strategy: strategy,
        operation: 'update',
      };
      await writeBlobToFile(gitDDB.workingDir, fullDocPath, theirsData);
      await git.add({ fs, dir: gitDDB.workingDir, filepath: fullDocPath });
      return [
        {
          mode: (await theirs.mode()).toString(8),
          path: basename(fullDocPath),
          oid: theirsFatDoc.fileOid,
          type: 'blob',
        },
        {
          operation: 'insert',
          new: theirsFatDoc,
        },
        undefined,
        acceptedConflict,
      ];
    }
  }
  else if (base && ours && !theirs) {
    const baseOid = await base.oid();
    const oursOid = await ours.oid();
    const oursData = (await ours.content())!;
    const oursFatDoc = await getFatDocFromData(oursData, fullDocPath, docType);

    if (baseOid === oursOid) {
      // A file has been removed from theirs.
      console.log(' #case 10 - Accept theirs (delete): ' + fullDocPath);
      await fs.remove(nodePath.resolve(gitDDB.workingDir, fullDocPath)).catch(() => {
        throw new Err.CannotDeleteDataError();
      });
      await git.remove({ fs, dir: gitDDB.workingDir, filepath: fullDocPath });
      return [
        undefined,
        {
          operation: 'delete',
          old: oursFatDoc,
        },
        undefined,
        undefined,
      ];
    }

    // ! Conflict

    const strategy = await getStrategy(conflictResolutionStrategy, oursFatDoc, undefined);

    if (strategy === 'ours' || strategy === 'ours-diff') {
      console.log(' #case 11 - Conflict. Accept ours (update): ' + fullDocPath);
      const acceptedConflict: AcceptedConflict = {
        fatDoc: oursFatDoc,
        strategy: strategy,
        operation: 'update',
      };
      return [
        {
          mode: (await ours.mode()).toString(8),
          path: basename(fullDocPath),
          oid: oursOid,
          type: 'blob',
        },
        undefined,
        {
          operation: 'insert',
          new: oursFatDoc,
        },
        acceptedConflict,
      ];
    }
    else if (strategy === 'theirs' || strategy === 'theirs-diff') {
      console.log(' #case 12 - Conflict. Accept theirs (delete): ' + fullDocPath);
      const baseData = (await base.content())!;
      const baseFatDoc = await getFatDocFromData(baseData, fullDocPath, docType);
      const acceptedConflicts: AcceptedConflict = {
        fatDoc: baseFatDoc,
        strategy: strategy,
        operation: 'delete',
      };
      await fs.remove(nodePath.resolve(gitDDB.workingDir, fullDocPath)).catch(() => {
        throw new Err.CannotDeleteDataError();
      });
      await git.remove({ fs, dir: gitDDB.workingDir, filepath: fullDocPath });
      return [
        undefined,
        {
          operation: 'delete',
          old: oursFatDoc,
        },
        undefined,
        acceptedConflicts,
      ];
    }
  }
  else if (base && ours && theirs) {
    const baseOid = await base.oid();
    const oursOid = await ours.oid();
    const theirsOid = await theirs.oid();

    if (oursOid === theirsOid) {
      // The same filenames with exactly the same contents are inserted into both local and remote.
      console.log(' #case 13 - Accept both (update): ' + fullDocPath);
      return [
        {
          // TODO: check whether mode is the same.
          mode: (await ours.mode()).toString(8),
          path: basename(fullDocPath),
          oid: oursOid,
          type: 'blob',
        },
        undefined,
        undefined,
        undefined,
      ];
    }
    else if (baseOid === oursOid) {
      console.log(' #case 14 - Accept theirs (update): ' + fullDocPath);
      const oursData = (await ours.content())!;
      const oursFatDoc = await getFatDocFromData(oursData, fullDocPath, docType);
      const theirsData = (await theirs.content())!;
      const theirsFatDoc = await getFatDocFromData(theirsData, fullDocPath, docType);
      await writeBlobToFile(gitDDB.workingDir, fullDocPath, theirsData);
      await git.add({ fs, dir: gitDDB.workingDir, filepath: fullDocPath });
      return [
        {
          mode: (await theirs.mode()).toString(8),
          path: basename(fullDocPath),
          oid: theirsFatDoc.fileOid,
          type: 'blob',
        },
        {
          operation: 'update',
          old: oursFatDoc,
          new: theirsFatDoc,
        },
        undefined,
        undefined,
      ];
    }
    else if (baseOid === theirsOid) {
      console.log(' #case 15 - Accept ours (update): ' + fullDocPath);
      const oursData = (await ours.content())!;
      const oursFatDoc = await getFatDocFromData(oursData, fullDocPath, docType);
      const theirsData = (await theirs.content())!;
      const theirsFatDoc = await getFatDocFromData(theirsData, fullDocPath, docType);
      return [
        {
          mode: (await theirs.mode()).toString(8),
          path: basename(fullDocPath),
          oid: oursFatDoc.fileOid,
          type: 'blob',
        },
        undefined,
        {
          operation: 'update',
          old: theirsFatDoc,
          new: oursFatDoc,
        },
        undefined,
      ];
    }

    // ! Conflict

    const baseData = (await base.content())!;
    const oursData = (await ours.content())!;
    const theirsData = (await theirs.content())!;
    const oursFatDoc = await getFatDocFromData(oursData, fullDocPath, docType);
    const theirsFatDoc = await getFatDocFromData(theirsData, fullDocPath, docType);
    const strategy = await getStrategy(
      conflictResolutionStrategy,
      oursFatDoc,
      theirsFatDoc
    );

    if (strategy === 'ours') {
      console.log(' #case 16 - Conflict. Accept ours (update): ' + fullDocPath);
      return [
        {
          mode: (await ours.mode()).toString(8),
          path: basename(fullDocPath),
          oid: oursFatDoc.fileOid,
          type: 'blob',
        },
        undefined,
        {
          operation: 'update',
          old: theirsFatDoc,
          new: oursFatDoc,
        },
        {
          fatDoc: oursFatDoc,
          strategy: strategy,
          operation: 'update',
        },
      ];
    }
    else if (strategy === 'theirs') {
      console.log(' #case 17 - Conflict. Accept theirs (update): ' + fullDocPath);
      await writeBlobToFile(gitDDB.workingDir, fullDocPath, theirsData);
      await git.add({ fs, dir: gitDDB.workingDir, filepath: fullDocPath });

      return [
        {
          mode: (await theirs.mode()).toString(8),
          path: basename(fullDocPath),
          oid: theirsFatDoc.fileOid,
          type: 'blob',
        },
        {
          operation: 'update',
          old: oursFatDoc,
          new: theirsFatDoc,
        },
        undefined,
        {
          fatDoc: theirsFatDoc,
          strategy: strategy,
          operation: 'update',
        },
      ];
    }

    const data = await getMergedDocument(
      sync.jsonDiff,
      sync.jsonPatch,
      strategy,
      baseData,
      oursData,
      theirsData,
      docType
    );
    const resultFatDoc = await getFatDocFromData(data, fullDocPath, docType);
    await writeBlobToFile(gitDDB.workingDir, fullDocPath, data);
    await git.add({ fs, dir: gitDDB.workingDir, filepath: fullDocPath });

    let mode = '';
    if (strategy === 'ours-diff') {
      console.log(' #case 16 (diff) - Conflict. Accept ours (update): ' + fullDocPath);
      mode = (await ours.mode()).toString(8);
    }
    else if (strategy === 'theirs-diff') {
      console.log(' #case 17 (diff) - Conflict. Accept theirs (update): ' + fullDocPath);
      mode = (await theirs.mode()).toString(8);
    }

    return [
      {
        mode,
        path: basename(fullDocPath),
        oid: resultFatDoc.fileOid,
        type: 'blob',
      },
      {
        operation: 'update',
        old: oursFatDoc,
        new: resultFatDoc,
      },
      {
        operation: 'update',
        old: theirsFatDoc,
        new: resultFatDoc,
      },
      {
        fatDoc: resultFatDoc,
        strategy: strategy,
        operation: 'update-merge',
      },
    ];
  }
  throw new Err.InvalidConflictStateError('Invalid case');
}
