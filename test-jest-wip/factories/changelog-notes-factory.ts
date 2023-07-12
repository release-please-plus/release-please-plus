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

import {
  ChangelogNotesType,
  getChangelogTypes,
  GitHub,
  registerChangelogNotes,
} from '../../src';
import {
  buildChangelogNotes,
  unregisterChangelogNotes,
} from '../../src/factories/changelog-notes-factory';
import {DefaultChangelogNotes} from '../../src/changelog-notes/default';

describe('ChangelogNotesFactory', () => {
  let github: GitHub;
  beforeEach(async () => {
    github = await GitHub.create({
      owner: 'fake-owner',
      repo: 'fake-repo',
      defaultBranch: 'main',
      token: 'fake-token',
    });
  });
  describe('buildChangelogNotes', () => {
    const changelogTypes = ['default', 'github'];
    for (const changelogType of changelogTypes) {
      it(`should build a simple ${changelogType}`, () => {
        const changelogNotes = buildChangelogNotes({
          github,
          type: changelogType,
        });
        expect(changelogNotes).toBeDefined();
      });
    }
    it('should throw for unknown type', () => {
      expect(() =>
        buildChangelogNotes({github, type: 'non-existent'})
      ).toThrow();
    });
  });
  describe('getChangelogTypes', () => {
    it('should return default types', () => {
      const defaultTypes: ChangelogNotesType[] = ['default', 'github'];

      const types = getChangelogTypes();
      defaultTypes.forEach(type =>
        expect(types).toEqual(expect.arrayContaining([type]))
      );
    });
  });
  describe('registerChangelogNotes', () => {
    const changelogType = 'custom-test';

    class CustomTest extends DefaultChangelogNotes {}

    afterEach(() => {
      unregisterChangelogNotes(changelogType);
    });

    it('should register new releaser', async () => {
      registerChangelogNotes(changelogType, options => new CustomTest(options));

      const changelogNotesOptions = {
        type: changelogType,
        github,
        repositoryConfig: {},
        targetBranch: 'main',
      };
      const strategy = await buildChangelogNotes(changelogNotesOptions);
      expect(strategy).toBeInstanceOf(CustomTest);
    });
    it('should return custom type', () => {
      registerChangelogNotes(changelogType, options => new CustomTest(options));

      const allTypes = getChangelogTypes();
      expect(allTypes).toEqual(expect.arrayContaining([changelogType]));
    });
  });
});
