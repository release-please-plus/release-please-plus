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

import {GitHub} from '../../src/github';
import {TerraformModule} from '../../src/strategies/terraform-module';

import {assertHasUpdate, buildMockConventionalCommit} from '../helpers';
import {TagName} from '../../src/util/tag-name';
import {Version} from '../../src/version';
import {Changelog} from '../../src/updaters/changelog';
import {ReadMe} from '../../src/updaters/terraform/readme';
import {ModuleVersion} from '../../src/updaters/terraform/module-version';
import {when} from 'jest-when';

const COMMITS = [
  ...buildMockConventionalCommit(
    'fix(deps): update dependency com.google.cloud:google-cloud-storage to v1.120.0'
  ),
  ...buildMockConventionalCommit(
    'fix(deps): update dependency com.google.cloud:google-cloud-spanner to v1.50.0'
  ),
  ...buildMockConventionalCommit('chore: update common templates'),
];

describe('TerraformModule', () => {
  let github: GitHub;
  beforeEach(async () => {
    github = await GitHub.create({
      owner: 'googleapis',
      repo: 'terraform-module-test-repo',
      defaultBranch: 'main',
    });
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });
  describe('buildReleasePullRequest', () => {
    it('returns release PR changes with defaultInitialVersion', async () => {
      const expectedVersion = '0.1.0';
      const strategy = new TerraformModule({
        targetBranch: 'main',
        github,
        component: 'google-cloud-automl',
      });
      jest.spyOn(github, 'findFilesByFilenameAndRef').mockResolvedValue([]);
      const latestRelease = undefined;
      const release = await strategy.buildReleasePullRequest(
        COMMITS,
        latestRelease
      );
      expect(release!.version?.toString()).toEqual(expectedVersion);
    });
    it('returns release PR changes with semver patch bump', async () => {
      const expectedVersion = '0.123.5';
      const strategy = new TerraformModule({
        targetBranch: 'main',
        github,
        component: 'google-cloud-automl',
      });
      jest.spyOn(github, 'findFilesByFilenameAndRef').mockResolvedValue([]);
      const latestRelease = {
        tag: new TagName(Version.parse('0.123.4'), 'google-cloud-automl'),
        sha: 'abc123',
        notes: 'some notes',
      };
      const release = await strategy.buildReleasePullRequest(
        COMMITS,
        latestRelease
      );
      expect(release!.version?.toString()).toEqual(expectedVersion);
    });
  });
  describe('buildUpdates', () => {
    it('builds common files', async () => {
      const strategy = new TerraformModule({
        targetBranch: 'main',
        github,
        component: 'google-cloud-automl',
      });
      jest.spyOn(github, 'findFilesByFilenameAndRef').mockResolvedValue([]);
      const latestRelease = undefined;
      const release = await strategy.buildReleasePullRequest(
        COMMITS,
        latestRelease
      );
      const updates = release!.updates;
      assertHasUpdate(updates, 'CHANGELOG.md', Changelog);
    });

    it('finds and updates README files', async () => {
      const strategy = new TerraformModule({
        targetBranch: 'main',
        github,
        component: 'google-cloud-automl',
      });
      const findFilesStub = jest.spyOn(github, 'findFilesByFilenameAndRef');
      when(findFilesStub)
        .calledWith('readme.md', 'main', '.')
        .mockResolvedValue(['path1/readme.md', 'path2/readme.md']);
      when(findFilesStub)
        .calledWith('README.md', 'main', '.')
        .mockResolvedValue(['README.md', 'path3/README.md']);
      when(findFilesStub)
        .calledWith('versions.tf', 'main', '.')
        .mockResolvedValue(['path1/versions.tf', 'path2/versions.tf']);
      when(findFilesStub)
        .calledWith('versions.tf.tmpl', 'main', '.')
        .mockResolvedValue([
          'path1/versions.tf.tmpl',
          'path2/versions.tf.tmpl',
        ]);
      const latestRelease = undefined;
      const release = await strategy.buildReleasePullRequest(
        COMMITS,
        latestRelease
      );
      const updates = release!.updates;
      assertHasUpdate(updates, 'path1/readme.md', ReadMe);
      assertHasUpdate(updates, 'path2/readme.md', ReadMe);
      assertHasUpdate(updates, 'README.md', ReadMe);
      assertHasUpdate(updates, 'path3/README.md', ReadMe);
      assertHasUpdate(updates, 'path1/versions.tf', ModuleVersion);
      assertHasUpdate(updates, 'path2/versions.tf', ModuleVersion);
      assertHasUpdate(updates, 'path1/versions.tf.tmpl', ModuleVersion);
      assertHasUpdate(updates, 'path2/versions.tf.tmpl', ModuleVersion);
    });
  });
});
