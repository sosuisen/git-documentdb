/* eslint-disable max-depth */
import { editOp, insertOp, JSONOp, moveOp, replaceOp, type } from 'ot-json1';
import { ConflictResolveStrategyLabels, IJsonPatch, JsonDoc } from '../types';
import { DEFAULT_CONFLICT_RESOLVE_STRATEGY } from '../const';

export class JsonPatchOT implements IJsonPatch {
  constructor () {}

  private _textCreateOp (startNum: number, str: string): JSONOp {
    if (startNum > 0) {
      return editOp(['text'], 'text-unicode', [startNum, str]);
    }
    return editOp(['text'], 'text-unicode', [str]);
  }

  private _textReplaceOp (startNum: number, from: string, to: string): JSONOp {
    if (startNum > 0) {
      return editOp(['text'], 'text-unicode', [startNum, { d: from.length }, to]);
    }
    return editOp(['text'], 'text-unicode', [{ d: from.length }, to]);
  }

  private _textDeleteOp (startNum: number, str: string) {
    if (startNum > 0) {
      return editOp(['text'], 'text-unicode', [startNum, { d: str.length }]);
    }
    return editOp(['text'], 'text-unicode', [{ d: str.length }]);
  }

  // eslint-disable-next-line complexity
  getTextOp (text: string): JSONOp {
    // From text patch
    const operators: JSONOp[] = [];
    const lines = text.split('\n');
    let startNum: number;
    let currentLine = 0;
    for (; currentLine < lines.length; currentLine++) {
      const patchStart = lines[currentLine].match(/^@@ -(\d+?),\d+? \+\d+?,\d+? @@/);
      if (patchStart) {
        startNum = parseInt(patchStart[1], 10);
        currentLine++;
        if (currentLine >= lines.length) break;
        const isContextLine = lines[currentLine].match(/ (.+?)$/);
        if (isContextLine) {
          const context = isContextLine[1];
          startNum += context.length - 1;
          currentLine++;
      }

      const isAddOrDeleteLine = lines[currentLine].match(/([+-])(.+?)$/);
      if (!isAddOrDeleteLine) continue;

      const addOrDelete = isAddOrDeleteLine[1];
      const str = decodeURI(isAddOrDeleteLine[2]);
      if (addOrDelete === '+') {
        // Create
        operators.push(this._textCreateOp(startNum, str));
        continue;
      }
      // addOrDelete is '-'
      let isReplace = false;
      // Read next line to check replace text
      if (currentLine + 1 < lines.length) {
        const isReplaceLine = lines[currentLine + 1].match(/\+(.+?)$/);
        if (isReplaceLine) {
          isReplace = true;
          operators.push(this._textReplaceOp(startNum, str, decodeURI(isReplaceLine[1])));
        }
      }
      if (!isReplace) {
        // Delete
        operators.push(this._textDeleteOp(startNum, str));
      }
    }
    return operators.reduce(type.compose, null);
  }

  fromDiff (diff: { [key: string]: any }): JSONOp {
    const operations: JSONOp = [];
    const procTree = (ancestors: string[], tree: JsonDoc) => {
      const keys = Object.keys(tree);
      let sortedKeys: string[];
      if (keys.includes('_t')) {
        keys.sort(); // 1, 2, 3, _1, _2, _3
        let underBarStart = 0;
        for (underBarStart = 0; underBarStart < keys.length; underBarStart++) {
          if (keys[underBarStart].startsWith('_')) {
            break;
          }
        }
        const noBar = keys.slice(0, underBarStart);
        const underBar = keys.slice(underBarStart, keys.length);
        sortedKeys = underBar.concat(noBar); // _1, _2, _3, 1, 2, 3
      }
      else {
        sortedKeys = keys.sort();
      }
      sortedKeys.forEach(key => {
        if (Array.isArray(tree[key])) {
          const arr = tree[key] as any[];
          if (arr.length === 1) {
            operations.push(insertOp(ancestors.concat(key), arr[0])!);
          }
          else if (arr.length === 2) {
            operations.push(replaceOp(ancestors.concat(key), arr[0], arr[1])!);
          }
          else if (arr.length === 3) {
            const firstItem = arr[0];
            if (typeof firstItem === 'string') {
              const isTextPatch = firstItem.match(/^@@ -\d+?,\d+? \+\d+?,\d+? @@\n/m);
              if (isTextPatch) {
                const textOp = this.getTextOp(firstItem);
                if (textOp) {
                  operations.push(textOp);
                }
              }
            }
          }
        }
      });
    };
    procTree([], diff);
    if (operations.length === 1) {
      return (operations[0] as unknown) as JSONOp;
    }
    return operations;
  }

  apply (doc: JsonDoc, op: JSONOp): JsonDoc {
    return (type.apply(doc, op) as unknown) as JsonDoc;
  }

  patch (
    docOurs: JsonDoc,
    diffOurs: { [key: string]: any },
    diffTheirs?: { [key: string]: any } | undefined,
    strategy?: ConflictResolveStrategyLabels
  ): JsonDoc {
    strategy ??= DEFAULT_CONFLICT_RESOLVE_STRATEGY;
    if (diffTheirs === undefined) {
      return (type.apply(docOurs, this.fromDiff(diffOurs)) as unknown) as JsonDoc;
    }
    const opOurs = this.fromDiff(diffOurs);
    const opTheirs = this.fromDiff(diffTheirs);
    const transformedOpTheirs = this.transform(opTheirs, opOurs, strategy!);
    const newDoc = type.apply(docOurs, transformedOpTheirs!);
    return (newDoc as unknown) as JsonDoc;
  }

  // eslint-disable-next-line complexity
  resolveConflict (
    _opOurs: JSONOp,
    _opTheirs: JSONOp,
    strategy: ConflictResolveStrategyLabels
  ): [JSONOp, JSONOp, JSONOp | undefined] {
    let transformedOpTheirs;
    try {
      console.log('trying ours: ' + JSON.stringify(_opOurs));
      console.log('trying theirs: ' + JSON.stringify(_opTheirs));
      transformedOpTheirs = type.transform(_opTheirs, _opOurs, 'right');
    } catch (err) {
      if (err.conflict) {
        console.log('conflict: ' + JSON.stringify(err.conflict));
        const conflict = err.conflict as { type: number; op1: any[]; op2: any[] };
        let conflictedOperation;

        // Remove conflicted op from targetOperations
        let targetOperations;
        if (strategy.startsWith('ours')) {
          // NOTE: op1 is opTheirs, op2 is opOurs
          conflictedOperation = conflict.op1;
          targetOperations = JSON.parse(JSON.stringify(_opTheirs));
        }
        else {
          conflictedOperation = conflict.op2;
          targetOperations = JSON.parse(JSON.stringify(_opOurs));
        }
        // Location is array.
        const conflictedLocation = conflictedOperation.slice(0, -1);
        // Get p, r, d, i, e
        const conflictedCommands = Object.keys(
          conflictedOperation[conflictedOperation.length - 1]
        );

        if (targetOperations.length > 1 && !Array.isArray(targetOperations[0])) {
          // Operation (e.g. {p: 0})
          const op: { [command: string]: string } =
            targetOperations[targetOperations.length - 1];
          conflictedCommands.forEach(command => delete op[command]);
          targetOperations[targetOperations.length - 1] = op;
        }
        else if (targetOperations.length > 1) {
          // Search conflictedLocation in targetOperations
          let loc = -1;
          for (let i = 0; i < targetOperations.length; i++) {
            if (targetOperations[i].length - 1 === conflictedLocation.length) {
              for (let j = 0; j < conflictedLocation.length; j++) {
                if (targetOperations[i][j] !== conflictedLocation[j]) {
                  break;
                }
                if (j === conflictedLocation.length - 1) {
                  loc = i;
                }
              }
              if (loc >= 0) {
                break;
              }
            }
          }
          if (loc >= 0) {
            const op: { [command: string]: string } =
              targetOperations[loc][targetOperations[loc].length - 1];
            conflictedCommands.forEach(command => delete op[command]);
            if (Object.keys(op).length > 0) {
              targetOperations[loc][targetOperations[loc].length - 1] = op;
            }
            else {
              targetOperations.splice(loc, 1);
            }
            if (targetOperations.length === 1) {
              targetOperations = targetOperations[0];
            }
            console.log('# resolved: ' + JSON.stringify(targetOperations));
          }
        }
        if (strategy.startsWith('ours')) {
          return [JSON.parse(JSON.stringify(_opOurs)), targetOperations, undefined];
        }
        return [targetOperations, JSON.parse(JSON.stringify(_opTheirs)), undefined];
      }
      throw err;
    }
    return [
      JSON.parse(JSON.stringify(_opOurs)),
      JSON.parse(JSON.stringify(_opTheirs)),
      transformedOpTheirs,
    ];
  }

  transform (opTheirs: JSONOp, opOurs: JSONOp, strategy: ConflictResolveStrategyLabels) {
    let transformedOpTheirs;
    while (transformedOpTheirs === undefined) {
      [opOurs, opTheirs, transformedOpTheirs] = this.resolveConflict(
        opOurs,
        opTheirs,
        strategy
      );
    }
    return transformedOpTheirs;
  }
}
