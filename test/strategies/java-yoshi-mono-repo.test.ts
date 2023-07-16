// Copyright 2023 Google LLC
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
import {JavaYoshiMonoRepo} from '../../src/strategies/java-yoshi-mono-repo';

import {
  buildGitHubFileContent,
  assertHasUpdate,
  assertNoHasUpdate,
} from '../helpers';
import {buildMockConventionalCommit} from '../helpers';
import {TagName} from '../../src/util/tag-name';
import {Version} from '../../src/version';
import {Changelog} from '../../src/updaters/changelog';
import {JavaUpdate} from '../../src/updaters/java/java-update';
import {VersionsManifest} from '../../src/updaters/java/versions-manifest';
import {CompositeUpdater} from '../../src/updaters/composite';
import {when} from 'jest-when';

import {FileNotFoundError} from '../../src/errors';

const fixturesPath = './test/fixtures/strategies/java-yoshi';

const COMMITS = [
  ...buildMockConventionalCommit(
    'fix(deps): update dependency com.google.cloud:google-cloud-storage to v1.120.0',
    ['foo/bar/pom.xml']
  ),
  ...buildMockConventionalCommit(
    'fix(deps): update dependency com.google.cloud:google-cloud-spanner to v1.50.0'
  ),
  ...buildMockConventionalCommit('chore: update common templates'),
];

const UUID_REGEX =
  /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g;
const ISO_DATE_REGEX =
  /[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]+Z/g; // 2023-01-05T16:42:33.446Z

