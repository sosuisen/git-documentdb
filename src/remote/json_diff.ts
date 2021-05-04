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

  diff (_oldDoc: JsonDoc | undefined, _newDoc: JsonDoc): { [key: string]: any } {
    if (_oldDoc === undefined) _oldDoc = {};
    const oldDoc = JSON.parse(JSON.stringify(_oldDoc));
    const newDoc = JSON.parse(JSON.stringify(_newDoc));
    const diff = (this._jsonDiffPatch.diff(oldDoc, newDoc) as unknown) as {
      [key: string]: any;
    };
    return diff;
  }
}
