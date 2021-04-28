/* eslint-disable max-depth */
import { resolve } from 'path';
import { insertOp, JSONOp, moveOp, replaceOp, type } from 'ot-json1';
import { Delta } from 'jsondiffpatch';
import {
  ConflictResolveStrategies,
  ConflictResolveStrategyLabels,
  JsonDoc,
} from '../types';
import { threeWayMerge } from './3way_merge';
import { DEFAULT_CONFLICT_RESOLVE_STRATEGY } from './sync';

export class JsonPatch {
  constructor () {}
  fromDiff (diff: Delta): JSONOp {
    const operations: JSONOp = [];
    const procTree = (ancestors: string[], tree: JsonDoc) => {
      const keys = Object.keys(tree);
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
        const sortedChildren = underBar.concat(noBar); // _1, _2, _3, 1, 2, 3
      }
      else {
        keys.sort().forEach(key => {
          if (Array.isArray(tree[key])) {
            const arr = tree[key] as any[];
            if (arr.length === 1) {
              operations.push(insertOp(ancestors.concat(key), arr[0])!);
            }
            else if (arr.length === 2) {
              operations.push(replaceOp(ancestors.concat(key), arr[0], arr[1])!);
            }
          }
        });
      }
    };
    procTree([], diff);
    if (operations.length === 1) {
      return (operations[0] as unknown) as JSONOp;
    }
    return operations;
  }

  apply (doc: JsonDoc, op: JSONOp) {
    return type.apply(doc, op);
  }

  patch (
    docOurs: JsonDoc,
    diffOurs: Delta,
    diffTheirs?: Delta | undefined,
    strategy?: ConflictResolveStrategyLabels
  ) {
    strategy ??= DEFAULT_CONFLICT_RESOLVE_STRATEGY;
    if (diffTheirs === undefined) {
      return type.apply(docOurs, this.fromDiff(diffOurs));
    }
    const opOurs = this.fromDiff(diffOurs);
    const opTheirs = this.fromDiff(diffTheirs);
    const transformedOpTheirs = this.transform(opTheirs, opOurs, strategy!);
    const newDoc = type.apply(docOurs, transformedOpTheirs!);
    return newDoc;
  }

  // eslint-disable-next-line complexity
  resolveConflict (
    _opOurs: JSONOp,
    _opTheirs: JSONOp,
    strategy: ConflictResolveStrategyLabels
  ): [JSONOp, JSONOp, JSONOp | undefined] {
    let opOurs = JSON.parse(JSON.stringify(_opOurs));
    let opTheirs = JSON.parse(JSON.stringify(_opTheirs));
    let transformedOpTheirs;
    try {
      console.log('trying ours: '  + JSON.stringify(opOurs));
      console.log('trying theirs: '  + JSON.stringify(opTheirs));
      transformedOpTheirs = type.transform(opTheirs, opOurs, 'right');
    } catch (err) {
      if (err.conflict) {
        console.log('conflict: ' + JSON.stringify(err.conflict));
        const conflict = err.conflict as { type: number; op1: any[]; op2: any[] };
        // NOTE: op1 is opTheirs, op2 is opOurs
        if (strategy.startsWith('ours')) {
          // Remove conflicted op from theirs

          const targetPosition = conflict.op1.slice(0, -1);

          // Get p, r, d, i, e
          const conflictedCommands = Object.keys(conflict.op1[conflict.op1.length - 1]);

          // Command and its argument. e.g. {p: 0}
          let commandAndArgs: { [command: string]: string };
          if (opTheirs.length > 1 && !Array.isArray(opTheirs[0])) {
            commandAndArgs = opTheirs[opTheirs.length - 1];
            conflictedCommands.forEach(command => delete commandAndArgs[command]);
            opTheirs[opTheirs.length - 1] = commandAndArgs;
          }
          else if (opTheirs.length > 1) {
            // Search target position
            let pos = -1;
            for (let i = 0; i < opTheirs.length; i++) {
              if (opTheirs[i].length - 1 === targetPosition.length) {
                for (let j = 0; j < targetPosition.length; j++) {
                  if (opTheirs[i][j] !== targetPosition[j]) {
                    break;
                  }
                  if (j === targetPosition.length - 1) {
                    pos = i;
                  }
                }
                if (pos >= 0) {
                  break;
                }
              }
            }
            if (pos >= 0) {
              commandAndArgs = opTheirs[pos][opTheirs[pos].length - 1];
              conflictedCommands.forEach(command => delete commandAndArgs[command]);
              if (Object.keys(commandAndArgs).length > 0) {
                opTheirs[pos][opTheirs[pos].length - 1] = commandAndArgs;
              }
              else {
                opTheirs.splice(pos, 1);
              }
              if (opTheirs.length === 1) {
                opTheirs = opTheirs[0];
              }
              console.log('# resolved: ' + JSON.stringify(opTheirs));
            }
          }
        }
        else if (strategy.startsWith('theirs')) {
        }
        return [opOurs, opTheirs, undefined];
      }
      throw err;
    }
    return [opOurs, opTheirs, transformedOpTheirs];
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
