/* eslint-disable @typescript-eslint/naming-convention */
import fs from 'fs-extra';
import { Octokit } from '@octokit/rest';
import git from 'isomorphic-git';
import sinon from 'sinon';
import expect from 'expect';
import nodegit from '@sosuisen/nodegit';
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
import { FILE_REMOVE_TIMEOUT, JSON_EXT } from '../src/const';
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
      name: newDoc!._id + JSON_EXT,
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
      name: oldDoc!._id + JSON_EXT,
      fileOid: oldResult!.fileOid,
      type: 'json',
      doc: oldDoc!,
    },
    new: {
      _id: newDoc!._id,
      name: newDoc!._id + JSON_EXT,
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
      name: oldDoc!._id + JSON_EXT,
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
      name: newDoc!._id + JSON_EXT,
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
      name: oldDoc!._id + JSON_EXT,
      fileOid: oldFileSHA,
      type: 'json',
      doc: oldDoc!,
    },
    new: {
      _id: newDoc!._id,
      name: newDoc!._id + JSON_EXT,
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
      name: oldDoc!._id + JSON_EXT,
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
  options.connection ??= { type: 'github', personalAccessToken: token };
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
    .catch(err => {
      console.debug('Cannot delete: ' + remoteURL);
      console.debug(err);
    });
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

  /*
  const headCommitOid = await git.resolveRef({ fs, dir: gitDDB.workingDir, ref: 'HEAD' });
  await git.walk({
    fs,
    dir: gitDDB.workingDir,
    trees: [git.TREE({ ref: headCommitOid })],
    // @ts-ignore
    map: function (fullDocPath, [a]) {
      console.log('myres: ' + fullDocPath);
      return '';
    },
  }); */

  const currentIndex = await gitDDB.repository()?.refreshIndex();
  const entryCount = currentIndex!.entryCount() - 1; // Reduce by 1 due to '.gitddb/info.json'
  // console.log('# check count: fromFiles: ' + files.length + ', fromIndex: ' + entryCount);
  if (files.length !== entryCount) {
    return false;
  }

  /** Basic type (loose or packed) of any Git object.
  // https://github.com/libgit2/libgit2/blob/HEAD/include/git2/types.h
  typedef enum {
	  GIT_OBJECT_ANY =      -2, // Object can be any of the following
	  GIT_OBJECT_INVALID =  -1, // Object is invalid.
	  GIT_OBJECT_COMMIT =    1, // A commit object.
	  GIT_OBJECT_TREE =      2, // A tree (directory listing) object.
	  GIT_OBJECT_BLOB =      3, // A file revision object.
	  GIT_OBJECT_TAG =       4, // An annotated tag object.
	  GIT_OBJECT_OFS_DELTA = 6, // A delta, base is given by an offset.
	  GIT_OBJECT_REF_DELTA = 7, // A delta, base is given by object id.
  } git_object_t;
  */
  for (const file of files) {
    // console.log('# check:' + file);
    // Type 3 means BLOB
    // @ts-ignore
    // eslint-disable-next-line no-await-in-loop
    const hashFromFile = await nodegit.Odb.hashfile(
      gitDDB.workingDir + '/' + file,
      3
    ).catch((err: Error) => console.log(err));
    // console.log('  - fromFile:  ' + hashFromFile.tostrS());

    // Does index include blob?
    const hashFromIndex = currentIndex?.getByPath(file).id;
    // console.log('  - fromIndex: ' + hashFromIndex!.tostrS());
    if (!hashFromIndex?.equal(hashFromFile)) {
      return false;
    }
    // Does blob exist?
    // eslint-disable-next-line no-await-in-loop
    const blob = await gitDDB
      .repository()
      ?.getBlob(hashFromIndex!)
      .catch((err: Error) => console.log(err));
    if (!blob || blob?.rawsize() === 0) {
      return false;
    }
    // console.log('  - rawSize:' + blob?.rawsize());
  }
  return true;
};

export const getWorkingDirDocs = (gitDDB: GitDocumentDB) => {
  return listFiles(gitDDB, gitDDB.workingDir).map(filepath => {
    const doc = fs.readJSONSync(gitDDB.workingDir + '/' + filepath);
    doc._id = filepath.replace(new RegExp(JSON_EXT + '$'), '');
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
  ).catch(() => {});
  await clock.tickAsync(FILE_REMOVE_TIMEOUT);
  clock.restore();
};
