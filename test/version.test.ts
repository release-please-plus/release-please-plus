// Copyright 2021 Google LLC
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

import {Version} from '../src/version';

describe('Version', () => {
  describe('parse', () => {
    it('can read a plain semver', async () => {
      const input = '1.23.45';
      const version = Version.parse(input);
      expect(version.major).toBe(1);
      expect(version.minor).toBe(23);
      expect(version.patch).toBe(45);
      expect(version.preRelease).toBeUndefined();
      expect(version.build).toBeUndefined();
      expect(version.toString()).toBe(input);
    });
    it('can read a SNAPSHOT version', async () => {
      const input = '1.23.45-SNAPSHOT';
      const version = Version.parse(input);
      expect(version.major).toBe(1);
      expect(version.minor).toBe(23);
      expect(version.patch).toBe(45);
      expect(version.preRelease).toBe('SNAPSHOT');
      expect(version.build).toBeUndefined();
      expect(version.toString()).toBe(input);
    });
    it('can read a beta version', async () => {
      const input = '1.23.45-beta';
      const version = Version.parse(input);
      expect(version.major).toBe(1);
      expect(version.minor).toBe(23);
      expect(version.patch).toBe(45);
      expect(version.preRelease).toBe('beta');
      expect(version.build).toBeUndefined();
      expect(version.toString()).toBe(input);
    });
    it('can read a beta SNAPSHOT version', async () => {
      const input = '1.23.45-beta-SNAPSHOT';
      const version = Version.parse(input);
      expect(version.major).toBe(1);
      expect(version.minor).toBe(23);
      expect(version.patch).toBe(45);
      expect(version.preRelease).toBe('beta-SNAPSHOT');
      expect(version.build).toBeUndefined();
      expect(version.toString()).toBe(input);
    });
    it('can read an lts version', async () => {
      const input = '1.23.45-sp.1';
      const version = Version.parse(input);
      expect(version.major).toBe(1);
      expect(version.minor).toBe(23);
      expect(version.patch).toBe(45);
      expect(version.preRelease).toBe('sp.1');
      expect(version.build).toBeUndefined();
      expect(version.toString()).toBe(input);
    });
    it('can read an lts beta version', async () => {
      const input = '1.23.45-beta-sp.1';
      const version = Version.parse(input);
      expect(version.major).toBe(1);
      expect(version.minor).toBe(23);
      expect(version.patch).toBe(45);
      expect(version.preRelease).toBe('beta-sp.1');
      expect(version.build).toBeUndefined();
      expect(version.toString()).toBe(input);
    });
    it('can read an lts snapshot version', async () => {
      const input = '1.23.45-sp.1-SNAPSHOT';
      const version = Version.parse(input);
      expect(version.major).toBe(1);
      expect(version.minor).toBe(23);
      expect(version.patch).toBe(45);
      expect(version.preRelease).toBe('sp.1-SNAPSHOT');
      expect(version.build).toBeUndefined();
      expect(version.toString()).toBe(input);
    });
    it('can read an lts beta snapshot version', async () => {
      const input = '1.23.45-beta-sp.1-SNAPSHOT';
      const version = Version.parse(input);
      expect(version.major).toBe(1);
      expect(version.minor).toBe(23);
      expect(version.patch).toBe(45);
      expect(version.preRelease).toBe('beta-sp.1-SNAPSHOT');
      expect(version.toString()).toBe(input);
    });
    it('can read a plain semver with build', async () => {
      const input = '1.23.45+678';
      const version = Version.parse(input);
      expect(version.major).toBe(1);
      expect(version.minor).toBe(23);
      expect(version.patch).toBe(45);
      expect(version.preRelease).toBeUndefined();
      expect(version.build).toBe('678');
      expect(version.toString()).toBe(input);
    });
    it('can read a plain semver with alphanumeric build', async () => {
      const input = '1.23.45+678abc';
      const version = Version.parse(input);
      expect(version.major).toBe(1);
      expect(version.minor).toBe(23);
      expect(version.patch).toBe(45);
      expect(version.preRelease).toBeUndefined();
      expect(version.build).toBe('678abc');
      expect(version.toString()).toBe(input);
    });
    it('can read a semver with pre-release and build', async () => {
      const input = '1.23.45-beta.123+678';
      const version = Version.parse(input);
      expect(version.major).toBe(1);
      expect(version.minor).toBe(23);
      expect(version.patch).toBe(45);
      expect(version.preRelease).toBe('beta.123');
      expect(version.build).toBe('678');
      expect(version.toString()).toBe(input);
    });
  });
  describe('compare', () => {
    it('should handle pre-release versions', () => {
      const comparison = Version.parse('1.2.3').compare(
        Version.parse('1.2.3-alpha')
      );
      expect(comparison).toEqual(1);
    });
    it('should sort in ascending order using compare', () => {
      const input = [
        Version.parse('1.2.3'),
        Version.parse('1.2.3-alpha'),
        Version.parse('2.2.0'),
      ];
      const output = input.sort((a, b) => a.compare(b));
      expect(output.map(version => version.toString())).toEqual([
        '1.2.3-alpha',
        '1.2.3',
        '2.2.0',
      ]);
    });
  });
});
