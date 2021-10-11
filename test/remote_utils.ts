/* eslint-disable @typescript-eslint/naming-convention */
import fs from 'fs-extra';
import { Octokit } from '@octokit/rest';
import git from 'isomorphic-git';
import sinon from 'sinon';
import expect from 'expect';
import {
  ChangedFileDelete,
  ChangedFileInsert,
  ChangedFileUpdate,
  DeleteResult,
  JsonDoc,
  PutResult,
  RemoteOptions,
  Schema,
} from '../src/types';
import { SyncInterface } from '../src/types_sync';
import { GitDocumentDB } from '../src/git_documentdb';
import { FILE_REMOVE_TIMEOUT, GIT_DOCUMENTDB_METADATA_DIR, JSON_EXTENSION } from '../src/const';
import { RemoteRepository } from '../src/remote/remote_repository';

const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

/**
 * Get CommitInfo Object Array from args
 */
export function getCommitInfo (resultOrMessage: (PutResult | DeleteResult | string)[]) {
  return resultOrMessage.reduce((acc, current) => {
    if (typeof current === 'string') {
      const commit = {
        oid: expect.any(String),
        message: current,
        parent: expect.any(Array),
        author: {
          name: expect.any(String),
          email: expect.any(String),
          timestamp: expect.any(Number),
        },
        committer: {
          name: expect.any(String),
          email: expect.any(String),
          timestamp: expect.any(Number),
        },
      };
      acc.push(commit);
    }
    else {
      acc.push(current.commit);
    }
    return acc;
  }, [] as any[]);
}

/**
 * Get ChangedFile Object from args
 * @remarks 'result' must includes fileOid of 'doc'
 */
export function getChangedFileInsert (
  newDoc: JsonDoc,
  newResult: PutResult | DeleteResult
): ChangedFileInsert {
  return {
    operation: 'insert',
    new: {
      _id: newDoc!._id,
      name: newDoc!._id + JSON_EXTENSION,
      fileOid: newResult!.fileOid,
      type: 'json',
      doc: newDoc,
    },
  };
}

export function getChangedFileUpdate (
  oldDoc: JsonDoc,
  oldResult: PutResult | DeleteResult,
  newDoc: JsonDoc,
  newResult: PutResult | DeleteResult
): ChangedFileUpdate {
  return {
    operation: 'update',
    old: {
      _id: oldDoc!._id,
      name: oldDoc!._id + JSON_EXTENSION,
      fileOid: oldResult!.fileOid,
      type: 'json',
      doc: oldDoc!,
    },
    new: {
      _id: newDoc!._id,
      name: newDoc!._id + JSON_EXTENSION,
      fileOid: newResult!.fileOid,
      type: 'json',
      doc: newDoc,
    },
  };
}

export function getChangedFileDelete (
  oldDoc: JsonDoc,
  oldResult: PutResult | DeleteResult
): ChangedFileDelete {
  return {
    operation: 'delete',
    old: {
      _id: oldDoc!._id,
      name: oldDoc!._id + JSON_EXTENSION,
      fileOid: oldResult!.fileOid,
      type: 'json',
      doc: oldDoc,
    },
  };
}

export function getChangedFileInsertBySHA (
  newDoc: JsonDoc,
  newFileSHA: string
): ChangedFileInsert {
  return {
    operation: 'insert',
    new: {
      _id: newDoc!._id,
      name: newDoc!._id + JSON_EXTENSION,
      fileOid: newFileSHA,
      type: 'json',
      doc: newDoc,
    },
  };
}

export function getChangedFileUpdateBySHA (
  oldDoc: JsonDoc,
  oldFileSHA: string,
  newDoc: JsonDoc,
  newFileSHA: string
): ChangedFileUpdate {
  return {
    operation: 'update',
    old: {
      _id: oldDoc!._id,
      name: oldDoc!._id + JSON_EXTENSION,
      fileOid: oldFileSHA,
      type: 'json',
      doc: oldDoc!,
    },
    new: {
      _id: newDoc!._id,
      name: newDoc!._id + JSON_EXTENSION,
      fileOid: newFileSHA,
      type: 'json',
      doc: newDoc,
    },
  };
}

