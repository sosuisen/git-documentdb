import { create } from 'jsondiffpatch';
import { JsonDoc } from '../types';

export class JsonDiff {
  private _jsonDiffPatch;
  constructor (idOfSubtree?: string[]) {
    const objectHash = (obj: { [key: string]: any }, index: number) => {
      idOfSubtree ??= [];
      for (let i = 0; i < idOfSubtree.length; i++) {
        const id = obj[idOfSubtree[i]];
        if (id !== undefined) {
          return id;
        }
      }
      return '$$index:' + index;
    };
    this._jsonDiffPatch = create({
      objectHash,
    });
  }

  diff (oldDoc: JsonDoc, newDoc: JsonDoc) {
    return this._jsonDiffPatch.diff(oldDoc, newDoc);
  }
}
