// Copyright 2019 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {coerceOption} from '../../src/util/coerce-option';
import {resolve} from 'path';

const fixturesPath = './test/fixtures';

describe('coerceOption', () => {
  it('is a noop if option does not look like path', () => {
    expect(coerceOption('helloworld')).toBe('helloworld');
  });

  it('returns path-like option, if it does not exist', () => {
    expect(coerceOption('this/path/does/not/exist')).toBe(
      'this/path/does/not/exist'
    );
  });

  it('returns path-like option, if it resolves to a folder', () => {
    expect(coerceOption(fixturesPath)).toBe(fixturesPath);
  });

  it('returns file contents if option is path-like, and it resolves to file', () => {
    const coerced = coerceOption(resolve(fixturesPath, 'key.txt'));
    expect(coerced).toBe('abc123');
  });
});
