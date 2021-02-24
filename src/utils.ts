/**
 * Returns JSON string which properties are sorted.
 * The sorting follows the UTF-16 (Number < Uppercase < Lowercase), except that heading underscore _ is the last.
 * Its indent is 2.
 *
 * NOTE: Heading underscore cannot be the first because replacing '\uffff' with '\u0000' does not effect to sorting order.
 */
export const toSortedJSONString = (obj: Record<string, any>) => {
  return JSON.stringify(
    obj,
    (_k, v) =>
      !(Array.isArray(v) || v === null) && typeof v === 'object'
        ? Object.keys(v)
          .sort((a, b) => {
            // Heading underscore is treated as the last character.
            a = a.startsWith('_') ? '\uffff' + a.slice(1) : a;
            b = b.startsWith('_') ? '\uffff' + b.slice(1) : b;
            return a > b ? 1 : a < b ? -1 : 0;
          })
          .reduce((r, k) => {
            r[k] = v[k];
            return r;
          }, {} as Record<string, any>)
        : v,
    2
  );
};