export function getChangedFileDeleteBySHA (
  oldDoc: JsonDoc,
  oldFileSHA: string
): ChangedFileDelete {
  return {
    operation: 'delete',
    old: {
      _id: oldDoc!._id,
      name: oldDoc!._id + JSON_EXTENSION,
      fileOid: oldFileSHA,
      type: 'json',
      doc: oldDoc,
    },
  };
}

export async function createDatabase (
  remoteURLBase: string,
  localDir: string,
  serialId: () => string,
  options?: RemoteOptions,
  schema?: Schema
): Promise<[GitDocumentDB, SyncInterface]> {
  const remoteURL = remoteURLBase + serialId();

  const dbNameA = serialId();

  const dbA: GitDocumentDB = new GitDocumentDB({
    dbName: dbNameA,
    localDir,
    schema,
  });
  options ??= {
    remoteUrl: remoteURL,
    connection: { type: 'github', personalAccessToken: token },
    includeCommits: true,
  };
  options.remoteUrl ??= remoteURL;
  options.includeCommits ??= true;

  await dbA.open();
  await dbA.sync(options);
  const remoteA = dbA.getSync(remoteURL);

  return [dbA, remoteA];
}

export async function createClonedDatabases (
  remoteURLBase: string,
  localDir: string,
  serialId: () => string,
  options?: RemoteOptions,
  logLevel?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
): Promise<[GitDocumentDB, GitDocumentDB, SyncInterface, SyncInterface]> {
  const remoteURL = remoteURLBase + serialId();

  const dbNameA = serialId();

  const dbA: GitDocumentDB = new GitDocumentDB({
    dbName: dbNameA,
    localDir,
    logLevel: logLevel ?? 'info',
  });
  options ??= {
    remoteUrl: remoteURL,
    connection: { type: 'github', personalAccessToken: token },
    includeCommits: true,
  };
  options.remoteUrl ??= remoteURL;
  options.connection ??= { type: 'github', personalAccessToken: token };
  options.includeCommits ??= true;
  await dbA.open();
  await dbA.sync(options);
  const dbNameB = serialId();
  const dbB: GitDocumentDB = new GitDocumentDB({
    dbName: dbNameB,
    localDir,
    logLevel: logLevel ?? 'info',
  });
  // Clone dbA
  await dbB.open();
  await dbB.sync(options);
  const remoteA = dbA.getSync(remoteURL);
  const remoteB = dbB.getSync(remoteURL);

  return [dbA, dbB, remoteA, remoteB];
}

export const createRemoteRepository = async (remoteURL: string) => {
  await new RemoteRepository({
    remoteUrl: remoteURL,
    connection: {
      type: 'github',
      personalAccessToken: token,
    },
  })
    .create()
    .catch(err => {
      console.debug('Cannot create: ' + remoteURL);
      console.debug(err);
    });
};

export const destroyRemoteRepository = async (remoteURL: string) => {
  await new RemoteRepository({
    remoteUrl: remoteURL,
    connection: {
      type: 'github',
      personalAccessToken: token,
    },
  })
    .destroy()
    .catch(() => {});
};

export async function removeRemoteRepositories (reposPrefix: string) {
  // Remove test repositories on remote
  // console.log(' Removing remote repositories..');
  const octokit = new Octokit({
    auth: token,
  });

  const len = 0;
  const promises: Promise<any>[] = [];

  // eslint-disable-next-line no-await-in-loop
  const reposArray = await octokit.paginate(
    octokit.repos.listForAuthenticatedUser,
    { per_page: 100 },
    response =>
      response.data.filter(repos => {
        if (repos) {
          const urlArray = repos.full_name.split('/');
          const repo = urlArray[1];
          return repo.startsWith(reposPrefix);
        }
        return false;
      })
  );
  // console.log(` - Got ${reposArray.length} repositories`);
  reposArray.forEach(repos => {
    const urlArray = repos.full_name.split('/');
    const owner = urlArray[0];
    const repo = urlArray[1];
    promises.push(
      octokit.repos.delete({ owner, repo }).catch(err => {
        if (err.status !== 404) {
          console.debug(err);
        }
      })
    );
  });
  // console.log(` - Start to remove repositories..`);
  // eslint-disable-next-line no-await-in-loop
  await Promise.all(promises);
  // console.log(` - Completed`);
}

