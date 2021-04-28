import { insertOp, type } from 'ot-json1';
import { JsonDiff } from '../../src/remote/diff';
import { JsonPatchOT } from '../../src/remote/json_patch_ot';

const jDiff = new JsonDiff();
const jPatch = new JsonPatchOT();

describe('<remote/ot> OT', () => {
  it('returns op from primitives: add', () => {
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
    expect(jPatch.apply(oldDoc, patch)).toStrictEqual(newDoc);
    expect(jPatch.fromDiff(diff!)).toStrictEqual(patch);

    expect(jPatch.patch(oldDoc, jDiff.diff(oldDoc, newDoc)!)).toStrictEqual(newDoc);
  });

  it('returns merged op from serialized primitives: add', () => {
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
    console.log(patchOurs);
    const patchTheirs = jPatch.fromDiff(diffTheirs!);
    console.log(patchTheirs);

    expect(jPatch.patch(ours, diffOurs!, diffTheirs)).toStrictEqual(merged);
  });

  it('returns merged op from overwriting primitives: add', () => {
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
    // 'age' and 'deer' is interdependent.
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

  it('returns merged op from conflicted primitives: add', () => {
    const base = {
      _id: 'nara',
      age: 'Nara prefecture',
    };

    const ours = {
      _id: 'nara',
      age: 'Previous Nara prefecture',
      year: 1868,
    };

    const theirs = {
      _id: 'nara',
      age: 'Heijo-kyo',
      year: 710,
    };

    const merged = {
      _id: 'nara',
      age: 'Previous Nara prefecture',
      year: 1868,
    };

    const diffOurs = jDiff.diff(base, ours);
    console.log(diffOurs);
    const diffTheirs = jDiff.diff(base, theirs);
    console.log(diffTheirs);

    const patchOurs = jPatch.fromDiff(diffOurs!);
    console.log(patchOurs);
    const patchTheirs = jPatch.fromDiff(diffTheirs!);
    console.log(patchTheirs);

    expect(jPatch.patch(ours, diffOurs!, diffTheirs)).toStrictEqual(merged);
  });

  it.skip('test transform', () => {
    const op1 = insertOp(['a'], 'x');
    console.log(op1);
    const op2 = insertOp(['b', 'c'], 'y');
    console.log(op2);
    const mergeOp = type.transform(op1, op2, 'left');
    console.log(mergeOp);
  });
});
