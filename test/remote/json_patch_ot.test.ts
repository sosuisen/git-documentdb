import { editOp, insertOp, type } from 'ot-json1';
import { JsonDiff } from '../../src/remote/diff';
import { JsonPatchOT } from '../../src/remote/json_patch_ot';

const jDiff = new JsonDiff();
const jPatch = new JsonPatchOT();

describe('<remote/ot> OT', () => {
  describe('for primitive', () => {
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
    expect(jDiff.diff(oldDoc, newDoc)).toStrictEqual(diff);
    */
      // keys must be sorted by descendant order
      const patch = [
        ['age2', { i: 'Heijo-kyo' }],
        ['current2', { i: false }],
        ['year2', { i: 710 }],
      ];
      expect(jPatch.apply(oldDoc, patch)).toStrictEqual(newDoc);
    });

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
      expect(jDiff.diff(oldDoc, newDoc)).toStrictEqual(diff);

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

      expect(jPatch.patch(oldDoc, jDiff.diff(oldDoc, newDoc)!)).toStrictEqual(newDoc);
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

      const diffOurs = jDiff.diff(base, ours);
      const diffTheirs = jDiff.diff(base, theirs);

      const patchOurs = jPatch.fromDiff(diffOurs!);
      // console.log(patchOurs);
      const patchTheirs = jPatch.fromDiff(diffTheirs!);
      // console.log(patchTheirs);

      expect(jPatch.patch(ours, diffOurs!, diffTheirs)).toStrictEqual(merged);
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

      const diffOurs = jDiff.diff(base, ours);
      // console.log(diffOurs);
      const diffTheirs = jDiff.diff(base, theirs);
      // console.log(diffTheirs);
      const patchOurs = jPatch.fromDiff(diffOurs!);
      // console.log(patchOurs);
      const patchTheirs = jPatch.fromDiff(diffTheirs!);
      // console.log(patchTheirs);

      expect(jPatch.patch(ours, diffOurs!, diffTheirs)).toStrictEqual(merged);
    });
  });

  describe('for text', () => {
    it('applies patch (create)', () => {
      const myDiff = new JsonDiff({
        minTextLength: 1,
      });
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
      expect(myDiff.diff(oldDoc, newDoc)).toStrictEqual(diff);
      // keys must be sorted by descendant order
      const patch = ['text', { es: [3, '123'] }];
      // const op = editOp(['title'], 'text-unicode', ['My cool blog entry']);
      // console.log(op);

      expect(jPatch.apply(oldDoc, patch)).toStrictEqual(newDoc);
    });

    it('applies patch (replace)', () => {
      const myDiff = new JsonDiff({
        minTextLength: 1,
      });
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
      expect(myDiff.diff(oldDoc, newDoc)).toStrictEqual(diff);
      // keys must be sorted by descendant order
      const patch = ['text', { es: [1, { d: 4 }, 'ebdc'] }];
      // const op = editOp(['title'], 'text-unicode', ['My cool blog entry']);
      // console.log(op);

      expect(jPatch.apply(oldDoc, patch)).toStrictEqual(newDoc);
    });

    it('applies patch (move)', () => {
      const myDiff = new JsonDiff({
        minTextLength: 1,
      });
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
      expect(myDiff.diff(oldDoc, newDoc)).toStrictEqual(diff);
      // keys must be sorted by descendant order
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

    it('returns patch from diff (create)', () => {
      const myDiff = new JsonDiff({
        minTextLength: 1,
      });
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
      expect(myDiff.diff(oldDoc, newDoc)).toStrictEqual(diff);

      const patch = ['text', { es: [3, '123'] }];

      expect(jPatch.fromDiff(diff!)).toStrictEqual(patch);
    });

    it('returns patch from diff (replace)', () => {
      const myDiff = new JsonDiff({
        minTextLength: 1,
      });
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
      expect(myDiff.diff(oldDoc, newDoc)).toStrictEqual(diff);

      const patch = ['text', { es: [1, { d: 4 }, 'ebdc'] }];

      expect(jPatch.fromDiff(diff!)).toStrictEqual(patch);
    });

    it.only('applies patch (move)', () => {
      const myDiff = new JsonDiff({
        minTextLength: 1,
      });
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
      expect(myDiff.diff(oldDoc, newDoc)).toStrictEqual(diff);
      // keys must be sorted by descendant order
      const op = editOp(['text'], 'text-unicode', [7, '56789']);
      // console.log(op);
      const op2 = editOp(['text'], 'text-unicode', [36, { d: 5 }]);
      // console.log(op2);
      const op3 = [op, op2].reduce(type.compose, null);
      // console.dir(op3, { depth: 10 });

      const patch = ['text', { es: [7, '56789', 24, { d: 5 }] }];
      expect(jPatch.fromDiff(diff!)).toStrictEqual(patch);
    });

    it.skip('merges conflicted primitives: add', () => {});
  });
});
