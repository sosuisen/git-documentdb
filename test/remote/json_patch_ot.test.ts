import { editOp, insertOp, type } from 'ot-json1';
import { JsonDiff } from '../../src/remote/json_diff';
import { JsonPatchOT } from '../../src/remote/json_patch_ot';

const primitiveDiff = new JsonDiff({
  minTextLength: 1000,
});

const textOTDiff = new JsonDiff({
  minTextLength: 0,
});

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

      const diffOurs = primitiveDiff.diff(base, ours);
      // console.log(diffOurs);
      const diffTheirs = primitiveDiff.diff(base, theirs);
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

    it('returns patch from diff (add to head of text)', () => {
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

    it('returns patch from diff (add to middle of text', () => {
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

    it('returns patch from diff (add to tail of text', () => {
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

    it('returns patch from diff (delete from tail of text', () => {
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

    it('merges conflicted text: add', () => {
      const base = {
        _id: 'littlewomen',
        text: '',
      };

      // The number of deer has increased.
      const ours = {
        _id: 'littlewomen',
        text: `"Christmas won't be Christmas without any presents,"
grumbled Jo, lying on the rug. 
`,
      };

      // The number of deer in Nara was small in the past.
      const theirs = {
        _id: 'littlewomen',
        text: `"It's so dreadful to be poor!"
sighed Meg, looking down at her old dress.`,
      };

      // This is correct as a merge result, but incorrect as a schema.
      // 'age' and 'deer' are interdependent.
      // It must be resolved by user.
      const merged = {
        _id: 'littlewomen',
        text: `"Christmas won't be Christmas without any presents,"
grumbled Jo, lying on the rug. 
"It's so dreadful to be poor!"
sighed Meg, looking down at her old dress.`,
      };

      const diffOurs = textOTDiff.diff(base, ours);
      console.log(diffOurs);
      const diffTheirs = textOTDiff.diff(base, theirs);
      console.log(diffTheirs);
      const patchOurs = jPatch.fromDiff(diffOurs!);
      // console.log(patchOurs);
      const patchTheirs = jPatch.fromDiff(diffTheirs!);
      // console.log(patchTheirs);

      expect(jPatch.patch(ours, diffOurs!, diffTheirs)).toStrictEqual(merged);
    });

    it.skip('merges conflicted primitives: add', () => {});
  });
});