export const listFiles = (gitDDB: GitDocumentDB, dir: string): string[] => {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap(dirent =>
      dirent.isFile()
        ? [`${dir}/${dirent.name}`.replace(gitDDB.workingDir + '/', '')]
        : listFiles(gitDDB, `${dir}/${dirent.name}`)
    )
    .filter(name => !name.match(/^(\.gitddb|\.git)/));
};

export const compareWorkingDirAndBlobs = async (
  gitDDB: GitDocumentDB
): Promise<boolean> => {
  const files = listFiles(gitDDB, gitDDB.workingDir);

  const entries: string[] = await git.walk({
    fs,
    dir: gitDDB.workingDir,
    trees: [git.STAGE()],
    // @ts-ignore
    // eslint-disable-next-line complexity
    map: async function (fullDocPath, [entry]) {
      if (fullDocPath.startsWith(GIT_DOCUMENTDB_METADATA_DIR)) return;
      if ((await entry?.type()) === 'blob') {
        return fullDocPath;
      }
    },
  });

  // console.log('# check count: fromFiles: ' + files.length + ', fromIndex: ' + entryCount);
  if (files.length !== entries.length) {
    return false;
  }

  for (const file of files) {
    // console.log('# check:' + file);
    // Does index include blob?
    if (!entries.includes(file)) {
      return false;
    }

    // eslint-disable-next-line no-await-in-loop
    const buf = await fs.readFile(gitDDB.workingDir + '/' + file)!;
    const data = Uint8Array.from(buf);
    // eslint-disable-next-line no-await-in-loop
    const { oid } = await git.hashBlob({ object: data });

    // Does blob exist?
    // eslint-disable-next-line no-await-in-loop
    const readBlobResult = await git
      .readBlob({ fs, dir: gitDDB.workingDir, oid })
      .catch((err: Error) => console.log(err));

    if (readBlobResult === undefined) {
      return false;
    }
    // console.log('  - rawSize:' + blob?.rawsize());
  }
  return true;
};

export const getWorkingDirDocs = (gitDDB: GitDocumentDB) => {
  return listFiles(gitDDB, gitDDB.workingDir).map(filepath => {
    const doc = fs.readJSONSync(gitDDB.workingDir + '/' + filepath);
    doc._id = filepath.replace(new RegExp(JSON_EXTENSION + '$'), '');
    return doc;
  });
};

export const destroyDBs = async (DBs: GitDocumentDB[]) => {
  /**
   * ! NOTICE: sinon.useFakeTimers() is used in each test to skip FileRemoveTimeoutError.
   */
  const clock = sinon.useFakeTimers();
  Promise.all(
    DBs.map(db =>
      db.destroy().catch(() => {
        /* throws FileRemoveTimeoutError */
      })
    )
  ).catch(err => {
    console.log(err);
  });
  await clock.tickAsync(FILE_REMOVE_TIMEOUT);
  clock.restore();
};

export async function createGitRemote (
  localDir: string,
  remoteUrl: string,
  remoteName: string
) {
  await git.addRemote({
    fs,
    dir: localDir,
    remote: remoteName,
    url: remoteUrl,
  });
  /*
  await git.setConfig({
    fs,
    dir: localDir,
    path: `remote.${remoteName}.url`,
    value: remoteUrl,
  });
  await git.setConfig({
    fs,
    dir: localDir,
    path: `remote.${remoteName}.fetch`,
    value: `+refs/heads/*:refs/remotes/${remoteName}/*`,
  });
*/
}
