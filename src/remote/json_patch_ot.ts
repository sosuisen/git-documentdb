/* eslint-disable unicorn/prefer-spread */
/* eslint-disable max-depth */
import { editOp, insertOp, JSONOp, removeOp, replaceOp, type } from 'ot-json1';
import { uniCount } from 'unicount';
import { ConflictResolutionStrategyLabels, IJsonPatch, JsonDoc } from '../types';
import { DEFAULT_CONFLICT_RESOLUTION_STRATEGY } from '../const';

export class JsonPatchOT implements IJsonPatch {
  constructor () {}

  private _textCreateOp (path: string[], startNum: number, str: string): JSONOp {
    if (startNum > 0) {
      return editOp(path, 'text-unicode', [startNum, str]);
    }
    return editOp(path, 'text-unicode', [str]);
  }

  private _textReplaceOp (
    path: string[],
    startNum: number,
    from: string,
    to: string
  ): JSONOp {
    if (startNum > 0) {
      return editOp(path, 'text-unicode', [startNum, { d: uniCount(from) }, to]);
    }
    return editOp(path, 'text-unicode', [{ d: uniCount(from) }, to]);
  }

  private _textDeleteOp (path: string[], startNum: number, str: string) {
    if (startNum > 0) {
      return editOp(path, 'text-unicode', [startNum, { d: uniCount(str) }]);
    }
    return editOp(path, 'text-unicode', [{ d: uniCount(str) }]);
  }

  // eslint-disable-next-line complexity
  getTextOp (path: string[], text: string): JSONOp {
    // From text patch
    const operators: JSONOp[] = [];
    const lines = text.split('\n');
    let startNum = 0;
    let currentLine = 0;
    for (; currentLine < lines.length; currentLine++) {
      const line = decodeURI(lines[currentLine]);

      let patchStart = line.match(/^@@ -(\d+?),\d+? \+\d+?,\d+? @@/);
      if (!patchStart) patchStart = line.match(/^@@ -(\d+?) \+\d+?,\d+? @@/m);
      if (!patchStart) patchStart = line.match(/^@@ -(\d+?),\d+? \+\d+? @@/m);
      if (patchStart) {
        startNum = parseInt(patchStart[1], 10) - 1;
        continue;
      }

      // Need s option to allow . to match newline characters.
      const isContextLine = line.match(/^ (.+?)$/s);
      if (isContextLine) {
        const context = isContextLine[1];
        startNum += uniCount(context);
        continue;
      }

      // Need s option to allow . to match newline characters.
      const isAddOrDeleteLine = line.match(/^([+-])(.+?)$/s);
      if (isAddOrDeleteLine) {
        const addOrDelete = isAddOrDeleteLine[1];
        const str = isAddOrDeleteLine[2];
        if (addOrDelete === '+') {
          // Create
          operators.push(this._textCreateOp(path, startNum, str));
          startNum += uniCount(str);
          continue;
        }
        // addOrDelete is '-'
        let isReplace = false;
        // Read next line to check replace text
        if (currentLine + 1 < lines.length) {
          const nextLine = decodeURI(lines[currentLine + 1]);
          // Need s option to allow . to match newline characters.
          const isReplaceLine = nextLine.match(/^\+(.+?)$/s);
          if (isReplaceLine) {
            isReplace = true;
            const replaceTo = isReplaceLine[1];
            operators.push(this._textReplaceOp(path, startNum, str, replaceTo));
            currentLine++;
            startNum += uniCount(replaceTo) - uniCount(str);
          }
        }
        if (!isReplace) {
          // Delete
          operators.push(this._textDeleteOp(path, startNum, str));
          startNum -= uniCount(str);
        }
      }
    }
    return operators.reduce(type.compose, null);
  }

