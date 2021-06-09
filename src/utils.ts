/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import nodegit from '@sosuisen/nodegit';
import { ReadCommitResult } from 'isomorphic-git';
import { DocMetadata, NormalizedCommit } from './types';

/**
 * @internal
 */
export function sleep (msec: number) {
  return new Promise(resolve => setTimeout(resolve, msec));
}

/**
 * Returns JSON string which properties are sorted.
 * The sorting follows the UTF-16 (Number < Uppercase < Lowercase), except that heading underscore _ is the last.
 * Its indent is 2.
 *
 * NOTE: Heading underscore cannot be the first because replacing '\uffff' with '\u0000' does not effect to sorting order.
 *
 */
export function toSortedJSONString (obj: Record<string, any>) {
  return JSON.stringify(
    obj,
    (key, v) =>
      !(Array.isArray(v) || v === null) && typeof v === 'object'
        ? Object.keys(v)
          .sort((a, b) => {
            // Heading underscore is treated as the last character.
            a = a.startsWith('_') ? '\uffff' + a.slice(1) : a;
            b = b.startsWith('_') ? '\uffff' + b.slice(1) : b;
            return a > b ? 1 : a < b ? -1 : 0;
          })
          .reduce((r, k) => {
            r[k] = v[k];
            return r;
          }, {} as Record<string, any>)
        : v,
    2
  );
}

/**
 * Get metadata of all files from current Git index
 *
 * @internal
 */
export async function getAllMetadata (repos: nodegit.Repository) {
  const files: DocMetadata[] = [];
  const head = await nodegit.Reference.nameToId(repos, 'HEAD').catch(e => false);
  if (head) {
    const headCommit = await repos.getCommit(head as nodegit.Oid);
    const localTree = await headCommit.getTree();
    const directories: nodegit.Tree[] = [];
    directories.push(localTree);

    while (directories.length > 0) {
      const dir = directories.shift();
      if (dir === undefined) break;
      const entries = dir.entries(); // returns entry by alphabetical order
      while (entries.length > 0) {
        const entry = entries.shift();
        if (entry?.isDirectory()) {
          // eslint-disable-next-line max-depth
          if (entry.name() !== '.gitddb') {
            // eslint-disable-next-line no-await-in-loop
            const subtree = await entry.getTree();
            directories.push(subtree);
          }
        }
        else {
          const entryPath = entry!.path();
          const ext = path.extname(entryPath);
          const id = entryPath.replace(new RegExp(ext + '$'), '');

          const docMetadata: DocMetadata = {
            id,
            fileSha: entry!.id().tostrS(),
            type: ext === '.json' ? 'json' : 'raw',
          };
          files.push(docMetadata);
        }
      }
    }
  }
  return files;
}

/**
 * Get normalized commit
 */
export function normalizeCommit (commit: ReadCommitResult): NormalizedCommit {
  const normalized: NormalizedCommit = {
    sha: commit.oid,
    message: commit.commit.message.trimEnd(),
    parent: commit.commit.parent,
    author: {
      name: commit.commit.author.name,
      email: commit.commit.author.email,
      timestamp: new Date(commit.commit.author.timestamp),
    },
    committer: {
      name: commit.commit.committer.name,
      email: commit.commit.committer.email,
      timestamp: new Date(commit.commit.committer.timestamp),
    },
  };
  if (commit.commit.gpgsig !== undefined) {
    normalized.gpgsig = commit.commit.gpgsig;
  }
  return normalized;
}

/**
 * Template literal tag for console style
 * https://bluesock.org/~willkg/dev/ansi.html#ansicodes
 *
 * @internal
 */
class ConsoleStyleClass {
  private _style = '';
  constructor (style?: string) {
    this._style = style ?? '';
  }

  tag = () => {
    return (literals: TemplateStringsArray, ...placeholders: any[]) => {
      let result = this._style;
      for (let i = 0; i < placeholders.length; i++) {
        result += literals[i];
        result += placeholders[i].toString();
      }
      result += literals[literals.length - 1];
      // Reset style
      result += '\x1b[0m';
      return result;
    };
  };
  /*
  bright = () => new ConsoleStyleClass(this._style + '\x1b[1m');
  dim = () => new ConsoleStyleClass(this._style + '\x1b[2m');
  underscore = () => new ConsoleStyleClass(this._style + '\x1b[4m');
  blink = () => new ConsoleStyleClass(this._style + '\x1b[5m');
  reverse = () => new ConsoleStyleClass(this._style + '\x1b[7m');
  hidden = () => new ConsoleStyleClass(this._style + '\x1b[8m');
  */

  fgBlack = () => new ConsoleStyleClass(this._style + '\x1b[30m');
  bgWhite = () => new ConsoleStyleClass(this._style + '\x1b[47m');

  fgRed = () => new ConsoleStyleClass(this._style + '\x1b[31m');
  bgRed = () => new ConsoleStyleClass(this._style + '\x1b[41m');
  bgGreen = () => new ConsoleStyleClass(this._style + '\x1b[42m');
  bgYellow = () => new ConsoleStyleClass(this._style + '\x1b[43m');

  /*
  fgGreen = () => new ConsoleStyleClass(this._style + '\x1b[32m');
  fgYellow = () => new ConsoleStyleClass(this._style + '\x1b[33m');
  fgBlue = () => new ConsoleStyleClass(this._style + '\x1b[34m');
  fgMagenta = () => new ConsoleStyleClass(this._style + '\x1b[35m');
  fgCyan = () => new ConsoleStyleClass(this._style + '\x1b[36m');
  fgWhite = () => new ConsoleStyleClass(this._style + '\x1b[37m');

  bgBlack = () => new ConsoleStyleClass(this._style + '\x1b[40m');

  bgBlue = () => new ConsoleStyleClass(this._style + '\x1b[44m');
  bgMagenta = () => new ConsoleStyleClass(this._style + '\x1b[45m');
  bgCyan = () => new ConsoleStyleClass(this._style + '\x1b[46m');
  */
}

export const CONSOLE_STYLE = new ConsoleStyleClass('');
