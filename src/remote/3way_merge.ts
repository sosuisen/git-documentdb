import nodePath from 'path';
import nodegit from '@sosuisen/nodegit';
import git from 'isomorphic-git';
import fs from 'fs-extra';
import { DEFAULT_CONFLICT_RESOLUTION_STRATEGY, JSON_EXT } from '../const';
import {
  CannotDeleteDataError,
  InvalidConflictStateError,
  RepositoryNotOpenError,
} from '../error';
import {
  AcceptedConflict,
  ConflictResolutionStrategies,
  ConflictResolutionStrategyLabels,
  IJsonPatch,
  JsonDoc,
} from '../types';
import { IDocumentDB } from '../types_gitddb';
import { getDocumentFromBuffer, writeBlobToFile } from './worker_utils';
import { toSortedJSONString } from '../utils';
import { JsonDiff } from './json_diff';
import { ISync } from '../types_sync';

function getStrategy (
  strategy: ConflictResolutionStrategies | undefined,
  oursDoc?: JsonDoc,
  theirsDoc?: JsonDoc
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

function getMergedDocument (
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
    result = {};
  }
  return toSortedJSONString(result);
}

/**
 * 3-way merge
 *
 * @throws {@link RepositoryNotOpenError}
 * @throws {@link InvalidConflictStateError}
 * @throws {@link CannotDeleteDataError}
 * @throws {@link CannotCreateDirectoryError} (from writeBlobToFile())
 */
