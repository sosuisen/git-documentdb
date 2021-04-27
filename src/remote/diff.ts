import { create } from 'jsondiffpatch';
import { JsonDiffOptions, JsonDoc } from '../types';

const JSON_DIFF_MINIMUM_TEXT_LENGTH = 30;
export class JsonDiff {
  private _jsonDiffPatch;
  constructor (options?: JsonDiffOptions) {
    options ??= {
      idOfSubtree: undefined,
      minTextLength: undefined,
    };
    options.idOfSubtree ??= [];
    options.minTextLength ??= JSON_DIFF_MINIMUM_TEXT_LENGTH;

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
        minLength: options!.minTextLength,
      },
    });
  }

  diff (oldDoc: JsonDoc, newDoc: JsonDoc) {
    return this._jsonDiffPatch.diff(oldDoc, newDoc);
  }
}
