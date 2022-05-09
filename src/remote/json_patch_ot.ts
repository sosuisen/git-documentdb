/* eslint-disable unicorn/prefer-spread */
/* eslint-disable max-depth */
import { editOp, insertOp, JSONOp, moveOp, removeOp, replaceOp, type } from 'ot-json1';
import { uniCount } from 'unicount';
import {
  ConflictResolutionStrategyLabels,
  IJsonPatch,
  JsonDiffPatchOptions,
  JsonDoc,
} from '../types';
import { DEFAULT_CONFLICT_RESOLUTION_STRATEGY } from '../const';

export class JsonPatchOT implements IJsonPatch {
  private _keyOfUniqueArray: string[];

  constructor (options?: JsonDiffPatchOptions) {
    options ??= {
      keyOfUniqueArray: undefined,
    };
    this._keyOfUniqueArray =
      options.keyOfUniqueArray !== undefined ? options.keyOfUniqueArray : [];
  }

  private _textCreateOp (path: (string | number)[], startNum: number, str: string): JSONOp {
    if (startNum > 0) {
      return editOp(path, 'text-unicode', [startNum, str]);
    }
    return editOp(path, 'text-unicode', [str]);
  }

  private _textReplaceOp (
    path: (string | number)[],
    startNum: number,
    from: string,
    to: string
  ): JSONOp {
    if (startNum > 0) {
      return editOp(path, 'text-unicode', [startNum, { d: uniCount(from) }, to]);
    }
    return editOp(path, 'text-unicode', [{ d: uniCount(from) }, to]);
  }

  private _textDeleteOp (path: (string | number)[], startNum: number, str: string) {
    if (startNum > 0) {
      return editOp(path, 'text-unicode', [startNum, { d: uniCount(str) }]);
    }
    return editOp(path, 'text-unicode', [{ d: uniCount(str) }]);
  }

