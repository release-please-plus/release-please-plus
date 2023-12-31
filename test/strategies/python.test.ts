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
import {Python} from '../../src/strategies/python';

import {buildGitHubFileContent, assertHasUpdate} from '../helpers';
import {buildMockConventionalCommit} from '../helpers';
import {PythonFileWithVersion} from '../../src/updaters/python/python-file-with-version';
import {TagName} from '../../src/util/tag-name';
import {Version} from '../../src/version';
import {PyProjectToml} from '../../src/updaters/python/pyproject-toml';
import {SetupCfg} from '../../src/updaters/python/setup-cfg';
import {SetupPy} from '../../src/updaters/python/setup-py';
import {Changelog} from '../../src/updaters/changelog';
import {ChangelogJson} from '../../src/updaters/changelog-json';
import {when} from 'jest-when';

const fixturesPath = './test/fixtures/strategies/python';

const UUID_REGEX =
  /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g;
const ISO_DATE_REGEX =
  /[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]+Z/g; // 2023-01-05T16:42:33.446Z

const COMMITS = [
  ...buildMockConventionalCommit(
    'fix(deps): update dependency com.google.cloud:google-cloud-storage to v1.120.0'
  ),
  ...buildMockConventionalCommit(
    'fix(deps): update dependency com.google.cloud:google-cloud-spanner to v1.50.0'
  ),
  ...buildMockConventionalCommit('chore: update common templates'),
];

describe('Python', () => {
  let github: GitHub;
  beforeEach(async () => {
    github = await GitHub.create({
      owner: 'googleapis',
      repo: 'py-test-repo',
      defaultBranch: 'main',
    });
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });
  describe('buildReleasePullRequest', () => {
    it('returns release PR changes with defaultInitialVersion', async () => {
      const expectedVersion = '0.1.0';
      const strategy = new Python({
        targetBranch: 'main',
        github,
        component: 'google-cloud-automl',
      });
      jest
        .spyOn(github, 'getFileContentsOnBranch')
        .mockResolvedValue(buildGitHubFileContent(fixturesPath, 'setup.py'));
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
      const strategy = new Python({
        targetBranch: 'main',
        github,
        component: 'google-cloud-automl',
      });
      jest
        .spyOn(github, 'getFileContentsOnBranch')
        .mockResolvedValue(buildGitHubFileContent(fixturesPath, 'setup.py'));
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
      const strategy = new Python({
        targetBranch: 'main',
        github,
        component: 'google-cloud-automl',
      });
      jest
        .spyOn(github, 'getFileContentsOnBranch')
        .mockResolvedValue(buildGitHubFileContent(fixturesPath, 'setup.py'));
      jest.spyOn(github, 'findFilesByFilenameAndRef').mockResolvedValue([]);
      const latestRelease = undefined;
      const release = await strategy.buildReleasePullRequest(
        COMMITS,
        latestRelease
      );
      const updates = release!.updates;
      assertHasUpdate(updates, 'CHANGELOG.md', Changelog);
      assertHasUpdate(updates, 'setup.cfg', SetupCfg);
      assertHasUpdate(updates, 'setup.py', SetupPy);
      assertHasUpdate(
        updates,
        'google-cloud-automl/__init__.py',
        PythonFileWithVersion
      );
      assertHasUpdate(
        updates,
        'src/google-cloud-automl/__init__.py',
        PythonFileWithVersion
      );
      assertHasUpdate(
        updates,
        'google_cloud_automl/__init__.py',
        PythonFileWithVersion
      );
      assertHasUpdate(
        updates,
        'src/google_cloud_automl/__init__.py',
        PythonFileWithVersion
      );
    });

    it('finds and updates a pyproject.toml', async () => {
      const strategy = new Python({
        targetBranch: 'main',
        github,
        component: 'google-cloud-automl',
      });
      jest
        .spyOn(github, 'getFileContentsOnBranch')
        .mockResolvedValue(
          buildGitHubFileContent('./test/updaters/fixtures', 'pyproject.toml')
        );
      jest.spyOn(github, 'findFilesByFilenameAndRef').mockResolvedValue([]);
      const latestRelease = undefined;
      const release = await strategy.buildReleasePullRequest(
        COMMITS,
        latestRelease
      );
      const updates = release!.updates;
      assertHasUpdate(updates, 'pyproject.toml', PyProjectToml);
    });

    it('finds and updates a version.py file', async () => {
      const strategy = new Python({
        targetBranch: 'main',
        github,
        component: 'google-cloud-automl',
      });
      jest
        .spyOn(github, 'getFileContentsOnBranch')
        .mockResolvedValue(buildGitHubFileContent(fixturesPath, 'setup.py'));
      jest
        .spyOn(github, 'findFilesByFilenameAndRef')
        .mockResolvedValue(['src/version.py']);
      const latestRelease = undefined;
      const release = await strategy.buildReleasePullRequest(
        COMMITS,
        latestRelease
      );
      const updates = release!.updates;
      assertHasUpdate(updates, 'src/version.py', PythonFileWithVersion);
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
      const strategy = new Python({
        targetBranch: 'main',
        github,
        component: 'google-cloud-automl',
      });
      jest.spyOn(github, 'findFilesByFilenameAndRef').mockResolvedValue([]);
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('changelog.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(fixturesPath, 'changelog.json')
        );
      when(getFileContentsStub)
        .calledWith('setup.py', 'main')
        .mockResolvedValue(buildGitHubFileContent(fixturesPath, 'setup.py'));
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
});
