import nodePath from 'path';
import nodegit from '@sosuisen/nodegit';
import fs from 'fs-extra';
import {
  CannotCreateDirectoryError,
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
import { getDocument } from './worker_utils';
import { toSortedJSONString } from '../utils';
import { JsonDiff } from './json_diff';
import { ISync } from '../types_sync';

/**
 * Write blob to file system
 *
 * @throws {@link CannotCreateDirectoryError}
 */
async function writeBlobToFile (gitDDB: IDocumentDB, fileName: string, data: string) {
  const filePath = nodePath.resolve(gitDDB.workingDir(), fileName);
  const dir = nodePath.dirname(filePath);
  await fs.ensureDir(dir).catch((err: Error) => {
    return Promise.reject(new CannotCreateDirectoryError(err.message));
  });
  await fs.writeFile(filePath, data);
}

async function getStrategy (
  gitDDB: IDocumentDB,
  strategy: ConflictResolutionStrategies | undefined,
  path: string,
  ours?: nodegit.TreeEntry,
  theirs?: nodegit.TreeEntry
) {
  const defaultStrategy: ConflictResolutionStrategies = 'ours-prop';
  if (strategy === undefined) {
    strategy = defaultStrategy;
  }
  else if (
    strategy !== 'ours-prop' &&
    strategy !== 'theirs-prop' &&
    strategy !== 'ours' &&
    strategy !== 'theirs'
  ) {
    // Strategy may be a function
    const id = path.replace(new RegExp(gitDDB.fileExt + '$'), '');
    const oursDoc = ours
      ? await getDocument(gitDDB, id, ours.id()).catch(() => undefined)
      : undefined;
    const theirsDoc = theirs
      ? await getDocument(gitDDB, id, theirs.id()).catch(() => undefined)
      : undefined;
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
  else if (strategy === 'ours-prop') {
    result = jsonPatch.patch(
      ours,
      jsonDiff.diff(base, ours),
      theirs,
      jsonDiff.diff(base, theirs),
      strategy
    );
  }
  else if (strategy === 'theirs-prop') {
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
  conflict_resolve_strategy: ConflictResolutionStrategies,
  resolvedIndex: nodegit.Index,
  path: string,
  mergeBase: nodegit.Commit,
  oursCommit: nodegit.Commit,
  theirsCommit: nodegit.Commit,
  acceptedConflicts: AcceptedConflict[]
): Promise<void> {
  const repos = gitDDB.repository();
  if (repos === undefined) {
    throw new RepositoryNotOpenError();
  }
  // Try 3-way merge on the assumption that their is no conflict.
  const baseCommit = await repos.getCommit(mergeBase);

  const ours = await oursCommit.getEntry(path).catch(() => undefined);
  const theirs = await theirsCommit.getEntry(path).catch(() => undefined);
  const base = await baseCommit.getEntry(path).catch(() => undefined);

  const docId = path.replace(new RegExp(gitDDB.fileExt + '$'), '');

  // 2 x 2 x 2 cases
  if (!base && !ours && !theirs) {
    // This case must not occurred.
    throw new InvalidConflictStateError(
      'Neither a base entry nor a local entry nor a remote entry exists.'
    );
  }
  else if (!base && !ours && theirs) {
    // A new file has been created on theirs.
    // Write it to the file.
    // console.log(' #case 1 - Accept theirs (create): ' + path);
    await writeBlobToFile(gitDDB, path, (await theirs.getBlob()).toString());
    await resolvedIndex.addByPath(path);
  }
  else if (!base && ours && !theirs) {
    // A new file has been created on ours.
    // Just add it to the index.
    // console.log(' #case 2 - Accept ours (create): ' + path);
    await resolvedIndex.addByPath(path);
  }
  else if (!base && ours && theirs) {
    if (ours.id().equal(theirs.id())) {
      // The same filenames with exactly the same contents are created on both local and remote.
      // console.log(' #case 3 - Accept both (create): ' + path);
      // Jut add it to the index.
      await resolvedIndex.addByPath(path);
    }
    else {
      // ! Conflict
      const strategy = await getStrategy(
        gitDDB,
        conflict_resolve_strategy,
        path,
        ours,
        theirs
      );
      if (strategy === 'ours' || strategy === 'ours-prop') {
        // Just add it to the index.
        // console.log(' #case 4 - Conflict. Accept ours (create): ' + path);
        const data = await getMergedDocument(
          sync.jsonDiff,
          sync.jsonPatch,
          strategy,
          undefined,
          JSON.parse((await ours.getBlob()).toString()),
          JSON.parse((await theirs.getBlob()).toString())
        );

        await writeBlobToFile(gitDDB, path, data);

        await resolvedIndex.addByPath(path);
        const entry = await resolvedIndex.getByPath(path);
        const file_sha = entry.id.tostrS();
        acceptedConflicts.push({
          target: {
            id: docId,
            file_sha,
          },
          strategy: strategy,
          operation: strategy === 'ours' ? 'create' : 'create-merge',
        });
      }
      else if (strategy === 'theirs' || strategy === 'theirs-prop') {
        // Write theirs to the file.
        // console.log(' #case 5 - Conflict. Accept theirs (create): ' + path);
        const data = await getMergedDocument(
          sync.jsonDiff,
          sync.jsonPatch,
          strategy,
          undefined,
          JSON.parse((await ours.getBlob()).toString()),
          JSON.parse((await theirs.getBlob()).toString())
        );
        await writeBlobToFile(gitDDB, path, data);

        await resolvedIndex.addByPath(path);
        const entry = await resolvedIndex.getByPath(path);
        const file_sha = entry.id.tostrS();

        acceptedConflicts.push({
          target: {
            id: docId,
            file_sha,
          },
          strategy: strategy,
          operation: strategy === 'theirs' ? 'create' : 'create-merge',
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
    if (base.id().equal(theirs.id())) {
      // A file has been removed on ours.
      // console.log(' #case 7 - Accept ours (delete): ' + path);
      await resolvedIndex.removeByPath(path);
    }
    else {
      // ! Conflict
      const strategy = await getStrategy(
        gitDDB,
        conflict_resolve_strategy,
        path,
        ours,
        theirs
      );
      if (strategy === 'ours' || strategy === 'ours-prop') {
        // Just add it to the index.
        // console.log(' #case 8 - Conflict. Accept ours (delete): ' + path);
        acceptedConflicts.push({
          target: {
            id: docId,
            file_sha: base.sha(),
          },
          strategy: strategy,
          operation: 'delete',
        });
        await resolvedIndex.removeByPath(path);
      }
      else if (strategy === 'theirs' || strategy === 'theirs-prop') {
        // Write theirs to the file.
        // console.log(' #case 9 - Conflict. Accept theirs (update): ' + path);
        acceptedConflicts.push({
          target: {
            id: docId,
            file_sha: theirs.sha(),
          },
          strategy: strategy,
          operation: 'update',
        });

        const data = (await theirs.getBlob()).toString();

        await writeBlobToFile(gitDDB, path, data);

        await resolvedIndex.addByPath(path);
      }
    }
  }
  else if (base && ours && !theirs) {
    if (base.id().equal(ours.id())) {
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
        gitDDB,
        conflict_resolve_strategy,
        path,
        ours,
        theirs
      );
      if (strategy === 'ours' || strategy === 'ours-prop') {
        // Just add to the index.
        // console.log(' #case 11 - Conflict. Accept ours (update): ' + path);
        acceptedConflicts.push({
          target: {
            id: docId,
            file_sha: ours.sha(),
          },
          strategy: strategy,
          operation: 'update',
        });

        const data = (await ours.getBlob()).toString();

        await writeBlobToFile(gitDDB, path, data);

        await resolvedIndex.addByPath(path);
      }
      else if (strategy === 'theirs' || strategy === 'theirs-prop') {
        // Remove file
        // console.log(' #case 12 - Conflict. Accept theirs (delete): ' + path);
        acceptedConflicts.push({
          target: {
            id: docId,
            file_sha: base.sha(),
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
    if (ours.id().equal(theirs.id())) {
      // The same filenames with exactly the same contents are created on both local and remote.
      // Jut add it to the index.
      // console.log(' #case 13 - Accept both (update): ' + path);
      await resolvedIndex.addByPath(path);
    }
    else if (base.id().equal(ours.id())) {
      // Write theirs to the file.
      // console.log(' #case 14 - Accept theirs (update): ' + path);
      const data = (await theirs.getBlob()).toString();
      await writeBlobToFile(gitDDB, path, data);
      await resolvedIndex.addByPath(path);
    }
    else if (base.id().equal(theirs.id())) {
      // Jut add it to the index.
      // console.log(' #case 15 - Accept ours (update): ' + path);
      await resolvedIndex.addByPath(path);
    }
    else {
      // ! Conflict
      const strategy = await getStrategy(
        gitDDB,
        conflict_resolve_strategy,
        path,
        ours,
        theirs
      );
      if (strategy === 'ours' || strategy === 'ours-prop') {
        // Just add it to the index.
        // console.log(' #case 16 - Conflict. Accept ours (update): ' + path);
        const data = await getMergedDocument(
          sync.jsonDiff,
          sync.jsonPatch,
          strategy,
          JSON.parse((await base.getBlob()).toString()),
          JSON.parse((await ours.getBlob()).toString()),
          JSON.parse((await theirs.getBlob()).toString())
        );

        await writeBlobToFile(gitDDB, path, data);

        await resolvedIndex.addByPath(path);
        const entry = await resolvedIndex.getByPath(path);
        const file_sha = entry.id.tostrS();

        acceptedConflicts.push({
          target: {
            id: docId,
            file_sha,
          },
          strategy: strategy,
          operation: strategy === 'ours' ? 'update' : 'update-merge',
        });
      }
      else if (strategy === 'theirs' || strategy === 'theirs-prop') {
        // Write theirs to the file.
        // console.log(' #case 17 - Conflict. Accept theirs (update): ' + path);
        const data = await getMergedDocument(
          sync.jsonDiff,
          sync.jsonPatch,
          strategy,
          JSON.parse((await base.getBlob()).toString()),
          JSON.parse((await ours.getBlob()).toString()),
          JSON.parse((await theirs.getBlob()).toString())
        );

        await writeBlobToFile(gitDDB, path, data);

        await resolvedIndex.addByPath(path);
        const entry = await resolvedIndex.getByPath(path);
        const file_sha = entry.id.tostrS();

        acceptedConflicts.push({
          target: {
            id: docId,
            file_sha,
          },
          strategy: strategy,
          operation: strategy === 'theirs' ? 'update' : 'update-merge',
        });
      }
    }
  }
}