  fromDiff (diff: { [key: string]: any }): JSONOp {
    const operations: JSONOp[] = [];
    const procTree = (ancestors: string[], tree: JsonDoc) => {
      const keys = Object.keys(tree);
      let sortedKeys: string[];
      if (keys.includes('_t')) {
        // is Array
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
        // is Object
        sortedKeys = keys.sort();
      }
      // eslint-disable-next-line complexity
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
            if (arr[1] === 0 && arr[2] === 0) {
              operations.push(removeOp(ancestors.concat(key)));
            }
            else if (typeof firstItem === 'string') {
              let isTextPatch = firstItem.match(/^@@ -\d+?,\d+? \+\d+?,\d+? @@\n/m);
              if (!isTextPatch)
                isTextPatch = firstItem.match(/^@@ -\d+? \+\d+?,\d+? @@\n/m);
              if (!isTextPatch)
                isTextPatch = firstItem.match(/^@@ -\d+?,\d+? \+\d+? @@\n/m);
              if (isTextPatch) {
                const textOp = this.getTextOp(ancestors.concat(key), firstItem);
                if (textOp) {
                  operations.push(textOp);
                }
              }
            }
          }
        }
        else if (typeof tree[key] === 'object') {
          procTree(ancestors.concat(key), tree[key]);
        }
      });
    };
    procTree([], diff);
    if (operations.length === 1) {
      return (operations[0] as unknown) as JSONOp;
    }
    /**
     * A path can be a flat array format in the specification. e.g.) ['x', 'y', {i:2}]
     * https://github.com/ottypes/json1/blob/master/spec.md
     * However type.transform function does not accept the flat array format.
     * Use a nested array format instead. e.g.) ['x', ['y', {i:2}]].
     * type.compose converts the flat array format to the nested array format.
     */
    return operations.reduce(type.compose, null);
  }

  apply (doc: JsonDoc, op: JSONOp): JsonDoc {
    return (type.apply(doc, op) as unknown) as JsonDoc;
  }

  patch (
    docOurs: JsonDoc,
    diffOurs: { [key: string]: any },
    docTheirs?: JsonDoc | undefined,
    diffTheirs?: { [key: string]: any } | undefined,
    strategy?: ConflictResolutionStrategyLabels
  ): JsonDoc {
    strategy ??= DEFAULT_CONFLICT_RESOLUTION_STRATEGY;
    if (docTheirs === undefined || diffTheirs === undefined) {
      return (type.apply(docOurs, this.fromDiff(diffOurs)) as unknown) as JsonDoc;
    }
    // console.log(JSON.stringify(diffOurs));
    // console.log(JSON.stringify(diffTheirs));
    const opOurs = this.fromDiff(diffOurs);
    // console.log('opOurs: ' + JSON.stringify(opOurs) + '\n');
    const opTheirs = this.fromDiff(diffTheirs);
    // console.log('opTheirs: ' + JSON.stringify(opTheirs) + '\n');
    const transformedOp = this.transform(opTheirs, opOurs, strategy!);
    // console.log('# transformed: ' + JSON.stringify(transformedOp) + '\n');
    let newDoc: JsonDoc;
    if (strategy.startsWith('ours')) {
      newDoc = (type.apply(docOurs, transformedOp!) as unknown) as JsonDoc;
    }
    else {
      // console.log('# apply to: ' + JSON.stringify(docTheirs));
      newDoc = (type.apply(docTheirs, transformedOp!) as unknown) as JsonDoc;
    }
    return newDoc;
  }

  // eslint-disable-next-line complexity
  resolveConflict (
    opOurs: JSONOp,
    opTheirs: JSONOp,
    strategy: ConflictResolutionStrategyLabels
  ): [JSONOp, JSONOp, JSONOp | undefined] {
    let transformedOp;
    try {
      // console.log('trying ours: ' + JSON.stringify(opOurs));
      // console.log('trying theirs: ' + JSON.stringify(opTheirs));
      if (strategy.startsWith('ours')) {
        transformedOp = type.transform(opTheirs, opOurs, 'right');
      }
      else {
        transformedOp = type.transform(opOurs, opTheirs, 'right');
      }
    } catch (err: unknown) {
      if ((err as { conflict: any }).conflict) {
        // console.log('conflict: ' + JSON.stringify(err.conflict));
        const conflict = (err as { conflict: any }).conflict as {
          type: number;
          op1: any[];
          op2: any[];
        };
        let conflictedOperation;

        // Remove conflicted op from targetOperations
        let targetOperations;
        if (strategy.startsWith('ours')) {
          // NOTE: op1 is opTheirs, op2 is opOurs
          conflictedOperation = conflict.op1;
          targetOperations = JSON.parse(JSON.stringify(opTheirs));
        }
        else {
          conflictedOperation = conflict.op2;
          targetOperations = JSON.parse(JSON.stringify(opOurs));
        }
        // Get JSON array of conflicted path
        const conflictedPath = JSON.stringify(conflictedOperation.slice(0, -1));

        // Get p, r, d, i, e
        const conflictedCommands = Object.keys(
          conflictedOperation[conflictedOperation.length - 1]
        );

        const resolvedOperations: any[] = [];

        const stack: { pathFromRoot: string[]; opArray: any[] }[] = [
          {
            pathFromRoot: [],
            opArray: targetOperations,
          },
        ];
        while (stack.length > 0) {
          const { pathFromRoot, opArray } = stack.pop()!;

          if (opArray.length === 0) continue;

          const opPath: string[] = [];
          for (const opElm of opArray) {
            if (typeof opElm === 'string') {
              pathFromRoot.push(opElm);
            }
            else if (Array.isArray(opElm)) {
              stack.push({
                pathFromRoot: [...pathFromRoot],
                opArray: JSON.parse(JSON.stringify(opElm)),
              });
            }
            else {
              // Operation (e.g. {p: 0})
              if (JSON.stringify(pathFromRoot) === conflictedPath) {
                conflictedCommands.forEach(command => delete opElm[command]);
              }
              if (Object.keys(opElm).length > 0) {
                const resolvedOp = pathFromRoot.concat(opElm);
                resolvedOperations.push(resolvedOp);
              }
            }
          }
        }
        // console.log('# resolved: ' + JSON.stringify(resolvedOperations));
        const resolvedOperationsComposed = resolvedOperations.reduce(type.compose, null);
        // console.log('# resolved composed: ' + JSON.stringify(resolvedOperationsComposed));

        if (strategy.startsWith('ours')) {
          return [
            JSON.parse(JSON.stringify(opOurs)),
            resolvedOperationsComposed,
            undefined,
          ];
        }
        return [
          resolvedOperationsComposed,
          JSON.parse(JSON.stringify(opTheirs)),
          undefined,
        ];
      }
      throw err;
    }
    return [
      JSON.parse(JSON.stringify(opOurs)),
      JSON.parse(JSON.stringify(opTheirs)),
      transformedOp,
    ];
  }

  transform (opTheirs: JSONOp, opOurs: JSONOp, strategy: ConflictResolutionStrategyLabels) {
    let transformedOp;
    while (transformedOp === undefined) {
      [opOurs, opTheirs, transformedOp] = this.resolveConflict(opOurs, opTheirs, strategy);
    }
    return transformedOp;
  }
}