describe('JavaYoshiMonoRepo', () => {
  let github: GitHub;
  beforeEach(async () => {
    github = await GitHub.create({
      owner: 'googleapis',
      repo: 'java-yoshi-test-repo',
      defaultBranch: 'main',
    });
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });
  describe('buildReleasePullRequest', () => {
    it('returns release PR changes with defaultInitialVersion', async () => {
      const expectedVersion = '0.1.0';
      const strategy = new JavaYoshiMonoRepo({
        targetBranch: 'main',
        github,
        component: 'google-cloud-automl',
      });
      jest.spyOn(github, 'findFilesByFilenameAndRef').mockResolvedValue([]);
      const getFileContentsStub = jest
        .spyOn(github, 'getFileContentsOnBranch')
        .mockRejectedValue(new FileNotFoundError(''));
      when(getFileContentsStub)
        .calledWith('versions.txt', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(fixturesPath, 'versions.txt')
        );
      const latestRelease = undefined;
      const release = await strategy.buildReleasePullRequest(
        COMMITS,
        latestRelease
      );
      expect(release!.version?.toString()).toEqual(expectedVersion);
    });
    it('returns release PR changes with semver patch bump', async () => {
      const expectedVersion = '0.123.5';
      const strategy = new JavaYoshiMonoRepo({
        targetBranch: 'main',
        github,
        component: 'google-cloud-automl',
      });
      jest.spyOn(github, 'findFilesByFilenameAndRef').mockResolvedValue([]);
      const getFileContentsStub = jest
        .spyOn(github, 'getFileContentsOnBranch')
        .mockRejectedValue(new FileNotFoundError(''));
      when(getFileContentsStub)
        .calledWith('versions.txt', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(fixturesPath, 'versions.txt')
        );
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
    it('returns a snapshot bump PR', async () => {
      const expectedVersion = '0.123.5-SNAPSHOT';
      const strategy = new JavaYoshiMonoRepo({
        targetBranch: 'main',
        github,
        component: 'google-cloud-automl',
      });
      jest.spyOn(github, 'findFilesByFilenameAndRef').mockResolvedValue([]);
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('versions.txt', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(fixturesPath, 'versions-released.txt')
        );
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
    it('handles promotion to 1.0.0', async () => {
      const commits = [
        ...buildMockConventionalCommit(
          'feat: promote to 1.0.0\n\nRelease-As: 1.0.0'
        ),
      ];
      const expectedVersion = '1.0.0';
      const strategy = new JavaYoshiMonoRepo({
        targetBranch: 'main',
        github,
        component: 'google-cloud-automl',
      });
      jest.spyOn(github, 'findFilesByFilenameAndRef').mockResolvedValue([]);
      const getFileContentsStub = jest
        .spyOn(github, 'getFileContentsOnBranch')
        .mockRejectedValue(new FileNotFoundError(''));
      when(getFileContentsStub)
        .calledWith('versions.txt', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'versions-with-beta-artifacts.txt'
          )
        );
      const latestRelease = {
        tag: new TagName(Version.parse('0.123.4'), 'google-cloud-automl'),
        sha: 'abc123',
        notes: 'some notes',
      };
      const releasePullRequest = await strategy.buildReleasePullRequest(
        commits,
        latestRelease
      );
      expect(releasePullRequest!.version?.toString()).toEqual(expectedVersion);
      const update = assertHasUpdate(
        releasePullRequest!.updates,
        'versions.txt',
        VersionsManifest
      );
      const versionsMap = (update.updater as VersionsManifest).versionsMap!;
      expect(versionsMap.get('grpc-google-cloud-trace-v1')?.toString()).toEqual(
        '1.0.0'
      );
      expect(
        versionsMap.get('grpc-google-cloud-trace-v1beta1')?.toString()
      ).toEqual('0.74.0');
    });
  });
  describe('buildUpdates', () => {
    it('builds common files', async () => {
      const strategy = new JavaYoshiMonoRepo({
        targetBranch: 'main',
        github,
        component: 'google-cloud-automl',
      });
      jest.spyOn(github, 'findFilesByFilenameAndRef').mockResolvedValue([]);
      const getFileContentsStub = jest
        .spyOn(github, 'getFileContentsOnBranch')
        .mockRejectedValue(new FileNotFoundError(''));
      when(getFileContentsStub)
        .calledWith('versions.txt', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(fixturesPath, 'versions.txt')
        );
      const latestRelease = undefined;
      const release = await strategy.buildReleasePullRequest(
        COMMITS,
        latestRelease
      );
      const updates = release!.updates;
      assertHasUpdate(updates, 'CHANGELOG.md', Changelog);
      assertHasUpdate(updates, 'versions.txt', VersionsManifest);
    });

    it('finds and updates standard files', async () => {
      const strategy = new JavaYoshiMonoRepo({
        targetBranch: 'main',
        github,
        component: 'google-cloud-automl',
      });
      const findFilesStub = jest
        .spyOn(github, 'findFilesByFilenameAndRef')
        .mockRejectedValue(new FileNotFoundError(''));
      when(findFilesStub)
        .calledWith('pom.xml', 'main', '.')
        .mockResolvedValue(['path1/pom.xml', 'path2/pom.xml']);
      when(findFilesStub)
        .calledWith('build.gradle', 'main', '.')
        .mockResolvedValue(['path1/build.gradle', 'path2/build.gradle']);
      when(findFilesStub)
        .calledWith('dependencies.properties', 'main', '.')
        .mockResolvedValue(['dependencies.properties']);
      when(findFilesStub)
        .calledWith('README.md', 'main', '.')
        .mockResolvedValue(['path1/README.md', 'path2/README.md']);
      const getFileContentsStub = jest
        .spyOn(github, 'getFileContentsOnBranch')
        .mockRejectedValue(new FileNotFoundError(''));
      when(getFileContentsStub)
        .calledWith('versions.txt', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(fixturesPath, 'versions.txt')
        );
      const latestRelease = undefined;
      const release = await strategy.buildReleasePullRequest(
        COMMITS,
        latestRelease
      );
      const updates = release!.updates;
      assertHasUpdate(updates, 'CHANGELOG.md', Changelog);
      const {updater} = assertHasUpdate(updates, 'path1/pom.xml', JavaUpdate);
      const javaUpdater = updater as JavaUpdate;
      expect(javaUpdater.isSnapshot).toBe(false);
      expect(
        javaUpdater.versionsMap?.get('google-cloud-trace')?.toString()
      ).toEqual('0.108.1-beta');
      assertHasUpdate(updates, 'path2/pom.xml', JavaUpdate);
      assertHasUpdate(updates, 'path1/build.gradle', JavaUpdate);
      assertHasUpdate(updates, 'path1/build.gradle', JavaUpdate);
      assertHasUpdate(updates, 'dependencies.properties', JavaUpdate);
      assertHasUpdate(updates, 'versions.txt', VersionsManifest);
      assertHasUpdate(updates, 'path1/README.md', JavaUpdate);
      assertHasUpdate(updates, 'path2/README.md', JavaUpdate);
    });

    it('finds and updates extra files', async () => {
      const strategy = new JavaYoshiMonoRepo({
        targetBranch: 'main',
        github,
        component: 'google-cloud-automl',
        extraFiles: ['foo/bar.java', 'src/version.java'],
      });
      jest.spyOn(github, 'findFilesByFilenameAndRef').mockResolvedValue([]);
      const getFileContentsStub = jest
        .spyOn(github, 'getFileContentsOnBranch')
        .mockRejectedValue(new FileNotFoundError(''));
      when(getFileContentsStub)
        .calledWith('versions.txt', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(fixturesPath, 'versions.txt')
        );
      const latestRelease = undefined;
      const release = await strategy.buildReleasePullRequest(
        COMMITS,
        latestRelease
      );
      const updates = release!.updates;
      assertHasUpdate(updates, 'CHANGELOG.md', Changelog);
      assertHasUpdate(updates, 'foo/bar.java', CompositeUpdater);
      assertHasUpdate(updates, 'src/version.java', CompositeUpdater);
      assertHasUpdate(updates, 'versions.txt', VersionsManifest);
    });

    it('updates all files for snapshots', async () => {
      const strategy = new JavaYoshiMonoRepo({
        targetBranch: 'main',
        github,
        component: 'google-cloud-automl',
      });
      const findFilesStub = jest
        .spyOn(github, 'findFilesByFilenameAndRef')
        .mockRejectedValue(new FileNotFoundError(''));

      when(findFilesStub)
        .calledWith('pom.xml', 'main', '.')
        .mockResolvedValue(['path1/pom.xml', 'path2/pom.xml']);
      when(findFilesStub)
        .calledWith('build.gradle', 'main', '.')
        .mockResolvedValue(['path1/build.gradle', 'path2/build.gradle']);
      when(findFilesStub)
        .calledWith('dependencies.properties', 'main', '.')
        .mockResolvedValue(['dependencies.properties']);
      when(findFilesStub)
        .calledWith('README.md', 'main', '.')
        .mockResolvedValue(['path1/README.md', 'path2/README.md']);
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('versions.txt', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(fixturesPath, 'versions-released.txt')
        );
      const latestRelease = undefined;
      const release = await strategy.buildReleasePullRequest(
        COMMITS,
        latestRelease
      );
      const updates = release!.updates;
      assertNoHasUpdate(updates, 'CHANGELOG.md');
      const {updater} = assertHasUpdate(updates, 'path1/pom.xml', JavaUpdate);
      const javaUpdater = updater as JavaUpdate;
      expect(javaUpdater.isSnapshot).toBe(true);
      expect(
        javaUpdater.versionsMap?.get('google-cloud-trace')?.toString()
      ).toEqual('0.108.1-beta-SNAPSHOT');
      assertHasUpdate(updates, 'path2/pom.xml', JavaUpdate);
      assertHasUpdate(updates, 'path1/build.gradle', JavaUpdate);
      assertHasUpdate(updates, 'path1/build.gradle', JavaUpdate);
      assertHasUpdate(updates, 'dependencies.properties', JavaUpdate);
      assertHasUpdate(updates, 'versions.txt', VersionsManifest);
      assertHasUpdate(updates, 'path1/README.md', JavaUpdate);
      assertHasUpdate(updates, 'path2/README.md', JavaUpdate);
    });

    it('updates changelog.json', async () => {
      const strategy = new JavaYoshiMonoRepo({
        targetBranch: 'main',
        github,
        component: 'google-cloud-automl',
      });
      jest.spyOn(github, 'findFilesByFilenameAndRef').mockResolvedValue([]);
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('versions.txt', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(fixturesPath, 'versions.txt')
        );
      when(getFileContentsStub)
        .calledWith('foo/.repo-metadata.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(fixturesPath, '.repo-metadata.json')
        );
      when(getFileContentsStub)
        .calledWith('changelog.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(fixturesPath, 'changelog.json')
        );
      const latestRelease = undefined;
      const release = await strategy.buildReleasePullRequest(
        COMMITS,
        latestRelease
      );
      const updates = release!.updates;
      assertHasUpdate(updates, 'CHANGELOG.md', Changelog);
      assertHasUpdate(updates, 'versions.txt', VersionsManifest);
      const update = assertHasUpdate(
        updates,
        'changelog.json',
        CompositeUpdater
      );
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

    it('omits non-breaking chores from changelog.json', async () => {
      const COMMITS = [
        ...buildMockConventionalCommit(
          'fix(deps): update dependency com.google.cloud:google-cloud-storage to v1.120.0',
          ['foo/bar/pom.xml']
        ),
        ...buildMockConventionalCommit('chore: update deps', [
          'foo/bar/pom.xml',
        ]),
        ...buildMockConventionalCommit('chore!: update a very important dep', [
          'foo/bar/pom.xml',
        ]),
        ...buildMockConventionalCommit(
          'fix(deps): update dependency com.google.cloud:google-cloud-spanner to v1.50.0'
        ),
        ...buildMockConventionalCommit('chore: update common templates'),
      ];
      const strategy = new JavaYoshiMonoRepo({
        targetBranch: 'main',
        github,
        component: 'google-cloud-automl',
      });
      jest.spyOn(github, 'findFilesByFilenameAndRef').mockResolvedValue([]);
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('versions.txt', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(fixturesPath, 'versions.txt')
        );
      when(getFileContentsStub)
        .calledWith('foo/.repo-metadata.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(fixturesPath, '.repo-metadata.json')
        );
      when(getFileContentsStub)
        .calledWith('changelog.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(fixturesPath, 'changelog.json')
        );
      const latestRelease = undefined;
      const release = await strategy.buildReleasePullRequest(
        COMMITS,
        latestRelease
      );
      const updates = release!.updates;
      assertHasUpdate(updates, 'CHANGELOG.md', Changelog);
      assertHasUpdate(updates, 'versions.txt', VersionsManifest);
      const update = assertHasUpdate(
        updates,
        'changelog.json',
        CompositeUpdater
      );
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

    it('does not update changelog.json if no .repo-metadata.json is found', async () => {
      const COMMITS = [
        ...buildMockConventionalCommit(
          'fix(deps): update dependency com.google.cloud:google-cloud-storage to v1.120.0',
          ['bar/bar/pom.xml']
        ),
        ...buildMockConventionalCommit(
          'fix(deps): update dependency com.google.cloud:google-cloud-spanner to v1.50.0'
        ),
        ...buildMockConventionalCommit('chore: update common templates'),
      ];
      const strategy = new JavaYoshiMonoRepo({
        targetBranch: 'main',
        github,
        component: 'google-cloud-automl',
      });
      jest.spyOn(github, 'findFilesByFilenameAndRef').mockResolvedValue([]);
      const getFileContentsStub = jest
        .spyOn(github, 'getFileContentsOnBranch')
        .mockRejectedValue(new FileNotFoundError(''));
      when(getFileContentsStub)
        .calledWith('versions.txt', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(fixturesPath, 'versions.txt')
        );
      when(getFileContentsStub)
        .calledWith('changelog.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(fixturesPath, 'changelog.json')
        );
      const latestRelease = undefined;
      const release = await strategy.buildReleasePullRequest(
        COMMITS,
        latestRelease
      );
      const updates = release!.updates;
      assertHasUpdate(updates, 'CHANGELOG.md', Changelog);
      assertHasUpdate(updates, 'versions.txt', VersionsManifest);
      const update = assertHasUpdate(
        updates,
        'changelog.json',
        CompositeUpdater
      );
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
