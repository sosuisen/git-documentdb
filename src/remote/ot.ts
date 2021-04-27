import { insertOp, JSONOp, moveOp, type } from 'ot-json1';
import { Delta } from 'jsondiffpatch';
import { JsonDoc } from '../types';

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
          }
        });
      }
    };
    procTree([], diff);
    return operations;
  }

  apply (doc: JsonDoc, op: JSONOp) {
    return type.apply(doc, op);
  }

  patch (
    doc: JsonDoc,
    diffLeft: Delta,
    diffRight?: Delta | undefined,
    prefer?: 'left' | 'right' | undefined
  ) {
    prefer ??= 'left';
    if (diffRight === undefined) {
      return type.apply(doc, this.fromDiff(diffLeft));
    }
    const opLeft = this.fromDiff(diffLeft);
    const opRight = this.fromDiff(diffRight);
    const newOpLeft = this.transform(opLeft, opRight, prefer!);
    let newDoc = type.apply(doc, opRight);
    newDoc = type.apply(newDoc, newOpLeft!);
    return newDoc;
  }

  transform (left: JSONOp, right: JSONOp, prefer?: 'left' | 'right') {
    prefer ??= 'left';
    return type.transform(left, right, prefer);
  }
}
