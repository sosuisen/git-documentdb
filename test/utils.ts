import path from 'path';
import git from '@sosuisen/isomorphic-git';
import fs from 'fs-extra';
import { GitDDBInterface } from '../src/types_gitddb';

export async function addOneData (
  gitDDB: GitDDBInterface,
  fullDocPath: string,
  data: string,
  author?: { name?: string; email?: string },
  committer?: { name?: string; email?: string }
) {
  fs.ensureDirSync(path.dirname(path.resolve(gitDDB.workingDir, fullDocPath)));
  fs.writeFileSync(path.resolve(gitDDB.workingDir, fullDocPath), data);
  await git.add({ fs, dir: gitDDB.workingDir, filepath: fullDocPath });
  await git.commit({
    fs,
    dir: gitDDB.workingDir,
    message: 'message',
    author: author ?? gitDDB.author,
    committer: committer ?? gitDDB.committer,
  });
}

export async function removeOneData (gitDDB: GitDDBInterface, fullDocPath: string) {
  await git.remove({ fs, dir: gitDDB.workingDir, filepath: fullDocPath });
  fs.removeSync(path.resolve(gitDDB.workingDir, fullDocPath));
  await git.commit({
    fs,
    dir: gitDDB.workingDir,
    message: 'message',
    author: gitDDB.author,
  });
}
