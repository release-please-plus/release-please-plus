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

import {Node} from '../../src/strategies/node';
import {
  buildMockConventionalCommit,
  buildGitHubFileContent,
  assertHasUpdate,
} from '../helpers';
import nock from 'nock';

import {GitHub} from '../../src/github';
import {Version} from '../../src/version';
import {TagName} from '../../src/util/tag-name';
import {PackageLockJson} from '../../src/updaters/node/package-lock-json';
import {SamplesPackageJson} from '../../src/updaters/node/samples-package-json';
import {Changelog} from '../../src/updaters/changelog';
import {PackageJson} from '../../src/updaters/node/package-json';
import {ChangelogJson} from '../../src/updaters/changelog-json';
import * as assert from 'assert';
import {MissingRequiredFileError, FileNotFoundError} from '../../src/errors';
import {when} from 'jest-when';

nock.disableNetConnect();

const fixturesPath = './test/fixtures/strategies/node';

const UUID_REGEX =
  /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g;
const ISO_DATE_REGEX =
  /[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]+Z/g; // 2023-01-05T16:42:33.446Z

describe('Node', () => {
  let github: GitHub;
  const commits = [
    ...buildMockConventionalCommit(
      'fix(deps): update dependency com.google.cloud:google-cloud-storage to v1.120.0'
    ),
  ];
  beforeEach(async () => {
    github = await GitHub.create({
      owner: 'googleapis',
      repo: 'node-test-repo',
      defaultBranch: 'main',
    });
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });
  describe('buildReleasePullRequest', () => {
    it('returns release PR changes with defaultInitialVersion', async () => {
      const expectedVersion = '1.0.0';
      const strategy = new Node({
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
      const strategy = new Node({
        targetBranch: 'main',
        github,
        component: 'some-node-package',
        packageName: 'some-node-package',
      });
      const latestRelease = {
        tag: new TagName(Version.parse('0.123.4'), 'some-node-package'),
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
      const strategy = new Node({
        targetBranch: 'main',
        github,
      });
      const commits = [
        ...buildMockConventionalCommit(
          'fix(deps): update dependency com.google.cloud:google-cloud-storage to v1.120.0'
        ),
      ];
      const latestRelease = {
        tag: new TagName(Version.parse('0.123.4'), 'node-test-repo'),
        sha: 'abc123',
        notes: 'some notes',
      };
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(fixturesPath, 'package.json')
        );
      const pullRequest = await strategy.buildReleasePullRequest(
        commits,
        latestRelease
      );
      expect(pullRequest!.version?.toString()).toEqual(expectedVersion);
    });
    it('detects a default packageName', async () => {
      const expectedVersion = '0.123.5';
      const strategy = new Node({
        targetBranch: 'main',
        github,
        component: 'abc-123',
      });
      const commits = [
        ...buildMockConventionalCommit(
          'fix(deps): update dependency com.google.cloud:google-cloud-storage to v1.120.0'
        ),
      ];
      const latestRelease = {
        tag: new TagName(Version.parse('0.123.4'), 'node-test-repo'),
        sha: 'abc123',
        notes: 'some notes',
      };
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(fixturesPath, 'package.json')
        );
      const pullRequest = await strategy.buildReleasePullRequest(
        commits,
        latestRelease
      );
      expect(pullRequest!.version?.toString()).toEqual(expectedVersion);
    });
    it('handles missing package.json', async () => {
      jest
        .spyOn(github, 'getFileContentsOnBranch')
        .mockRejectedValue(new FileNotFoundError('stub/path'));
      const strategy = new Node({
        targetBranch: 'main',
        github,
      });
      const latestRelease = {
        tag: new TagName(Version.parse('0.123.4'), 'some-node-package'),
        sha: 'abc123',
        notes: 'some notes',
      };
      assert.rejects(async () => {
        await strategy.buildReleasePullRequest(commits, latestRelease);
      }, MissingRequiredFileError);
    });
    it('updates changelog.json if present', async () => {
      const COMMITS = [
        ...buildMockConventionalCommit(
          'fix(deps): update dependency com.google.cloud:google-cloud-storage to v1.120.0'
        ),
        ...buildMockConventionalCommit('chore: update deps'),
        ...buildMockConventionalCommit('chore!: update a very important dep'),
        ...buildMockConventionalCommit(
          'fix(deps): update dependency com.google.cloud:google-cloud-spanner to v1.50.0'
        ),
        ...buildMockConventionalCommit('chore: update common templates'),
      ];
      const strategy = new Node({
        targetBranch: 'main',
        github,
        component: 'google-cloud-node',
      });
      jest.spyOn(github, 'findFilesByFilenameAndRef').mockResolvedValue([]);
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('changelog.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(fixturesPath, 'changelog.json')
        );
      when(getFileContentsStub)
        .calledWith('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(fixturesPath, 'package.json')
        );
      const latestRelease = undefined;
      const release = await strategy.buildReleasePullRequest(
        COMMITS,
        latestRelease
      );
      const updates = release!.updates;
      assertHasUpdate(updates, 'CHANGELOG.md', Changelog);
      const update = assertHasUpdate(updates, 'changelog.json', ChangelogJson);
      const newContent = update.updater.updateContent(
        JSON.stringify({entries: []})
      );
      expect(
        newContent
          .replace(/\r\n/g, '\n') // make newline consistent regardless of OS.
          .replace(UUID_REGEX, 'abc-123-efd-qwerty')
          .replace(ISO_DATE_REGEX, '2023-01-05T16:42:33.446Z')
      ).toMatchSnapshot();
    });
  });
  describe('buildUpdates', () => {
    it('builds common files', async () => {
      const strategy = new Node({
        targetBranch: 'main',
        github,
        component: 'google-cloud-automl',
        packageName: 'google-cloud-automl-pkg',
      });
      jest.spyOn(github, 'findFilesByFilenameAndRef').mockResolvedValue([]);
      const latestRelease = undefined;
      const release = await strategy.buildReleasePullRequest(
        commits,
        latestRelease
      );
      const updates = release!.updates;
      assertHasUpdate(updates, 'CHANGELOG.md', Changelog);
      assertHasUpdate(updates, 'package-lock.json', PackageLockJson);
      assertHasUpdate(updates, 'npm-shrinkwrap.json', PackageLockJson);
      const update = assertHasUpdate(
        updates,
        'samples/package.json',
        SamplesPackageJson
      );
      const updater = update.updater as SamplesPackageJson;
      expect(updater.packageName).toBe('google-cloud-automl-pkg');
      assertHasUpdate(updates, 'package.json', PackageJson);
    });
  });
});
