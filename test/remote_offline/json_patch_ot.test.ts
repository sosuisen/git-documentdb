/* eslint-disable @typescript-eslint/naming-convention */
import { editOp, type } from 'ot-json1';
import expect from 'expect';
import { JsonDiff } from '../../src/remote/json_diff';
import { JsonPatchOT } from '../../src/remote/json_patch_ot';

const primitiveDiff = new JsonDiff();

const textOTDiff = new JsonDiff({
  plainTextProperties: { text: true },
});

const jPatch = new JsonPatchOT();

const jPatchUniqueArray = new JsonPatchOT({
  keyOfUniqueArray: ['unique'],
});

describe('<remote/ot> OT', () => {
  describe('apply:', () => {
    it('apply op', () => {
      const oldDoc = {
        _id: 'oldId',
      };
      const op = ['_id', { r: true, i: 'newId' }];

      expect(jPatch.apply(oldDoc, op)).toStrictEqual({
        _id: 'newId',
      });
    });

    it('apply empty op', () => {
      const oldDoc = {
        _id: 'oldId',
      };
      // Do not be undefined. Use null.
      expect(jPatch.apply(oldDoc, null)).toStrictEqual({
        _id: 'oldId',
      });
    });

    it('apply complex op', () => {
      const oldDoc = {
        _id: 'old',
        collapsedList: [163, 339, 451, 559, 604],
        condition: {},
        geometry: { height: 686, width: 410, x: 390, y: 4, z: 8931 },
        label: {
          height: 64,
          status: 'closed',
          text: 'old',
          width: 400,
          x: 390,
          y: 4,
          zoom: 1,
        },
      };

      const op = [
        [
          'collapsedList',
          [0, { r: true }],
          [1, { r: true }],
          [2, { r: true }],
          [3, { r: true }],
          [4, { r: true }],
        ],
        [
          'geometry',
          ['height', { r: true, i: 980 }],
          ['width', { r: true, i: 650 }],
          ['z', { r: true, i: 8937 }],
        ],
        [
          'label',
          'text',
          {
            r: true,
            i: 'updated',
          },
        ],
      ];

      const newDoc = {
        _id: 'old',
        collapsedList: [],
        condition: {},
        geometry: { height: 980, width: 650, x: 390, y: 4, z: 8937 },
        label: {
          height: 64,
          status: 'closed',
          text: 'updated',
          width: 400,
          x: 390,
          y: 4,
          zoom: 1,
        },
      };
      expect(jPatch.apply(oldDoc, op)).toStrictEqual(newDoc);
    });

    it('applies patch (create)', () => {
      const oldDoc = {
        _id: 'nara',
        age: 'Nara prefecture',
        year: 1887,
        current: true,
      };
      const newDoc = {
        _id: 'nara',
        age: 'Nara prefecture',
        year: 1887,
        current: true,
        age2: 'Heijo-kyo',
        year2: 710,
        current2: false,
      };
      /* 
    const diff = {
      age2: ['Heijo-kyo'],
      year2: [710],
      current2: [false],
    };
    expect(primitiveDiff.diff(oldDoc, newDoc)).toStrictEqual(diff);
    */
      // keys must be sorted by descendant order
      const patch = [
        ['age2', { i: 'Heijo-kyo' }],
        ['current2', { i: false }],
        ['year2', { i: 710 }],
      ];
      expect(jPatch.apply(oldDoc, patch)).toStrictEqual(newDoc);
    });
  });

  describe('patch:', () => {
    it('patches from undefined diff', () => {
      const oldDoc = {
        _id: 'nara',
      };
      const newDoc = {
        _id: 'nara',
      };
      // primitiveDiff.diff(oldDoc, newDoc) will return undefined.
      expect(primitiveDiff.diff(oldDoc, newDoc)).toBeUndefined();
      expect(jPatch.patch(oldDoc, primitiveDiff.diff(oldDoc, newDoc)!)).toStrictEqual(
        newDoc
      );
    });
  });

  describe('for array:', () => {
    it('new property', () => {
      const oldDoc = {
        _id: 'nara',
      };
      const newDoc = {
        _id: 'nara',
        temple: ['Toshodaiji', 'Todaiji', 'Yakushiji'],
      };

      expect(jPatch.patch(oldDoc, primitiveDiff.diff(oldDoc, newDoc)!)).toStrictEqual(
        newDoc
      );
    });

    it('delete property', () => {
      const oldDoc = {
        _id: 'nara',
        temple: ['Toshodaiji', 'Todaiji', 'Yakushiji'],
      };
      const newDoc = {
        _id: 'nara',
      };

      expect(jPatch.patch(oldDoc, primitiveDiff.diff(oldDoc, newDoc)!)).toStrictEqual(
        newDoc
      );
    });

    describe('insert:', () => {
      it('insert to empty array', () => {
        const oldDoc = {
          _id: 'nara',
          temple: [],
        };
        const newDoc = {
          _id: 'nara',
          temple: ['Toshodaiji'],
        };

        const diff = primitiveDiff.diff(oldDoc, newDoc)!;
        expect(jPatch.patch(oldDoc, diff)).toStrictEqual(newDoc);
      });

      it('insert at first', () => {
        const oldDoc = {
          number: ['1', '2'],
        };
        const newDoc = {
          number: ['3', '1', '2'],
        };

        const diff = primitiveDiff.diff(oldDoc, newDoc)!;
        expect(jPatch.patch(oldDoc, diff)).toStrictEqual(newDoc);
      });

      it('insert at middle', () => {
        const oldDoc = {
          number: ['1', '2'],
        };
        const newDoc = {
          number: ['1', '3', '2'],
        };

        const diff = primitiveDiff.diff(oldDoc, newDoc)!;
        expect(jPatch.patch(oldDoc, diff)).toStrictEqual(newDoc);
      });

      it('insert at last', () => {
        const oldDoc = {
          number: ['1', '2'],
        };
        const newDoc = {
          number: ['1', '2', '3'],
        };

        const diff = primitiveDiff.diff(oldDoc, newDoc)!;
        expect(jPatch.patch(oldDoc, diff)).toStrictEqual(newDoc);
      });

      it('insert two members', () => {
        const oldDoc = {
          number: ['1', '2'],
        };
        const newDoc = {
          number: ['1', '3', '4', '2'],
        };

        const diff = primitiveDiff.diff(oldDoc, newDoc)!;
        expect(jPatch.patch(oldDoc, diff)).toStrictEqual(newDoc);
      });

      it('insert two members at a distance', () => {
        const oldDoc = {
          number: ['1', '2'],
        };
        const newDoc = {
          number: ['1', '3', '2', '4'],
        };

        const diff = primitiveDiff.diff(oldDoc, newDoc)!;
        expect(jPatch.patch(oldDoc, diff)).toStrictEqual(newDoc);
      });
    });

    describe('move:', () => {
      it('move from the first to the last(1)', () => {
        const oldDoc = {
          number: ['1', '2', '3'],
        };
        const newDoc = {
          number: ['2', '3', '1'],
        };

        const diff = primitiveDiff.diff(oldDoc, newDoc)!;
        // console.log(diff);
        // { number: { _t: 'a', _0: [ '', 2, 3 ] } }
        //  The first member is always ''.
        //  The second member 0 represents destinationIndex
        //  The last member 3 is the magical number that indicates "array move"
        expect(jPatch.patch(oldDoc, diff)).toStrictEqual(newDoc);
      });

      it('move from the first to the last(2)', () => {
        const oldDoc = {
          number: ['1', '2', '3', '4'],
        };
        const newDoc = {
          number: ['2', '3', '4', '1'],
        };

        const diff = primitiveDiff.diff(oldDoc, newDoc)!;
        expect(jPatch.patch(oldDoc, diff)).toStrictEqual(newDoc);
      });

      it('move from the last to the first(1)', () => {
        const oldDoc = {
          number: ['1', '2', '3'],
        };
        const newDoc = {
          number: ['3', '1', '2'],
        };

        const diff = primitiveDiff.diff(oldDoc, newDoc)!;
        // console.log(diff);
        // { number: { _t: 'a', _2: [ '', 0, 3 ] } }
        //  The first member is always ''.
        //  The second member 0 represents destinationIndex
        //  The last member 3 is the magical number that indicates "array move"
        expect(jPatch.patch(oldDoc, diff)).toStrictEqual(newDoc);
      });

      it('move from the last to the first(2)', () => {
        const oldDoc = {
          number: ['1', '2', '3', '4'],
        };
        const newDoc = {
          number: ['4', '1', '2', '3'],
        };

        const diff = primitiveDiff.diff(oldDoc, newDoc)!;
        expect(jPatch.patch(oldDoc, diff)).toStrictEqual(newDoc);
      });

      it('replace the last with the first(1)', () => {
        const oldDoc = {
          number: ['1', '2', '3'],
        };
        const newDoc = {
          number: ['3', '2', '1'],
        };

        const diff = primitiveDiff.diff(oldDoc, newDoc)!;
        expect(jPatch.patch(oldDoc, diff)).toStrictEqual(newDoc);
      });

      it('replace the last with the first(2)', () => {
        const oldDoc = {
          number: ['1', '2', '3', '4'],
        };
        const newDoc = {
          number: ['4', '2', '3', '1'],
        };

        const diff = primitiveDiff.diff(oldDoc, newDoc)!;
        expect(jPatch.patch(oldDoc, diff)).toStrictEqual(newDoc);
      });

      it('reverse', () => {
        const oldDoc = {
          number: ['1', '2', '3', '4'],
        };
        const newDoc = {
          number: ['4', '3', '2', '1'],
        };

        const diff = primitiveDiff.diff(oldDoc, newDoc)!;
        expect(jPatch.patch(oldDoc, diff)).toStrictEqual(newDoc);
      });

      it('shuffle', () => {
        const oldDoc = {
          number: ['1', '2', '3', '4', '5'],
        };
        const newDoc = {
          number: ['4', '3', '2', '5', '1'],
        };

        const diff = primitiveDiff.diff(oldDoc, newDoc)!;
        expect(jPatch.patch(oldDoc, diff)).toStrictEqual(newDoc);
      });
    });

    describe('delete:', () => {
      it('delete one', () => {
        const oldDoc = {
          number: ['1', '2'],
        };
        const newDoc = {
          number: ['1'],
        };
        const diff = primitiveDiff.diff(oldDoc, newDoc)!;
        expect(jPatch.patch(oldDoc, diff)).toStrictEqual(newDoc);
      });

      it('delete middle one', () => {
        const oldDoc = {
          number: ['1', '2', '3'],
        };
        const newDoc = {
          number: ['1', '3'],
        };
        const diff = primitiveDiff.diff(oldDoc, newDoc)!;
        expect(jPatch.patch(oldDoc, diff)).toStrictEqual(newDoc);
      });

      it('delete the last two', () => {
        const oldDoc = {
          number: ['1', '2', '3'],
        };
        const newDoc = {
          number: ['1'],
        };
        const diff = primitiveDiff.diff(oldDoc, newDoc)!;
        expect(jPatch.patch(oldDoc, diff)).toStrictEqual(newDoc);
      });

      it('delete the first two', () => {
        const oldDoc = {
          number: ['1', '2', '3'],
        };
        const newDoc = {
          number: ['3'],
        };
        const diff = primitiveDiff.diff(oldDoc, newDoc)!;
        expect(jPatch.patch(oldDoc, diff)).toStrictEqual(newDoc);
      });

      it('delete two at a distance', () => {
        const oldDoc = {
          number: ['1', '2', '3'],
        };
        const newDoc = {
          number: ['2'],
        };
        const diff = primitiveDiff.diff(oldDoc, newDoc)!;
        expect(jPatch.patch(oldDoc, diff)).toStrictEqual(newDoc);
      });

      it('clear array', () => {
        const oldDoc = {
          number: ['1', '2'],
        };
        const newDoc = {
          number: [],
        };
        const diff = primitiveDiff.diff(oldDoc, newDoc)!;
        expect(jPatch.patch(oldDoc, diff)).toStrictEqual(newDoc);
      });
    });

    describe('delete and insert:', () => {
      it('delete one, then insert new one at the first position', () => {
        const oldDoc = {
          number: ['1', '2'],
        };
        const newDoc = {
          number: ['3', '2'],
        };
        expect(jPatch.patch(oldDoc, primitiveDiff.diff(oldDoc, newDoc)!)).toStrictEqual(
          newDoc
        );
      });

      it('delete the first, then insert the last', () => {
        const oldDoc = {
          number: ['1', '2'],
        };
        const newDoc = {
          number: ['2', '3'],
        };
        expect(jPatch.patch(oldDoc, primitiveDiff.diff(oldDoc, newDoc)!)).toStrictEqual(
          newDoc
        );
      });

      it('delete one, then insert new one', () => {
        const oldDoc = {
          number: ['1'],
        };
        const newDoc = {
          number: ['2'],
        };

        expect(jPatch.patch(oldDoc, primitiveDiff.diff(oldDoc, newDoc)!)).toStrictEqual(
          newDoc
        );
      });

      it('delete two, then insert new one', () => {
        const oldDoc = {
          number: ['1', '2'],
        };
        const newDoc = {
          number: ['3'],
        };

        expect(jPatch.patch(oldDoc, primitiveDiff.diff(oldDoc, newDoc)!)).toStrictEqual(
          newDoc
        );
      });
    });

    describe('delete and move:', () => {
      it('delete the first, then move the third to the second', () => {
        const oldDoc = {
          _id: 'nara',
          number: ['1', '2', '3', '4'],
        };
        const newDoc = {
          _id: 'nara',
          number: ['2', '4', '3'],
        };
        expect(jPatch.patch(oldDoc, primitiveDiff.diff(oldDoc, newDoc)!)).toStrictEqual(
          newDoc
        );
      });

      it('delete the third, then move the first to the last', () => {
        const oldDoc = {
          _id: 'nara',
          number: ['1', '2', '3', '4'],
        };
        const newDoc = {
          _id: 'nara',
          number: ['2', '4', '1'],
        };
        expect(jPatch.patch(oldDoc, primitiveDiff.diff(oldDoc, newDoc)!)).toStrictEqual(
          newDoc
        );
      });

      it('delete the first, then move the last to the first', () => {
        const oldDoc = {
          number: ['1', '2', '3'],
        };
        const newDoc = {
          number: ['3', '2'],
        };
        expect(jPatch.patch(oldDoc, primitiveDiff.diff(oldDoc, newDoc)!)).toStrictEqual(
          newDoc
        );
      });

      it('delete the second, then move the last to the first', () => {
        const oldDoc = {
          number: ['1', '2', '3'],
        };
        const newDoc = {
          number: ['3', '1'],
        };
        expect(jPatch.patch(oldDoc, primitiveDiff.diff(oldDoc, newDoc)!)).toStrictEqual(
          newDoc
        );
      });
    });

    describe('insert and move:', () => {
      it('insert the first, then move the last to the second', () => {
        const oldDoc = {
          number: ['1', '2', '3'],
        };
        const newDoc = {
          number: ['4', '3', '2', '1'],
        };
        expect(jPatch.patch(oldDoc, primitiveDiff.diff(oldDoc, newDoc)!)).toStrictEqual(
          newDoc
        );
      });

      it('insert the first, then move the last to the first', () => {
        const oldDoc = {
          number: ['1', '2', '3'],
        };
        const newDoc = {
          number: ['3', '4', '1', '2'],
        };
        expect(jPatch.patch(oldDoc, primitiveDiff.diff(oldDoc, newDoc)!)).toStrictEqual(
          newDoc
        );
      });
    });

    describe('composite:', () => {
      it('insert after the second, insert after the third, remove the last, then move the first to the last', () => {
        const oldDoc = {
          number: ['1', '2', '3'],
        };
        const newDoc = {
          number: ['2', '4', '5', '1'],
        };
        expect(jPatch.patch(oldDoc, primitiveDiff.diff(oldDoc, newDoc)!)).toStrictEqual(
          newDoc
        );
      });
    });

    it('nesting arrays', () => {
      const oldDoc = {
        cherry: [
          ['NaraPark', 'double cherry blossoms'],
          ['MtYoshino', 'cherry blossoms'],
        ],
      };
      const newDoc = {
        cherry: [
          ['NaraPark', 'double cherry blossoms'],
          ['MtYoshino', 'awesome cherry blossoms'],
        ],
      };
      const diff = primitiveDiff.diff(oldDoc, newDoc)!;
      expect(jPatch.patch(oldDoc, diff)).toStrictEqual(newDoc);
    });

    it('of objects', () => {
      const oldDoc = {
        _id: 'nara',
        site: [
          { place: 'NaraPark', flower: ['cherry blossoms'] },
          { place: 'MtYoshino', flower: ['cherry blossoms'] },
        ],
      };

      const newDoc = {
        _id: 'nara',
        site: [
          { place: 'MtYoshino', flower: ['cherry blossoms'] },
          { place: 'NaraPark', flower: ['double cherry blossoms', 'Japanese apricot'] },
        ],
      };
      const diff = primitiveDiff.diff(oldDoc, newDoc)!;
      console.log(JSON.stringify(diff));
      expect(jPatch.patch(oldDoc, diff)).toStrictEqual(newDoc);
    });

    it('of objects by objectHash', () => {
      const myDiff = new JsonDiff({
        keyInArrayedObject: ['place'],
      });

      const oldDoc = {
        _id: 'nara',
        site: [
          { place: 'NaraPark', flower: ['cherry blossoms'] },
          { place: 'MtYoshino', flower: ['cherry blossoms'] },
        ],
      };

      const newDoc = {
        _id: 'nara',
        site: [
          { place: 'MtYoshino', flower: ['cherry blossoms'] },
          { place: 'NaraPark', flower: ['double cherry blossoms', 'Japanese apricot'] },
        ],
      };
      const diff = myDiff.diff(oldDoc, newDoc)!;
      console.log(JSON.stringify(diff));
      expect(jPatch.patch(oldDoc, diff)).toStrictEqual(newDoc);
    });

    describe('merge:', () => {
      it('merges insert and insert', () => {
        const base = {
          number: ['1', '2', '3'],
        };

        // move
        const ours = {
          number: ['1', '2', '4', '3'],
        };

        // replace
        const theirs = {
          number: ['1', '2', '3', '5'],
        };

        const merged = {
          number: ['1', '2', '4', '3', '5'],
        };

        const diffOurs = primitiveDiff.diff(base, ours);
        // console.log(diffOurs);
        const diffTheirs = primitiveDiff.diff(base, theirs);
        // console.log(diffTheirs);

        expect(jPatch.patch(ours, diffOurs!, theirs, diffTheirs)).toStrictEqual(merged);
      });

      it('merges insert and insert (2)', () => {
        const base = {
          number: ['1', '2', '3'],
        };

        // move
        const ours = {
          number: ['1', '2', '4', '3'],
        };

        // replace
        const theirs = {
          number: ['1', '2', '5', '3'],
        };

        const merged = {
          number: ['1', '2', '4', '5', '3'],
        };

        const diffOurs = primitiveDiff.diff(base, ours);
        // console.log(diffOurs);
        const diffTheirs = primitiveDiff.diff(base, theirs);
        // console.log(diffTheirs);

        expect(jPatch.patch(ours, diffOurs!, theirs, diffTheirs)).toStrictEqual(merged);
      });

      it('merges remove and remove', () => {
        const base = {
          number: ['1', '2', '3'],
        };

        // move
        const ours = {
          number: ['1', '2'],
        };

        // replace
        const theirs = {
          number: ['1', '3'],
        };

        const merged = {
          number: ['1'],
        };

        const diffOurs = primitiveDiff.diff(base, ours);
        // console.log(diffOurs);
        const diffTheirs = primitiveDiff.diff(base, theirs);
        // console.log(diffTheirs);

        expect(jPatch.patch(ours, diffOurs!, theirs, diffTheirs)).toStrictEqual(merged);
      });

      it('replacing take precedence over moving', () => {
        const base = {
          number: ['1', '2', '3'],
        };

        // move
        const ours = {
          number: ['3', '1', '2'],
        };

        // replace
        const theirs = {
          number: ['1', '2', '4'],
        };

        /**
         * Result is not ['4', '1', '2' ],
         * Replacing take precedence over moving
         */
        const merged = {
          number: ['1', '2', '4'],
        };

        const diffOurs = primitiveDiff.diff(base, ours);
        // console.log(diffOurs);
        const diffTheirs = primitiveDiff.diff(base, theirs);
        // console.log(diffTheirs);

        expect(jPatch.patch(ours, diffOurs!, theirs, diffTheirs)).toStrictEqual(merged);
      });

      it('replacing take precedence over moving (reverse)', () => {
        const base = {
          number: ['1', '2', '3'],
        };

        // replace
        const ours = {
          number: ['1', '2', '4'],
        };

        // move
        const theirs = {
          number: ['3', '1', '2'],
        };

        /**
         * Result is not ['4', '1', '2' ],
         * Replacing take precedence over moving
         */
        const merged = {
          number: ['1', '2', '4'],
        };

        const diffOurs = primitiveDiff.diff(base, ours);
        // console.log(diffOurs);
        const diffTheirs = primitiveDiff.diff(base, theirs);
        // console.log(diffTheirs);
        const patchOurs = jPatch.fromDiff(diffOurs!);
        // console.log(patchOurs);
        const patchTheirs = jPatch.fromDiff(diffTheirs!);
        // console.log(patchTheirs);

        expect(jPatch.patch(ours, diffOurs!, theirs, diffTheirs)).toStrictEqual(merged);
      });

      it('removing take precedence over moving', () => {
        const base = {
          number: ['1', '2', '3'],
        };

        // remove
        const ours = {
          number: ['1', '2'],
        };

        // move
        const theirs = {
          number: ['3', '1', '2'],
        };

        // Removing take precedence over moving
        const merged = {
          number: ['1', '2'],
        };

        const diffOurs = primitiveDiff.diff(base, ours);
        // console.log(diffOurs);
        const diffTheirs = primitiveDiff.diff(base, theirs);
        // console.log(diffTheirs);

        expect(jPatch.patch(ours, diffOurs!, theirs, diffTheirs)).toStrictEqual(merged);
      });

      it('removing take precedence over moving (reverse)', () => {
        const base = {
          number: ['1', '2', '3'],
        };

        // move
        const ours = {
          number: ['3', '1', '2'],
        };

        // remove
        const theirs = {
          number: ['1', '2'],
        };

        // Removing take precedence over moving
        const merged = {
          number: ['1', '2'],
        };

        const diffOurs = primitiveDiff.diff(base, ours);
        // console.log(diffOurs);
        const diffTheirs = primitiveDiff.diff(base, theirs);
        // console.log(diffTheirs);

        expect(jPatch.patch(ours, diffOurs!, theirs, diffTheirs)).toStrictEqual(merged);
      });

      it('merges remove and replace', () => {
        const base = {
          number: ['1', '2', '3'],
        };

        const ours = {
          number: ['1', '2'],
        };

        const theirs = {
          number: ['1', '2', '4'],
        };

        const merged = {
          number: ['1', '2', '4'],
        };

        const diffOurs = primitiveDiff.diff(base, ours);
        // console.log(diffOurs);
        const diffTheirs = primitiveDiff.diff(base, theirs);
        // console.log(diffTheirs);

        expect(jPatch.patch(ours, diffOurs!, theirs, diffTheirs)).toStrictEqual(merged);
      });

      it('merges insert and remove', () => {
        const base = {
          number: ['1', '2', '3'],
        };

        const ours = {
          number: ['1', '2'],
        };

        const theirs = {
          number: ['4', '1', '2', '3'],
        };

        const merged = {
          number: ['4', '1', '2'],
        };

        const diffOurs = primitiveDiff.diff(base, ours);
        // console.log(diffOurs);
        const diffTheirs = primitiveDiff.diff(base, theirs);
        // console.log(diffTheirs);

        expect(jPatch.patch(ours, diffOurs!, theirs, diffTheirs)).toStrictEqual(merged);
      });

      it('merges move and move the same', () => {
        /**
         * See https://github.com/ottypes/json1#limitations.
         * > We're missing a conflict for situations
         * > when two operations both move the same object to different locations.
         * > Currently the left operation will silently 'win'
         * > and the other operation's move will be discarded.
         * > But this behaviour should be user configurable
         */
        const base = {
          number: ['1', '2', '3', '4', '5'],
        };

        const ours = {
          number: ['5', '2', '3', '4', '1'],
        };

        // Move the same to another position
        const theirs = {
          number: ['1', '2', '3', '5', '4'],
        };

        // Ours wins silently.
        const merged = {
          number: ['5', '2', '3', '4', '1'],
        };

        const diffOurs = primitiveDiff.diff(base, ours);
        // console.log(diffOurs);
        const diffTheirs = primitiveDiff.diff(base, theirs);
        // console.log(diffTheirs);

        expect(jPatch.patch(ours, diffOurs!, theirs, diffTheirs)).toStrictEqual(merged);
      });

      it('merges move all and move all', () => {
        const base = {
          number: ['1', '2', '3', '4', '5'],
        };

        const ours = {
          number: ['5', '3', '2', '4', '1'],
        };

        const theirs = {
          number: ['3', '4', '1', '5', '2'],
        };

        /*
         * TODO:
         * The results are not predictable.
         * JSON1 can not merge moves well.
         * See https://github.com/ottypes/json1#limitations.
         * > We're missing a conflict for situations
         * > when two operations both move the same object to different locations.
         * > Currently the left operation will silently 'win'
         * > and the other operation's move will be discarded.
         * > But this behaviour should be user configurable
         */
        const merged = {
          number: ['5', '3', '2', '4', '1'],
        };

        const diffOurs = primitiveDiff.diff(base, ours);
        // console.log(diffOurs);
        const diffTheirs = primitiveDiff.diff(base, theirs);
        // console.log(diffTheirs);

        expect(jPatch.patch(ours, diffOurs!, theirs, diffTheirs)).toStrictEqual(merged);
      });

      it('merges move all and move all (2)', () => {
        const base = {
          number: ['1', '2', '3', '4', '5'],
        };

        const ours = {
          number: ['3', '4', '1', '5', '2'],
        };

        const theirs = {
          number: ['5', '3', '2', '4', '1'],
        };

        /*
         * TODO:
         * The results are not predictable.
         * JSON1 can not merge moves well.
         * See https://github.com/ottypes/json1#limitations.
         * > We're missing a conflict for situations
         * > when two operations both move the same object to different locations.
         * > Currently the left operation will silently 'win'
         * > and the other operation's move will be discarded.
         * > But this behaviour should be user configurable
         */
        const merged = {
          number: ['5', '3', '4', '1', '2'],
        };

        const diffOurs = primitiveDiff.diff(base, ours);
        // console.log(diffOurs);
        const diffTheirs = primitiveDiff.diff(base, theirs);
        // console.log(diffTheirs);

        expect(jPatch.patch(ours, diffOurs!, theirs, diffTheirs)).toStrictEqual(merged);
      });
    });

    describe('duplicated members in array', () => {
      it('merging insert operations results in duplicate members', () => {
        const base = {
          number: ['1', '2'],
        };

        // move
        const ours = {
          number: ['1', '2', '3'],
        };

        // replace
        const theirs = {
          number: ['3', '1', '2'],
        };

        // 3 is duplicated.
        const merged = {
          number: ['3', '1', '2', '3'],
        };

        const diffOurs = primitiveDiff.diff(base, ours);
        // console.log(diffOurs);
        const diffTheirs = primitiveDiff.diff(base, theirs);
        // console.log(diffTheirs);

        expect(jPatch.patch(ours, diffOurs!, theirs, diffTheirs)).toStrictEqual(merged);
      });

      it('merging insert operations results in duplicate members (2)', () => {
        const base = {
          number: ['1', '2'],
        };

        // move
        const ours = {
          number: ['1', '2', '3'],
        };

        // replace
        const theirs = {
          number: ['1', '2', '3'],
        };

        // 3 is duplicated.
        const merged = {
          number: ['1', '2', '3', '3'],
        };

        const diffOurs = primitiveDiff.diff(base, ours);
        // console.log(diffOurs);
        const diffTheirs = primitiveDiff.diff(base, theirs);
        // console.log(diffTheirs);

        expect(jPatch.patch(ours, diffOurs!, theirs, diffTheirs)).toStrictEqual(merged);
      });

      it('merging insert operations by unique array', () => {
        const base = {
          unique: ['1', '2'],
        };

        const ours = {
          unique: ['1', '2', '3'],
        };

        const theirs = {
          unique: ['3', '1', '2'],
        };

        // Result is ['3', '1', '2', '3'] if not unique array.
        // ours-diff strategy is applied to remove the first '3'.
        const merged = {
          unique: ['1', '2', '3'],
        };

        const diffOurs = primitiveDiff.diff(base, ours);
        // console.log(diffOurs);
        const diffTheirs = primitiveDiff.diff(base, theirs);
        // console.log(diffTheirs);

        expect(jPatchUniqueArray.patch(ours, diffOurs!, theirs, diffTheirs)).toStrictEqual(
          merged
        );
      });

      it('merging insert operations by unique array (reverse)', () => {
        const base = {
          unique: ['1', '2'],
        };

        const ours = {
          unique: ['3', '1', '2'],
        };

        const theirs = {
          unique: ['1', '2', '3'],
        };

        // Result is ['3', '1', '2', '3'] if not unique array.
        // ours-diff strategy is applied to remove the last '3'.
        const merged = {
          unique: ['3', '1', '2'],
        };

        const diffOurs = primitiveDiff.diff(base, ours);
        // console.log(diffOurs);
        const diffTheirs = primitiveDiff.diff(base, theirs);
        // console.log(diffTheirs);

        expect(jPatchUniqueArray.patch(ours, diffOurs!, theirs, diffTheirs)).toStrictEqual(
          merged
        );
      });

      it('merging insert operations by unique array (2)', () => {
        const base = {
          unique: ['1', '2'],
        };

        const ours = {
          unique: ['1', '2', '3'],
        };

        const theirs = {
          unique: ['1', '2', '3'],
        };

        // Result is ['1', '2', '3', '3'] if not unique array.
        // ours-diff strategy is applied to remove the last '3'.
        const merged = {
          unique: ['1', '2', '3'],
        };

        const diffOurs = primitiveDiff.diff(base, ours);
        // console.log(diffOurs);
        const diffTheirs = primitiveDiff.diff(base, theirs);
        // console.log(diffTheirs);

        expect(jPatchUniqueArray.patch(ours, diffOurs!, theirs, diffTheirs)).toStrictEqual(
          merged
        );
      });

      it('merging insert operations by unique array and theirs-diff', () => {
        const base = {
          unique: ['1', '2'],
        };

        const ours = {
          unique: ['1', '2', '3'],
        };

        const theirs = {
          unique: ['3', '1', '2'],
        };

        // Result is ['3', '1', '2', '3'] if not unique array.
        // theirs-diff strategy is applied to remove the last '3'.
        const merged = {
          unique: ['3', '1', '2'],
        };

        const diffOurs = primitiveDiff.diff(base, ours);
        // console.log(diffOurs);
        const diffTheirs = primitiveDiff.diff(base, theirs);
        // console.log(diffTheirs);

        expect(
          jPatchUniqueArray.patch(ours, diffOurs!, theirs, diffTheirs, 'theirs-diff')
        ).toStrictEqual(merged);
      });

      it('merging insert operations by unique array and theirs-diff (reverse)', () => {
        const base = {
          unique: ['1', '2'],
        };

        const ours = {
          unique: ['3', '1', '2'],
        };

        const theirs = {
          unique: ['1', '2', '3'],
        };

        // Result is ['3', '1', '2', '3'] if not unique array.
        // theirs-diff strategy is applied to remove the first '3'.
        const merged = {
          unique: ['1', '2', '3'],
        };

        const diffOurs = primitiveDiff.diff(base, ours);
        // console.log(diffOurs);
        const diffTheirs = primitiveDiff.diff(base, theirs);
        // console.log(diffTheirs);

        expect(
          jPatchUniqueArray.patch(ours, diffOurs!, theirs, diffTheirs, 'theirs-diff')
        ).toStrictEqual(merged);
      });

      it('merging insert operations by unique array in a deep subtree', () => {
        const base = {
          a: 'a',
          b: {
            c: 'c',
            d: {
              e: 'e',
              unique: ['1', '2'],
            },
          },
        };

        const ours = {
          a: 'a',
          b: {
            c: 'c',
            d: {
              e: 'e',
              unique: ['1', '2', '3'],
            },
          },
        };

        const theirs = {
          a: 'a',
          b: {
            c: 'c',
            d: {
              e: 'e',
              unique: ['3', '1', '2'],
            },
          },
        };

        // Result is ['3', '1', '2', '3'] if not unique array.
        // ours-diff strategy is applied to remove the first '3'.
        const merged = {
          a: 'a',
          b: {
            c: 'c',
            d: {
              e: 'e',
              unique: ['1', '2', '3'],
            },
          },
        };

        const diffOurs = primitiveDiff.diff(base, ours);
        // console.log(diffOurs);
        const diffTheirs = primitiveDiff.diff(base, theirs);
        // console.log(diffTheirs);

        expect(jPatchUniqueArray.patch(ours, diffOurs!, theirs, diffTheirs)).toStrictEqual(
          merged
        );
      });

      it('multiple unique array appears', () => {
        const base = {
          unique: ['1', '2'],
          b: {
            c: 'c',
            d: {
              e: 'e',
              unique: ['1', '2'],
            },
          },
        };

        const ours = {
          unique: ['1', '2', '3'],
          b: {
            c: 'c',
            d: {
              e: 'e',
              unique: ['1', '2', '3'],
            },
          },
        };

        const theirs = {
          unique: ['3', '1', '2'],
          b: {
            c: 'c',
            d: {
              e: 'e',
              unique: ['3', '1', '2'],
            },
          },
        };

        // Result is ['3', '1', '2', '3'] if not unique array.
        // ours-diff strategy is applied to remove the first '3'.
        const merged = {
          unique: ['1', '2', '3'],
          b: {
            c: 'c',
            d: {
              e: 'e',
              unique: ['1', '2', '3'],
            },
          },
        };

        const diffOurs = primitiveDiff.diff(base, ours);
        // console.log(diffOurs);
        const diffTheirs = primitiveDiff.diff(base, theirs);
        // console.log(diffTheirs);

        expect(jPatchUniqueArray.patch(ours, diffOurs!, theirs, diffTheirs)).toStrictEqual(
          merged
        );
      });
    });
  });

  describe('for object:', () => {
    it('returns patch from diff (create)', () => {
      const oldDoc = {
        _id: 'nara',
        age: 'Nara prefecture',
        year: 1887,
        current: true,
      };
      const newDoc = {
        _id: 'nara',
        age: 'Nara prefecture',
        year: 1887,
        current: true,
        age2: 'Heijo-kyo',
        year2: 710,
        current2: false,
      };

      const diff = {
        age2: ['Heijo-kyo'],
        year2: [710],
        current2: [false],
      };
      expect(primitiveDiff.diff(oldDoc, newDoc)).toStrictEqual(diff);

      // keys must be sorted by descendant order
      const patch = [
        ['age2', { i: 'Heijo-kyo' }],
        ['current2', { i: false }],
        ['year2', { i: 710 }],
      ];

      expect(jPatch.fromDiff(diff!)).toStrictEqual(patch);
    });

    it('patches from diff (create)', () => {
      const oldDoc = {
        _id: 'nara',
        age: 'Nara prefecture',
        year: 1887,
        current: true,
      };
      const newDoc = {
        _id: 'nara',
        age: 'Nara prefecture',
        year: 1887,
        current: true,
        age2: 'Heijo-kyo',
        year2: 710,
        current2: false,
      };

      expect(jPatch.patch(oldDoc, primitiveDiff.diff(oldDoc, newDoc)!)).toStrictEqual(
        newDoc
      );
    });

    it('patches from diff (delete)', () => {
      const oldDoc = {
        _id: 'nara',
        age: 'Nara prefecture',
        year: 1887,
        current: true,
      };
      const newDoc = {
        _id: 'nara',
        age: 'Nara prefecture',
        year: 1887,
      };

      expect(jPatch.patch(oldDoc, primitiveDiff.diff(oldDoc, newDoc)!)).toStrictEqual(
        newDoc
      );
    });

    it('merges independent changes (create)', () => {
      const base = {
        _id: 'nara',
        age: 'Nara prefecture',
      };

      const ours = {
        _id: 'nara',
        age: 'Nara prefecture',
        year: 1887,
        current: true,
      };

      const theirs = {
        _id: 'nara',
        age: 'Nara prefecture',
        age2: 'Heijo-kyo',
        year2: 710,
        current2: false,
      };

      const merged = {
        _id: 'nara',
        age: 'Nara prefecture',
        year: 1887,
        current: true,
        age2: 'Heijo-kyo',
        year2: 710,
        current2: false,
      };

      const diffOurs = primitiveDiff.diff(base, ours);
      const diffTheirs = primitiveDiff.diff(base, theirs);

      const patchOurs = jPatch.fromDiff(diffOurs!);
      // console.log(patchOurs);
      const patchTheirs = jPatch.fromDiff(diffTheirs!);
      // console.log(patchTheirs);

      expect(jPatch.patch(ours, diffOurs!, theirs, diffTheirs)).toStrictEqual(merged);
    });

    it('merges independent changes (update)', () => {
      const base = {
        _id: 'nara',
        age: 'Nara prefecture',
        deer: 100,
      };

      // The number of deer has increased.
      const ours = {
        _id: 'nara',
        age: 'Nara prefecture',
        deer: 1000,
      };

      // The number of deer in Nara was small in the past.
      const theirs = {
        _id: 'nara',
        age: 'Heijo-kyo',
        deer: 100,
      };

      // This is correct as a merge result, but incorrect as a schema.
      // 'age' and 'deer' are interdependent.
      // It must be resolved by user.
      const merged = {
        _id: 'nara',
        age: 'Heijo-kyo',
        deer: 1000,
      };

      const diffOurs = primitiveDiff.diff(base, ours);
      // console.log(diffOurs);
      const diffTheirs = primitiveDiff.diff(base, theirs);
      // console.log(diffTheirs);
      const patchOurs = jPatch.fromDiff(diffOurs!);
      // console.log(patchOurs);
      const patchTheirs = jPatch.fromDiff(diffTheirs!);
      // console.log(patchTheirs);

      expect(jPatch.patch(ours, diffOurs!, theirs, diffTheirs)).toStrictEqual(merged);
    });

    it('merges conflicted changes (update and remove by ours-diff)', () => {
      const base = {
        _id: 'nara',
        age: 'Nara prefecture',
      };

      const ours = {
        _id: 'nara',
        age: 'Heijo-kyo',
      };

      const theirs = {
        _id: 'nara',
      };

      const merged = {
        _id: 'nara',
        age: 'Heijo-kyo',
      };

      const diffOurs = primitiveDiff.diff(base, ours);
      const diffTheirs = primitiveDiff.diff(base, theirs);

      const patchOurs = jPatch.fromDiff(diffOurs!);
      // console.log(patchOurs);
      const patchTheirs = jPatch.fromDiff(diffTheirs!);
      // console.log(patchTheirs);

      expect(jPatch.patch(ours, diffOurs!, theirs, diffTheirs)).toStrictEqual(merged);
    });

    it('merges conflicted changes (update by ours-diff)', () => {
      // Default strategy is ours-diff
      const base = {
        _id: 'nara',
        age: 'Nara prefecture',
        deer: 100,
      };

      const ours = {
        _id: 'nara',
        age: 'Fujiwara-kyo',
        deer: 1000,
      };

      const theirs = {
        _id: 'nara',
        age: 'Heijo-kyo',
        deer: 100,
      };

      const merged = {
        _id: 'nara',
        age: 'Fujiwara-kyo',
        deer: 1000,
      };

      const diffOurs = primitiveDiff.diff(base, ours);
      // console.log(diffOurs);
      const diffTheirs = primitiveDiff.diff(base, theirs);
      // console.log(diffTheirs);
      const patchOurs = jPatch.fromDiff(diffOurs!);
      // console.log(patchOurs);
      const patchTheirs = jPatch.fromDiff(diffTheirs!);
      // console.log(patchTheirs);

      expect(jPatch.patch(ours, diffOurs!, theirs, diffTheirs)).toStrictEqual(merged);
    });
  });

  describe('for text:', () => {
    it('applies patch (create)', () => {
      const oldDoc = {
        _id: 'nara',
        text: 'abcdef',
      };
      const newDoc = {
        _id: 'nara',
        text: 'abc123def',
      };

      const diff = {
        text: [
          `@@ -1,6 +1,9 @@
 abc
+123
 def
`,
          0,
          2,
        ],
      };
      expect(textOTDiff.diff(oldDoc, newDoc)).toStrictEqual(diff);
      // keys must be sorted by descendant order
      const patch = ['text', { es: [3, '123'] }];
      // const op = editOp(['title'], 'text-unicode', ['My cool blog entry']);
      // console.log(op);

      expect(jPatch.apply(oldDoc, patch)).toStrictEqual(newDoc);
    });

    it('applies patch (replace)', () => {
      const oldDoc = {
        _id: 'nara',
        text: 'abcdef',
      };
      const newDoc = {
        _id: 'nara',
        text: 'aebdcf',
      };

      const diff = {
        text: [
          `@@ -1,6 +1,6 @@
 a
-bcde
+ebdc
 f
`,
          0,
          2,
        ],
      };
      expect(textOTDiff.diff(oldDoc, newDoc)).toStrictEqual(diff);
      // keys must be sorted by descendant order
      const patch = ['text', { es: [1, { d: 4 }, 'ebdc'] }];
      // const op = editOp(['title'], 'text-unicode', ['My cool blog entry']);
      // console.log(op);

      expect(jPatch.apply(oldDoc, patch)).toStrictEqual(newDoc);
    });

    it('applies patch (move)', () => {
      const oldDoc = {
        _id: 'nara',
        text: 'abcdefghijklmnopqrstuvwxyz0123456789',
      };
      const newDoc = {
        _id: 'nara',
        text: 'abcdefg56789hijklmnopqrstuvwxyz01234',
      };

      const diff = {
        text: [
          `@@ -1,15 +1,20 @@
 abcdefg
+56789
 hijklmno
@@ -29,13 +29,8 @@
 xyz01234
-56789
`,
          0,
          2,
        ],
      };
      expect(textOTDiff.diff(oldDoc, newDoc)).toStrictEqual(diff);

      const op = editOp(['text'], 'text-unicode', [7, '56789']);
      // console.log(op);
      const op2 = editOp(['text'], 'text-unicode', [36, { d: 5 }]);
      // console.log(op2);
      const op3 = [op, op2].reduce(type.compose, null);
      // console.log(op3);

      // const op = editOp(['title'], 'text-unicode', ['My cool blog entry']);
      // console.log(op);

      expect(jPatch.apply(oldDoc, op3)).toStrictEqual(newDoc);
    });

    it('returns patch from diff (from one character)', () => {
      const oldDoc = {
        _id: 'nara',
        text: ' ',
      };

      const newDoc = {
        _id: 'nara',
        text: 'abc',
      };
      const diff = {
        text: [
          `@@ -1 +1,3 @@
- 
+abc
`,
          0,
          2,
        ],
      };
      expect(textOTDiff.diff(oldDoc, newDoc)).toStrictEqual(diff);
      const patch = ['text', { es: [{ d: 1 }, 'abc'] }];

      expect(jPatch.fromDiff(diff!)).toStrictEqual(patch);

      expect(jPatch.apply(oldDoc, patch)).toStrictEqual(newDoc);
    });

    it('returns patch from diff (to one character)', () => {
      const oldDoc = {
        _id: 'nara',
        text: 'abc',
      };

      const newDoc = {
        _id: 'nara',
        text: ' ',
      };

      const diff = {
        text: [
          `@@ -1,3 +1 @@
-abc
+ 
`,
          0,
          2,
        ],
      };

      expect(textOTDiff.diff(oldDoc, newDoc)).toStrictEqual(diff);

      const patch = ['text', { es: [{ d: 3 }, ' '] }];

      expect(jPatch.fromDiff(diff!)).toStrictEqual(patch);

      expect(jPatch.apply(oldDoc, patch)).toStrictEqual(newDoc);
    });

    it('returns patch from diff (create)', () => {
      const oldDoc = {
        _id: 'nara',
        text: 'abcdef',
      };
      const newDoc = {
        _id: 'nara',
        text: 'abc123def',
      };

      const diff = {
        text: [
          `@@ -1,6 +1,9 @@
 abc
+123
 def
`,
          0,
          2,
        ],
      };
      expect(textOTDiff.diff(oldDoc, newDoc)).toStrictEqual(diff);

      const patch = ['text', { es: [3, '123'] }];

      expect(jPatch.fromDiff(diff!)).toStrictEqual(patch);

      expect(jPatch.apply(oldDoc, patch)).toStrictEqual(newDoc);
    });

    it('returns patch from diff (insert to head of text)', () => {
      const oldDoc = {
        _id: 'nara',
        text: 'abc',
      };

      const newDoc = {
        _id: 'nara',
        text: '123abc',
      };
      const diff = {
        text: [
          `@@ -1,3 +1,6 @@
+123
 abc
`,
          0,
          2,
        ],
      };
      expect(textOTDiff.diff(oldDoc, newDoc)).toStrictEqual(diff);

      const patch = ['text', { es: ['123'] }];
      // expect(jPatch.fromDiff(diff!)).toStrictEqual(patch);

      expect(jPatch.apply(oldDoc, patch)).toStrictEqual(newDoc);
    });

    it('returns patch from diff (insert to middle of text', () => {
      const oldDoc = {
        _id: 'nara',
        text: 'abc',
      };

      const newDoc = {
        _id: 'nara',
        text: 'ab123c',
      };
      const diff = {
        text: [
          `@@ -1,3 +1,6 @@
 ab
+123
 c
`,
          0,
          2,
        ],
      };
      expect(textOTDiff.diff(oldDoc, newDoc)).toStrictEqual(diff);

      const patch = ['text', { es: [2, '123'] }];
      expect(jPatch.fromDiff(diff!)).toStrictEqual(patch);

      expect(jPatch.apply(oldDoc, patch)).toStrictEqual(newDoc);
    });

    it('returns patch from diff (insert to tail of text)', () => {
      const oldDoc = {
        _id: 'nara',
        text: 'abc',
      };

      const newDoc = {
        _id: 'nara',
        text: 'abc123',
      };
      const diff = {
        text: [
          `@@ -1,3 +1,6 @@
 abc
+123
`,
          0,
          2,
        ],
      };
      expect(textOTDiff.diff(oldDoc, newDoc)).toStrictEqual(diff);

      const patch = ['text', { es: [3, '123'] }];
      expect(jPatch.fromDiff(diff!)).toStrictEqual(patch);

      expect(jPatch.apply(oldDoc, patch)).toStrictEqual(newDoc);
    });

    it('returns patch from diff (delete from head of text)', () => {
      const oldDoc = {
        _id: 'nara',
        text: 'abcdef',
      };

      const newDoc = {
        _id: 'nara',
        text: 'def',
      };

      const diff = {
        text: [
          `@@ -1,6 +1,3 @@
-abc
 def
`,
          0,
          2,
        ],
      };

      expect(textOTDiff.diff(oldDoc, newDoc)).toStrictEqual(diff);

      const patch = ['text', { es: [{ d: 3 }] }];
      expect(jPatch.fromDiff(diff!)).toStrictEqual(patch);

      expect(jPatch.apply(oldDoc, patch)).toStrictEqual(newDoc);
    });

    it('returns patch from diff (delete from middle of text)', () => {
      const oldDoc = {
        _id: 'nara',
        text: 'abcdef',
      };

      const newDoc = {
        _id: 'nara',
        text: 'adef',
      };

      const diff = {
        text: [
          `@@ -1,6 +1,4 @@
 a
-bc
 def
`,
          0,
          2,
        ],
      };

      expect(textOTDiff.diff(oldDoc, newDoc)).toStrictEqual(diff);

      const patch = ['text', { es: [1, { d: 2 }] }];
      expect(jPatch.fromDiff(diff!)).toStrictEqual(patch);

      expect(jPatch.apply(oldDoc, patch)).toStrictEqual(newDoc);
    });

    it('returns patch from diff (delete from tail of text)', () => {
      const oldDoc = {
        _id: 'nara',
        text: 'abcdef',
      };

      const newDoc = {
        _id: 'nara',
        text: 'abc',
      };

      const diff = {
        text: [
          `@@ -1,6 +1,3 @@
 abc
-def
`,
          0,
          2,
        ],
      };

      expect(textOTDiff.diff(oldDoc, newDoc)).toStrictEqual(diff);

      const patch = ['text', { es: [3, { d: 3 }] }];
      expect(jPatch.fromDiff(diff!)).toStrictEqual(patch);

      expect(jPatch.apply(oldDoc, patch)).toStrictEqual(newDoc);
    });

    it('returns patch from diff (replace)', () => {
      const oldDoc = {
        _id: 'nara',
        text: 'abcdef',
      };
      const newDoc = {
        _id: 'nara',
        text: 'aebdcf',
      };

      const diff = {
        text: [
          `@@ -1,6 +1,6 @@
 a
-bcde
+ebdc
 f
`,
          0,
          2,
        ],
      };
      expect(textOTDiff.diff(oldDoc, newDoc)).toStrictEqual(diff);

      const patch = ['text', { es: [1, { d: 4 }, 'ebdc'] }];

      expect(jPatch.fromDiff(diff!)).toStrictEqual(patch);

      expect(jPatch.apply(oldDoc, patch)).toStrictEqual(newDoc);
    });

    it('returns patch from diff (move)', () => {
      const oldDoc = {
        _id: 'nara',
        text: 'abcdefghijklmnopqrstuvwxyz0123456789',
      };
      const newDoc = {
        _id: 'nara',
        text: 'abcdefg56789hijklmnopqrstuvwxyz01234',
      };

      const diff = {
        text: [
          `@@ -1,15 +1,20 @@
 abcdefg
+56789
 hijklmno
@@ -29,13 +29,8 @@
 xyz01234
-56789
`,
          0,
          2,
        ],
      };
      expect(textOTDiff.diff(oldDoc, newDoc)).toStrictEqual(diff);

      const op = editOp(['text'], 'text-unicode', [7, '56789']);
      // console.log(op);
      const op2 = editOp(['text'], 'text-unicode', [36, { d: 5 }]);
      // console.log(op2);
      const op3 = [op, op2].reduce(type.compose, null);
      // console.dir(op3, { depth: 10 });

      const patch = ['text', { es: [7, '56789', 24, { d: 5 }] }];
      expect(jPatch.fromDiff(diff!)).toStrictEqual(patch);

      expect(jPatch.apply(oldDoc, patch)).toStrictEqual(newDoc);
    });

    it('returns patch from diff (escaped)', () => {
      // google/diff-match-patch uses encodeURI()
      const oldDoc = {
        _id: 'nara',
        text: '[abc]',
      };

      const newDoc = {
        _id: 'nara',
        text: `[abc]de`,
      };

      const diff = {
        text: [
          `@@ -1,5 +1,7 @@
 %5Babc%5D
+de
`,
          0,
          2,
        ],
      };

      expect(textOTDiff.diff(oldDoc, newDoc)).toStrictEqual(diff);

      const patch = ['text', { es: [5, `de`] }];

      expect(jPatch.fromDiff(diff!)).toStrictEqual(patch);

      expect(jPatch.apply(oldDoc, patch)).toStrictEqual(newDoc);
    });

    it('returns patch from diff (not escaped)', () => {
      // google/diff-match-patch uses encodeURI()
      const oldDoc = {
        _id: 'nara',
        text: ' ',
      };

      const newDoc = {
        _id: 'nara',
        text: `AZaz09;,/?:@&=+$-_.!~*'()#`,
      };

      const diff = {
        text: [
          `@@ -1 +1,26 @@
- 
+AZaz09;,/?:@&=+$-_.!~*'()#
`,
          0,
          2,
        ],
      };

      expect(textOTDiff.diff(oldDoc, newDoc)).toStrictEqual(diff);

      const patch = ['text', { es: [{ d: 1 }, `AZaz09;,/?:@&=+$-_.!~*'()#`] }];

      expect(jPatch.fromDiff(diff!)).toStrictEqual(patch);

      expect(jPatch.apply(oldDoc, patch)).toStrictEqual(newDoc);
    });

    it('returns patch from diff (two new lines)', () => {
      const oldDoc = {
        _id: 'nara',
        text: 'abcdef',
      };

      const newDoc = {
        _id: 'nara',
        text: `ab\ncd\nef`,
      };

      const diff = {
        text: [
          `@@ -1,6 +1,8 @@
 ab
+%0A
 cd
+%0A
 ef
`,
          0,
          2,
        ],
      };

      expect(textOTDiff.diff(oldDoc, newDoc)).toStrictEqual(diff);

      expect(jPatch.patch(oldDoc, diff)).toStrictEqual(newDoc);
    });

    it('returns patch from diff (long text with new lines)', () => {
      const oldDoc = {
        _id: 'littlewomen',
        text: `"Christmas won't be Christmas without any presents,"
grumbled Jo, lying on the rug. 
"It's so dreadful to be poor!"
sighed Meg, looking down at her old dress.`,
      };

      const newDoc = {
        _id: 'littlewomen',
        text: `[Xmas won't be Xmas without any presents,]
grumbled Jo,
lying on the rug. 

[It's so dreadful to be poor!]
sighed Meg, looking down at her old dress.`,
      };

      const diff = {
        text: [
          `@@ -1,11 +1,6 @@
-%22Christ
+%5BX
 mas 
@@ -12,14 +12,9 @@
  be 
-Christ
+X
 mas 
@@ -34,17 +34,17 @@
 resents,
-%22
+%5D
 %0Agrumble
@@ -48,17 +48,17 @@
 bled Jo,
- 
+%0A
 lying on
@@ -68,17 +68,18 @@
 e rug. %0A
-%22
+%0A%5B
 It's so 
@@ -102,9 +102,9 @@
 oor!
-%22
+%5D
 %0Asig
`,
          0,
          2,
        ],
      };
      expect(textOTDiff.diff(oldDoc, newDoc)).toStrictEqual(diff);

      // console.dir(jPatch.fromDiff(diff), { depth: 10 });

      expect(jPatch.patch(oldDoc, diff)).toStrictEqual(newDoc);
    });

    it('returns patch from diff (emoji)', () => {
      // google/diff-match-patch uses encodeURI()
      const oldDoc = {
        _id: 'nara',
        text: '😀😃😄😁😆😅',
      };

      const newDoc = {
        _id: 'nara',
        text: '😀😃a😄😁b😆😅',
      };

      expect(jPatch.patch(oldDoc, textOTDiff.diff(oldDoc, newDoc))).toStrictEqual(newDoc);
    });

    it('merges conflicted text: insert', () => {
      const base = {
        _id: 'littlewomen',
        text: '',
      };

      const ours = {
        _id: 'littlewomen',
        text: `"Christmas won't be Christmas without any presents,"
grumbled Jo, lying on the rug. 
`,
      };

      const theirs = {
        _id: 'littlewomen',
        text: `"It's so dreadful to be poor!"
sighed Meg, looking down at her old dress.`,
      };

      const merged = {
        _id: 'littlewomen',
        text: `"Christmas won't be Christmas without any presents,"
grumbled Jo, lying on the rug. 
"It's so dreadful to be poor!"
sighed Meg, looking down at her old dress.`,
      };

      const diffOurs = textOTDiff.diff(base, ours);
      // console.log(diffOurs);
      const diffTheirs = textOTDiff.diff(base, theirs);
      // console.log(diffTheirs);
      const patchOurs = jPatch.fromDiff(diffOurs!);
      // console.log(patchOurs);
      const patchTheirs = jPatch.fromDiff(diffTheirs!);
      // console.log(patchTheirs);

      expect(jPatch.patch(ours, diffOurs!, theirs, diffTheirs)).toStrictEqual(merged);
    });

    it('merges conflicted text: update and delete', () => {
      const base = {
        _id: 'littlewomen',
        text: `"Christmas won't be Christmas without any presents,"
grumbled Jo, lying on the rug. 
"It's so dreadful to be poor!"
sighed Meg, looking down at her old dress.`,
      };

      // update
      const ours = {
        _id: 'littlewomen',
        text: `"Xmas won't be Xmas without any presents,"
grumbled Jo, lying on the rug.
"It's so dreadful to be poor!"
sighed Meg, looking down at her old dress.`,
      };

      // move
      const theirs = {
        _id: 'littlewomen',
        text: `"It's so dreadful to be poor!"
sighed Meg, looking down at her old dress.
"Christmas won't be Christmas without any presents,"
grumbled Jo, lying on the rug.`,
      };

      // Good result!
      const merged = {
        _id: 'littlewomen',
        text: `"It's so dreadful to be poor!"
sighed Meg, looking down at her old dress.
"Xmas won't be Xmas without any presents,"
grumbled Jo, lying on the rug.`,
      };

      const diffOurs = textOTDiff.diff(base, ours);
      // console.log(diffOurs);
      const diffTheirs = textOTDiff.diff(base, theirs);
      // console.log(diffTheirs);
      const patchOurs = jPatch.fromDiff(diffOurs!);
      // console.log(patchOurs);
      const patchTheirs = jPatch.fromDiff(diffTheirs!);
      // console.log(patchTheirs);

      expect(jPatch.patch(ours, diffOurs!, theirs, diffTheirs)).toStrictEqual(merged);
    });

    it('merges conflicted text: insert and delete', () => {
      const base = {
        _id: 'littlewomen',
        text: `"Christmas won't be Christmas without any presents,"
grumbled Jo, lying on the rug. 
`,
      };

      const ours = {
        _id: 'littlewomen',
        text: `"Christmas won't be Christmas without any presents,"
grumbled Jo, lying on the rug. 
"It's so dreadful to be poor!"
sighed Meg, looking down at her old dress.`,
      };

      const theirs = {
        _id: 'littlewomen',
        text: ``,
      };

      const merged = {
        _id: 'littlewomen',
        text: `"It's so dreadful to be poor!"
sighed Meg, looking down at her old dress.`,
      };

      const diffOurs = textOTDiff.diff(base, ours);
      // console.log(diffOurs);
      const diffTheirs = textOTDiff.diff(base, theirs);
      // console.log(diffTheirs);
      const patchOurs = jPatch.fromDiff(diffOurs!);
      // console.log(patchOurs);
      const patchTheirs = jPatch.fromDiff(diffTheirs!);
      // console.log(patchTheirs);

      expect(jPatch.patch(ours, diffOurs!, theirs, diffTheirs)).toStrictEqual(merged);
    });

    it('merges conflicted text: update and move', () => {
      const base = {
        _id: 'littlewomen',
        text: `"Christmas won't be Christmas without any presents,"
grumbled Jo, lying on the rug. 
`,
      };

      const ours = {
        _id: 'littlewomen',
        text: `"Xmas won't be Xmas without any presents,"
grumbled Jo, lying on the rug.`,
      };

      const theirs = {
        _id: 'littlewomen',
        text: ``,
      };

      // ! NOTE: Not good result
      const merged = {
        _id: 'littlewomen',
        text: `XX`,
      };

      const diffOurs = textOTDiff.diff(base, ours);
      // console.log(diffOurs);
      const diffTheirs = textOTDiff.diff(base, theirs);
      // console.log(diffTheirs);
      const patchOurs = jPatch.fromDiff(diffOurs!);
      // console.log(patchOurs);
      const patchTheirs = jPatch.fromDiff(diffTheirs!);
      // console.log(patchTheirs);

      expect(jPatch.patch(ours, diffOurs!, theirs, diffTheirs)).toStrictEqual(merged);
    });

    it('merges only the selected property', () => {
      const base = {
        _id: 'littlewomen',
        text: '',
        not_merge: '',
      };

      const ours = {
        _id: 'littlewomen',
        text: `"Christmas won't be Christmas without any presents,"
grumbled Jo, lying on the rug. 
`,
        not_merge: 'from ours',
      };

      const theirs = {
        _id: 'littlewomen',
        text: `"It's so dreadful to be poor!"
sighed Meg, looking down at her old dress.`,
        not_merge: 'from theirs',
      };

      const merged = {
        _id: 'littlewomen',
        text: `"Christmas won't be Christmas without any presents,"
grumbled Jo, lying on the rug. 
"It's so dreadful to be poor!"
sighed Meg, looking down at her old dress.`,
        not_merge: 'from ours',
      };

      const diffOurs = textOTDiff.diff(base, ours);
      // console.log(diffOurs);
      const diffTheirs = textOTDiff.diff(base, theirs);
      // console.log(diffTheirs);
      const patchOurs = jPatch.fromDiff(diffOurs!);
      // console.log(patchOurs);
      const patchTheirs = jPatch.fromDiff(diffTheirs!);
      // console.log(patchTheirs);

      expect(jPatch.patch(ours, diffOurs!, theirs, diffTheirs)).toStrictEqual(merged);
    });

    it('merges non ASCII text', () => {
      const base = {
        _id: 'wagahai',
        author: 'なし',
        text: '吾輩は猫である。',
      };

      const ours = {
        _id: 'wagahai',
        author: '夏目漱石',
        text: `吾輩は猫である。名前はまだ無い。`,
      };

      const theirs = {
        _id: 'wagahai',
        author: '太宰治',
        text: `吾輩は犬である。`,
      };

      const merged = {
        _id: 'wagahai',
        author: '夏目漱石',
        text: `吾輩は犬である。名前はまだ無い。`,
      };

      const diffOurs = textOTDiff.diff(base, ours);
      // console.log(diffOurs);
      const diffTheirs = textOTDiff.diff(base, theirs);
      // console.log(diffTheirs);
      const patchOurs = jPatch.fromDiff(diffOurs!);
      // console.log(patchOurs);
      const patchTheirs = jPatch.fromDiff(diffTheirs!);
      // console.log(patchTheirs);

      expect(jPatch.patch(ours, diffOurs!, theirs, diffTheirs)).toStrictEqual(merged);
    });

    it('merges non ASCII text 2', () => {
      const base = {
        _id: 'wagahai',
        text: '吾輩は猫である。',
      };

      const ours = {
        _id: 'wagahai',
        text: `吾輩は猫だよ。`,
      };

      const theirs = {
        _id: 'wagahai',
        text: `吾輩は犬である。`,
      };

      const merged = {
        _id: 'wagahai',
        text: `吾輩は犬だよ。`,
      };

      const diffOurs = textOTDiff.diff(base, ours);
      // console.log(diffOurs);
      const diffTheirs = textOTDiff.diff(base, theirs);
      // console.log(diffTheirs);
      const patchOurs = jPatch.fromDiff(diffOurs!);
      // console.log(patchOurs);
      const patchTheirs = jPatch.fromDiff(diffTheirs!);
      // console.log(patchTheirs);

      expect(jPatch.patch(ours, diffOurs!, theirs, diffTheirs)).toStrictEqual(merged);
    });

    it('merges non ASCII text 3', () => {
      const base = {
        _id: 'wagahai',
        text: '吾輩は猫である。',
      };

      const ours = {
        _id: 'wagahai',
        text: `吾輩は猫だよ。`,
      };

      const theirs = {
        _id: 'wagahai',
        text: `吾輩は犬だよ。`,
      };

      // ! NOTE: Not good result
      const merged = {
        _id: 'wagahai',
        text: `吾輩はだよ犬だよ。`,
      };

      const diffOurs = textOTDiff.diff(base, ours);
      // console.log(diffOurs);
      const diffTheirs = textOTDiff.diff(base, theirs);
      // console.log(diffTheirs);
      const patchOurs = jPatch.fromDiff(diffOurs!);
      // console.log(patchOurs);
      const patchTheirs = jPatch.fromDiff(diffTheirs!);
      // console.log(patchTheirs);

      expect(jPatch.patch(ours, diffOurs!, theirs, diffTheirs)).toStrictEqual(merged);
    });

    it('merges non ASCII text', () => {
      const base = {
        _id: 'wagahai',
        author: 'なし',
        text: '吾輩は猫である。',
      };

      const ours = {
        _id: 'wagahai',
        author: '夏目漱石',
        text: `吾輩は猫である。名前はまだ無い。`,
      };

      const theirs = {
        _id: 'wagahai',
        author: '太宰治',
        text: `吾輩は犬である。`,
      };

      const merged = {
        _id: 'wagahai',
        author: '夏目漱石',
        text: `吾輩は犬である。名前はまだ無い。`,
      };

      const diffOurs = textOTDiff.diff(base, ours);
      // console.log(diffOurs);
      const diffTheirs = textOTDiff.diff(base, theirs);
      // console.log(diffTheirs);
      const patchOurs = jPatch.fromDiff(diffOurs!);
      // console.log(patchOurs);
      const patchTheirs = jPatch.fromDiff(diffTheirs!);
      // console.log(patchTheirs);

      expect(jPatch.patch(ours, diffOurs!, theirs, diffTheirs)).toStrictEqual(merged);
    });
  });

  describe('merge nested object:', () => {
    it('merges simple structure', () => {
      const base = {
        geometry: {
          height: 300,
        },
      };

      const ours = {
        geometry: {
          height: 374,
        },
      };

      const theirs = {
        geometry: {
          height: 310,
        },
      };

      const merged = {
        geometry: {
          height: 374,
        },
      };

      const diffOurs = textOTDiff.diff(base, ours);
      // console.log(diffOurs);
      const diffTheirs = textOTDiff.diff(base, theirs);
      // console.log(diffTheirs);
      const patchOurs = jPatch.fromDiff(diffOurs!);
      // console.log(patchOurs);
      const patchTheirs = jPatch.fromDiff(diffTheirs!);
      // console.log(patchTheirs);

      expect(jPatch.patch(ours, diffOurs!, theirs, diffTheirs)).toStrictEqual(merged);
    });

    it('merges complex structure', () => {
      const base = {
        condition: {
          locked: false,
        },
        geometry: {
          height: 300,
          width: 434,
          x: 70,
          y: 70,
          z: 2,
        },
        style: {
          backgroundColor: '#ffffff',
          opacity: 1,
          uiColor: '#f5f5f5',
          zoom: 0.85,
        },
        _id: 'note/n01FCXJV361VCX5SEEY45V8X604/c01FCXJV1DPAJZ7X6M8YYF17TZF',
      };

      const ours = {
        condition: {
          locked: false,
        },
        geometry: {
          height: 374,
          width: 324,
          x: 64,
          y: 80,
          z: 2,
        },
        style: {
          backgroundColor: '#fff8d0',
          opacity: 1,
          uiColor: '#f5eec8',
          zoom: 0.85,
        },
        _id: 'note/n01FCXJV361VCX5SEEY45V8X604/c01FCXJV1DPAJZ7X6M8YYF17TZF',
      };

      const theirs = {
        condition: {
          locked: false,
        },
        geometry: {
          height: 300,
          width: 434,
          x: 250,
          y: 54,
          z: 160,
        },
        style: {
          backgroundColor: '#ffffff',
          opacity: 1,
          uiColor: '#f5f5f5',
          zoom: 0.85,
        },
        _id: 'note/n01FCXJV361VCX5SEEY45V8X604/c01FCXJV1DPAJZ7X6M8YYF17TZF',
      };

      const merged = {
        condition: {
          locked: false,
        },
        geometry: {
          height: 374,
          width: 324,
          x: 64,
          y: 80,
          z: 160,
        },
        style: {
          backgroundColor: '#fff8d0',
          opacity: 1,
          uiColor: '#f5eec8',
          zoom: 0.85,
        },
        _id: 'note/n01FCXJV361VCX5SEEY45V8X604/c01FCXJV1DPAJZ7X6M8YYF17TZF',
      };

      const diffOurs = textOTDiff.diff(base, ours);
      // console.log(diffOurs);
      const diffTheirs = textOTDiff.diff(base, theirs);
      // console.log(diffTheirs);
      const patchOurs = jPatch.fromDiff(diffOurs!);
      // console.log(patchOurs);
      const patchTheirs = jPatch.fromDiff(diffTheirs!);
      // console.log(patchTheirs);

      expect(jPatch.patch(ours, diffOurs!, theirs, diffTheirs)).toStrictEqual(merged);
    });

    it('merge complex structure including delete operation', () => {
      const docOurs = {
        _id: 'note/n2021-10-12-15-30-30-_YFSS58F/c2021-12-06-05-54-52-GE43E73',
        condition: { locked: false },
        date: { createdDate: '2021-12-06 05:54:52', modifiedDate: '2021-12-15 00:31:28' },
        geometry: { height: 900, width: 461, x: 706, y: 80, z: 5804 },
        label: {
          enabled: false,
          status: 'closedLabel',
          text: 'foo',
        },
        style: { backgroundColor: '#ffdd9e', opacity: 1, uiColor: '#f5d498', zoom: 0.85 },
      };

      const docTheirs = {};

      const newDoc = {
        _id: 'note/n2021-10-12-15-30-30-_YFSS58F/c2021-12-06-05-54-52-GE43E73',
        condition: { locked: false },
        date: { createdDate: '2021-12-06 05:54:52', modifiedDate: '2021-12-15 00:31:28' },
        geometry: { height: 900, width: 461, x: 1459, y: 180, z: 5953 },
        label: {
          enabled: false,
          status: 'openedSticker',
          x: 1562,
          y: 144,
          height: 92,
          width: 329,
          text: 'foo bar',
        },
        style: { backgroundColor: '#fff8d0', opacity: 1, uiColor: '#fff8d0', zoom: 0.85 },
      };

      const diffOurs = {
        date: { modifiedDate: ['2021-12-15 00:31:17', '2021-12-15 00:31:28'] },
        label: {
          height: [64, 0, 0],
          width: [461, 0, 0],
          x: [706, 0, 0],
          y: [80, 0, 0],
          zoom: [0.85, 0, 0],
        },
      };
      const diffTheirs = {
        date: { modifiedDate: ['2021-12-15 00:31:17', '2021-12-15 07:36:11'] },
        geometry: { x: [706, 1459], y: [80, 180], z: [5804, 5953] },
        label: {
          height: [64, 92],
          status: ['closedLabel', 'openedSticker'],
          text: ['foo', 'foo bar'],
          width: [461, 329],
          x: [706, 1562],
          y: [80, 144],
        },
        style: { backgroundColor: ['#ffdd9e', '#fff8d0'], uiColor: ['#f5d498', '#fff8d0'] },
      };

      expect(jPatch.patch(docOurs, diffOurs, docTheirs, diffTheirs)).toStrictEqual(newDoc);
    });
  });
});
