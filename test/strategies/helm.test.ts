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

import {Helm} from '../../src/strategies/helm';
import {
  buildMockConventionalCommit,
  buildGitHubFileContent,
  assertHasUpdate,
} from '../helpers';

import {GitHub} from '../../src/github';
import {Version} from '../../src/version';
import {TagName} from '../../src/util/tag-name';
import {Changelog} from '../../src/updaters/changelog';
import {ChartYaml} from '../../src/updaters/helm/chart-yaml';
import {when} from 'jest-when';

const fixturesPath = './test/fixtures/strategies/helm';

describe('Helm', () => {
  let github: GitHub;
  const commits = [
    ...buildMockConventionalCommit(
      'fix(deps): update dependency com.google.cloud:google-cloud-storage to v1.120.0'
    ),
  ];
  beforeEach(async () => {
    github = await GitHub.create({
      owner: 'googleapis',
      repo: 'helm-test-repo',
      defaultBranch: 'main',
    });
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });
  describe('buildReleasePullRequest', () => {
    it('returns release PR changes with defaultInitialVersion', async () => {
      const expectedVersion = '1.0.0';
      const strategy = new Helm({
        targetBranch: 'main',
        github,
        component: 'google-cloud-automl',
        packageName: 'google-cloud-automl',
      });
      const latestRelease = undefined;
      const release = await strategy.buildReleasePullRequest(
        commits,
        latestRelease
      );
      expect(release!.version?.toString()).toEqual(expectedVersion);
    });
    it('builds a release pull request', async () => {
      const expectedVersion = '0.123.5';
      const strategy = new Helm({
        targetBranch: 'main',
        github,
        component: 'some-helm-package',
        packageName: 'some-helm-package',
      });
      const latestRelease = {
        tag: new TagName(Version.parse('0.123.4'), 'some-helm-package'),
        sha: 'abc123',
        notes: 'some notes',
      };
      const pullRequest = await strategy.buildReleasePullRequest(
        commits,
        latestRelease
      );
      expect(pullRequest!.version?.toString()).toEqual(expectedVersion);
    });
    it('detects a default component', async () => {
      const expectedVersion = '0.123.5';
      const strategy = new Helm({
        targetBranch: 'main',
        github,
      });
      const latestRelease = {
        tag: new TagName(Version.parse('0.123.4'), 'helm-test-repo'),
        sha: 'abc123',
        notes: 'some notes',
      };
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('Chart.yaml', 'main')
        .mockResolvedValue(buildGitHubFileContent(fixturesPath, 'Chart.yaml'));
      const pullRequest = await strategy.buildReleasePullRequest(
        commits,
        latestRelease
      );
      expect(pullRequest!.version?.toString()).toEqual(expectedVersion);
    });
  });
  describe('buildUpdates', () => {
    it('builds common files', async () => {
      const strategy = new Helm({
        targetBranch: 'main',
        github,
        component: 'google-cloud-automl',
        packageName: 'google-cloud-automl',
      });
      const latestRelease = undefined;
      const release = await strategy.buildReleasePullRequest(
        commits,
        latestRelease
      );
      const updates = release!.updates;
      expect(updates).toHaveLength(2);
      assertHasUpdate(updates, 'CHANGELOG.md', Changelog);
      assertHasUpdate(updates, 'Chart.yaml', ChartYaml);
    });
  });
});
