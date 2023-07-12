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
import {PHPYoshi} from '../../src/strategies/php-yoshi';

import {assertHasUpdate, buildGitHubFileRaw, dateSafe} from '../helpers';
import {buildMockConventionalCommit} from '../helpers';
import {TagName} from '../../src/util/tag-name';
import {Version} from '../../src/version';
import {Changelog} from '../../src/updaters/changelog';
import {RootComposerUpdatePackages} from '../../src/updaters/php/root-composer-update-packages';
import {PHPClientVersion} from '../../src/updaters/php/php-client-version';
import {DefaultUpdater} from '../../src/updaters/default';
import {readFileSync} from 'fs';
import {resolve} from 'path';
import {FileNotFoundError} from '../../src/errors';

describe('PHPYoshi', () => {
  let github: GitHub;
  let getFileStub: sinon.SinonStub;
  const commits = [
    ...buildMockConventionalCommit(
      'fix(deps): update dependency com.google.cloud:google-cloud-storage to v1.120.0',
      ['Client1/foo.php']
    ),
    ...buildMockConventionalCommit(
      'fix(deps): update dependency com.google.cloud:google-cloud-spanner to v1.50.0',
      ['Client2/foo.php', 'Client3/bar.php']
    ),
    ...buildMockConventionalCommit('misc: update common templates'),
  ];
  beforeEach(async () => {
    github = await GitHub.create({
      owner: 'googleapis',
      repo: 'php-yoshi-test-repo',
      defaultBranch: 'main',
    });
    getFileStub = jest.spyOn(github, 'getFileContentsOnBranch');
    getFileStub
      .calledWith('Client1/VERSION', 'main')
      .mockResolvedValue(buildGitHubFileRaw('1.2.3'));
    getFileStub
      .calledWith('Client2/VERSION', 'main')
      .mockResolvedValue(buildGitHubFileRaw('2.0.0'));
    getFileStub
      .calledWith('Client3/VERSION', 'main')
      .mockResolvedValue(buildGitHubFileRaw('0.1.2'));
    getFileStub
      .calledWith('Client1/composer.json', 'main')
      .mockResolvedValue(buildGitHubFileRaw('{"name": "google/client1"}'));
    getFileStub
      .calledWith('Client2/composer.json', 'main')
      .mockResolvedValue(buildGitHubFileRaw('{"name": "google/client2"}'));
    getFileStub
      .calledWith('Client3/composer.json', 'main')
      .mockResolvedValue(
        buildGitHubFileRaw(
          '{"name": "google/client3", "extra": {"component": {"entry": "src/Entry.php"}}}'
        )
      );
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });
  describe('buildReleasePullRequest', () => {
    it('returns release PR changes with defaultInitialVersion', async () => {
      const expectedVersion = '1.0.0';
      const strategy = new PHPYoshi({
        targetBranch: 'main',
        github,
      });
      const latestRelease = undefined;
      const release = await strategy.buildReleasePullRequest(
        commits,
        latestRelease
      );
      expect(release!.version?.toString()).toEqual(expectedVersion);
      expect(dateSafe(release!.body.toString())).toMatchSnapshot();
    });
    it('returns release PR changes with semver patch bump', async () => {
      const expectedVersion = '0.123.5';
      const strategy = new PHPYoshi({
        targetBranch: 'main',
        github,
      });
      const latestRelease = {
        tag: new TagName(Version.parse('0.123.4'), 'google-cloud-automl'),
        sha: 'abc123',
        notes: 'some notes',
      };
      const release = await strategy.buildReleasePullRequest(
        commits,
        latestRelease
      );
      expect(release!.version?.toString()).toEqual(expectedVersion);
      expect(dateSafe(release!.body.toString())).toMatchSnapshot();
    });
    it('includes misc commits', async () => {
      const expectedVersion = '0.123.5';
      const strategy = new PHPYoshi({
        targetBranch: 'main',
        github,
      });
      const latestRelease = {
        tag: new TagName(Version.parse('0.123.4'), 'google-cloud-automl'),
        sha: 'abc123',
        notes: 'some notes',
      };
      const release = await strategy.buildReleasePullRequest(
        [
          {
            sha: 'def234',
            message: 'misc: some miscellaneous task',
            files: ['Client3/README.md'],
          },
        ],
        latestRelease
      );
      expect(release!.version?.toString()).toEqual(expectedVersion);
      expect(dateSafe(release!.body.toString())).toMatchSnapshot();
    });
  });
  describe('buildUpdates', () => {
    it('builds common files', async () => {
      const strategy = new PHPYoshi({
        targetBranch: 'main',
        github,
      });
      const latestRelease = undefined;
      const release = await strategy.buildReleasePullRequest(
        commits,
        latestRelease
      );
      const updates = release!.updates;
      assertHasUpdate(updates, 'CHANGELOG.md', Changelog);
      assertHasUpdate(updates, 'composer.json', RootComposerUpdatePackages);
    });
    it('finds touched components', async () => {
      const strategy = new PHPYoshi({
        targetBranch: 'main',
        github,
      });
      const latestRelease = undefined;
      const release = await strategy.buildReleasePullRequest(
        commits,
        latestRelease
      );
      const updates = release!.updates;
      assertHasUpdate(updates, 'Client1/VERSION', DefaultUpdater);
      assertHasUpdate(updates, 'Client2/VERSION', DefaultUpdater);
      assertHasUpdate(updates, 'Client3/VERSION', DefaultUpdater);
      assertHasUpdate(updates, 'Client3/src/Entry.php', PHPClientVersion);
    });
    it('ignores non client top level directories', async () => {
      const strategy = new PHPYoshi({
        targetBranch: 'main',
        github,
      });
      const latestRelease = undefined;
      const commits = [
        ...buildMockConventionalCommit(
          'fix(deps): update dependency com.google.cloud:google-cloud-storage to v1.120.0',
          ['Client1/foo.php', '.git/release-please.yml']
        ),
        ...buildMockConventionalCommit(
          'fix(deps): update dependency com.google.cloud:google-cloud-spanner to v1.50.0',
          ['Client2/foo.php', 'Client3/bar.php']
        ),
        ...buildMockConventionalCommit('misc: update common templates'),
      ];
      getFileStub
        .calledWith('.git/VERSION', 'main')
        .rejects(new FileNotFoundError('.git/VERSION'));
      const release = await strategy.buildReleasePullRequest(
        commits,
        latestRelease
      );
      const updates = release!.updates;
      assertHasUpdate(updates, 'Client1/VERSION', DefaultUpdater);
      assertHasUpdate(updates, 'Client2/VERSION', DefaultUpdater);
      assertHasUpdate(updates, 'Client3/VERSION', DefaultUpdater);
      assertHasUpdate(updates, 'Client3/src/Entry.php', PHPClientVersion);
    });
  });
  describe('buildRelease', () => {
    it('parses the release notes', async () => {
      const strategy = new PHPYoshi({
        targetBranch: 'main',
        github,
      });
      const body = readFileSync(
        resolve('./test/fixtures/release-notes/legacy-php-yoshi.txt'),
        'utf8'
      ).replace(/\r\n/g, '\n');
      const mergedPullRequest = {
        headBranchName: 'release-please--branches--main',
        baseBranchName: 'main',
        number: 123,
        title: 'chore(main): release 0.173.0',
        body,
        labels: ['autorelease: pending'],
        files: [],
        sha: 'abc123',
      };
      const release = await strategy.buildRelease(mergedPullRequest);
      expect(release).toBeDefined();
      expect(release!.notes).toMatchSnapshot();
      expect(release!.name).toEqual('v0.173.0');
      expect(release!.sha).toEqual('abc123');
      expect(release!.tag.toString()).toEqual('v0.173.0');
    });
  });
});
