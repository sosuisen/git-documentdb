import { create } from '@sosuisen/jsondiffpatch';
import { JsonDiffOptions, JsonDoc } from '../types';

const JSON_DIFF_MINIMUM_TEXT_LENGTH = Number.MAX_SAFE_INTEGER;

export class JsonDiff {
  private _jsonDiffPatch;
  constructor (options?: JsonDiffOptions) {
    options ??= {
      idOfSubtree: undefined,
      plainTextProperties: undefined,
    };
    options.idOfSubtree ??= [];

    const objectHash = (obj: { [key: string]: any }, index: number) => {
      for (let i = 0; i < options!.idOfSubtree!.length; i++) {
        const id = obj[options!.idOfSubtree![i]];
        if (id !== undefined) {
          return id;
        }
      }
      return '$$index:' + index;
    };
    this._jsonDiffPatch = create({
      objectHash,
      textDiff: {
        minLength: JSON_DIFF_MINIMUM_TEXT_LENGTH,
        plainTextProperties: options!.plainTextProperties,
      },
    });
  }

  diff (oldDoc: JsonDoc | undefined, newDoc: JsonDoc): { [key: string]: any } {
    if (oldDoc === undefined) oldDoc = {};
    const oldDocClone = JSON.parse(JSON.stringify(oldDoc));
    const newDocClone = JSON.parse(JSON.stringify(newDoc));
    const diff = (this._jsonDiffPatch.diff(oldDocClone, newDocClone) as unknown) as {
      [key: string]: any;
    };
    return diff;
  }
}
