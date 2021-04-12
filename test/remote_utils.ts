import fs from 'fs-extra';
import { Octokit } from '@octokit/rest';
import sinon from 'sinon';
import nodegit from '@sosuisen/nodegit';
import { ISync, RemoteOptions } from '../src/types';
import { GitDocumentDB } from '../src/index';
import { FILE_REMOVE_TIMEOUT } from '../src/const';
import { RemoteRepository } from '../src/remote/remote_repository';

const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

export async function createDatabase (
  remoteURLBase: string,
  localDir: string,
  serialId: () => string,
  options?: RemoteOptions
): Promise<[GitDocumentDB, ISync]> {
  const remoteURL = remoteURLBase + serialId();

  const dbNameA = serialId();

  const dbA: GitDocumentDB = new GitDocumentDB({
    db_name: dbNameA,
    local_dir: localDir,
  });
  options ??= {
    remote_url: remoteURL,
    auth: { type: 'github', personal_access_token: token },
    include_commits: true,
  };
  options.remote_url ??= remoteURL;

  await dbA.create(options);
  const remoteA = dbA.getRemote(remoteURL);

  return [dbA, remoteA];
}

export async function createClonedDatabases (
  remoteURLBase: string,
  localDir: string,
  serialId: () => string,
  options?: RemoteOptions
): Promise<[GitDocumentDB, GitDocumentDB, ISync, ISync]> {
  const remoteURL = remoteURLBase + serialId();

  const dbNameA = serialId();

  const dbA: GitDocumentDB = new GitDocumentDB({
    db_name: dbNameA,
    local_dir: localDir,
  });
  options ??= {
    remote_url: remoteURL,
    auth: { type: 'github', personal_access_token: token },
    include_commits: true,
  };
  options.remote_url ??= remoteURL;

  await dbA.create(options);

  const dbNameB = serialId();
  const dbB: GitDocumentDB = new GitDocumentDB({
    db_name: dbNameB,
    local_dir: localDir,
  });
  // Clone dbA
  await dbB.create(options);

  const remoteA = dbA.getRemote(remoteURL);
  const remoteB = dbB.getRemote(remoteURL);

  return [dbA, dbB, remoteA, remoteB];
}

export const createRemoteRepository = async (remoteURL: string) => {
  await new RemoteRepository(remoteURL, {
    type: 'github',
    personal_access_token: token,
  })
    .create()
    .catch(err => {
      console.debug('Cannot create: ' + remoteURL);
      console.debug(err);
    });
};

export const destroyRemoteRepository = async (remoteURL: string) => {
  await new RemoteRepository(remoteURL, {
    type: 'github',
    personal_access_token: token,
  })
    .destroy()
    .catch(err => {
      console.debug('Cannot delete: ' + remoteURL);
      console.debug(err);
    });
};

export async function removeRemoteRepositories (reposPrefix: string) {
  // Remove test repositories on remote
  console.log('Removing remote repositories..');
  const octokit = new Octokit({
    auth: token,
  });
  const promises: Promise<any>[] = [];
  let len = 0;
  do {
    // eslint-disable-next-line no-await-in-loop
    const reposArray = await octokit.repos.listForAuthenticatedUser({ per_page: 100 });
    len = reposArray.data.length;
    reposArray.data.forEach(repos => {
      if (repos) {
        const urlArray = repos.full_name.split('/');
        const owner = urlArray[0];
        const repo = urlArray[1];
        if (repo.startsWith(reposPrefix)) {
          console.log('removing remote: ' + repos.full_name);
          promises.push(
            octokit.repos.delete({ owner, repo }).catch(err => {
              if (err.status !== 404) {
                console.debug(err);
              }
            })
          );
        }
      }
    });
  } while (len === 100);
  await Promise.all(promises);
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
    DBs.map(db => db.destroy().catch(err => console.debug(err.toString())))
  ).catch(err => console.log(err));
  await clock.tickAsync(FILE_REMOVE_TIMEOUT);
  clock.restore();
};
