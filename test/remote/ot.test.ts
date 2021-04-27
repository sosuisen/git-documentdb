import { JsonDiff } from '../../src/remote/diff';
import { JsonPatch } from '../../src/remote/ot';

const jDiff = new JsonDiff();
const jPatch = new JsonPatch();

describe('<remote/ot> OT', () => {
  it('returns operation from diff of primitives: add', () => {
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

    const diff = {
      prof2: ['Heijo-kyo'],
      year2: [710],
      current2: [false],
    };
    expect(jDiff.diff(oldDoc, newDoc)).toStrictEqual(diff);

    // keys must be sorted by descendant order
    const patch = [
      ['current2', { i: false }],
      ['prof2', { i: 'Heijo-kyo' }],
      ['year2', { i: 710 }],
    ];
    expect(jPatch.apply(oldDoc, patch)).toStrictEqual(newDoc);
    expect(jPatch.fromDiff(diff!)).toStrictEqual(patch);

    expect(jPatch.patch(oldDoc, jDiff.diff(oldDoc, newDoc)!)).toStrictEqual(newDoc);
  });

  it('returns merged operation from diff of primitives: add', () => {
    const base = {
      _id: 'nara',
      prof: 'Nara prefecture',
    };

    const ours = {
      _id: 'nara',
      prof: 'Nara prefecture',
      year: 1887,
      current: true,
    };

    const theirs = {
      _id: 'nara',
      prof: 'Nara prefecture',
      prof2: 'Heijo-kyo',
      year2: 710,
      current2: false,
    };

    const merged = {
      _id: 'nara',
      prof: 'Nara prefecture',
      year: 1887,
      current: true,
      prof2: 'Heijo-kyo',
      year2: 710,
      current2: false,
    };

    const diffOurs = jDiff.diff(base, ours);
    const diffTheirs = jDiff.diff(base, theirs);

    const patch = [
      ['current', { i: true }],
      ['current2', { i: false }],
      ['prof2', { i: 'Heijo-kyo' }],
      ['year', { i: 1887 }],
      ['year2', { i: 710 }],
    ];
    expect(jPatch.apply(base, patch)).toStrictEqual(merged);

    const patchOurs = jPatch.fromDiff(diffOurs!);
    console.log(patchOurs);
    const patchTheirs = jPatch.fromDiff(diffTheirs!);
    console.log(patchTheirs);
    const patchMerged = jPatch.transform(patchOurs, patchTheirs, 'left');
    console.log(patchMerged);
    expect(patchMerged).toStrictEqual(patch);

    expect(jPatch.patch(base, diffOurs!, diffTheirs)).toStrictEqual(merged);
  });
});
