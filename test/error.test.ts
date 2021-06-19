/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import expect from 'expect';
import { InvalidCollectionPathError } from '../src/error';

describe('<error>', () => {
  it('InvalidCollectionPathError ', () => {
    const err = new InvalidCollectionPathError('test-message');
    expect(err.message).toMatch(/test-message/);
  });
});
