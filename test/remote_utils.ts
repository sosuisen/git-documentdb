import fs from 'fs-extra';
import { Octokit } from '@octokit/rest';
import sinon from 'sinon';
import nodegit from '@sosuisen/nodegit';
import {
  ChangedFileDelete,
  ChangedFileInsert,
  ChangedFileUpdate,
  CommitInfo,
  JsonDoc,
  PutResult,
  RemoteOptions,
  RemoveResult,
  Schema,
} from '../src/types';
import { ISync } from '../src/types_sync';
import { GitDocumentDB } from '../src/index';
import { FILE_REMOVE_TIMEOUT } from '../src/const';
import { RemoteRepository } from '../src/remote/remote_repository';

const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

/**
 * Get CommitInfo Object Array from args
 */
export function getCommitInfo (
  resultOrMessage: (PutResult | RemoveResult | string)[]
): CommitInfo[] {
  return resultOrMessage.reduce((acc, current) => {
    if (typeof current === 'string') {
      acc.push({
        sha: expect.stringMatching(/^.+$/),
        author: expect.stringMatching(/^.+$/),
        date: expect.any(Date),
        message: current,
      });
    }
    else {
      acc.push({
        sha: current.commit_sha,
        author: expect.stringMatching(/^.+$/),
        date: expect.any(Date),
        message: expect.stringMatching(/^.+$/),
      });
    }
    return acc;
  }, [] as CommitInfo[]);
}

/**
 * Get ChangedFile Object from args
 * @remarks 'result' must includes file_sha of 'doc'
 */
export function getChangedFileInsert (
  newDoc: JsonDoc,
  newResult: PutResult | RemoveResult
): ChangedFileInsert {
  return {
    operation: 'insert',
    new: {
      id: newDoc!._id,
      file_sha: newResult!.file_sha,
      doc: newDoc,
    },
  };
}

export function getChangedFileUpdate (
  oldDoc: JsonDoc,
  oldResult: PutResult | RemoveResult,
  newDoc: JsonDoc,
  newResult: PutResult | RemoveResult
): ChangedFileUpdate {
  return {
    operation: 'update',
    old: {
      id: oldDoc!._id,
      file_sha: oldResult!.file_sha,
      doc: oldDoc!,
    },
    new: {
      id: newDoc!._id,
      file_sha: newResult!.file_sha,
      doc: newDoc,
    },
  };
}

export function getChangedFileDelete (
  oldDoc: JsonDoc,
  oldResult: PutResult | RemoveResult
): ChangedFileDelete {
  return {
    operation: 'delete',
    old: {
      id: oldDoc!._id,
      file_sha: oldResult!.file_sha,
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
      id: newDoc!._id,
      file_sha: newFileSHA,
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
      id: oldDoc!._id,
      file_sha: oldFileSHA,
      doc: oldDoc!,
    },
    new: {
      id: newDoc!._id,
      file_sha: newFileSHA,
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
      id: oldDoc!._id,
      file_sha: oldFileSHA,
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
): Promise<[GitDocumentDB, ISync]> {
  const remoteURL = remoteURLBase + serialId();

  const dbNameA = serialId();

  const dbA: GitDocumentDB = new GitDocumentDB({
    db_name: dbNameA,
    local_dir: localDir,
    schema,
  });
  options ??= {
    remote_url: remoteURL,
    connection: { type: 'github', personal_access_token: token },
    include_commits: true,
  };
  options.remote_url ??= remoteURL;
  options.connection ??= { type: 'github', personal_access_token: token };
  options.include_commits ??= true;

  await dbA.createDB(options);
  const remoteA = dbA.getSynchronizer(remoteURL);

  return [dbA, remoteA];
}

export async function createClonedDatabases (
  remoteURLBase: string,
  localDir: string,
  serialId: () => string,
  options?: RemoteOptions,
  log_level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
): Promise<[GitDocumentDB, GitDocumentDB, ISync, ISync]> {
  const remoteURL = remoteURLBase + serialId();

  const dbNameA = serialId();

  const dbA: GitDocumentDB = new GitDocumentDB({
    db_name: dbNameA,
    local_dir: localDir,
    log_level: log_level ?? 'info',
  });
  options ??= {
    remote_url: remoteURL,
    connection: { type: 'github', personal_access_token: token },
    include_commits: true,
  };
  options.remote_url ??= remoteURL;
  options.connection ??= { type: 'github', personal_access_token: token };
  options.include_commits ??= true;

  await dbA.createDB(options);

  const dbNameB = serialId();
  const dbB: GitDocumentDB = new GitDocumentDB({
    db_name: dbNameB,
    local_dir: localDir,
    log_level: log_level ?? 'info',
  });
  // Clone dbA
  await dbB.createDB(options);

  const remoteA = dbA.getSynchronizer(remoteURL);
  const remoteB = dbB.getSynchronizer(remoteURL);

  return [dbA, dbB, remoteA, remoteB];
}

export const createRemoteRepository = async (remoteURL: string) => {
  await new RemoteRepository({
    remote_url: remoteURL,
    connection: {
      type: 'github',
      personal_access_token: token,
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
    remote_url: remoteURL,
    connection: {
      type: 'github',
      personal_access_token: token,
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
        ? [`${dir}/${dirent.name}`.replace(gitDDB.workingDir() + '/', '')]
        : listFiles(gitDDB, `${dir}/${dirent.name}`)
    )
    .filter(name => !name.match(/^(\.gitddb|\.git)/));
};

export const compareWorkingDirAndBlobs = async (
  gitDDB: GitDocumentDB
): Promise<boolean> => {
  const files = listFiles(gitDDB, gitDDB.workingDir());

  const currentIndex = await gitDDB.repository()?.refreshIndex();
  const entryCount = currentIndex!.entryCount() - 1; // Reduce by 1 due to '.gitddb/lib_version'
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
      gitDDB.workingDir() + '/' + file,
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

export const getWorkingDirFiles = (gitDDB: GitDocumentDB) => {
  return listFiles(gitDDB, gitDDB.workingDir()).map(filepath =>
    fs.readJSONSync(gitDDB.workingDir() + '/' + filepath)
  );
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