// eslint-disable-next-line complexity
export async function threeWayMerge (
  gitDDB: IDocumentDB,
  sync: ISync,
  conflictResolutionStrategy: ConflictResolutionStrategies,
  resolvedIndex: nodegit.Index,
  path: string,
  mergeBaseOid: string,
  oursCommitOid: string,
  theirsCommitOid: string,
  acceptedConflicts: AcceptedConflict[]
): Promise<void> {
  const repos = gitDDB.repository();
  if (repos === undefined) {
    throw new RepositoryNotOpenError();
  }
  // Try 3-way merge on the assumption that their is no conflict.
  const base = await git
    .readBlob({
      fs,
      dir: gitDDB.workingDir(),
      oid: mergeBaseOid,
      filepath: path,
    })
    .catch(() => undefined);

  const ours = await git
    .readBlob({
      fs,
      dir: gitDDB.workingDir(),
      oid: oursCommitOid,
      filepath: path,
    })
    .catch(() => undefined);

  const theirs = await git
    .readBlob({
      fs,
      dir: gitDDB.workingDir(),
      oid: theirsCommitOid,
      filepath: path,
    })
    .catch(() => undefined);

  const docId = path.replace(new RegExp(JSON_EXT + '$'), '');

  // 2 x 2 x 2 cases
  if (!base && !ours && !theirs) {
    // This case must not occurred.
    throw new InvalidConflictStateError(
      'Neither a base entry nor a local entry nor a remote entry exists.'
    );
  }
  else if (!base && !ours && theirs) {
    // A new file has been inserted on theirs.
    // Write it to the file.
    // console.log(' #case 1 - Accept theirs (insert): ' + path);
    await writeBlobToFile(gitDDB, path, Buffer.from(theirs!.blob).toString('utf-8'));
    await resolvedIndex.addByPath(path);
  }
  else if (!base && ours && !theirs) {
    // A new file has been inserted on ours.
    // Just add it to the index.
    // console.log(' #case 2 - Accept ours (insert): ' + path);
    await resolvedIndex.addByPath(path);
  }
  else if (!base && ours && theirs) {
    if (ours.oid === theirs.oid) {
      // The same filenames with exactly the same contents are inserted on both local and remote.
      // console.log(' #case 3 - Accept both (insert): ' + path);
      // Jut add it to the index.
      await resolvedIndex.addByPath(path);
    }
    else {
      // ! Conflict
      const strategy = await getStrategy(
        conflictResolutionStrategy,
        getDocumentFromBuffer(path, ours.blob),
        getDocumentFromBuffer(path, theirs.blob)
      );
      if (strategy === 'ours' || strategy === 'ours-diff') {
        // Just add it to the index.
        // console.log(' #case 4 - Conflict. Accept ours (insert): ' + path);
        const data = await getMergedDocument(
          sync.jsonDiff,
          sync.jsonPatch,
          strategy,
          undefined,
          JSON.parse(Buffer.from(ours!.blob).toString('utf-8')),
          JSON.parse(Buffer.from(theirs!.blob).toString('utf-8'))
        );

        await writeBlobToFile(gitDDB, path, data);

        await resolvedIndex.addByPath(path);
        const entry = await resolvedIndex.getByPath(path);
        const fileSha = entry.id.tostrS();
        acceptedConflicts.push({
          target: {
            _id: docId,
            fileSha,
          },
          strategy: strategy,
          operation: strategy === 'ours' ? 'insert' : 'insert-merge',
        });
      }
      else if (strategy === 'theirs' || strategy === 'theirs-diff') {
        // Write theirs to the file.
        // console.log(' #case 5 - Conflict. Accept theirs (insert): ' + path);
        const data = await getMergedDocument(
          sync.jsonDiff,
          sync.jsonPatch,
          strategy,
          undefined,
          JSON.parse(Buffer.from(ours!.blob).toString('utf-8')),
          JSON.parse(Buffer.from(theirs!.blob).toString('utf-8'))
        );
        await writeBlobToFile(gitDDB, path, data);

        await resolvedIndex.addByPath(path);
        const entry = await resolvedIndex.getByPath(path);
        const fileSha = entry.id.tostrS();

        acceptedConflicts.push({
          target: {
            _id: docId,
            fileSha,
          },
          strategy: strategy,
          operation: strategy === 'theirs' ? 'insert' : 'insert-merge',
        });
      }
    }
  }
  else if (base && !ours && !theirs) {
    // The same files are removed.
    // console.log(' #case 6 - Accept both (delete): ' + path);
    await resolvedIndex.removeByPath(path);
  }
  else if (base && !ours && theirs) {
    if (base.oid === theirs.oid) {
      // A file has been removed on ours.
      // console.log(' #case 7 - Accept ours (delete): ' + path);
      await resolvedIndex.removeByPath(path);
    }
    else {
      // ! Conflict
      const strategy = await getStrategy(
        conflictResolutionStrategy,
        undefined,
        getDocumentFromBuffer(path, theirs.blob)
      );
      if (strategy === 'ours' || strategy === 'ours-diff') {
        // Just add it to the index.
        // console.log(' #case 8 - Conflict. Accept ours (delete): ' + path);
        acceptedConflicts.push({
          target: {
            _id: docId,
            fileSha: base.oid,
          },
          strategy: strategy,
          operation: 'delete',
        });
        await resolvedIndex.removeByPath(path);
      }
      else if (strategy === 'theirs' || strategy === 'theirs-diff') {
        // Write theirs to the file.
        // console.log(' #case 9 - Conflict. Accept theirs (update): ' + path);
        acceptedConflicts.push({
          target: {
            _id: docId,
            fileSha: theirs.oid,
          },
          strategy: strategy,
          operation: 'update',
        });

        const data = Buffer.from(theirs!.blob).toString('utf-8');

        await writeBlobToFile(gitDDB, path, data);

        await resolvedIndex.addByPath(path);
      }
    }
  }
  else if (base && ours && !theirs) {
    if (base.oid === ours.oid) {
      // A file has been removed on theirs.
      // console.log(' #case 10 - Accept theirs (delete): ' + path);
      await fs.remove(nodePath.resolve(repos.workdir(), path)).catch(() => {
        throw new CannotDeleteDataError();
      });
      await resolvedIndex.removeByPath(path);
    }
    else {
      // ! Conflict
      const strategy = await getStrategy(
        conflictResolutionStrategy,
        getDocumentFromBuffer(path, ours.blob),
        undefined
      );
      if (strategy === 'ours' || strategy === 'ours-diff') {
        // Just add to the index.
        // console.log(' #case 11 - Conflict. Accept ours (update): ' + path);
        acceptedConflicts.push({
          target: {
            _id: docId,
            fileSha: ours.oid,
          },
          strategy: strategy,
          operation: 'update',
        });

        const data = Buffer.from(ours!.blob).toString('utf-8');

        await writeBlobToFile(gitDDB, path, data);

        await resolvedIndex.addByPath(path);
      }
      else if (strategy === 'theirs' || strategy === 'theirs-diff') {
        // Remove file
        // console.log(' #case 12 - Conflict. Accept theirs (delete): ' + path);
        acceptedConflicts.push({
          target: {
            _id: docId,
            fileSha: base.oid,
          },
          strategy: strategy,
          operation: 'delete',
        });
        await fs.remove(nodePath.resolve(repos.workdir(), path)).catch(() => {
          throw new CannotDeleteDataError();
        });
        await resolvedIndex.removeByPath(path);
      }
    }
  }
  else if (base && ours && theirs) {
    if (ours.oid === theirs.oid) {
      // The same filenames with exactly the same contents are inserted on both local and remote.
      // Jut add it to the index.
      // console.log(' #case 13 - Accept both (update): ' + path);
      await resolvedIndex.addByPath(path);
    }
    else if (base.oid === ours.oid) {
      // Write theirs to the file.
      // console.log(' #case 14 - Accept theirs (update): ' + path);
      const data = Buffer.from(theirs!.blob).toString('utf-8');
      await writeBlobToFile(gitDDB, path, data);
      await resolvedIndex.addByPath(path);
    }
    else if (base.oid === theirs.oid) {
      // Jut add it to the index.
      // console.log(' #case 15 - Accept ours (update): ' + path);
      await resolvedIndex.addByPath(path);
    }
    else {
      // ! Conflict
      const strategy = await getStrategy(
        conflictResolutionStrategy,
        getDocumentFromBuffer(path, ours.blob),
        getDocumentFromBuffer(path, theirs.blob)
      );
      if (strategy === 'ours' || strategy === 'ours-diff') {
        // Just add it to the index.
        // console.log(' #case 16 - Conflict. Accept ours (update): ' + path);
        const data = await getMergedDocument(
          sync.jsonDiff,
          sync.jsonPatch,
          strategy,
          JSON.parse(Buffer.from(base!.blob).toString('utf-8')),
          JSON.parse(Buffer.from(ours!.blob).toString('utf-8')),
          JSON.parse(Buffer.from(theirs!.blob).toString('utf-8'))
        );

        await writeBlobToFile(gitDDB, path, data);

        await resolvedIndex.addByPath(path);
        const entry = await resolvedIndex.getByPath(path);
        const fileSha = entry.id.tostrS();

        acceptedConflicts.push({
          target: {
            _id: docId,
            fileSha,
          },
          strategy: strategy,
          operation: strategy === 'ours' ? 'update' : 'update-merge',
        });
      }
      else if (strategy === 'theirs' || strategy === 'theirs-diff') {
        // Write theirs to the file.
        // console.log(' #case 17 - Conflict. Accept theirs (update): ' + path);
        const data = await getMergedDocument(
          sync.jsonDiff,
          sync.jsonPatch,
          strategy,
          JSON.parse(Buffer.from(base!.blob).toString('utf-8')),
          JSON.parse(Buffer.from(ours!.blob).toString('utf-8')),
          JSON.parse(Buffer.from(theirs!.blob).toString('utf-8'))
        );

        await writeBlobToFile(gitDDB, path, data);

        await resolvedIndex.addByPath(path);
        const entry = await resolvedIndex.getByPath(path);
        const fileSha = entry.id.tostrS();

        acceptedConflicts.push({
          target: {
            _id: docId,
            fileSha,
          },
          strategy: strategy,
          operation: strategy === 'theirs' ? 'update' : 'update-merge',
        });
      }
    }
  }
}
