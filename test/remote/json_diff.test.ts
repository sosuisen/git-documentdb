import { JsonDiff } from '../../src/remote/json_diff';

const primitiveDiff = new JsonDiff();

const textOTDiff = new JsonDiff({
  plainTextProperties: { text: true },
});

describe('<remote/diff> diff', () => {
  describe('primitives', () => {
    it('adding values', () => {
      const oldDoc = {
        _id: 'nara',
        prof: 'Nara prefecture',
        year: 1887,
        current: true,
      };
      const newDoc = {
        _id: 'nara',
        prof: 'Nara prefecture',
        year: 1887,
        current: true,
        prof2: 'Heijo-kyo',
        year2: 710,
        current2: false,
      };
      expect(primitiveDiff.diff(oldDoc, newDoc)).toStrictEqual({
        prof2: ['Heijo-kyo'],
        year2: [710],
        current2: [false],
      });
    });

    it('updating values', () => {
      const oldDoc = {
        _id: 'nara',
        prof: 'Nara prefecture',
        year: 1887,
        current: true,
      };
      const newDoc = {
        _id: 'nara',
        prof: 'Heijo-kyo',
        year: 710,
        current: false,
      };
      expect(primitiveDiff.diff(oldDoc, newDoc)).toStrictEqual({
        prof: ['Nara prefecture', 'Heijo-kyo'],
        year: [1887, 710],
        current: [true, false],
      });
    });

    it('deleting values', () => {
      const oldDoc = {
        _id: 'nara',
        prof: 'Nara prefecture',
        year: 1887,
        current: true,
      };
      const newDoc = {
        _id: 'nara',
      };
      expect(primitiveDiff.diff(oldDoc, newDoc)).toStrictEqual({
        prof: ['Nara prefecture', 0, 0],
        year: [1887, 0, 0],
        current: [true, 0, 0],
      });
    });
  });

  describe('nested objects', () => {
    it('adding properties', () => {
      const oldDoc = {
        _id: 'nara',
        data: {
          prof: 'Nara prefecture',
          year: 1887,
        },
      };
      const newDoc = {
        _id: 'nara',
        data: {
          prof: 'Nara prefecture',
          year: 1887,
          current: true,
        },
      };
      expect(primitiveDiff.diff(oldDoc, newDoc)).toStrictEqual({
        data: {
          current: [true],
        },
      });
    });

    it('adding subtree', () => {
      const oldDoc = {
        _id: 'nara',
        data: {
          prof: 'Nara prefecture',
        },
      };
      const newDoc = {
        _id: 'nara',
        data: {
          prof: 'Nara prefecture',
          site: {
            prof: 'Heijo-kyo',
          },
        },
      };
      expect(primitiveDiff.diff(oldDoc, newDoc)).toStrictEqual({
        data: {
          site: [{ prof: 'Heijo-kyo' }],
        },
      });
    });

    it('adding array', () => {
      const oldDoc = {
        _id: 'nara',
        data: {
          prof: 'Nara prefecture',
        },
      };
      const newDoc = {
        _id: 'nara',
        data: {
          prof: 'Nara prefecture',
          site: ['Heijo-kyo'],
        },
      };
      expect(primitiveDiff.diff(oldDoc, newDoc)).toStrictEqual({
        data: {
          site: [['Heijo-kyo']],
        },
      });
    });

    it('updating properties', () => {
      const oldDoc = {
        _id: 'nara',
        data: {
          prof: 'Nara prefecture',
          year: 1887,
          current: true,
        },
      };
      const newDoc = {
        _id: 'nara',
        data: {
          prof: 'Heijo-kyo',
          year: 710,
          current: false,
        },
      };
      expect(primitiveDiff.diff(oldDoc, newDoc)).toStrictEqual({
        data: {
          prof: ['Nara prefecture', 'Heijo-kyo'],
          year: [1887, 710],
          current: [true, false],
        },
      });
    });

    it('deleting properties', () => {
      const oldDoc = {
        _id: 'nara',
        data: {
          prof: 'Nara prefecture',
          year: 1887,
          current: true,
        },
      };
      const newDoc = {
        _id: 'nara',
        data: {
          prof: 'Nara prefecture',
        },
      };
      expect(primitiveDiff.diff(oldDoc, newDoc)).toStrictEqual({
        data: {
          year: [1887, 0, 0],
          current: [true, 0, 0],
        },
      });
    });
  });

  describe('arrays', () => {
    it('inserting at first', () => {
      const oldDoc = {
        _id: 'nara',
        temple: ['Todaiji', 'Yakushiji'],
      };
      const newDoc = {
        _id: 'nara',
        temple: ['Toshodaiji', 'Todaiji', 'Yakushiji'],
      };
      expect(primitiveDiff.diff(oldDoc, newDoc)).toStrictEqual({
        temple: {
          0: ['Toshodaiji'],
          _t: 'a',
        },
      });
    });

    it('inserting at middle', () => {
      const oldDoc = {
        _id: 'nara',
        temple: ['Todaiji', 'Yakushiji'],
      };
      const newDoc = {
        _id: 'nara',
        temple: ['Todaiji', 'Toshodaiji', 'Yakushiji'],
      };
      expect(primitiveDiff.diff(oldDoc, newDoc)).toStrictEqual({
        temple: {
          1: ['Toshodaiji'],
          _t: 'a',
        },
      });
    });

    it('inserting at last', () => {
      const oldDoc = {
        _id: 'nara',
        temple: ['Todaiji', 'Yakushiji'],
      };
      const newDoc = {
        _id: 'nara',
        temple: ['Todaiji', 'Yakushiji', 'Toshodaiji'],
      };
      expect(primitiveDiff.diff(oldDoc, newDoc)).toStrictEqual({
        temple: {
          2: ['Toshodaiji'],
          _t: 'a',
        },
      });
    });

    it('inserting two members', () => {
      const oldDoc = {
        _id: 'nara',
        temple: ['Todaiji', 'Yakushiji'],
      };
      const newDoc = {
        _id: 'nara',
        temple: ['Todaiji', 'Toshodaiji', 'Kofukuji', 'Yakushiji'],
      };
      expect(primitiveDiff.diff(oldDoc, newDoc)).toStrictEqual({
        temple: {
          1: ['Toshodaiji'],
          2: ['Kofukuji'],
          _t: 'a',
        },
      });
    });

    it('moving', () => {
      const oldDoc = {
        _id: 'nara',
        temple: ['Todaiji', 'Yakushiji'],
      };
      const newDoc = {
        _id: 'nara',
        temple: ['Yakushiji', 'Todaiji'],
      };
      expect(primitiveDiff.diff(oldDoc, newDoc)).toStrictEqual({
        temple: {
          _1: ['', 0, 3],
          _t: 'a',
        },
      });
      /*
      not {
        _0: ['', 1, 3],
        _t: 'a',
      },
    */
    });

    it('moving sequential two members', () => {
      const oldDoc = {
        _id: 'nara',
        temple: ['Todaiji', 'Yakushiji', 'Toshodaiji', 'Kofukuji'],
      };
      const newDoc = {
        _id: 'nara',
        temple: ['Toshodaiji', 'Kofukuji', 'Todaiji', 'Yakushiji'],
      };
      expect(primitiveDiff.diff(oldDoc, newDoc)).toStrictEqual({
        temple: {
          _2: ['', 0, 3],
          _3: ['', 1, 3],
          _t: 'a',
        },
      });
    });

    it('deleting', () => {
      const oldDoc = {
        _id: 'nara',
        temple: ['Todaiji', 'Yakushiji'],
      };
      const newDoc = {
        _id: 'nara',
        temple: ['Todaiji'],
      };
      expect(primitiveDiff.diff(oldDoc, newDoc)).toStrictEqual({
        temple: {
          _1: ['Yakushiji', 0, 0],
          _t: 'a',
        },
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

      expect(primitiveDiff.diff(oldDoc, newDoc)).toStrictEqual({
        cherry: {
          1: {
            1: ['awesome cherry blossoms'],
            _1: ['cherry blossoms', 0, 0],
            _t: 'a',
          },
          _t: 'a',
        },
      });
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

      /**
       * Cannot deal well with array of objects
       */
      expect(primitiveDiff.diff(oldDoc, newDoc)).toStrictEqual({
        site: {
          0: {
            place: ['NaraPark', 'MtYoshino'],
          },
          1: {
            flower: {
              0: ['double cherry blossoms'],
              1: ['Japanese apricot'],
              _0: ['cherry blossoms', 0, 0],
              _t: 'a',
            },
            place: ['MtYoshino', 'NaraPark'],
          },
          _t: 'a',
        },
      });
    });

    it('of object by objectHash', () => {
      const myDiff = new JsonDiff({
        idOfSubtree: ['place'],
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

      /**
       * Can deal well with array of objects each of which is identified by objectHash function.
       */
      expect(myDiff.diff(oldDoc, newDoc)).toStrictEqual({
        site: {
          1: {
            flower: {
              0: ['double cherry blossoms'],
              1: ['Japanese apricot'],
              _0: ['cherry blossoms', 0, 0],
              _t: 'a',
            },
          },
          _1: ['', 0, 3],
          _t: 'a',
        },
      });
    });
  });

  describe('plaintext-OT', () => {
    it('from undefined object to text', () => {
      const oldDoc = {};

      const newDoc = {
        _id: 'nara',
        text: 'abc',
      };

      expect(textOTDiff.diff(oldDoc, newDoc)).toStrictEqual({
        _id: ['nara'],
        text: ['abc'],
      });
    });

    it('from empty to text', () => {
      const oldDoc = {
        _id: 'nara',
        text: '',
      };

      const newDoc = {
        _id: 'nara',
        text: 'abc',
      };

      expect(textOTDiff.diff(oldDoc, newDoc)).toStrictEqual({
        text: [
          `@@ -0,0 +1,3 @@
+abc
`,
          0,
          2,
        ],
      });
    });

    it('from text to empty', () => {
      const oldDoc = {
        _id: 'nara',
        text: 'abc',
      };

      const newDoc = {
        _id: 'nara',
        text: '',
      };

      expect(textOTDiff.diff(oldDoc, newDoc)).toStrictEqual({
        text: [
          `@@ -1,3 +0,0 @@
-abc
`,
          0,
          2,
        ],
      });
    });

    it('from one character', () => {
      const oldDoc = {
        _id: 'nara',
        text: ' ',
      };

      const newDoc = {
        _id: 'nara',
        text: 'abc',
      };

      expect(textOTDiff.diff(oldDoc, newDoc)).toStrictEqual({
        text: [
          `@@ -1 +1,3 @@
- 
+abc
`,
          0,
          2,
        ],
      });
    });

    it('to one character', () => {
      const oldDoc = {
        _id: 'nara',
        text: 'abc',
      };

      const newDoc = {
        _id: 'nara',
        text: ' ',
      };

      expect(textOTDiff.diff(oldDoc, newDoc)).toStrictEqual({
        text: [
          `@@ -1,3 +1 @@
-abc
+ 
`,
          0,
          2,
        ],
      });
    });

    it('adding to head of text', () => {
      const oldDoc = {
        _id: 'nara',
        text: 'abc',
      };

      const newDoc = {
        _id: 'nara',
        text: '123abc',
      };

      expect(textOTDiff.diff(oldDoc, newDoc)).toStrictEqual({
        text: [
          `@@ -1,3 +1,6 @@
+123
 abc
`,
          0,
          2,
        ],
      });
    });

    it('adding to tail of text', () => {
      const oldDoc = {
        _id: 'nara',
        text: 'abc',
      };

      const newDoc = {
        _id: 'nara',
        text: 'abc123',
      };

      expect(textOTDiff.diff(oldDoc, newDoc)).toStrictEqual({
        text: [
          `@@ -1,3 +1,6 @@
 abc
+123
`,
          0,
          2,
        ],
      });
    });

    it('deleting from head of text', () => {
      const oldDoc = {
        _id: 'nara',
        text: 'abcdef',
      };

      const newDoc = {
        _id: 'nara',
        text: 'def',
      };

      expect(textOTDiff.diff(oldDoc, newDoc)).toStrictEqual({
        text: [
          `@@ -1,6 +1,3 @@
-abc
 def
`,
          0,
          2,
        ],
      });
    });

    it('deleting from tail of text', () => {
      const oldDoc = {
        _id: 'nara',
        text: 'abcdef',
      };

      const newDoc = {
        _id: 'nara',
        text: 'abc',
      };

      expect(textOTDiff.diff(oldDoc, newDoc)).toStrictEqual({
        text: [
          `@@ -1,6 +1,3 @@
 abc
-def
`,
          0,
          2,
        ],
      });
    });

    it('replacing', () => {
      const oldDoc = {
        _id: 'nara',
        text: 'abcdef',
      };

      const newDoc = {
        _id: 'nara',
        text: 'aebdcf',
      };

      expect(textOTDiff.diff(oldDoc, newDoc)).toStrictEqual({
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
      });
    });

    it('moving long text', () => {
      const oldDoc = {
        _id: 'nara',
        text: 'abcdefghijklmnopqrstuvwxyz0123456789',
      };

      const newDoc = {
        _id: 'nara',
        text: 'abcdefg56789hijklmnopqrstuvwxyz01234',
      };

      expect(textOTDiff.diff(oldDoc, newDoc)).toStrictEqual({
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
      });
    });

    it('adding not escaped characters', () => {
      // google/diff-match-patch uses encodeURI()
      const oldDoc = {
        _id: 'nara',
        text: ' ',
      };

      const newDoc = {
        _id: 'nara',
        text: `AZaz09;,/?:@&=+$-_.!~*'()#`,
      };

      expect(textOTDiff.diff(oldDoc, newDoc)).toStrictEqual({
        text: [
          `@@ -1 +1,26 @@
- 
+AZaz09;,/?:@&=+$-_.!~*'()#
`,
          0,
          2,
        ],
      });
    });

    it('adding new lines and replacing complex text', () => {
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

      expect(textOTDiff.diff(oldDoc, newDoc)).toStrictEqual({
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
      });
    });
  });
});
