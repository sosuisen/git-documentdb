import { JsonDiff } from '../../src/remote/diff';

const jDiff = new JsonDiff();

describe('<remote/diff> diff', () => {
  it('primitives: add', () => {
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
    expect(jDiff.diff(oldDoc, newDoc)).toStrictEqual({
      prof2: ['Heijo-kyo'],
      year2: [710],
      current2: [false],
    });
  });

  it('primitives: update', () => {
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
    expect(jDiff.diff(oldDoc, newDoc)).toStrictEqual({
      prof: ['Nara prefecture', 'Heijo-kyo'],
      year: [1887, 710],
      current: [true, false],
    });
  });

  it('primitives: delete', () => {
    const oldDoc = {
      _id: 'nara',
      prof: 'Nara prefecture',
      year: 1887,
      current: true,
    };
    const newDoc = {
      _id: 'nara',
    };
    expect(jDiff.diff(oldDoc, newDoc)).toStrictEqual({
      prof: ['Nara prefecture', 0, 0],
      year: [1887, 0, 0],
      current: [true, 0, 0],
    });
  });

  it('nested objects: add property', () => {
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
    expect(jDiff.diff(oldDoc, newDoc)).toStrictEqual({
      data: {
        current: [true],
      },
    });
  });

  it('nested objects: add subtree', () => {
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
    expect(jDiff.diff(oldDoc, newDoc)).toStrictEqual({
      data: {
        site: [{ prof: 'Heijo-kyo' }],
      },
    });
  });

  it('nested objects: add array', () => {
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
    expect(jDiff.diff(oldDoc, newDoc)).toStrictEqual({
      data: {
        site: [['Heijo-kyo']],
      },
    });
  });

  it('nested objects: update', () => {
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
    expect(jDiff.diff(oldDoc, newDoc)).toStrictEqual({
      data: {
        prof: ['Nara prefecture', 'Heijo-kyo'],
        year: [1887, 710],
        current: [true, false],
      },
    });
  });

  it('nested objects: delete', () => {
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
    expect(jDiff.diff(oldDoc, newDoc)).toStrictEqual({
      data: {
        year: [1887, 0, 0],
        current: [true, 0, 0],
      },
    });
  });

  it('arrays: insert at first', () => {
    const oldDoc = {
      _id: 'nara',
      temple: ['Todaiji', 'Yakushiji'],
    };
    const newDoc = {
      _id: 'nara',
      temple: ['Toshodaiji', 'Todaiji', 'Yakushiji'],
    };
    expect(jDiff.diff(oldDoc, newDoc)).toStrictEqual({
      temple: {
        0: ['Toshodaiji'],
        _t: 'a',
      },
    });
  });

  it('arrays: insert at middle', () => {
    const oldDoc = {
      _id: 'nara',
      temple: ['Todaiji', 'Yakushiji'],
    };
    const newDoc = {
      _id: 'nara',
      temple: ['Todaiji', 'Toshodaiji', 'Yakushiji'],
    };
    expect(jDiff.diff(oldDoc, newDoc)).toStrictEqual({
      temple: {
        1: ['Toshodaiji'],
        _t: 'a',
      },
    });
  });

  it('arrays: insert at last', () => {
    const oldDoc = {
      _id: 'nara',
      temple: ['Todaiji', 'Yakushiji'],
    };
    const newDoc = {
      _id: 'nara',
      temple: ['Todaiji', 'Yakushiji', 'Toshodaiji'],
    };
    expect(jDiff.diff(oldDoc, newDoc)).toStrictEqual({
      temple: {
        2: ['Toshodaiji'],
        _t: 'a',
      },
    });
  });

  it('arrays: insert two members', () => {
    const oldDoc = {
      _id: 'nara',
      temple: ['Todaiji', 'Yakushiji'],
    };
    const newDoc = {
      _id: 'nara',
      temple: ['Todaiji', 'Toshodaiji', 'Kofukuji', 'Yakushiji'],
    };
    expect(jDiff.diff(oldDoc, newDoc)).toStrictEqual({
      temple: {
        1: ['Toshodaiji'],
        2: ['Kofukuji'],
        _t: 'a',
      },
    });
  });

  it('arrays: move', () => {
    const oldDoc = {
      _id: 'nara',
      temple: ['Todaiji', 'Yakushiji'],
    };
    const newDoc = {
      _id: 'nara',
      temple: ['Yakushiji', 'Todaiji'],
    };
    expect(jDiff.diff(oldDoc, newDoc)).toStrictEqual({
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

  it('arrays: move sequential two members', () => {
    const oldDoc = {
      _id: 'nara',
      temple: ['Todaiji', 'Yakushiji', 'Toshodaiji', 'Kofukuji'],
    };
    const newDoc = {
      _id: 'nara',
      temple: ['Toshodaiji', 'Kofukuji', 'Todaiji', 'Yakushiji'],
    };
    expect(jDiff.diff(oldDoc, newDoc)).toStrictEqual({
      temple: {
        _2: ['', 0, 3],
        _3: ['', 1, 3],
        _t: 'a',
      },
    });
  });

  it('arrays: remove', () => {
    const oldDoc = {
      _id: 'nara',
      temple: ['Todaiji', 'Yakushiji'],
    };
    const newDoc = {
      _id: 'nara',
      temple: ['Todaiji'],
    };
    expect(jDiff.diff(oldDoc, newDoc)).toStrictEqual({
      temple: {
        _1: ['Yakushiji', 0, 0],
        _t: 'a',
      },
    });
  });

  it('nested arrays', () => {
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

    expect(jDiff.diff(oldDoc, newDoc)).toStrictEqual({
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

  it('object arrays', () => {
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
    expect(jDiff.diff(oldDoc, newDoc)).toStrictEqual({
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

  it('object arrays by objectHash', () => {
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

  it('long text (more than 30 characters)', () => {
    const oldDoc = {
      _id: 'nara',
      text: 'abcdefghijklmnopqrstuvwxyz0123456789',
    };

    const newDoc = {
      _id: 'nara',
      text: 'abcdefg56789hijklmnopqrstuvwxyz01234',
    };

    expect(jDiff.diff(oldDoc, newDoc)).toStrictEqual({
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

  it('short text (more than 1 characters)', () => {
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

    expect(myDiff.diff(oldDoc, newDoc)).toStrictEqual({
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
});
