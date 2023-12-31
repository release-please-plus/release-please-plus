// Copyright 2022 Google LLC
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

import {RootComposerUpdatePackages} from '../../src/updaters/php/root-composer-update-packages';
import {Version, VersionsMap} from '../../src/version';

describe('PHPComposer', () => {
  describe('updateContent', () => {
    it('does not update a version when version is the same', async () => {
      const oldContent = '{"version":"1.0.0","replace":{"version":"1.0.0"}}';

      const version = Version.parse('1.0.0');

      const versionsMap: VersionsMap = new Map();

      const newContent = new RootComposerUpdatePackages({
        version,
        versionsMap,
      }).updateContent(oldContent);

      expect(newContent).toBe(
        '{"version":"1.0.0","replace":{"version":"1.0.0"}}'
      );

      expect(newContent).toMatchSnapshot();
    });

    it('update all versions in composer.json', async () => {
      const oldContent = '{"version":"0.0.0","replace":{"version":"0.0.0"}}';

      const version = Version.parse('1.0.0');

      const versionsMap: VersionsMap = new Map();

      versionsMap.set('version', version);

      const newContent = new RootComposerUpdatePackages({
        version,
        versionsMap,
      }).updateContent(oldContent);

      expect(newContent).toBe(
        '{"version":"1.0.0","replace":{"version":"1.0.0"}}'
      );

      expect(newContent).toMatchSnapshot();
    });

    it('update root version in composer.json', async () => {
      const oldContent = '{"version":"0.0.0"}';

      const version = Version.parse('1.0.0');

      const versionsMap: VersionsMap = new Map();

      versionsMap.set('version', version);

      const newContent = new RootComposerUpdatePackages({
        version,
        versionsMap,
      }).updateContent(oldContent);

      expect(newContent).toBe('{"version":"1.0.0"}');

      expect(newContent).toMatchSnapshot();
    });

    it('update replace version in composer.json when version is present', async () => {
      const oldContent = '{"replace":{"version":"0.0.0"}}';

      const version = Version.parse('1.0.0');

      const versionsMap: VersionsMap = new Map();

      versionsMap.set('version', version);

      const newContent = new RootComposerUpdatePackages({
        version,
        versionsMap,
      }).updateContent(oldContent);

      expect(newContent).toBe('{"replace":{"version":"1.0.0"}}');

      expect(newContent).toMatchSnapshot();
    });

    it('update replace version in composer.json when version is missing', async () => {
      const oldContent = '{"replace":{}}';

      const version = Version.parse('1.0.0');

      const versionsMap: VersionsMap = new Map();

      versionsMap.set('version', version);

      const newContent = new RootComposerUpdatePackages({
        version,
        versionsMap,
      }).updateContent(oldContent);

      expect(newContent).toBe('{"replace":{"version":"1.0.0"}}');

      expect(newContent).toMatchSnapshot();
    });
  });
});