  // eslint-disable-next-line complexity
  getTextOp (path: (string | number)[], text: string): JSONOp {
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
    if (diff === undefined) return null; // Do not be undefined. Use null.
    const operations: JSONOp[] = [];
    const procTree = (ancestors: (string | number)[], tree: JsonDoc) => {
      const keys = Object.keys(tree);
      let sortedKeys: (string | number)[] = [];
      const isArray = keys.includes('_t');

      const nest: string[] = [];
      const insOp: string[] = [];
      const replOp: string[] = [];
      const remOp: string[] = [];
      const movOp: string[] = [];
      const txtOp: string[] = [];

      if (isArray) {
        // is Array
        // underscore _ means 'remove' or 'move' operation
        keys.sort(); // 1, 2, 3, _1, _2, _3
        // console.log('## start parse keys: ' + JSON.stringify(keys));
        let underBarStart = 0;
        for (underBarStart = 0; underBarStart < keys.length; underBarStart++) {
          if (keys[underBarStart].startsWith('_')) {
            break;
          }
        }

        // no bar: insert/replace/text
        keys.slice(0, underBarStart).forEach(key => {
          if (!Array.isArray(tree[key])) nest.push(key);
          else if (tree[key].length === 1) insOp.push(key);
          else if (tree[key].length === 2) replOp.push(key);
          else if (tree[key].length === 3 && typeof tree[key][0] === 'string')
            txtOp.push(key);
        });

        // underBar: remove/move
        // eslint-disable-next-line complexity
        keys.slice(underBarStart, keys.length).forEach(key => {
          if (!Array.isArray(tree[key])) nest.push(key);
          else if (tree[key].length === 3) {
            const arr = tree[key];
            if (arr[1] === 0 && arr[2] === 0) remOp.push(key);
            else if (arr[0] === '' && arr[2] === 3) movOp.push(key);
          }
        });
        movOp.sort(
          (a, b) =>
            // sort by destination position
            tree[a][1] - tree[b][1]
        );
        insOp.sort(
          (a, b) =>
            // sort by destination position
            parseInt(a, 10) - parseInt(b, 10)
        );
        // sort order: replace, text, remove, insert, move
        sortedKeys = sortedKeys.concat(replOp, txtOp, remOp, movOp, insOp, nest);
      }
      else {
        // is Object
        sortedKeys = keys.sort();
      }
      const removedIndex: (string | number)[] = [];
      const insertedIndex: (string | number)[] = [];
      const movedOperation: { from: number; to: number }[] = [];
      // eslint-disable-next-line complexity
      sortedKeys.forEach(key => {
        // console.log('# ' + key);
        if (Array.isArray(tree[key])) {
          const arr = tree[key] as any[];
          if (arr.length === 1) {
            // Insert
            if (isArray && typeof key === 'string') {
              key = parseInt(key.replace(/^_/, ''), 10); // Remove heading underscore
            }
            if (isArray) {
              let dstOffset = 0;
              movOp.forEach(mop => {
                const from = parseInt(mop, 10);
                const to = tree[mop][1] as number;
                if (from < (key as number) && to > key) dstOffset++;
                if (from > (key as number) && to < key) dstOffset--;
              });
              operations.push(
                insertOp(ancestors.concat((key as number) + dstOffset), arr[0])!
              );
              insertedIndex.push(key);
            }
            else {
              operations.push(insertOp(ancestors.concat(key), arr[0])!);
            }
          }
          else if (arr.length === 2) {
            // Replace
            if (isArray && typeof key === 'string') {
              key = parseInt(key.replace(/^_/, ''), 10); // Remove heading underscore
            }
            operations.push(replaceOp(ancestors.concat(key), arr[0], arr[1])!);
          }
          else if (arr.length === 3) {
            const firstItem = arr[0];
            if (isArray && typeof key === 'string') {
              key = parseInt(key.replace(/^_/, ''), 10); // Remove heading underscore
            }
            if (arr[1] === 0 && arr[2] === 0) {
              // Remove
              // See https://github.com/benjamine/jsondiffpatch/blob/master/docs/deltas.md
              if (typeof key === 'string') {
                // Remove property
                operations.push(removeOp(ancestors.concat(key)));
              }
              else {
                // Remove from array
                const offset = -removedIndex.length;
                operations.push(removeOp(ancestors.concat((key as number) + offset)));
                removedIndex.push(key);
              }
            }
            else if (arr[0] === '' && arr[2] === 3) {
              // Moved
              // See https://github.com/benjamine/jsondiffpatch/blob/master/docs/deltas.md
              if (isArray) {
                let offset = 0;
                removedIndex.forEach(index => {
                  if (parseInt(index as string, 10) <= parseInt(key as string, 10))
                    offset--;
                });
                /*
                insertedIndex.forEach(index => {
                  if (parseInt(index as string, 10) <= parseInt(key as string, 10))
                    offset++;
                });
                */
                movedOperation.forEach(mop => {
                  if (mop.from < (key as number) && mop.to > arr[1]) offset--;
                  if (mop.from > (key as number) && mop.to < arr[1]) offset++;
                });

                let dstOffset = 0;
                insOp.forEach(iop => {
                  if (parseInt(iop as string, 10) <= parseInt(arr[1] as string, 10))
                    dstOffset--;
                });
                operations.push(
                  moveOp(
                    ancestors.concat((key as number) + offset),
                    ancestors.concat((arr[1] as number) + dstOffset)
                  )
                );
                movedOperation.push({ from: key as number, to: arr[1] });
              }
              else {
                operations.push(moveOp(ancestors.concat(key), ancestors.concat(arr[1])));
              }
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
          if (isArray && typeof key === 'string') {
            key = parseInt(key.replace(/^_/, ''), 10); // Remove heading underscore
          }
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
    const reducedOperations = operations.reduce(type.compose, null);
    return reducedOperations;
  }

  apply (doc: JsonDoc, op: JSONOp): JsonDoc {
    return (type.apply(doc, op) as unknown) as JsonDoc;
  }

  // eslint-disable-next-line complexity
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

    if (this._keyOfUniqueArray !== undefined && this._keyOfUniqueArray.length > 0) {
      const ourTrees: JsonDoc[] = [docOurs];
      const theirTrees: JsonDoc[] = [docTheirs];
      const trees: JsonDoc[] = [newDoc];
      while (trees.length > 0) {
        const currentTree = trees.pop();
        const currentOurTree = ourTrees.pop();
        const currentTheirTree = theirTrees.pop();
        if (
          currentTree === undefined ||
          currentOurTree === undefined ||
          currentTheirTree === undefined
        )
          break;

        Object.keys(currentTree!).forEach(key => {
          if (!Array.isArray(currentTree![key]) && typeof currentTree![key] === 'object') {
            trees.push(currentTree![key]);
            ourTrees.push(currentOurTree![key]);
            theirTrees.push(currentTheirTree![key]);
          }
          else if (this._keyOfUniqueArray.includes(key)) {
            const array = currentTree![key] as any[];
            const ourArray = currentOurTree![key] as any[];
            const theirArray = currentTheirTree![key] as any[];
            if (Array.isArray(array)) {
              // eslint-disable-next-line complexity
              const unique = array.filter((x, i, self) => {
                if (self.indexOf(x) === i && i !== self.lastIndexOf(x)) {
                  if (
                    strategy!.startsWith('ours') &&
                    ourArray.indexOf(x) <= theirArray.indexOf(x)
                  ) {
                    return true;
                  }
                  else if (
                    strategy!.startsWith('theirs') &&
                    ourArray.indexOf(x) > theirArray.indexOf(x)
                  ) {
                    return true;
                  }
                  return false;
                }
                else if (self.indexOf(x) !== i && i === self.lastIndexOf(x)) {
                  if (
                    strategy!.startsWith('ours') &&
                    ourArray.indexOf(x) > theirArray.indexOf(x)
                  ) {
                    return true;
                  }
                  else if (
                    strategy!.startsWith('theirs') &&
                    ourArray.indexOf(x) <= theirArray.indexOf(x)
                  ) {
                    return true;
                  }
                  return false;
                }

                return true;
              });
              currentTree![key] = unique;
            }
          }
        });
      }
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
      // console.log('conflict: ' + JSON.stringify(err));
      if ((err as { conflict: any }).conflict) {
        // console.log('conflict: ' + JSON.stringify((err as { conflict: any }).conflict));
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
