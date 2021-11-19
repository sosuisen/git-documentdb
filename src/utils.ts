/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import fs from 'fs-extra';
import yaml from 'js-yaml';
import {
  readBlob,
  ReadCommitResult,
  readTree,
  resolveRef,
  TreeEntry,
  TreeObject,
} from '@sosuisen/isomorphic-git';
import {
  BinaryDocMetadata,
  DocMetadata,
  DocType,
  JsonDocMetadata,
  NormalizedCommit,
  SerializeFormat,
  TextDocMetadata,
} from './types';
import { FRONT_MATTER_POSTFIX, GIT_DOCUMENTDB_METADATA_DIR, JSON_POSTFIX } from './const';

/**
 * @internal
 */
export function sleep (msec: number) {
  return new Promise(resolve => setTimeout(resolve, msec));
}

// eslint-disable-next-line @typescript-eslint/naming-convention
const decoder = new TextDecoder(); // default 'utf-8' or 'utf8'
// eslint-disable-next-line @typescript-eslint/naming-convention
const encoder = new TextEncoder(); // default 'utf-8' or 'utf8'
/**
 * utf8decode
 *
 * @internal
 */
export function utf8decode (uint8array: Uint8Array) {
  return decoder.decode(uint8array);
}
/**
 * utf8encode
 *
 * @internal
 */
export function utf8encode (utf8: string) {
  return encoder.encode(utf8);
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

export function toYAML (obj: Record<string, any>) {
  return yaml.dump(obj, { sortKeys: true });
}

export function toFrontMatterMarkdown (obj: Record<string, any>) {
  const body = typeof obj._body === 'string' ? obj._body : '';
  const clone = JSON.parse(JSON.stringify(obj));
  delete clone._body;
  let hasOnlyId = true;
  for (const key of Object.keys(clone)) {
    if (key !== '_id') {
      hasOnlyId = false;
      break;
    }
  }
  if (hasOnlyId) {
    return body;
  }

  const frontMatter = '---\n' + yaml.dump(clone, { sortKeys: true }) + '---\n';
  return frontMatter + body;
}

/**
 * Get metadata of all files from current Git index
 *
 * @internal
 */
// eslint-disable-next-line complexity
export async function getAllMetadata (
  workingDir: string,
  serializeFormat: SerializeFormat
): Promise<DocMetadata[]> {
  const files: DocMetadata[] = [];
  const commitOid = await resolveRef({ fs, dir: workingDir, ref: 'HEAD' }).catch(
    () => undefined
  );

  if (commitOid === undefined) return [];

  const treeResult = (await readTree({
    fs,
    dir: workingDir,
    oid: commitOid,
  }).catch(() => undefined))!;

  const directories: { path: string; entries: TreeObject }[] = []; // type TreeObject = Array<TreeEntry>
  const targetDir = '';
  if (treeResult) {
    directories.push({ path: targetDir, entries: treeResult.tree });
  }

  const docs: DocMetadata[] = [];
  while (directories.length > 0) {
    const directory = directories.shift();
    if (directory === undefined) break;

    const entries: TreeEntry[] = directory.entries;

    for (const entry of entries) {
      const fullDocPath =
        directory.path !== '' ? `${directory.path}/${entry.path}` : entry.path;
      if (entry.type === 'tree') {
        if (fullDocPath !== GIT_DOCUMENTDB_METADATA_DIR) {
          // eslint-disable-next-line no-await-in-loop
          const { tree } = await readTree({
            fs,
            dir: workingDir,
            oid: entry.oid,
          });
          directories.push({ path: fullDocPath, entries: tree });
        }
      }
      else {
        // eslint-disable-next-line no-await-in-loop
        const readBlobResult = await readBlob({
          fs,
          dir: workingDir,
          oid: commitOid,
          filepath: fullDocPath,
        }).catch(() => undefined);

        // Skip if cannot read
        if (readBlobResult === undefined) continue;

        const docType: DocType = serializeFormat.hasObjectExtension(fullDocPath)
          ? 'json'
          : 'text';
        if (docType === 'text') {
          // TODO: select binary or text by .gitattribtues
        }
        if (docType === 'json') {
          const _id = serializeFormat.removeExtension(fullDocPath);
          const meta: JsonDocMetadata = {
            _id,
            name: fullDocPath,
            fileOid: entry.oid,
            type: 'json',
          };
          docs.push(meta);
        }
        else if (docType === 'text') {
          const meta: TextDocMetadata = {
            name: fullDocPath,
            fileOid: entry.oid,
            type: 'text',
          };
          docs.push(meta);
        }
        else if (docType === 'binary') {
          const meta: BinaryDocMetadata = {
            name: fullDocPath,
            fileOid: entry.oid,
            type: 'binary',
          };
          docs.push(meta);
        }
      }
    }
  }

  return docs;
}

/**
 * Get normalized commit
 */
export function normalizeCommit (commit: ReadCommitResult): NormalizedCommit {
  const normalized: NormalizedCommit = {
    oid: commit.oid,
    message: commit.commit.message.trimEnd(),
    parent: commit.commit.parent,
    author: {
      name: commit.commit.author.name,
      email: commit.commit.author.email,
      timestamp: commit.commit.author.timestamp * 1000,
    },
    committer: {
      name: commit.commit.committer.name,
      email: commit.commit.committer.email,
      timestamp: commit.commit.committer.timestamp * 1000,
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
