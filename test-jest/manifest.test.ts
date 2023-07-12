/* eslint-disable @typescript-eslint/no-unused-vars */
import 'jest-extended';
import createMockInstance from 'jest-create-mock-instance';
import {Manifest} from '../src/manifest';
import {GitHub, ReleaseOptions} from '../src/github';
import * as githubModule from '../src/github';
import {when} from 'jest-when';
import {
  buildGitHubFileContent,
  buildGitHubFileRaw,
  stubSuggesterWithSnapshot,
  assertHasUpdate,
  dateSafe,
  safeSnapshot,
  mockCommits,
  mockReleases,
  mockTags,
  assertNoHasUpdate,
  mockReleaseData,
} from './helpers';
import * as assert from 'assert';
import {Version} from '../src/version';
import {PullRequest} from '../src/pull-request';
import {readFileSync} from 'fs';
import {resolve} from 'path';
import * as pluginFactory from '../src/factories/plugin-factory';
import {SentenceCase} from '../src/plugins/sentence-case';
import {NodeWorkspace} from '../src/plugins/node-workspace';
import {CargoWorkspace} from '../src/plugins/cargo-workspace';
import {PullRequestTitle} from '../src/util/pull-request-title';
import {PullRequestBody} from '../src/util/pull-request-body';
import {RawContent} from '../src/updaters/raw-content';
import {TagName} from '../src/util/tag-name';
import {
  DuplicateReleaseError,
  FileNotFoundError,
  ConfigurationError,
  GitHubAPIError,
} from '../src/errors';
import {RequestError} from '@octokit/request-error';
import nock from 'nock';
import {LinkedVersions} from '../src/plugins/linked-versions';
import {MavenWorkspace} from '../src/plugins/maven-workspace';

nock.disableNetConnect();
const fixturesPath = './test/fixtures';

function mockPullRequests(
  github: GitHub,
  openPullRequests: PullRequest[],
  mergedPullRequests: PullRequest[] = [],
  closedPullRequests: PullRequest[] = []
) {
  async function* fakeGenerator() {
    for (const pullRequest of openPullRequests) {
      yield pullRequest;
    }
  }
  async function* mergedGenerator() {
    for (const pullRequest of mergedPullRequests) {
      yield pullRequest;
    }
  }
  async function* closedGenerator() {
    for (const pullRequest of closedPullRequests) {
      yield pullRequest;
    }
  }

  const argAtIndex = (index: number, matcher: string) =>
    when.allArgs((args, equals) => equals(args[index], matcher));
  const stub = jest.spyOn(github, 'pullRequestIterator');
  return when(stub)
    .calledWith(argAtIndex(1, 'OPEN'))
    .mockReturnValue(fakeGenerator())
    .calledWith(argAtIndex(1, 'MERGED'))
    .mockReturnValue(mergedGenerator())
    .calledWith(argAtIndex(1, 'CLOSED'))
    .mockReturnValue(closedGenerator());
}

function mockCreateRelease(
  github: GitHub,
  releases: {
    id: number;
    sha: string;
    tagName: string;
    draft?: boolean;
    prerelease?: boolean;
    duplicate?: boolean;
  }[]
) {
  const releaseStub = jest.spyOn(github, 'createRelease');
  releaseStub.mockImplementation((release, options) => {
    const result = releases.find(r => r.tagName === release.tag.toString());
    if (!result) throw 'release not found';
    if (result.duplicate) {
      return Promise.reject(
        new DuplicateReleaseError(
          new RequestError('dup', 400, {
            response: {
              headers: {},
              status: 400,
              url: '',
              data: '',
            },
            request: {
              headers: {},
              method: 'POST',
              url: '',
            },
          }),
          result.tagName
        )
      );
    }
    return Promise.resolve({
      ...result,
      url: 'https://path/to/release',
      notes: 'some release notes',
    });
  });

  // for (const {id, sha, tagName, draft, duplicate} of releases) {
  // const stub = releaseStub.mockResolvedValue({
  //   id,
  //   tagName,
  //   sha,
  //   url: 'https://path/to/release',
  //   notes: 'some release notes',
  //   draft,
  // });

  // const tagCheck = when(arg => arg.tag.toString() === tagName);
  // if (duplicate) {
  //   const stub = when(releaseStub)
  //     .calledWith(expect.objectContaining({tag: expect.anything()}))
  //     .mockRejectedValue(
  //       new DuplicateReleaseError(
  //         new RequestError('dup', 400, {
  //           response: {
  //             headers: {},
  //             status: 400,
  //             url: '',
  //             data: '',
  //           },
  //           request: {
  //             headers: {},
  //             method: 'POST',
  //             url: '',
  //           },
  //         }),
  //         tagName
  //       )
  //     );
  // } else {
  //   const stub = when(releaseStub)
  //     .calledWith(expect.objectContaining({tag: expect.anything()}))
  //     .mockResolvedValue({
  //       id,
  //       tagName,
  //       sha,
  //       url: 'https://path/to/release',
  //       notes: 'some release notes',
  //       draft,
  //     });
  // }
  //}
  return releaseStub;
}

function pullRequestBody(path: string): string {
  return readFileSync(resolve(fixturesPath, path), 'utf8').replace(
    /\r\n/g,
    '\n'
  );
}

describe('Manifest', () => {
  let github: GitHub;
  beforeEach(async () => {
    github = await GitHub.create({
      owner: 'fake-owner',
      repo: 'fake-repo',
      defaultBranch: 'main',
      token: 'fake-token',
    });
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // sandbox.stub -> jest.spyOn
  // withArgs -> calledWith
  // resolves -> mockResolvedValue
  describe('fromManifest', () => {
    it('should parse config and manifest from repository', async () => {
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('release-please-config.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(fixturesPath, 'manifest/config/config.json')
        )
        .calledWith('.release-please-manifest.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch
      );
      expect(Object.keys(manifest.repositoryConfig)).toHaveLength(8);
      expect(Object.keys(manifest.releasedVersions)).toHaveLength(8);
    });
    it('should limit manifest loading to the given path', async () => {
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('release-please-config.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(fixturesPath, 'manifest/config/config.json')
        )
        .calledWith('.release-please-manifest.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch,
        undefined,
        undefined,
        undefined,
        'packages/gcf-utils'
      );
      expect(Object.keys(manifest.repositoryConfig)).toHaveLength(1);
      expect(
        manifest.repositoryConfig['packages/gcf-utils'].releaseType
      ).toEqual('node');
      expect(Object.keys(manifest.releasedVersions)).toHaveLength(8);
    });
    it('should override release-as with the given argument', async () => {
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('release-please-config.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(fixturesPath, 'manifest/config/config.json')
        )
        .calledWith('.release-please-manifest.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch,
        undefined,
        undefined,
        undefined,
        'packages/gcf-utils',
        '12.34.56'
      );
      expect(Object.keys(manifest.repositoryConfig)).toHaveLength(1);
      expect(manifest.repositoryConfig['packages/gcf-utils'].releaseAs).toEqual(
        '12.34.56'
      );
      expect(Object.keys(manifest.releasedVersions)).toHaveLength(8);
    });
    it('should read the default release-type from manifest', async () => {
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('release-please-config.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/config/root-release-type.json'
          )
        )
        .calledWith('.release-please-manifest.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch
      );
      expect(manifest.repositoryConfig['.'].releaseType).toEqual('java-yoshi');
      expect(manifest.repositoryConfig['node-package'].releaseType).toEqual(
        'node'
      );
    });
    it('should read custom pull request title patterns from manifest', async () => {
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('release-please-config.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/config/group-pr-title-pattern.json'
          )
        )
        .calledWith('.release-please-manifest.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch
      );
      expect(manifest['groupPullRequestTitlePattern']).toEqual(
        'chore${scope}: release${component} v${version}'
      );
      expect(
        manifest.repositoryConfig['packages/cron-utils'].pullRequestTitlePattern
      ).toEqual('chore${scope}: send it v${version}');
    });

    it('should read custom tag separator from manifest', async () => {
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('release-please-config.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/config/tag-separator.json'
          )
        )
        .calledWith('.release-please-manifest.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch
      );
      expect(manifest.repositoryConfig['.'].tagSeparator).toEqual('-');
      expect(
        manifest.repositoryConfig['packages/bot-config-utils'].tagSeparator
      ).toEqual('/');
    });

    it('should read extra files from manifest', async () => {
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('release-please-config.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/config/extra-files.json'
          )
        )
        .calledWith('.release-please-manifest.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch
      );
      expect(manifest.repositoryConfig['.'].extraFiles).toEqual([
        'default.txt',
        {
          type: 'json',
          path: 'path/default.json',
          jsonpath: '$.version',
        },
      ]);
      expect(
        manifest.repositoryConfig['packages/bot-config-utils'].extraFiles
      ).toEqual([
        'foo.txt',
        {
          type: 'json',
          path: 'path/bar.json',
          jsonpath: '$.version',
        },
      ]);
    });

    it('should read custom include component in tag from manifest', async () => {
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('release-please-config.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/config/include-component-in-tag.json'
          )
        )
        .calledWith('.release-please-manifest.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch
      );
      expect(manifest.repositoryConfig['.'].includeComponentInTag).toBe(false);
      expect(
        manifest.repositoryConfig['packages/bot-config-utils']
          .includeComponentInTag
      ).toBe(true);
    });

    it('should read custom include v in tag from manifest', async () => {
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('release-please-config.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/config/include-v-in-tag.json'
          )
        )
        .calledWith('.release-please-manifest.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch
      );
      expect(manifest.repositoryConfig['.'].includeVInTag).toBe(false);
      expect(
        manifest.repositoryConfig['packages/bot-config-utils'].includeVInTag
      ).toBe(true);
    });

    it('should read custom labels from manifest', async () => {
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('release-please-config.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(fixturesPath, 'manifest/config/labels.json')
        )
        .calledWith('.release-please-manifest.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch
      );
      expect(manifest['labels']).toEqual(['custom: pending']);
      expect(manifest['releaseLabels']).toEqual(['custom: tagged']);
    });
    it('should read extra labels from manifest', async () => {
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('release-please-config.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/config/extra-labels.json'
          )
        )
        .calledWith('.release-please-manifest.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch
      );
      expect(manifest.repositoryConfig['.'].extraLabels).toEqual([
        'lang: java',
      ]);
      expect(manifest.repositoryConfig['node-lib'].extraLabels).toEqual([
        'lang: nodejs',
      ]);
    });
    it('should read exclude paths from manifest', async () => {
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('release-please-config.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/config/exclude-paths.json'
          )
        )
        .calledWith('.release-please-manifest.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch
      );
      expect(manifest.repositoryConfig['.'].excludePaths).toEqual([
        'path-root-ignore',
      ]);
      expect(manifest.repositoryConfig['node-lib'].excludePaths).toEqual([
        'path-ignore',
      ]);
    });
    it('should build simple plugins from manifest', async () => {
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('release-please-config.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(fixturesPath, 'manifest/config/plugins.json')
        )
        .calledWith('.release-please-manifest.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch
      );
      expect(manifest.plugins).toHaveLength(2);
      expect(manifest.plugins[0]).toBeInstanceOf(NodeWorkspace);
      expect(manifest.plugins[1]).toBeInstanceOf(CargoWorkspace);
    });
    it('should build complex plugins from manifest', async () => {
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('release-please-config.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/config/complex-plugins.json'
          )
        )
        .calledWith('.release-please-manifest.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch
      );
      expect(manifest.plugins).toHaveLength(1);
      expect(manifest.plugins[0]).toBeInstanceOf(LinkedVersions);
      const plugin = manifest.plugins[0] as LinkedVersions;
      expect(plugin.groupName).toEqual('grouped components');
      expect(plugin.components).toEqual(new Set(['pkg2', 'pkg3']));
    });
    it('should build maven-workspace from manifest', async () => {
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('release-please-config.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/config/maven-workspace-plugins.json'
          )
        )
        .calledWith('.release-please-manifest.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch
      );
      expect(manifest.plugins).toHaveLength(1);
      expect(manifest.plugins[0]).toBeInstanceOf(MavenWorkspace);
      const plugin = manifest.plugins[0] as MavenWorkspace;
      expect(plugin.considerAllArtifacts).toBe(true);
    });
    it('should configure search depth from manifest', async () => {
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('release-please-config.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/config/search-depth.json'
          )
        )
        .calledWith('.release-please-manifest.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch
      );
      expect(manifest.releaseSearchDepth).toEqual(10);
      expect(manifest.commitSearchDepth).toEqual(50);
    });

    it('should read changelog host from manifest', async () => {
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('release-please-config.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/config/changelog-host.json'
          )
        )
        .calledWith('.release-please-manifest.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch
      );
      expect(manifest.repositoryConfig['.'].changelogHost).toEqual(
        'https://example.com'
      );
      expect(
        manifest.repositoryConfig['packages/bot-config-utils'].changelogHost
      ).toEqual('https://override.example.com');
    });

    it('should read changelog type from manifest', async () => {
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('release-please-config.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/config/changelog-type.json'
          )
        )
        .calledWith('.release-please-manifest.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch
      );
      expect(manifest.repositoryConfig['.'].changelogType).toEqual('github');
      expect(
        manifest.repositoryConfig['packages/bot-config-utils'].changelogType
      ).toEqual('default');
    });

    it('should read changelog path from manifest', async () => {
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('release-please-config.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/config/changelog-path.json'
          )
        )
        .calledWith('.release-please-manifest.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch
      );
      expect(manifest.repositoryConfig['.'].changelogPath).toEqual(
        'docs/foo.md'
      );
      expect(
        manifest.repositoryConfig['packages/bot-config-utils'].changelogPath
      ).toEqual('docs/bar.md');
    });

    it('should read versioning type from manifest', async () => {
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('release-please-config.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/config/versioning.json'
          )
        )
        .calledWith('.release-please-manifest.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch
      );
      expect(manifest.repositoryConfig['.'].versioning).toEqual(
        'always-bump-patch'
      );
      expect(
        manifest.repositoryConfig['packages/bot-config-utils'].versioning
      ).toEqual('default');
    });

    it('should throw a configuration error for a missing manifest config', async () => {
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('release-please-config.json', 'main')
        .mockRejectedValue(new FileNotFoundError('.release-please-config.json'))
        .calledWith('.release-please-manifest.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      await assert.rejects(async () => {
        await Manifest.fromManifest(github, github.repository.defaultBranch);
      }, ConfigurationError);
    });

    it('should throw a configuration error for a missing manifest versions file', async () => {
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('release-please-config.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(fixturesPath, 'manifest/config/config.json')
        )
        .calledWith('.release-please-manifest.json', 'main')
        .mockRejectedValue(
          new FileNotFoundError('.release-please-manifest.json')
        );
      await assert.rejects(async () => {
        await Manifest.fromManifest(github, github.repository.defaultBranch);
      }, ConfigurationError);
    });

    it('should throw a configuration error for a malformed manifest config', async () => {
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('release-please-config.json', 'main')
        .mockResolvedValue(buildGitHubFileRaw('{"malformed json"'))
        .calledWith('.release-please-manifest.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      await assert.rejects(
        async () => {
          await Manifest.fromManifest(github, github.repository.defaultBranch);
        },
        e => {
          console.log(e);
          return e instanceof ConfigurationError && e.message.includes('parse');
        }
      );
    });

    it('should throw a configuration error for a malformed manifest config', async () => {
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('release-please-config.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(fixturesPath, 'manifest/config/config.json')
        )
        .calledWith('.release-please-manifest.json', 'main')
        .mockResolvedValue(buildGitHubFileRaw('{"malformed json"'));
      await assert.rejects(
        async () => {
          await Manifest.fromManifest(github, github.repository.defaultBranch);
        },
        e => {
          console.log(e);
          return e instanceof ConfigurationError && e.message.includes('parse');
        }
      );
    });
  });

  describe('fromConfig', () => {
    it('should pass strategy options to the strategy', async () => {
      mockCommits(github, [
        {
          sha: 'abc123',
          message: 'some commit message',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 1.2.3',
            body: '',
            labels: [],
            files: [],
          },
        },
      ]);
      mockReleases(github, [
        {
          id: 123456,
          tagName: 'v1.2.3',
          sha: 'abc123',
          url: 'http://path/to/release',
        },
      ]);

      const manifest = await Manifest.fromConfig(github, 'target-branch', {
        releaseType: 'simple',
        bumpMinorPreMajor: true,
        bumpPatchForMinorPreMajor: true,
      });
      expect(Object.keys(manifest.repositoryConfig)).toHaveLength(1);
      expect(Object.keys(manifest.releasedVersions)).toHaveLength(1);
    });
    it('should find custom release pull request title', async () => {
      mockCommits(github, [
        {
          sha: 'abc123',
          message: 'some commit message',
          files: [],
          pullRequest: {
            headBranchName:
              'release-please--branches--main--components--foobar',
            baseBranchName: 'main',
            title: 'release: 1.2.3',
            number: 123,
            body: '',
            labels: [],
            files: [],
          },
        },
      ]);
      mockReleases(github, [
        {
          id: 123456,
          tagName: 'v1.2.3',
          sha: 'abc123',
          url: 'http://path/to/release',
        },
      ]);

      const manifest = await Manifest.fromConfig(github, 'target-branch', {
        releaseType: 'simple',
        bumpMinorPreMajor: true,
        bumpPatchForMinorPreMajor: true,
        pullRequestTitlePattern: 'release: ${version}',
        component: 'foobar',
        includeComponentInTag: false,
      });
      expect(Object.keys(manifest.repositoryConfig)).toHaveLength(1);
      expect(Object.keys(manifest.releasedVersions)).toHaveLength(1);
    });
    it('finds previous release without tag', async () => {
      mockCommits(github, [
        {
          sha: 'abc123',
          message: 'some commit message',
          files: [],
          pullRequest: {
            title: 'chore: release 1.2.3',
            headBranchName:
              'release-please--branches--main--components--foobar',
            baseBranchName: 'main',
            number: 123,
            body: '',
            labels: [],
            files: [],
          },
        },
      ]);
      mockReleases(github, [
        {
          id: 123456,
          tagName: 'v1.2.3',
          sha: 'abc123',
          url: 'http://path/to/release',
        },
      ]);

      const manifest = await Manifest.fromConfig(github, 'target-branch', {
        releaseType: 'simple',
        bumpMinorPreMajor: true,
        bumpPatchForMinorPreMajor: true,
        component: 'foobar',
        includeComponentInTag: false,
      });
      expect(Object.keys(manifest.repositoryConfig)).toHaveLength(1);
      expect(Object.keys(manifest.releasedVersions)).toHaveLength(1);
    });
    it('finds previous release with tag', async () => {
      mockCommits(github, [
        {
          sha: 'abc123',
          message: 'some commit message',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/foobar',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release foobar 1.2.3',
            body: '',
            labels: [],
            files: [],
          },
        },
      ]);
      mockReleases(github, [
        {
          id: 123456,
          tagName: 'foobar-v1.2.3',
          sha: 'abc123',
          url: 'http://path/to/release',
        },
      ]);

      const manifest = await Manifest.fromConfig(github, 'target-branch', {
        releaseType: 'simple',
        bumpMinorPreMajor: true,
        bumpPatchForMinorPreMajor: true,
        component: 'foobar',
        includeComponentInTag: true,
      });
      expect(Object.keys(manifest.repositoryConfig)).toHaveLength(1);
      expect(Object.keys(manifest.releasedVersions)).toHaveLength(1);
    });
    it('finds manually tagged release', async () => {
      mockCommits(github, [
        {
          sha: 'abc123',
          message: 'some commit message',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/foobar',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release foobar 1.2.3',
            body: '',
            labels: [],
            files: [],
          },
        },
      ]);
      mockReleases(github, [
        {
          id: 123456,
          tagName: 'other-v3.3.3',
          sha: 'abc123',
          url: 'http://path/to/release',
        },
      ]);

      const manifest = await Manifest.fromConfig(github, 'target-branch', {
        releaseType: 'simple',
        bumpMinorPreMajor: true,
        bumpPatchForMinorPreMajor: true,
        component: 'other',
        includeComponentInTag: true,
      });
      expect(Object.keys(manifest.repositoryConfig)).toHaveLength(1);
      // 'found release versions'
      expect(Object.keys(manifest.releasedVersions)).toHaveLength(1);
      expect(Object.values(manifest.releasedVersions)[0].toString()).toEqual(
        '3.3.3'
      );
    });
    it('finds legacy tags', async () => {
      mockCommits(github, [
        {
          sha: 'abc123',
          message: 'some commit message',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/foobar',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release foobar 1.2.3',
            body: '',
            labels: [],
            files: [],
          },
        },
      ]);
      mockReleases(github, []);
      mockTags(github, [
        {
          name: 'other-v3.3.3',
          sha: 'abc123',
        },
      ]);

      const manifest = await Manifest.fromConfig(github, 'target-branch', {
        releaseType: 'simple',
        bumpMinorPreMajor: true,
        bumpPatchForMinorPreMajor: true,
        component: 'other',
        includeComponentInTag: true,
      });
      expect(Object.keys(manifest.repositoryConfig)).toHaveLength(1);
      // 'found release versions'
      expect(Object.keys(manifest.releasedVersions)).toHaveLength(1);
      expect(Object.values(manifest.releasedVersions)[0].toString()).toEqual(
        '3.3.3'
      );
    });
    it('ignores manually tagged release if commit not found', async () => {
      mockCommits(github, [
        {
          sha: 'abc123',
          message: 'some commit message',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/foobar',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release foobar 1.2.3',
            body: '',
            labels: [],
            files: [],
          },
        },
      ]);
      mockReleases(github, [
        {
          id: 123456,
          tagName: 'other-v3.3.3',
          sha: 'def234',
          url: 'http://path/to/release',
        },
      ]);
      mockTags(github, []);

      const manifest = await Manifest.fromConfig(github, 'target-branch', {
        releaseType: 'simple',
        bumpMinorPreMajor: true,
        bumpPatchForMinorPreMajor: true,
        component: 'other',
        includeComponentInTag: true,
      });
      expect(Object.keys(manifest.repositoryConfig)).toHaveLength(1);
      expect(Object.keys(manifest.releasedVersions)).toHaveLength(0);
    });
    it('finds largest manually tagged release', async () => {
      mockCommits(github, [
        {
          sha: 'abc123',
          message: 'some commit message',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/foobar',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release foobar 1.2.3',
            body: '',
            labels: [],
            files: [],
          },
        },
        {
          sha: 'def234',
          message: 'some commit message',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/foobar',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release foobar 1.2.3',
            body: '',
            labels: [],
            files: [],
          },
        },
      ]);
      mockReleases(github, [
        {
          id: 123456,
          tagName: 'other-v3.3.3',
          sha: 'abc123',
          url: 'http://path/to/release',
        },
        {
          id: 654321,
          tagName: 'other-v3.3.2',
          sha: 'def234',
          url: 'http://path/to/release',
        },
      ]);

      const manifest = await Manifest.fromConfig(github, 'target-branch', {
        releaseType: 'simple',
        bumpMinorPreMajor: true,
        bumpPatchForMinorPreMajor: true,
        component: 'other',
        includeComponentInTag: true,
      });
      expect(Object.keys(manifest.repositoryConfig)).toHaveLength(1);
      // 'found release versions'
      expect(Object.keys(manifest.releasedVersions)).toHaveLength(1);
      expect(Object.values(manifest.releasedVersions)[0].toString()).toEqual(
        '3.3.3'
      );
    });
    it('finds largest found tagged', async () => {
      mockCommits(github, [
        {
          sha: 'abc123',
          message: 'some commit message',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/foobar',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release foobar 1.2.3',
            body: '',
            labels: [],
            files: [],
          },
        },
        {
          sha: 'def234',
          message: 'some commit message',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/foobar',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release foobar 1.2.3',
            body: '',
            labels: [],
            files: [],
          },
        },
      ]);
      mockReleases(github, []);
      mockTags(github, [
        {
          name: 'other-v3.3.3',
          sha: 'abc123',
        },
        {
          name: 'other-v3.3.2',
          sha: 'def234',
        },
      ]);

      const manifest = await Manifest.fromConfig(github, 'target-branch', {
        releaseType: 'simple',
        bumpMinorPreMajor: true,
        bumpPatchForMinorPreMajor: true,
        component: 'other',
        includeComponentInTag: true,
      });
      expect(Object.keys(manifest.repositoryConfig)).toHaveLength(1);
      // 'found release versions'
      expect(Object.keys(manifest.releasedVersions)).toHaveLength(1);
      expect(Object.values(manifest.releasedVersions)[0].toString()).toEqual(
        '3.3.3'
      );
    });
    it('finds manually tagged release commit over earlier automated commit', async () => {
      mockCommits(github, [
        {
          sha: 'abc123',
          message: 'some commit message',
          files: [],
        },
        {
          sha: 'def234',
          message: 'this commit should be found',
          files: [],
        },
        {
          sha: 'ghi345',
          message: 'some commit message',
          files: [],
          pullRequest: {
            title: 'chore: release 3.3.1',
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 123,
            body: '',
            labels: [],
            files: [],
          },
        },
      ]);
      mockReleases(github, [
        {
          id: 123456,
          tagName: 'v3.3.2',
          sha: 'def234',
          url: 'http://path/to/release',
        },
        {
          id: 654321,
          tagName: 'v3.3.1',
          sha: 'ghi345',
          url: 'http://path/to/release',
        },
      ]);
      mockTags(github, []);

      const manifest = await Manifest.fromConfig(github, 'target-branch', {
        releaseType: 'simple',
        bumpMinorPreMajor: true,
        bumpPatchForMinorPreMajor: true,
      });
      expect(Object.keys(manifest.repositoryConfig)).toHaveLength(1);
      // 'found release versions'
      expect(Object.keys(manifest.releasedVersions)).toHaveLength(1);
      expect(Object.values(manifest.releasedVersions)[0].toString()).toEqual(
        '3.3.2'
      );
    });
    it('allows configuring includeVInTag', async () => {
      mockCommits(github, [
        {
          sha: 'abc123',
          message: 'some commit message',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 1.2.3',
            body: '',
            labels: [],
            files: [],
          },
        },
      ]);
      mockReleases(github, [
        {
          id: 123456,
          tagName: 'v1.2.3',
          sha: 'abc123',
          url: 'http://path/to/release',
        },
      ]);

      const manifest = await Manifest.fromConfig(github, 'target-branch', {
        releaseType: 'simple',
        includeVInTag: false,
      });
      expect(Object.keys(manifest.repositoryConfig)).toHaveLength(1);
      expect(Object.keys(manifest.releasedVersions)).toHaveLength(1);
      expect(manifest.repositoryConfig['.'].includeVInTag).toBe(false);
    });

    it('finds latest published release', async () => {
      mockReleases(github, []);
      mockCommits(github, [
        {
          sha: 'abc123',
          message: 'some commit message',
          files: [],
          pullRequest: {
            title: 'chore: release 1.2.4-SNAPSHOT',
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 123,
            body: '',
            labels: [],
            files: [],
          },
        },
        {
          sha: 'abc123',
          message: 'some commit message',
          files: [],
          pullRequest: {
            title: 'chore: release 1.2.3',
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 123,
            body: '',
            labels: [],
            files: [],
          },
        },
      ]);

      const manifest = await Manifest.fromConfig(github, 'target-branch', {
        releaseType: 'java',
        includeComponentInTag: false,
      });
      expect(Object.keys(manifest.releasedVersions)).toHaveLength(1);
      expect(manifest.releasedVersions['.'].toString()).toBe('1.2.3');
    });
    it('falls back to release without component in tag', async () => {
      mockCommits(github, [
        {
          sha: 'abc123',
          message: 'some commit message',
          files: [],
        },
        {
          sha: 'def234',
          message: 'this commit should be found',
          files: [],
        },
        {
          sha: 'ghi345',
          message: 'some commit message',
          files: [],
          pullRequest: {
            title: 'chore: release 3.3.1',
            // fails to match legacy branch name without component
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 123,
            body: '',
            labels: [],
            files: [],
          },
        },
      ]);
      mockReleases(github, [
        {
          id: 123456,
          tagName: 'v3.3.1',
          sha: 'ghi345',
          url: 'http://path/to/release',
        },
      ]);
      mockTags(github, []);

      const manifest = await Manifest.fromConfig(github, 'target-branch', {
        releaseType: 'simple',
        bumpMinorPreMajor: true,
        bumpPatchForMinorPreMajor: true,
        component: 'foobar',
        includeComponentInTag: false,
      });
      expect(Object.keys(manifest.repositoryConfig)).toHaveLength(1);
      // 'found release versions'
      expect(Object.keys(manifest.releasedVersions)).toHaveLength(1);
      expect(Object.values(manifest.releasedVersions)[0].toString()).toEqual(
        '3.3.1'
      );
    });

    it('should fail if graphQL commits API is too slow', async () => {
      // In this scenario, graphQL fails with a 502 when pulling the list of
      // recent commits. We are unable to determine the latest release and thus
      // we should abort with the underlying API error.

      const scope = nock('https://api.github.com/')
        .post('/graphql')
        .times(6) // original + 5 retries
        .reply(502);
      const sleepStub = jest
        .spyOn(githubModule, 'sleepInMs')
        .mockResolvedValue(0);

      await assert.rejects(
        async () => {
          await Manifest.fromConfig(github, 'target-branch', {
            releaseType: 'simple',
            bumpMinorPreMajor: true,
            bumpPatchForMinorPreMajor: true,
            component: 'foobar',
            includeComponentInTag: false,
          });
        },
        error => {
          return (
            error instanceof GitHubAPIError &&
            (error as GitHubAPIError).status === 502
          );
        }
      );
      scope.done();
      expect(sleepStub).toHaveBeenCalledTimes(5);
    });
  });

  describe('buildPullRequests', () => {
    describe('with basic config', () => {
      beforeEach(() => {
        mockReleases(github, [
          {
            id: 123456,
            sha: 'abc123',
            tagName: 'v1.0.0',
            url: 'https://github.com/fake-owner/fake-repo/releases/tag/v1.0.0',
          },
        ]);
        mockCommits(github, [
          {
            sha: 'def456',
            message: 'fix: some bugfix',
            files: [],
          },
          {
            sha: 'abc123',
            message: 'chore: release 1.0.0',
            files: [],
            pullRequest: {
              headBranchName: 'release-please/branches/main',
              baseBranchName: 'main',
              number: 123,
              title: 'chore: release 1.0.0',
              body: '',
              labels: [],
              files: [],
              sha: 'abc123',
            },
          },
        ]);
      });

      it('should handle single package repository', async () => {
        const manifest = new Manifest(
          github,
          'main',
          {
            '.': {
              releaseType: 'simple',
            },
          },
          {
            '.': Version.parse('1.0.0'),
          }
        );
        const pullRequests = await manifest.buildPullRequests();
        expect(pullRequests).toHaveLength(1);
        const pullRequest = pullRequests[0];
        expect(pullRequest.version?.toString()).toEqual('1.0.1');
        // simple release type updates the changelog and version.txt
        assertHasUpdate(pullRequest.updates, 'CHANGELOG.md');
        assertHasUpdate(pullRequest.updates, 'version.txt');
        assertHasUpdate(pullRequest.updates, '.release-please-manifest.json');
        expect(pullRequest.headRefName).toEqual(
          'release-please--branches--main'
        );
      });

      it('should honour the manifestFile argument in Manifest.fromManifest', async () => {
        mockTags(github, []);
        const getFileContentsStub = jest.spyOn(
          github,
          'getFileContentsOnBranch'
        );
        when(getFileContentsStub)
          .calledWith('release-please-config.json', 'main')
          .mockResolvedValue(
            buildGitHubFileContent(fixturesPath, 'manifest/config/simple.json')
          )
          .calledWith('non/default/path/manifest.json', 'main')
          .mockResolvedValue(
            buildGitHubFileContent(
              fixturesPath,
              'manifest/versions/simple.json'
            )
          );
        const manifest = await Manifest.fromManifest(
          github,
          'main',
          undefined,
          'non/default/path/manifest.json'
        );
        const pullRequests = await manifest.buildPullRequests();
        expect(pullRequests).toHaveLength(1);
        const pullRequest = pullRequests[0];
        assertHasUpdate(pullRequest.updates, 'non/default/path/manifest.json');
      });

      it('should create a draft pull request', async () => {
        const manifest = new Manifest(
          github,
          'main',
          {
            '.': {
              releaseType: 'simple',
              draftPullRequest: true,
            },
          },
          {
            '.': Version.parse('1.0.0'),
          }
        );
        const pullRequests = await manifest.buildPullRequests();
        expect(pullRequests).toHaveLength(1);
        const pullRequest = pullRequests[0];
        expect(pullRequest.draft).toBe(true);
      });

      it('should create a draft pull request manifest wide', async () => {
        const manifest = new Manifest(
          github,
          'main',
          {
            '.': {
              releaseType: 'simple',
            },
          },
          {
            '.': Version.parse('1.0.0'),
          },
          {
            draftPullRequest: true,
          }
        );
        const pullRequests = await manifest.buildPullRequests();
        expect(pullRequests).toHaveLength(1);
        const pullRequest = pullRequests[0];
        expect(pullRequest.draft).toBe(true);
      });

      it('allows customizing pull request labels', async () => {
        const manifest = new Manifest(
          github,
          'main',
          {
            '.': {
              releaseType: 'simple',
            },
          },
          {
            '.': Version.parse('1.0.0'),
          },
          {
            labels: ['some-special-label'],
          }
        );
        const pullRequests = await manifest.buildPullRequests();
        expect(pullRequests).toHaveLength(1);
        const pullRequest = pullRequests[0];
        expect(pullRequest.labels).toEqual(['some-special-label']);
      });

      it('allows customizing pull request title', async () => {
        const manifest = new Manifest(
          github,
          'main',
          {
            '.': {
              releaseType: 'simple',
              pullRequestTitlePattern: 'release: ${version}',
            },
          },
          {
            '.': Version.parse('1.0.0'),
          }
        );
        const pullRequests = await manifest.buildPullRequests();
        expect(pullRequests).toHaveLength(1);
        const pullRequest = pullRequests[0];
        expect(pullRequest.title.toString()).toEqual('release: 1.0.1');
      });

      it('allows customizing pull request header', async () => {
        const manifest = new Manifest(
          github,
          'main',
          {
            '.': {
              releaseType: 'simple',
              pullRequestHeader: 'No beep boop for you',
            },
          },
          {
            '.': Version.parse('1.0.0'),
          }
        );
        const pullRequests = await manifest.buildPullRequests();
        expect(pullRequests).toHaveLength(1);
        const pullRequest = pullRequests[0];
        expect(pullRequest.body.header.toString()).toEqual(
          'No beep boop for you'
        );
      });
    });

    it('should find the component from config', async () => {
      mockReleases(github, [
        {
          id: 123456,
          sha: 'abc123',
          tagName: 'pkg1-v1.0.0',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg1-v1.0.0',
        },
      ]);
      mockCommits(github, [
        {
          sha: 'def456',
          message: 'fix: some bugfix',
          files: [],
        },
        {
          sha: 'abc123',
          message: 'chore: release 1.0.0',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/pkg1',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 1.0.0',
            body: '',
            labels: [],
            files: [],
            sha: 'abc123',
          },
        },
      ]);
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/repo/node/pkg1/package.json'
          )
        );
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
          },
        },
        {
          '.': Version.parse('1.0.0'),
        }
      );
      const pullRequests = await manifest.buildPullRequests();
      expect(pullRequests).toHaveLength(1);
      const pullRequest = pullRequests[0];
      expect(pullRequest.version?.toString()).toEqual('1.0.1');
      expect(pullRequest.headRefName).toEqual(
        'release-please--branches--main--components--pkg1'
      );
    });

    it('should handle multiple package repository', async () => {
      mockReleases(github, [
        {
          id: 123456,
          sha: 'abc123',
          tagName: 'pkg1-v1.0.0',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg1-v1.0.0',
        },
        {
          id: 654321,
          sha: 'def234',
          tagName: 'pkg2-v0.2.3',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg2-v0.2.3',
        },
      ]);
      mockCommits(github, [
        {
          sha: 'aaaaaa',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'abc123',
          message: 'chore: release main',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release main',
            body: '',
            labels: [],
            files: [],
            sha: 'abc123',
          },
        },
        {
          sha: 'bbbbbb',
          message: 'fix: some bugfix',
          files: ['path/b/foo'],
        },
        {
          sha: 'cccccc',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'def234',
          message: 'chore: release main',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release main',
            body: '',
            labels: [],
            files: [],
            sha: 'def234',
          },
        },
      ]);
      const manifest = new Manifest(
        github,
        'main',
        {
          'path/a': {
            releaseType: 'simple',
            component: 'pkg1',
          },
          'path/b': {
            releaseType: 'simple',
            component: 'pkg2',
          },
        },
        {
          'path/a': Version.parse('1.0.0'),
          'path/b': Version.parse('0.2.3'),
        }
      );
      const pullRequests = await manifest.buildPullRequests();
      expect(pullRequests).toHaveLength(1);
      expect(pullRequests[0].labels).toEqual(['autorelease: pending']);
      expect(dateSafe(pullRequests[0].body.toString())).toMatchSnapshot();
    });

    it('should allow creating multiple pull requests', async () => {
      mockReleases(github, [
        {
          id: 123456,
          sha: 'abc123',
          tagName: 'pkg1-v1.0.0',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg1-v1.0.0',
        },
        {
          id: 654321,
          sha: 'def234',
          tagName: 'pkg2-v0.2.3',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg2-v1.0.0',
        },
      ]);
      mockCommits(github, [
        {
          sha: 'aaaaaa',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'abc123',
          message: 'chore: release 1.0.0',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/pkg1',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 1.0.0',
            body: '',
            labels: [],
            files: [],
            sha: 'abc123',
          },
        },
        {
          sha: 'bbbbbb',
          message: 'fix: some bugfix',
          files: ['path/b/foo'],
        },
        {
          sha: 'cccccc',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'def234',
          message: 'chore: release 0.2.3',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/pkg2',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 0.2.3',
            body: '',
            labels: [],
            files: [],
            sha: 'def234',
          },
        },
      ]);
      const manifest = new Manifest(
        github,
        'main',
        {
          'path/a': {
            releaseType: 'simple',
            component: 'pkg1',
          },
          'path/b': {
            releaseType: 'simple',
            component: 'pkg2',
          },
        },
        {
          'path/a': Version.parse('1.0.0'),
          'path/b': Version.parse('0.2.3'),
        },
        {
          separatePullRequests: true,
        }
      );
      const pullRequests = await manifest.buildPullRequests();
      expect(pullRequests).toHaveLength(2);
      expect(dateSafe(pullRequests[0].body.toString())).toMatchSnapshot();
      expect(dateSafe(pullRequests[1].body.toString())).toMatchSnapshot();
    });

    it('should allow forcing release-as on a single component', async () => {
      mockReleases(github, [
        {
          id: 123456,
          sha: 'abc123',
          tagName: 'pkg1-v1.0.0',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg1-v1.0.0',
        },
        {
          id: 654321,
          sha: 'def234',
          tagName: 'pkg2-v0.2.3',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg2-v1.0.0',
        },
      ]);
      mockCommits(github, [
        {
          sha: 'aaaaaa',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'abc123',
          message: 'chore: release 1.0.0',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/pkg1',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 1.0.0',
            body: '',
            labels: [],
            files: [],
            sha: 'abc123',
          },
        },
        {
          sha: 'bbbbbb',
          message: 'fix: some bugfix',
          files: ['path/b/foo'],
        },
        {
          sha: 'cccccc',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'def234',
          message: 'chore: release 0.2.3',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/pkg2',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 0.2.3',
            body: '',
            labels: [],
            files: [],
            sha: 'def234',
          },
        },
      ]);
      const config = {
        'separate-pull-requests': true,
        packages: {
          'path/a': {
            'release-type': 'simple',
            component: 'pkg1',
          },
          'path/b': {
            'release-type': 'simple',
            component: 'pkg2',
            'release-as': '3.3.3',
          },
        },
      };
      const versions = {
        'path/a': '1.0.0',
        'path/b': '0.2.3',
      };
      when(jest.spyOn(github, 'getFileContentsOnBranch'))
        .calledWith('release-please-config.json', 'main')
        .mockResolvedValue(buildGitHubFileRaw(JSON.stringify(config)))
        .calledWith('.release-please-manifest.json', 'main')
        .mockResolvedValue(buildGitHubFileRaw(JSON.stringify(versions)));
      const manifest = await Manifest.fromManifest(github, 'main');
      const pullRequests = await manifest.buildPullRequests();
      expect(pullRequests).toHaveLength(2);
      expect(pullRequests[0].version?.toString()).toEqual('1.0.1');
      expect(pullRequests[1].version?.toString()).toEqual('3.3.3');
    });

    it('should allow forcing release-as on entire manifest', async () => {
      mockReleases(github, [
        {
          id: 123456,
          sha: 'abc123',
          tagName: 'pkg1-v1.0.0',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg1-v1.0.0',
        },
        {
          id: 654321,
          sha: 'def234',
          tagName: 'pkg2-v0.2.3',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg2-v1.0.0',
        },
      ]);
      mockCommits(github, [
        {
          sha: 'aaaaaa',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'abc123',
          message: 'chore: release 1.0.0',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/pkg1',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 1.0.0',
            body: '',
            labels: [],
            files: [],
            sha: 'abc123',
          },
        },
        {
          sha: 'bbbbbb',
          message: 'fix: some bugfix',
          files: ['path/b/foo'],
        },
        {
          sha: 'cccccc',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'def234',
          message: 'chore: release 0.2.3',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/pkg2',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 0.2.3',
            body: '',
            labels: [],
            files: [],
            sha: 'def234',
          },
        },
      ]);
      const config = {
        'release-as': '3.3.3',
        'separate-pull-requests': true,
        packages: {
          'path/a': {
            'release-type': 'simple',
            component: 'pkg1',
          },
          'path/b': {
            'release-type': 'simple',
            component: 'pkg2',
          },
        },
      };
      const versions = {
        'path/a': '1.0.0',
        'path/b': '0.2.3',
      };
      when(jest.spyOn(github, 'getFileContentsOnBranch'))
        .calledWith('release-please-config.json', 'main')
        .mockResolvedValue(buildGitHubFileRaw(JSON.stringify(config)))
        .calledWith('.release-please-manifest.json', 'main')
        .mockResolvedValue(buildGitHubFileRaw(JSON.stringify(versions)));
      const manifest = await Manifest.fromManifest(github, 'main');
      const pullRequests = await manifest.buildPullRequests();
      expect(pullRequests).toHaveLength(2);
      expect(pullRequests[0].version?.toString()).toEqual('3.3.3');
      expect(pullRequests[1].version?.toString()).toEqual('3.3.3');
    });

    it('should allow specifying a bootstrap sha', async () => {
      mockReleases(github, []);
      mockCommits(github, [
        {
          sha: 'aaaaaa',
          message: 'fix: some bugfix 1',
          files: ['path/a/foo'],
        },
        {
          sha: 'bbbbbb',
          message: 'fix: some bugfix 2',
          files: ['path/a/foo'],
        },
        {
          sha: 'cccccc',
          message: 'fix: some bugfix',
          files: ['path/b/foo'],
        },
        {
          sha: 'dddddd',
          message: 'fix: some bugfix',
          files: ['path/b/foo'],
        },
      ]);
      mockTags(github, []);
      const config = {
        'bootstrap-sha': 'cccccc',
        'separate-pull-requests': true,
        packages: {
          'path/a': {
            'release-type': 'simple',
            component: 'pkg1',
          },
          'path/b': {
            'release-type': 'simple',
            component: 'pkg2',
          },
        },
      };
      const versions = {
        'path/a': '0.0.0',
        'path/b': '0.0.0',
      };
      when(jest.spyOn(github, 'getFileContentsOnBranch'))
        .calledWith('release-please-config.json', 'main')
        .mockResolvedValue(buildGitHubFileRaw(JSON.stringify(config)))
        .calledWith('.release-please-manifest.json', 'main')
        .mockResolvedValue(buildGitHubFileRaw(JSON.stringify(versions)));
      const manifest = await Manifest.fromManifest(github, 'main');
      const pullRequests = await manifest.buildPullRequests();
      expect(pullRequests).toHaveLength(1);
      expect(pullRequests[0].version?.toString()).toEqual('1.0.0');
    });

    it('should allow specifying a last release sha', async () => {
      mockReleases(github, [
        {
          id: 123456,
          sha: 'abc123',
          tagName: 'pkg1-v1.0.0',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg1-v1.0.0',
        },
        {
          id: 654321,
          sha: 'def234',
          tagName: 'pkg2-v0.2.3',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg2-v1.0.0',
        },
      ]);
      mockCommits(github, [
        {
          sha: 'aaaaaa',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'abc123',
          message: 'chore: release 1.0.0',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/pkg1',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 1.0.0',
            body: '',
            labels: [],
            files: [],
            sha: 'abc123',
          },
        },
        {
          sha: 'bbbbbb',
          message: 'fix: some bugfix',
          files: ['path/b/foo'],
        },
        {
          sha: 'cccccc',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'def234',
          message: 'chore: release 0.2.3',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/pkg2',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 0.2.3',
            body: '',
            labels: [],
            files: [],
            sha: 'def234',
          },
        },
      ]);
      mockTags(github, []);
      const config = {
        'last-release-sha': 'bbbbbb',
        'separate-pull-requests': true,
        packages: {
          'path/a': {
            'release-type': 'simple',
            component: 'pkg1',
          },
          'path/b': {
            'release-type': 'simple',
            component: 'pkg2',
          },
        },
      };
      const versions = {
        'path/a': '0.0.0',
        'path/b': '0.0.0',
      };
      when(jest.spyOn(github, 'getFileContentsOnBranch'))
        .calledWith('release-please-config.json', 'main')
        .mockResolvedValue(buildGitHubFileRaw(JSON.stringify(config)))
        .calledWith('.release-please-manifest.json', 'main')
        .mockResolvedValue(buildGitHubFileRaw(JSON.stringify(versions)));
      const manifest = await Manifest.fromManifest(github, 'main');
      const pullRequests = await manifest.buildPullRequests();
      expect(pullRequests).toHaveLength(1);
      expect(pullRequests[0].version?.toString()).toEqual('1.0.0');
    });

    it('should allow customizing pull request title with root package', async () => {
      mockReleases(github, [
        {
          id: 1,
          sha: 'abc123',
          tagName: 'pkg1-v1.0.0',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg1-v1.0.0',
        },
        {
          id: 2,
          sha: 'abc123',
          tagName: 'root-v1.2.0',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/root-v1.2.0',
        },
        {
          id: 3,
          sha: 'def234',
          tagName: 'pkg1-v1.0.1',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg1-v1.0.1',
        },
        {
          id: 4,
          sha: 'def234',
          tagName: 'pkg2-v0.2.3',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg2-v0.2.3',
        },
        {
          id: 5,
          sha: 'def234',
          tagName: 'root-v1.2.1',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/root-v1.2.1',
        },
      ]);
      mockCommits(github, [
        {
          sha: 'aaaaaa',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'abc123',
          message: 'chore: release main',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release v1.2.0',
            body: '',
            labels: [],
            files: [],
            sha: 'abc123',
          },
        },
        {
          sha: 'bbbbbb',
          message: 'fix: some bugfix',
          files: ['path/b/foo'],
        },
        {
          sha: 'cccccc',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'def234',
          message: 'chore: release v1.2.1',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release v1.2.1',
            body: '',
            labels: [],
            files: [],
            sha: 'def234',
          },
        },
      ]);
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'simple',
            component: 'root',
          },
          'path/a': {
            releaseType: 'simple',
            component: 'pkg1',
          },
          'path/b': {
            releaseType: 'simple',
            component: 'pkg2',
          },
        },
        {
          '.': Version.parse('1.2.1'),
          'path/a': Version.parse('1.0.1'),
          'path/b': Version.parse('0.2.3'),
        },
        {
          groupPullRequestTitlePattern:
            'chore${scope}: release${component} v${version}',
        }
      );
      const pullRequests = await manifest.buildPullRequests();
      expect(pullRequests).toHaveLength(1);
      const pullRequest = pullRequests[0];
      expect(pullRequest.title.toString()).toEqual(
        'chore(main): release root v1.2.2'
      );
      expect(dateSafe(pullRequest.body.toString())).toMatchSnapshot();
    });

    it('should allow customizing pull request title without root package', async () => {
      mockReleases(github, [
        {
          id: 1,
          sha: 'abc123',
          tagName: 'pkg1-v1.0.0',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg1-v1.0.0',
        },
        {
          id: 2,
          sha: 'def234',
          tagName: 'pkg1-v1.0.1',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg1-v1.0.1',
        },
        {
          id: 3,
          sha: 'def234',
          tagName: 'pkg2-v0.2.3',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg2-v0.2.3',
        },
      ]);
      mockCommits(github, [
        {
          sha: 'aaaaaa',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'abc123',
          message: 'chore: release main',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release v1.2.0',
            body: '',
            labels: [],
            files: [],
            sha: 'abc123',
          },
        },
        {
          sha: 'bbbbbb',
          message: 'fix: some bugfix',
          files: ['path/b/foo'],
        },
        {
          sha: 'cccccc',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'def234',
          message: 'chore: release v1.2.1',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release v1.2.1',
            body: '',
            labels: [],
            files: [],
            sha: 'def234',
          },
        },
      ]);
      const manifest = new Manifest(
        github,
        'main',
        {
          'path/a': {
            releaseType: 'simple',
            component: 'pkg1',
          },
          'path/b': {
            releaseType: 'simple',
            component: 'pkg2',
          },
        },
        {
          'path/a': Version.parse('1.0.1'),
          'path/b': Version.parse('0.2.3'),
        },
        {
          groupPullRequestTitlePattern:
            'chore${scope}: release${component} v${version}',
        }
      );
      const pullRequests = await manifest.buildPullRequests();
      expect(pullRequests).toHaveLength(1);
      expect(pullRequests[0].title.toString()).toEqual(
        'chore(main): release v'
      );
    });

    it('should read latest version from manifest if no release tag found', async () => {
      mockReleases(github, []);
      mockCommits(github, [
        {
          sha: 'aaaaaa',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'cccccc',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
      ]);
      mockTags(github, []);
      const config = {
        packages: {
          'path/a': {
            'release-type': 'simple',
            component: 'pkg1',
          },
          'path/b': {
            'release-type': 'simple',
            component: 'pkg2',
          },
        },
      };
      const versions = {
        'path/a': '1.2.3',
        'path/b': '2.3.4',
      };
      when(jest.spyOn(github, 'getFileContentsOnBranch'))
        .calledWith('release-please-config.json', 'main')
        .mockResolvedValue(buildGitHubFileRaw(JSON.stringify(config)))
        .calledWith('.release-please-manifest.json', 'main')
        .mockResolvedValue(buildGitHubFileRaw(JSON.stringify(versions)));
      const manifest = await Manifest.fromManifest(github, 'main');
      const pullRequests = await manifest.buildPullRequests();
      expect(pullRequests).toHaveLength(1);
      expect(pullRequests[0].body.releaseData).toHaveLength(1);
      expect(pullRequests[0].body.releaseData[0].component).toEqual('pkg1');
      expect(pullRequests[0].body.releaseData[0].version?.toString()).toEqual(
        '1.2.4'
      );
    });

    it('should not update manifest if unpublished version is created', async () => {
      mockReleases(github, [
        {
          id: 123456,
          tagName: 'v1.2.3',
          sha: 'def234',
          url: 'http://path/to/release',
        },
      ]);
      mockCommits(github, [
        {
          sha: 'abc123',
          message: 'some commit message',
          files: [],
          pullRequest: {
            title: 'chore: release 1.2.3',
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 123,
            body: '',
            labels: [],
            files: [],
          },
        },
      ]);

      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'java',
          },
        },
        {
          '.': Version.parse('1.2.3'),
        }
      );
      const pullRequests = await manifest.buildPullRequests();
      expect(pullRequests).toHaveLength(1);
      const pullRequest = pullRequests[0];
      expect(pullRequest.version?.toString()).toEqual('1.2.4-SNAPSHOT');
      // simple release type updates the changelog and version.txt
      assertNoHasUpdate(pullRequest.updates, 'CHANGELOG.md');
      assertNoHasUpdate(pullRequest.updates, '.release-please-manifest.json');
      expect(pullRequest.headRefName).toEqual('release-please--branches--main');
    });

    describe('without commits', () => {
      beforeEach(() => {
        mockReleases(github, [
          {
            id: 123456,
            sha: 'abc123',
            tagName: 'v1.0.0',
            url: 'https://github.com/fake-owner/fake-repo/releases/tag/v1.0.0',
          },
        ]);
        mockCommits(github, []);
      });
      it('should ignore by default', async () => {
        const manifest = new Manifest(
          github,
          'main',
          {
            '.': {
              releaseType: 'simple',
            },
          },
          {
            '.': Version.parse('1.0.0'),
          }
        );
        const pullRequests = await manifest.buildPullRequests();
        expect(pullRequests).toHaveLength(0);
      });

      it('should delegate to strategies', async () => {
        const getFileContentsStub = jest.spyOn(
          github,
          'getFileContentsOnBranch'
        );
        when(getFileContentsStub)
          .calledWith('versions.txt', 'main')
          .mockResolvedValue(
            buildGitHubFileContent(
              fixturesPath,
              'strategies/java-yoshi/versions-released.txt'
            )
          );
        jest.spyOn(github, 'findFilesByFilenameAndRef').mockResolvedValue([]);
        const manifest = new Manifest(
          github,
          'main',
          {
            '.': {
              releaseType: 'java-yoshi',
            },
          },
          {
            '.': Version.parse('1.0.0'),
          }
        );
        const pullRequests = await manifest.buildPullRequests();
        expect(pullRequests).toHaveLength(1);
        const pullRequest = pullRequests[0];
        expect(pullRequest.version?.toString()).toEqual('1.0.1-SNAPSHOT');
        expect(pullRequest.headRefName).toEqual(
          'release-please--branches--main'
        );
      });
    });

    it('should handle extra files', async () => {
      mockReleases(github, []);
      mockTags(github, []);
      mockCommits(github, [
        {
          sha: 'aaaaaa',
          message: 'fix: a bugfix',
          files: ['foo', 'pkg.properties'],
        },
        {
          sha: 'bbbbbb',
          message: 'fix: b bugfix',
          files: ['pkg/b/foo'],
        },
        {
          sha: 'cccccc',
          message: 'fix: c bugfix',
          files: ['pkg/c/foo'],
        },
      ]);
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'simple',
            component: 'a',
            extraFiles: ['root.properties'],
          },
          'pkg/b': {
            releaseType: 'simple',
            component: 'b',
            extraFiles: ['pkg.properties', 'src/version', '/bbb.properties'],
            skipGithubRelease: true,
          },
          'pkg/c': {
            releaseType: 'simple',
            component: 'c',
            extraFiles: ['/pkg/pkg-c.properties', 'ccc.properties'],
            skipGithubRelease: true,
          },
        },
        {
          '.': Version.parse('1.1.0'),
          'pkg/b': Version.parse('1.0.0'),
          'pkg/c': Version.parse('1.0.1'),
        }
      );
      const pullRequests = await manifest.buildPullRequests();
      expect(pullRequests).toHaveLength(1);
      expect(Array.isArray(pullRequests[0].updates)).toBe(true);
      expect(pullRequests[0].updates.map(update => update.path)).toEqual(
        expect.arrayContaining([
          'root.properties',
          'bbb.properties',
          'pkg/pkg-c.properties',
          'pkg/b/pkg.properties',
          'pkg/b/src/version',
          'pkg/c/ccc.properties',
        ])
      );
      expect(pullRequests[0].updates.map(update => update.path)).not.toContain([
        'pkg/b/bbb.properties', // should be at root
        'pkg/c/pkg-c.properties', // should be up one level
      ]);
    });

    it('should allow overriding commit message', async () => {
      mockReleases(github, [
        {
          id: 123456,
          sha: 'abc123',
          tagName: 'v1.0.0',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/v1.0.0',
        },
      ]);
      mockCommits(github, [
        {
          sha: 'def456',
          message: 'fix: some bugfix',
          files: [],
          pullRequest: {
            headBranchName: 'fix-1',
            baseBranchName: 'main',
            number: 123,
            title: 'fix: some bugfix',
            body: 'BEGIN_COMMIT_OVERRIDE\nfix: real fix message\nEND_COMMIT_OVERRIDE',
            labels: [],
            files: [],
            sha: 'abc123',
          },
        },
        {
          sha: 'abc123',
          message: 'chore: release 1.0.0',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 1.0.0',
            body: '',
            labels: [],
            files: [],
            sha: 'abc123',
          },
        },
      ]);
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'simple',
          },
        },
        {
          '.': Version.parse('1.0.0'),
        },
        {
          draftPullRequest: true,
        }
      );
      const pullRequests = await manifest.buildPullRequests();
      expect(pullRequests).toHaveLength(1);
      const pullRequest = pullRequests[0];
      safeSnapshot(pullRequest.body.toString());
    });

    describe('with plugins', () => {
      beforeEach(() => {
        mockReleases(github, [
          {
            id: 123456,
            sha: 'abc123',
            tagName: 'pkg1-v1.0.0',
            url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg1-v1.0.0',
          },
          {
            id: 654321,
            sha: 'def234',
            tagName: 'pkg2-v0.2.3',
            url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg2-v1.0.0',
          },
        ]);
        mockCommits(github, [
          {
            sha: 'aaaaaa',
            message: 'fix: some bugfix\nfix:another fix',
            files: ['path/a/foo'],
          },
          {
            sha: 'abc123',
            message: 'chore: release 1.0.0',
            files: [],
            pullRequest: {
              headBranchName: 'release-please/branches/main/components/pkg1',
              baseBranchName: 'main',
              number: 123,
              title: 'chore: release 1.0.0',
              body: '',
              labels: [],
              files: [],
              sha: 'abc123',
            },
          },
          {
            sha: 'bbbbbb',
            message: 'fix: some bugfix',
            files: ['path/b/foo'],
          },
          {
            sha: 'cccccc',
            message: 'fix: some bugfix',
            files: ['path/a/foo'],
          },
          {
            sha: 'def234',
            message: 'chore: release 0.2.3',
            files: [],
            pullRequest: {
              headBranchName: 'release-please/branches/main/components/pkg2',
              baseBranchName: 'main',
              number: 123,
              title: 'chore: release 0.2.3',
              body: '',
              labels: [],
              files: [],
              sha: 'def234',
            },
          },
        ]);
      });

      it('should load and run a single plugins', async () => {
        const mockPlugin3 = createMockInstance(NodeWorkspace);
        mockPlugin3.run.mockImplementation(args => Promise.resolve(args));
        mockPlugin3.preconfigure.mockImplementation(args =>
          Promise.resolve(args)
        );
        mockPlugin3.processCommits.mockImplementation(args => args);
        const mock = jest.spyOn(pluginFactory, 'buildPlugin');
        when(mock)
          .calledWith(expect.objectContaining({type: 'node-workspace'}))
          .mockReturnValue(mockPlugin3);
        const manifest = new Manifest(
          github,
          'main',
          {
            'path/a': {
              releaseType: 'node',
              component: 'pkg1',
              packageName: 'pkg1',
            },
            'path/b': {
              releaseType: 'node',
              component: 'pkg2',
              packageName: 'pkg2',
            },
          },
          {
            'path/a': Version.parse('1.0.0'),
            'path/b': Version.parse('0.2.3'),
          },
          {
            separatePullRequests: true,
            plugins: ['node-workspace'],
          }
        );
        const pullRequests = await manifest.buildPullRequests();
        expect(pullRequests).not.toBeEmpty();
        expect(mockPlugin3.run).toHaveBeenCalledOnce();
      });

      it('should load and run multiple plugins', async () => {
        const mockPlugin = createMockInstance(NodeWorkspace);
        mockPlugin.run.mockImplementation(args => Promise.resolve(args));
        mockPlugin.preconfigure.mockImplementation(args =>
          Promise.resolve(args)
        );
        mockPlugin.processCommits.mockImplementation(args => args);

        const mockPlugin2 = createMockInstance(CargoWorkspace);
        mockPlugin2.run.mockImplementation(args => Promise.resolve(args));
        mockPlugin2.preconfigure.mockImplementation(args =>
          Promise.resolve(args)
        );
        mockPlugin2.processCommits.mockImplementation(args => args);
        const mock = jest.spyOn(pluginFactory, 'buildPlugin');
        when(mock)
          .calledWith(expect.objectContaining({type: 'node-workspace'}))
          .mockReturnValue(mockPlugin)
          .calledWith(expect.objectContaining({type: 'cargo-workspace'}))
          .mockReturnValue(mockPlugin2);
        const manifest = new Manifest(
          github,
          'main',
          {
            'path/a': {
              releaseType: 'node',
              component: 'pkg1',
              packageName: '@foo/pkg1',
            },
            'path/b': {
              releaseType: 'node',
              component: 'pkg2',
              packageName: '@foo/pkg2',
            },
          },
          {
            'path/a': Version.parse('1.0.0'),
            'path/b': Version.parse('0.2.3'),
          },
          {
            separatePullRequests: true,
            plugins: ['node-workspace', 'cargo-workspace'],
          }
        );
        const pullRequests = await manifest.buildPullRequests();
        expect(pullRequests).not.toBeEmpty();
        expect(mockPlugin.run).toHaveBeenCalledOnce();
        expect(mockPlugin2.run).toHaveBeenCalledOnce();
      });

      it('should apply plugin hook "processCommits"', async () => {
        const plugin = new SentenceCase(github, 'main', {});
        const spy = jest.spyOn(plugin, 'processCommits');

        when(jest.spyOn(pluginFactory, 'buildPlugin'))
          .calledWith(expect.objectContaining({type: 'sentence-case'}))
          .mockReturnValue(plugin);

        const manifest = new Manifest(
          github,
          'main',
          {
            'path/a': {
              releaseType: 'node',
              component: 'pkg1',
              packageName: 'pkg1',
            },
          },
          {
            'path/a': Version.parse('1.0.0'),
          },
          {
            plugins: ['sentence-case'],
          }
        );
        const pullRequests = await manifest.buildPullRequests();
        expect(pullRequests).not.toBeEmpty();
        // This assertion verifies that conventional commit parsing
        // was applied before calling the processCommits plugin hook:
        expect(spy).toHaveBeenCalledWith([
          {
            sha: 'aaaaaa',
            message: 'fix: Another fix',
            files: ['path/a/foo'],
            pullRequest: undefined,
            type: 'fix',
            scope: null,
            bareMessage: 'Another fix',
            notes: [],
            references: [],
            breaking: false,
          },
          {
            sha: 'aaaaaa',
            message: 'fix: Some bugfix',
            files: ['path/a/foo'],
            pullRequest: undefined,
            type: 'fix',
            scope: null,
            bareMessage: 'Some bugfix',
            notes: [],
            references: [],
            breaking: false,
          },
        ]);
      });
    });

    it('should fallback to tagged version', async () => {
      mockReleases(github, []);
      mockTags(github, [
        {
          name: 'pkg1-v1.0.0',
          sha: 'abc123',
        },
      ]);
      mockCommits(github, [
        {
          sha: 'def456',
          message: 'fix: some bugfix',
          files: [],
        },
        {
          sha: 'abc123',
          message: 'chore: release 1.0.0',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/pkg1',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 1.0.0',
            body: '',
            labels: [],
            files: [],
            sha: 'abc123',
          },
        },
      ]);
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/repo/node/pkg1/package.json'
          )
        );
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
          },
        },
        {
          '.': Version.parse('1.0.0'),
        }
      );
      const pullRequests = await manifest.buildPullRequests();
      expect(pullRequests).toHaveLength(1);
      const pullRequest = pullRequests[0];
      expect(pullRequest.version?.toString()).toEqual('1.0.1');
      expect(pullRequest.headRefName).toEqual(
        'release-please--branches--main--components--pkg1'
      );
    });

    it('should handle mixing componentless configs', async () => {
      mockReleases(github, [
        {
          id: 123456,
          sha: 'abc123',
          tagName: 'v1.0.0',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/v1.0.0',
        },
        {
          id: 654321,
          sha: 'def234',
          tagName: 'pkg2-v0.2.3',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg2-v0.2.3',
        },
      ]);
      mockCommits(github, [
        {
          sha: 'aaaaaa',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'abc123',
          message: 'chore: release main',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release main',
            body: '',
            labels: [],
            files: [],
            sha: 'abc123',
          },
        },
        {
          sha: 'bbbbbb',
          message: 'fix: some bugfix',
          files: ['path/b/foo'],
        },
        {
          sha: 'cccccc',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'def234',
          message: 'chore: release main',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release main',
            body: '',
            labels: [],
            files: [],
            sha: 'def234',
          },
        },
      ]);
      const manifest = new Manifest(
        github,
        'main',
        {
          'path/a': {
            releaseType: 'simple',
            component: 'pkg1',
            includeComponentInTag: false,
          },
          'path/b': {
            releaseType: 'simple',
            component: 'pkg2',
          },
        },
        {
          'path/a': Version.parse('1.0.0'),
          'path/b': Version.parse('0.2.3'),
        }
      );
      const pullRequests = await manifest.buildPullRequests();
      expect(pullRequests).toHaveLength(1);
      expect(pullRequests[0].labels).toEqual(['autorelease: pending']);
      expect(dateSafe(pullRequests[0].body.toString())).toMatchSnapshot();
    });

    it('should allow customizing release-search-depth', async () => {
      const releaseStub = mockReleases(github, []);
      mockTags(github, [
        {
          name: 'pkg1-v1.0.0',
          sha: 'abc123',
        },
      ]);
      mockCommits(github, [
        {
          sha: 'def456',
          message: 'fix: some bugfix',
          files: [],
        },
        {
          sha: 'abc123',
          message: 'chore: release 1.0.0',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/pkg1',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 1.0.0',
            body: '',
            labels: [],
            files: [],
            sha: 'abc123',
          },
        },
      ]);
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/repo/node/pkg1/package.json'
          )
        );
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
          },
        },
        {
          '.': Version.parse('1.0.0'),
        },
        {
          releaseSearchDepth: 1,
        }
      );
      expect(manifest.releaseSearchDepth).toEqual(1);
      const pullRequests = await manifest.buildPullRequests();
      expect(pullRequests).toHaveLength(1);
      const pullRequest = pullRequests[0];
      expect(pullRequest.version?.toString()).toEqual('1.0.1');
      expect(pullRequest.headRefName).toEqual(
        'release-please--branches--main--components--pkg1'
      );
      expect(releaseStub).toHaveBeenCalledOnce();
      expect(releaseStub).toHaveBeenCalledWith({maxResults: 1});
    });

    it('should allow customizing commit-search-depth', async () => {
      mockReleases(github, []);
      mockTags(github, [
        {
          name: 'pkg1-v1.0.0',
          sha: 'abc123',
        },
      ]);
      const commitsStub = mockCommits(github, [
        {
          sha: 'def456',
          message: 'fix: some bugfix',
          files: [],
        },
        {
          sha: 'abc123',
          message: 'chore: release 1.0.0',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/pkg1',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 1.0.0',
            body: '',
            labels: [],
            files: [],
            sha: 'abc123',
          },
        },
      ]);
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/repo/node/pkg1/package.json'
          )
        );
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
          },
        },
        {
          '.': Version.parse('1.0.0'),
        },
        {
          commitSearchDepth: 1,
        }
      );
      expect(manifest.commitSearchDepth).toEqual(1);
      const pullRequests = await manifest.buildPullRequests();
      expect(pullRequests).toHaveLength(1);
      const pullRequest = pullRequests[0];
      expect(pullRequest.version?.toString()).toEqual('1.0.1');
      expect(pullRequest.headRefName).toEqual(
        'release-please--branches--main--components--pkg1'
      );
      expect(commitsStub).toHaveBeenCalledWith(
        'main',
        expect.objectContaining({maxResults: 1})
      );
    });

    describe('with multiple components', () => {
      beforeEach(() => {
        mockReleases(github, []);
        mockTags(github, [
          {
            name: 'b-v1.0.0',
            sha: 'abc123',
          },
          {
            name: 'c-v2.0.0',
            sha: 'abc123',
          },
          {
            name: 'd-v3.0.0',
            sha: 'abc123',
          },
        ]);
        mockCommits(github, [
          {
            sha: 'def456',
            message: 'fix: some bugfix',
            files: ['pkg/b/foo.txt', 'pkg/c/foo.txt', 'pkg/d/foo.txt'],
          },
          {
            sha: 'abc123',
            message: 'chore: release main',
            files: [],
            pullRequest: {
              headBranchName: 'release-please/branches/main/components/pkg1',
              baseBranchName: 'main',
              number: 123,
              title: 'chore: release main',
              body: '',
              labels: [],
              files: [],
              sha: 'abc123',
            },
          },
        ]);
        const getFileContentsStub = jest.spyOn(
          github,
          'getFileContentsOnBranch'
        );
        when(getFileContentsStub)
          .calledWith('package.json', 'main')
          .mockResolvedValue(
            buildGitHubFileContent(
              fixturesPath,
              'manifest/repo/node/pkg1/package.json'
            )
          );
      });

      it('should allow configuring separate pull requests', async () => {
        const manifest = new Manifest(
          github,
          'main',
          {
            'pkg/b': {
              releaseType: 'simple',
              component: 'b',
            },
            'pkg/c': {
              releaseType: 'simple',
              component: 'c',
            },
            'pkg/d': {
              releaseType: 'simple',
              component: 'd',
            },
          },
          {
            'pkg/b': Version.parse('1.0.0'),
            'pkg/c': Version.parse('2.0.0'),
            'pkg/d': Version.parse('3.0.0'),
          },
          {
            separatePullRequests: true,
          }
        );
        const pullRequests = await manifest.buildPullRequests();
        expect(pullRequests).toHaveLength(3);
        const pullRequestB = pullRequests[0];
        expect(pullRequestB.headRefName).toEqual(
          'release-please--branches--main--components--b'
        );
        const pullRequestC = pullRequests[1];
        expect(pullRequestC.headRefName).toEqual(
          'release-please--branches--main--components--c'
        );
        const pullRequestD = pullRequests[2];
        expect(pullRequestD.headRefName).toEqual(
          'release-please--branches--main--components--d'
        );
      });

      it('should allow configuring individual separate pull requests', async () => {
        const manifest = new Manifest(
          github,
          'main',
          {
            'pkg/b': {
              releaseType: 'simple',
              component: 'b',
            },
            'pkg/c': {
              releaseType: 'simple',
              component: 'c',
            },
            'pkg/d': {
              releaseType: 'simple',
              component: 'd',
              separatePullRequests: true,
            },
          },
          {
            'pkg/b': Version.parse('1.0.0'),
            'pkg/c': Version.parse('2.0.0'),
            'pkg/d': Version.parse('3.0.0'),
          }
        );
        const pullRequests = await manifest.buildPullRequests();
        expect(pullRequests).toHaveLength(2);
        const pullRequest = pullRequests[0];
        expect(pullRequest.headRefName).toEqual(
          'release-please--branches--main'
        );
        const mainPullRequest = pullRequests[1];
        expect(mainPullRequest.headRefName).toEqual(
          'release-please--branches--main--components--d'
        );
      });

      it('should allow configuring individual separate pull requests with includeComponentInTag = false', async () => {
        const manifest = new Manifest(
          github,
          'main',
          {
            'pkg/b': {
              releaseType: 'simple',
              component: 'b',
            },
            'pkg/c': {
              releaseType: 'simple',
              component: 'c',
            },
            'pkg/d': {
              releaseType: 'simple',
              component: 'd',
              separatePullRequests: true,
              includeComponentInTag: false,
            },
          },
          {
            'pkg/b': Version.parse('1.0.0'),
            'pkg/c': Version.parse('2.0.0'),
            'pkg/d': Version.parse('3.0.0'),
          }
        );
        const pullRequests = await manifest.buildPullRequests();
        expect(pullRequests).toHaveLength(2);
        const pullRequest = pullRequests[0];
        expect(pullRequest.headRefName).toEqual(
          'release-please--branches--main'
        );
        const mainPullRequest = pullRequests[1];
        expect(mainPullRequest.headRefName).toEqual(
          'release-please--branches--main--components--d'
        );
      });
    });
  });

  describe('createPullRequests', () => {
    it('handles no pull requests', async () => {
      const manifest = new Manifest(
        github,
        'main',
        {
          'path/a': {
            releaseType: 'node',
            component: 'pkg1',
          },
          'path/b': {
            releaseType: 'node',
            component: 'pkg2',
          },
        },
        {
          'path/a': Version.parse('1.0.0'),
          'path/b': Version.parse('0.2.3'),
        },
        {
          separatePullRequests: true,
          plugins: ['node-workspace'],
        }
      );
      jest.spyOn(manifest, 'buildPullRequests').mockResolvedValue([]);
      const pullRequests = await manifest.createPullRequests();
      expect(Object.keys(pullRequests)).toHaveLength(0);
    });

    it('handles a single pull request', async () => {
      when(jest.spyOn(github, 'getFileContentsOnBranch'))
        .calledWith('README.md', 'main')
        .mockResolvedValue(buildGitHubFileRaw('some-content'));
      stubSuggesterWithSnapshot();
      mockPullRequests(github, []);
      when(jest.spyOn(github, 'getPullRequest'))
        .calledWith(22)
        .mockResolvedValue({
          number: 22,
          title: 'pr title1',
          body: 'pr body1',
          headBranchName: 'release-please/branches/main',
          baseBranchName: 'main',
          labels: [],
          files: [],
        });
      const manifest = new Manifest(
        github,
        'main',
        {
          'path/a': {
            releaseType: 'node',
            component: 'pkg1',
          },
          'path/b': {
            releaseType: 'node',
            component: 'pkg2',
          },
        },
        {
          'path/a': Version.parse('1.0.0'),
          'path/b': Version.parse('0.2.3'),
        },
        {
          separatePullRequests: true,
          plugins: ['node-workspace'],
        }
      );
      jest.spyOn(manifest, 'buildPullRequests').mockResolvedValue([
        {
          title: PullRequestTitle.ofTargetBranch('main'),
          body: new PullRequestBody([
            {
              notes: 'Some release notes',
            },
          ]),
          updates: [
            {
              path: 'README.md',
              createIfMissing: false,
              updater: new RawContent('some raw content'),
            },
          ],
          labels: [],
          headRefName: 'release-please/branches/main',
          draft: false,
        },
      ]);
      const pullRequests = await manifest.createPullRequests();
      expect(pullRequests).toHaveLength(1);
    });

    it('handles a multiple pull requests', async () => {
      when(jest.spyOn(github, 'getFileContentsOnBranch'))
        .calledWith('README.md', 'main')
        .mockResolvedValue(buildGitHubFileRaw('some-content'))
        .calledWith('pkg2/README.md', 'main')
        .mockResolvedValue(buildGitHubFileRaw('some-content-2'));
      mockPullRequests(github, []);
      when(jest.spyOn(github, 'getPullRequest'))
        .calledWith(123)
        .mockResolvedValue({
          number: 123,
          title: 'pr title1',
          body: 'pr body1',
          headBranchName: 'release-please/branches/main',
          baseBranchName: 'main',
          labels: [],
          files: [],
        })
        .calledWith(124)
        .mockResolvedValue({
          number: 124,
          title: 'pr title2',
          body: 'pr body2',
          headBranchName: 'release-please/branches/main2',
          baseBranchName: 'main',
          labels: [],
          files: [],
        });
      when(jest.spyOn(github, 'createPullRequest'))
        .calledWith(
          expect.objectContaining({
            headBranchName: 'release-please/branches/main',
          }),
          'main',
          expect.toBeString(),
          expect.toBeArray(),
          expect.objectContaining({fork: false, draft: false})
        )
        .mockResolvedValue({
          number: 123,
          title: 'pr title1',
          body: 'pr body1',
          headBranchName: 'release-please/branches/main',
          baseBranchName: 'main',
          labels: [],
          files: [],
        })
        .calledWith(
          expect.objectContaining({
            headBranchName: 'release-please/branches/main2',
          }),
          'main',
          expect.toBeString(),
          expect.toBeArray(),
          expect.objectContaining({fork: false, draft: false})
        )
        .mockResolvedValue({
          number: 124,
          title: 'pr title2',
          body: 'pr body2',
          headBranchName: 'release-please/branches/main2',
          baseBranchName: 'main',
          labels: [],
          files: [],
        });
      const manifest = new Manifest(
        github,
        'main',
        {
          'path/a': {
            releaseType: 'node',
            component: 'pkg1',
          },
          'path/b': {
            releaseType: 'node',
            component: 'pkg2',
          },
        },
        {
          'path/a': Version.parse('1.0.0'),
          'path/b': Version.parse('0.2.3'),
        },
        {
          separatePullRequests: true,
          plugins: ['node-workspace'],
        }
      );
      jest.spyOn(manifest, 'buildPullRequests').mockResolvedValue([
        {
          title: PullRequestTitle.ofTargetBranch('main'),
          body: new PullRequestBody([
            {
              notes: 'Some release notes',
            },
          ]),
          updates: [
            {
              path: 'README.md',
              createIfMissing: false,
              updater: new RawContent('some raw content'),
            },
          ],
          labels: [],
          headRefName: 'release-please/branches/main',
          draft: false,
        },
        {
          title: PullRequestTitle.ofTargetBranch('main'),
          body: new PullRequestBody([
            {
              notes: 'Some release notes 2',
            },
          ]),
          updates: [
            {
              path: 'pkg2/README.md',
              createIfMissing: false,
              updater: new RawContent('some raw content 2'),
            },
          ],
          labels: [],
          headRefName: 'release-please/branches/main2',
          draft: false,
        },
      ]);
      const pullRequests = await manifest.createPullRequests();
      expect(pullRequests.map(pullRequest => pullRequest!.number)).toEqual([
        123, 124,
      ]);
    });

    it('handles signoff users', async () => {
      when(jest.spyOn(github, 'getFileContentsOnBranch'))
        .calledWith('README.md', 'main')
        .mockResolvedValue(buildGitHubFileRaw('some-content'));
      stubSuggesterWithSnapshot();
      mockPullRequests(github, []);
      when(jest.spyOn(github, 'getPullRequest'))
        .calledWith(22)
        .mockResolvedValue({
          number: 22,
          title: 'pr title1',
          body: 'pr body1',
          headBranchName: 'release-please/branches/main',
          baseBranchName: 'main',
          labels: [],
          files: [],
        });
      const manifest = new Manifest(
        github,
        'main',
        {
          'path/a': {
            releaseType: 'node',
            component: 'pkg1',
          },
          'path/b': {
            releaseType: 'node',
            component: 'pkg2',
          },
        },
        {
          'path/a': Version.parse('1.0.0'),
          'path/b': Version.parse('0.2.3'),
        },
        {
          separatePullRequests: true,
          plugins: ['node-workspace'],
          signoff: 'Alice <alice@example.com>',
        }
      );
      jest.spyOn(manifest, 'buildPullRequests').mockResolvedValue([
        {
          title: PullRequestTitle.ofTargetBranch('main'),
          body: new PullRequestBody([
            {
              notes: 'Some release notes',
            },
          ]),
          updates: [
            {
              path: 'README.md',
              createIfMissing: false,
              updater: new RawContent('some raw content'),
            },
          ],
          labels: [],
          headRefName: 'release-please/branches/main',
          draft: false,
        },
      ]);
      const pullRequestNumbers = await manifest.createPullRequests();
      expect(pullRequestNumbers).toHaveLength(1);
    });

    it('handles fork = true', async () => {
      when(jest.spyOn(github, 'getFileContentsOnBranch'))
        .calledWith('README.md', 'main')
        .mockResolvedValue(buildGitHubFileRaw('some-content'));
      stubSuggesterWithSnapshot();
      mockPullRequests(github, []);
      when(jest.spyOn(github, 'getPullRequest'))
        .calledWith(22)
        .mockResolvedValue({
          number: 22,
          title: 'pr title1',
          body: 'pr body1',
          headBranchName: 'release-please/branches/main',
          baseBranchName: 'main',
          labels: [],
          files: [],
        });
      const manifest = new Manifest(
        github,
        'main',
        {
          'path/a': {
            releaseType: 'node',
            component: 'pkg1',
          },
          'path/b': {
            releaseType: 'node',
            component: 'pkg2',
          },
        },
        {
          'path/a': Version.parse('1.0.0'),
          'path/b': Version.parse('0.2.3'),
        },
        {
          separatePullRequests: true,
          plugins: ['node-workspace'],
          fork: true,
        }
      );
      jest.spyOn(manifest, 'buildPullRequests').mockResolvedValue([
        {
          title: PullRequestTitle.ofTargetBranch('main'),
          body: new PullRequestBody([
            {
              notes: 'Some release notes',
            },
          ]),
          updates: [
            {
              path: 'README.md',
              createIfMissing: false,
              updater: new RawContent('some raw content'),
            },
          ],
          labels: [],
          headRefName: 'release-please/branches/main',
          draft: false,
        },
      ]);
      const pullRequestNumbers = await manifest.createPullRequests();
      expect(pullRequestNumbers).toHaveLength(1);
    });

    it('updates an existing pull request', async () => {
      when(jest.spyOn(github, 'getFileContentsOnBranch'))
        .calledWith('README.md', 'main')
        .mockResolvedValue(buildGitHubFileRaw('some-content'));
      stubSuggesterWithSnapshot();
      mockPullRequests(
        github,
        [
          {
            number: 22,
            title: 'pr title1',
            body: new PullRequestBody([]).toString(),
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            labels: ['autorelease: pending'],
            files: [],
          },
        ],
        []
      );
      when(jest.spyOn(github, 'updatePullRequest'))
        .calledWith(22, expect.anything(), expect.anything(), expect.anything())
        .mockResolvedValue({
          number: 22,
          title: 'pr title1',
          body: 'pr body1',
          headBranchName: 'release-please/branches/main',
          baseBranchName: 'main',
          labels: [],
          files: [],
        });
      const manifest = new Manifest(
        github,
        'main',
        {
          'path/a': {
            releaseType: 'node',
            component: 'pkg1',
          },
          'path/b': {
            releaseType: 'node',
            component: 'pkg2',
          },
        },
        {
          'path/a': Version.parse('1.0.0'),
          'path/b': Version.parse('0.2.3'),
        },
        {
          separatePullRequests: true,
          plugins: ['node-workspace'],
        }
      );
      jest.spyOn(manifest, 'buildPullRequests').mockResolvedValue([
        {
          title: PullRequestTitle.ofTargetBranch('main'),
          body: new PullRequestBody([
            {
              notes: 'Some release notes',
            },
          ]),
          updates: [
            {
              path: 'README.md',
              createIfMissing: false,
              updater: new RawContent('some raw content'),
            },
          ],
          labels: [],
          headRefName: 'release-please/branches/main',
          draft: false,
        },
      ]);
      const pullRequestNumbers = await manifest.createPullRequests();
      expect(pullRequestNumbers).toHaveLength(1);
    });

    describe('with an overflowing body', () => {
      const body = new PullRequestBody(mockReleaseData(1000), {
        useComponents: true,
      });

      it('updates an existing pull request', async () => {
        when(jest.spyOn(github, 'getFileContentsOnBranch'))
          .calledWith('README.md', 'main')
          .mockResolvedValue(buildGitHubFileRaw('some-content'));
        stubSuggesterWithSnapshot();
        mockPullRequests(
          github,
          [
            {
              number: 22,
              title: 'pr title1',
              body: pullRequestBody('release-notes/single.txt'),
              headBranchName: 'release-please/branches/main',
              baseBranchName: 'main',
              labels: ['autorelease: pending'],
              files: [],
            },
          ],
          []
        );
        when(jest.spyOn(github, 'updatePullRequest'))
          .calledWith(
            22,
            expect.anything(),
            expect.anything(),
            expect.objectContaining({
              pullRequestOverflowHandler: expect.toBeObject(),
            })
          )
          .mockResolvedValue({
            number: 22,
            title: 'pr title1',
            body: 'pr body1',
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            labels: [],
            files: [],
          });
        const manifest = new Manifest(
          github,
          'main',
          {
            'path/a': {
              releaseType: 'node',
              component: 'pkg1',
            },
            'path/b': {
              releaseType: 'node',
              component: 'pkg2',
            },
          },
          {
            'path/a': Version.parse('1.0.0'),
            'path/b': Version.parse('0.2.3'),
          },
          {
            separatePullRequests: true,
            plugins: ['node-workspace'],
          }
        );
        jest.spyOn(manifest, 'buildPullRequests').mockResolvedValue([
          {
            title: PullRequestTitle.ofTargetBranch('main'),
            body,
            updates: [
              {
                path: 'README.md',
                createIfMissing: false,
                updater: new RawContent('some raw content'),
              },
            ],
            labels: [],
            headRefName: 'release-please/branches/main',
            draft: false,
          },
        ]);
        const pullRequestNumbers = await manifest.createPullRequests();
        expect(pullRequestNumbers).toHaveLength(1);
      });

      it('ignores an existing pull request if there are no changes', async () => {
        when(jest.spyOn(github, 'getFileContentsOnBranch'))
          .calledWith('README.md', 'main')
          .mockResolvedValue(buildGitHubFileRaw('some-content'))
          .calledWith('release-notes.md', 'my-head-branch--release-notes')
          .mockResolvedValue(buildGitHubFileRaw(body.toString()));
        stubSuggesterWithSnapshot();
        mockPullRequests(
          github,
          [
            {
              number: 22,
              title: 'pr title1',
              body: pullRequestBody('release-notes/overflow.txt'),
              headBranchName: 'release-please/branches/main',
              baseBranchName: 'main',
              labels: ['autorelease: pending'],
              files: [],
            },
          ],
          []
        );
        when(jest.spyOn(github, 'updatePullRequest'))
          .calledWith(
            22,
            expect.anything(),
            expect.anything(),
            expect.objectContaining({
              pullRequestOverflowHandler: expect.toBeObject(),
            })
          )
          .mockResolvedValue({
            number: 22,
            title: 'pr title1',
            body: 'pr body1',
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            labels: [],
            files: [],
          });
        const manifest = new Manifest(
          github,
          'main',
          {
            'path/a': {
              releaseType: 'node',
              component: 'pkg1',
            },
            'path/b': {
              releaseType: 'node',
              component: 'pkg2',
            },
          },
          {
            'path/a': Version.parse('1.0.0'),
            'path/b': Version.parse('0.2.3'),
          },
          {
            separatePullRequests: true,
            plugins: ['node-workspace'],
          }
        );
        jest.spyOn(manifest, 'buildPullRequests').mockResolvedValue([
          {
            title: PullRequestTitle.ofTargetBranch('main'),
            body,
            updates: [
              {
                path: 'README.md',
                createIfMissing: false,
                updater: new RawContent('some raw content'),
              },
            ],
            labels: [],
            headRefName: 'release-please/branches/main',
            draft: false,
          },
        ]);
        const pullRequestNumbers = await manifest.createPullRequests();
        expect(pullRequestNumbers).toHaveLength(0);
      });
    });

    it('updates an existing snapshot pull request', async () => {
      when(jest.spyOn(github, 'getFileContentsOnBranch'))
        .calledWith('README.md', 'main')
        .mockResolvedValue(buildGitHubFileRaw('some-content'));
      stubSuggesterWithSnapshot();
      mockPullRequests(
        github,
        [
          {
            number: 22,
            title: 'pr title1',
            body: new PullRequestBody([]).toString(),
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            labels: ['autorelease: snapshot'],
            files: [],
          },
        ],
        []
      );
      when(jest.spyOn(github, 'updatePullRequest'))
        .calledWith(22, expect.anything(), expect.anything(), expect.anything())
        .mockResolvedValue({
          number: 22,
          title: 'pr title1',
          body: 'pr body1',
          headBranchName: 'release-please/branches/main',
          baseBranchName: 'main',
          labels: ['autorelease: snapshot'],
          files: [],
        });
      const manifest = new Manifest(
        github,
        'main',
        {
          'path/a': {
            releaseType: 'java',
            component: 'pkg1',
          },
          'path/b': {
            releaseType: 'java',
            component: 'pkg2',
          },
        },
        {
          'path/a': Version.parse('1.0.0'),
          'path/b': Version.parse('0.2.3'),
        },
        {
          separatePullRequests: true,
        }
      );
      jest.spyOn(manifest, 'buildPullRequests').mockResolvedValue([
        {
          title: PullRequestTitle.ofTargetBranch('main'),
          body: new PullRequestBody([
            {
              notes: 'SNAPSHOT bump',
            },
          ]),
          updates: [
            {
              path: 'pom.xml',
              createIfMissing: false,
              updater: new RawContent('some raw content'),
            },
          ],
          labels: [],
          headRefName: 'release-please/branches/main',
          draft: false,
        },
      ]);
      const pullRequestNumbers = await manifest.createPullRequests();
      expect(pullRequestNumbers).toHaveLength(1);
    });

    it('skips pull requests if there are pending, merged pull requests', async () => {
      when(jest.spyOn(github, 'getFileContentsOnBranch'))
        .calledWith('README.md', 'main')
        .mockResolvedValue(buildGitHubFileRaw('some-content'));
      mockPullRequests(
        github,
        [],
        [
          {
            number: 22,
            title: 'pr title1',
            body: new PullRequestBody([]).toString(),
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            labels: ['autorelease: pending'],
            files: [],
          },
        ]
      );
      const manifest = new Manifest(
        github,
        'main',
        {
          'path/a': {
            releaseType: 'node',
            component: 'pkg1',
          },
          'path/b': {
            releaseType: 'node',
            component: 'pkg2',
          },
        },
        {
          'path/a': Version.parse('1.0.0'),
          'path/b': Version.parse('0.2.3'),
        },
        {
          separatePullRequests: true,
          plugins: ['node-workspace'],
        }
      );
      jest.spyOn(manifest, 'buildPullRequests').mockResolvedValue([
        {
          title: PullRequestTitle.ofTargetBranch('main'),
          body: new PullRequestBody([
            {
              notes: 'Some release notes',
            },
          ]),
          updates: [
            {
              path: 'README.md',
              createIfMissing: false,
              updater: new RawContent('some raw content'),
            },
          ],
          labels: [],
          headRefName: 'release-please/branches/main',
          draft: false,
        },
      ]);
      const pullRequestNumbers = await manifest.createPullRequests();
      expect(pullRequestNumbers).toHaveLength(0);
    });

    it('reopens snoozed, closed pull request if there are changes', async () => {
      when(jest.spyOn(github, 'getFileContentsOnBranch'))
        .calledWith('README.md', 'main')
        .mockResolvedValue(buildGitHubFileRaw('some-content'));
      stubSuggesterWithSnapshot();
      mockPullRequests(
        github,
        [],
        [],
        [
          {
            number: 22,
            title: 'pr title1',
            body: new PullRequestBody([]).toString(),
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            labels: ['autorelease: pending', 'autorelease: snooze'],
            files: [],
          },
        ]
      );
      when(jest.spyOn(github, 'updatePullRequest'))
        .calledWith(22, expect.anything(), expect.anything(), expect.anything())
        .mockResolvedValue({
          number: 22,
          title: 'pr title1',
          body: 'pr body1',
          headBranchName: 'release-please/branches/main',
          baseBranchName: 'main',
          labels: [],
          files: [],
        });
      const manifest = new Manifest(
        github,
        'main',
        {
          'path/a': {
            releaseType: 'node',
            component: 'pkg1',
          },
          'path/b': {
            releaseType: 'node',
            component: 'pkg2',
          },
        },
        {
          'path/a': Version.parse('1.0.0'),
          'path/b': Version.parse('0.2.3'),
        },
        {
          separatePullRequests: true,
          plugins: ['node-workspace'],
        }
      );
      jest.spyOn(manifest, 'buildPullRequests').mockResolvedValue([
        {
          title: PullRequestTitle.ofTargetBranch('main'),
          body: new PullRequestBody([
            {
              notes: 'Some release notes',
            },
          ]),
          updates: [
            {
              path: 'README.md',
              createIfMissing: false,
              updater: new RawContent('some raw content'),
            },
          ],
          labels: [],
          headRefName: 'release-please/branches/main',
          draft: false,
        },
      ]);
      const removeLabelsStub = jest
        .spyOn(github, 'removeIssueLabels')
        .mockResolvedValue();
      const pullRequestNumbers = await manifest.createPullRequests();
      expect(pullRequestNumbers).toHaveLength(1);
      expect(removeLabelsStub).toHaveBeenCalledOnce();
    });

    it('ignores snoozed, closed pull request if there are no changes', async () => {
      const body = new PullRequestBody([
        {
          notes: '## 1.1.0\n\nSome release notes',
        },
      ]);
      when(jest.spyOn(github, 'getFileContentsOnBranch'))
        .calledWith('README.md', 'main')
        .mockResolvedValue(buildGitHubFileRaw('some-content'));
      mockPullRequests(
        github,
        [],
        [],
        [
          {
            number: 22,
            title: 'pr title1',
            body: body.toString(),
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            labels: ['autorelease: closed', 'autorelease: snooze'],
            files: [],
          },
        ]
      );
      const manifest = new Manifest(
        github,
        'main',
        {
          'path/a': {
            releaseType: 'node',
            component: 'pkg1',
          },
          'path/b': {
            releaseType: 'node',
            component: 'pkg2',
          },
        },
        {
          'path/a': Version.parse('1.0.0'),
          'path/b': Version.parse('0.2.3'),
        },
        {
          separatePullRequests: true,
          plugins: ['node-workspace'],
        }
      );
      jest.spyOn(manifest, 'buildPullRequests').mockResolvedValue([
        {
          title: PullRequestTitle.ofTargetBranch('main'),
          body,
          updates: [
            {
              path: 'README.md',
              createIfMissing: false,
              updater: new RawContent('some raw content'),
            },
          ],
          labels: [],
          headRefName: 'release-please/branches/main',
          draft: false,
        },
      ]);
      const pullRequestNumbers = await manifest.createPullRequests();
      expect(pullRequestNumbers).toHaveLength(0);
    });
  });

  describe('buildReleases', () => {
    it('should handle a single manifest release', async () => {
      mockPullRequests(
        github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody('release-notes/single-manifest.txt'),
            labels: ['autorelease: pending'],
            files: [],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-cloud/release-brancher'})
          )
        );
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
          },
        },
        {
          '.': Version.parse('1.3.1'),
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).toHaveLength(1);
      expect(releases[0].tag.toString()).toEqual('release-brancher-v1.3.1');
      expect(releases[0].sha).toEqual('abc123');
      expect(releases[0].notes).toBeString();
      expect(releases[0].notes).toStartWith('### Bug Fixes');
      expect(releases[0].path).toEqual('.');
      expect(releases[0].name).toEqual('release-brancher: v1.3.1');
      expect(releases[0].draft).toBeUndefined();
      expect(releases[0].prerelease).toBeUndefined();
    });

    it('should handle a multiple manifest release', async () => {
      mockPullRequests(
        github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody('release-notes/multiple.txt'),
            labels: ['autorelease: pending'],
            files: [
              'packages/bot-config-utils/package.json',
              'packages/label-utils/package.json',
              'packages/object-selector/package.json',
              'packages/datastore-lock/package.json',
            ],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('packages/bot-config-utils/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/bot-config-utils'})
          )
        )
        .calledWith('packages/label-utils/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/label-utils'})
          )
        )
        .calledWith('packages/object-selector/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/object-selector'})
          )
        )
        .calledWith('packages/datastore-lock/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/datastore-lock'})
          )
        );
      const manifest = new Manifest(
        github,
        'main',
        {
          'packages/bot-config-utils': {
            releaseType: 'node',
          },
          'packages/label-utils': {
            releaseType: 'node',
          },
          'packages/object-selector': {
            releaseType: 'node',
          },
          'packages/datastore-lock': {
            releaseType: 'node',
          },
        },
        {
          'packages/bot-config-utils': Version.parse('3.1.4'),
          'packages/label-utils': Version.parse('1.0.1'),
          'packages/object-selector': Version.parse('1.0.2'),
          'packages/datastore-lock': Version.parse('2.0.0'),
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).toHaveLength(4);
      expect(releases[0].tag.toString()).toEqual('bot-config-utils-v3.2.0');
      expect(releases[0].sha).toEqual('abc123');
      expect(releases[0].notes).toBeString();
      expect(releases[0].notes).toStartWith('### Features');
      expect(releases[0].path).toEqual('packages/bot-config-utils');
      expect(releases[0].name).toEqual('bot-config-utils: v3.2.0');
      expect(releases[1].tag.toString()).toEqual('label-utils-v1.1.0');
      expect(releases[1].sha).toEqual('abc123');
      expect(releases[1].notes).toBeString();
      expect(releases[1].notes).toStartWith('### Features');
      expect(releases[1].path).toEqual('packages/label-utils');
      expect(releases[1].name).toEqual('label-utils: v1.1.0');
      expect(releases[2].tag.toString()).toEqual('object-selector-v1.1.0');
      expect(releases[2].sha).toEqual('abc123');
      expect(releases[2].notes).toBeString();
      expect(releases[2].notes).toStartWith('### Features');
      expect(releases[2].path).toEqual('packages/object-selector');
      expect(releases[2].name).toEqual('object-selector: v1.1.0');
      expect(releases[3].tag.toString()).toEqual('datastore-lock-v2.1.0');
      expect(releases[3].sha).toEqual('abc123');
      expect(releases[3].notes).toBeString();
      expect(releases[3].notes).toStartWith('### Features');
      expect(releases[3].path).toEqual('packages/datastore-lock');
      expect(releases[3].name).toEqual('datastore-lock: v2.1.0');
    });

    it('should handle a mixed manifest release', async () => {
      mockPullRequests(
        github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody(
              'release-notes/mixed-componentless-manifest.txt'
            ),
            labels: ['autorelease: pending'],
            files: [
              'packages/bot-config-utils/package.json',
              'packages/label-utils/package.json',
            ],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('packages/bot-config-utils/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/bot-config-utils'})
          )
        )
        .calledWith('packages/label-utils/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/label-utils'})
          )
        );
      const manifest = new Manifest(
        github,
        'main',
        {
          'packages/bot-config-utils': {
            releaseType: 'node',
            includeComponentInTag: false,
          },
          'packages/label-utils': {
            releaseType: 'node',
          },
        },
        {
          'packages/bot-config-utils': Version.parse('3.1.4'),
          'packages/label-utils': Version.parse('1.0.1'),
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).toHaveLength(2);
      expect(releases[0].tag.toString()).toEqual('v3.2.0');
      expect(releases[0].sha).toEqual('abc123');
      expect(releases[0].notes).toBeString();
      expect(releases[0].notes).toStartWith('### Features');
      expect(releases[0].path).toEqual('packages/bot-config-utils');
      expect(releases[0].name).toEqual('v3.2.0');
      expect(releases[1].tag.toString()).toEqual('label-utils-v1.1.0');
      expect(releases[1].sha).toEqual('abc123');
      expect(releases[1].notes).toBeString();
      expect(releases[1].notes).toStartWith('### Features');
      expect(releases[1].path).toEqual('packages/label-utils');
      expect(releases[1].name).toEqual('label-utils: v1.1.0');
    });

    it('should handle a single standalone release', async () => {
      mockPullRequests(
        github,
        [],
        [
          {
            headBranchName: 'release-please--branches--main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore(main): release 3.2.7',
            body: pullRequestBody('release-notes/single.txt'),
            labels: ['autorelease: pending'],
            files: [],
            sha: 'abc123',
          },
        ]
      );
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'simple',
          },
        },
        {
          '.': Version.parse('3.2.6'),
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).toHaveLength(1);
      expect(releases[0].tag.toString()).toEqual('v3.2.7');
      expect(releases[0].sha).toEqual('abc123');
      expect(releases[0].notes).toBeString();
      expect(releases[0].notes).toStartWith('### [3.2.7]');
      expect(releases[0].path).toEqual('.');
      expect(releases[0].name).toEqual('v3.2.7');
      expect(releases[0].draft).toBeUndefined();
      expect(releases[0].prerelease).toBeUndefined();
    });

    it('should handle a single component release', async () => {
      mockPullRequests(
        github,
        [],
        [
          {
            headBranchName: 'release-please--branches--main--components--foo',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore(main): release 3.2.7',
            body: pullRequestBody('release-notes/single.txt'),
            labels: ['autorelease: pending'],
            files: [],
            sha: 'abc123',
          },
        ]
      );
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'simple',
            component: 'foo',
            includeComponentInTag: false,
          },
        },
        {
          '.': Version.parse('3.2.6'),
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).toHaveLength(1);
      expect(releases[0].tag.toString()).toEqual('v3.2.7');
      expect(releases[0].sha).toEqual('abc123');
      expect(releases[0].notes).toBeString();
      expect(releases[0].notes).toStartWith('### [3.2.7]');
      expect(releases[0].path).toEqual('.');
      expect(releases[0].name).toEqual('v3.2.7');
      expect(releases[0].draft).toBeUndefined();
      expect(releases[0].prerelease).toBeUndefined();
    });

    it('should allow skipping releases', async () => {
      mockPullRequests(
        github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody('release-notes/multiple.txt'),
            labels: ['autorelease: pending'],
            files: [
              'packages/bot-config-utils/package.json',
              'packages/label-utils/package.json',
              'packages/object-selector/package.json',
              'packages/datastore-lock/package.json',
            ],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('packages/bot-config-utils/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/bot-config-utils'})
          )
        )
        .calledWith('packages/label-utils/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/label-utils'})
          )
        )
        .calledWith('packages/object-selector/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/object-selector'})
          )
        )
        .calledWith('packages/datastore-lock/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/datastore-lock'})
          )
        );
      const manifest = new Manifest(
        github,
        'main',
        {
          'packages/bot-config-utils': {
            releaseType: 'node',
          },
          'packages/label-utils': {
            releaseType: 'node',
          },
          'packages/object-selector': {
            releaseType: 'node',
            skipGithubRelease: true,
          },
          'packages/datastore-lock': {
            releaseType: 'node',
          },
        },
        {
          'packages/bot-config-utils': Version.parse('3.1.4'),
          'packages/label-utils': Version.parse('1.0.1'),
          'packages/object-selector': Version.parse('1.0.2'),
          'packages/datastore-lock': Version.parse('2.0.0'),
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).toHaveLength(3);
      expect(releases[0].tag.toString()).toEqual('bot-config-utils-v3.2.0');
      expect(releases[0].sha).toEqual('abc123');
      expect(releases[0].notes).toBeString();
      expect(releases[0].notes).toSatisfy((msg: string) =>
        msg.startsWith('### Features')
      );
      expect(releases[1].tag.toString()).toEqual('label-utils-v1.1.0');
      expect(releases[1].sha).toEqual('abc123');
      expect(releases[1].notes).toBeString();
      expect(releases[1].notes).toSatisfy((msg: string) =>
        msg.startsWith('### Features')
      );
      expect(releases[2].tag.toString()).toEqual('datastore-lock-v2.1.0');
      expect(releases[2].sha).toEqual('abc123');
      expect(releases[2].notes).toBeString();
      expect(releases[2].notes).toSatisfy((msg: string) =>
        msg.startsWith('### Features')
      );
    });

    it('should build draft releases', async () => {
      mockPullRequests(
        github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody('release-notes/single-manifest.txt'),
            labels: ['autorelease: pending'],
            files: [],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-cloud/release-brancher'})
          )
        );
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
            draft: true,
          },
        },
        {
          '.': Version.parse('1.3.1'),
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).toHaveLength(1);
      expect(releases[0].name).toEqual('release-brancher: v1.3.1');
      expect(releases[0].draft).toBe(true);
      expect(releases[0].prerelease).toBeUndefined();
    });

    it('should build draft releases manifest wide', async () => {
      mockPullRequests(
        github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody('release-notes/single-manifest.txt'),
            labels: ['autorelease: pending'],
            files: [],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-cloud/release-brancher'})
          )
        );
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
          },
        },
        {
          '.': Version.parse('1.3.1'),
        },
        {
          draft: true,
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).toHaveLength(1);
      expect(releases[0].name).toEqual('release-brancher: v1.3.1');
      expect(releases[0].draft).toBe(true);
      expect(releases[0].prerelease).toBeUndefined();
    });

    it('should build prerelease releases from beta', async () => {
      mockPullRequests(
        github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody(
              'release-notes/single-manifest-prerelease.txt'
            ),
            labels: ['autorelease: pending'],
            files: [''],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-cloud/release-brancher'})
          )
        );
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
            prerelease: true,
          },
        },
        {
          '.': Version.parse('1.3.0'),
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).toHaveLength(1);
      expect(releases[0].name).toEqual('release-brancher: v1.3.1-beta1');
      expect(releases[0].draft).toBeUndefined();
      expect(releases[0].prerelease).toBe(true);
      expect(releases[0].tag.toString()).toEqual(
        'release-brancher-v1.3.1-beta1'
      );
    });

    it('should build prerelease releases from pre-major', async () => {
      mockPullRequests(
        github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody(
              'release-notes/single-manifest-pre-major.txt'
            ),
            labels: ['autorelease: pending'],
            files: [''],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-cloud/release-brancher'})
          )
        );
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
            prerelease: true,
          },
        },
        {
          '.': Version.parse('0.1.0'),
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).toHaveLength(1);
      expect(releases[0].name).toEqual('release-brancher: v0.2.0');
      expect(releases[0].draft).toBeUndefined();
      expect(releases[0].prerelease).toBe(true);
      expect(releases[0].tag.toString()).toEqual('release-brancher-v0.2.0');
    });

    it('should not build prerelease releases from non-prerelease', async () => {
      mockPullRequests(
        github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody('release-notes/single-manifest.txt'),
            labels: ['autorelease: pending'],
            files: [''],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-cloud/release-brancher'})
          )
        );
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
            prerelease: true,
          },
        },
        {
          '.': Version.parse('1.3.0'),
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).toHaveLength(1);
      expect(releases[0].name).toEqual('release-brancher: v1.3.1');
      expect(releases[0].draft).toBeUndefined();
      expect(releases[0].prerelease).toBe(false);
      expect(releases[0].tag.toString()).toEqual('release-brancher-v1.3.1');
    });

    it('should skip component in tag', async () => {
      mockPullRequests(
        github,
        [],
        [
          {
            headBranchName:
              'release-please--branches--main--components--release-brancher',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore(main): release v1.3.1',
            body: pullRequestBody('release-notes/single.txt'),
            labels: ['autorelease: pending'],
            files: [],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-cloud/release-brancher'})
          )
        );
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
            includeComponentInTag: false,
          },
        },
        {
          '.': Version.parse('1.3.0'),
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).toHaveLength(1);
      expect(releases[0].tag.toString()).toEqual('v1.3.1');
    });

    it('should handle customized pull request title', async () => {
      mockPullRequests(
        github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'release: 3.2.7',
            body: pullRequestBody('release-notes/single.txt'),
            labels: ['autorelease: pending'],
            files: [],
            sha: 'abc123',
          },
        ]
      );
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'simple',
            pullRequestTitlePattern: 'release: ${version}',
          },
        },
        {
          '.': Version.parse('3.2.6'),
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).toHaveLength(1);
      expect(releases[0].tag.toString()).toEqual('v3.2.7');
      expect(releases[0].sha).toEqual('abc123');
      expect(releases[0].notes).toBeString();
      expect(releases[0].notes).toSatisfy((msg: string) =>
        msg.startsWith('### [3.2.7]')
      );
      expect(releases[0].path).toEqual('.');
    });

    it('should skip component releases for non-component configs', async () => {
      mockPullRequests(
        github,
        [],
        [
          {
            headBranchName:
              'release-please--branches--main--components--storage',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore(main): release storage 3.2.7',
            body: pullRequestBody('release-notes/single.txt'),
            labels: ['autorelease: pending'],
            files: [],
            sha: 'abc123',
          },
        ]
      );
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'simple',
            includeComponentInTag: false,
          },
        },
        {
          '.': Version.parse('3.2.6'),
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).toHaveLength(0);
    });

    it('should handle complex title and base branch', async () => {
      mockPullRequests(
        github,
        [],
        [
          {
            headBranchName:
              'release-please--branches--hotfix/v3.1.0-bug--components--my-package-name',
            baseBranchName: 'hotfix/v3.1.0-bug',
            number: 1234,
            title: '[HOTFIX] - chore(hotfix/v3.1.0-bug): release 3.1.0-hotfix1',
            body: pullRequestBody('release-notes/single.txt'),
            labels: ['autorelease: pending'],
            files: [],
            sha: 'abc123',
          },
        ]
      );
      const manifest = new Manifest(
        github,
        'hotfix/v3.1.0-bug',
        {
          '.': {
            releaseType: 'simple',
            pullRequestTitlePattern:
              '[HOTFIX] - chore${scope}: release${component} ${version}',
            packageName: 'my-package-name',
            includeComponentInTag: false,
          },
        },
        {
          '.': Version.parse('3.1.0'),
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).toHaveLength(1);
      expect(releases[0].tag.toString()).toEqual('v3.1.0-hotfix1');
      expect(releases[0].sha).toEqual('abc123');
      expect(releases[0].notes).toBeString();
      expect(releases[0].path).toEqual('.');
    });

    it('should find the correct number of releases with a componentless tag', async () => {
      mockPullRequests(
        github,
        [],
        [
          {
            headBranchName: 'release-please--branches--main',
            baseBranchName: 'main',
            number: 2,
            title: 'chore: release v1.0.1',
            body: pullRequestBody('release-notes/grouped.txt'),
            labels: ['autorelease: pending'],
            files: [],
            sha: 'abc123',
          },
        ]
      );
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'simple',
            pullRequestTitlePattern: 'chore: release v${version}',
            component: 'base',
            includeComponentInTag: false,
          },
          api: {
            releaseType: 'simple',
            component: 'api',
          },
          chat: {
            releaseType: 'simple',
            component: 'chat',
          },
          cmds: {
            releaseType: 'simple',
            component: 'cmds',
          },
          presence: {
            releaseType: 'simple',
            component: 'presence',
          },
        },
        {
          '.': Version.parse('1.0.0'),
          api: Version.parse('1.0.0'),
          chat: Version.parse('1.0.0'),
          cmds: Version.parse('1.0.0'),
          presence: Version.parse('1.0.0'),
        },
        {
          groupPullRequestTitlePattern: 'chore: release v${version}',
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).toHaveLength(2);
    });

    it('should handle overflowing release notes', async () => {
      mockPullRequests(
        github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody('release-notes/overflow.txt'),
            labels: ['autorelease: pending'],
            files: [
              'packages/bot-config-utils/package.json',
              'packages/label-utils/package.json',
              'packages/object-selector/package.json',
              'packages/datastore-lock/package.json',
            ],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('packages/bot-config-utils/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/bot-config-utils'})
          )
        )
        .calledWith('packages/label-utils/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/label-utils'})
          )
        )
        .calledWith('packages/object-selector/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/object-selector'})
          )
        )
        .calledWith('packages/datastore-lock/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/datastore-lock'})
          )
        )
        // This branch is parsed from the overflow PR body
        .calledWith('release-notes.md', 'my-head-branch--release-notes')
        .mockResolvedValue(
          buildGitHubFileRaw(pullRequestBody('release-notes/multiple.txt'))
        );
      const manifest = new Manifest(
        github,
        'main',
        {
          'packages/bot-config-utils': {
            releaseType: 'node',
          },
          'packages/label-utils': {
            releaseType: 'node',
          },
          'packages/object-selector': {
            releaseType: 'node',
          },
          'packages/datastore-lock': {
            releaseType: 'node',
          },
        },
        {
          'packages/bot-config-utils': Version.parse('3.1.4'),
          'packages/label-utils': Version.parse('1.0.1'),
          'packages/object-selector': Version.parse('1.0.2'),
          'packages/datastore-lock': Version.parse('2.0.0'),
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).toHaveLength(4);
      expect(releases[0].tag.toString()).toEqual('bot-config-utils-v3.2.0');
      expect(releases[0].sha).toEqual('abc123');
      expect(releases[0].notes).toBeString();
      expect(releases[0].notes).toStartWith('### Features');
      expect(releases[0].path).toEqual('packages/bot-config-utils');
      expect(releases[0].name).toEqual('bot-config-utils: v3.2.0');
      expect(releases[1].tag.toString()).toEqual('label-utils-v1.1.0');
      expect(releases[1].sha).toEqual('abc123');
      expect(releases[1].notes).toBeString();
      expect(releases[1].notes).toStartWith('### Features');
      expect(releases[1].path).toEqual('packages/label-utils');
      expect(releases[1].name).toEqual('label-utils: v1.1.0');
      expect(releases[2].tag.toString()).toEqual('object-selector-v1.1.0');
      expect(releases[2].sha).toEqual('abc123');
      expect(releases[2].notes).toBeString();
      expect(releases[2].notes).toStartWith('### Features');
      expect(releases[2].path).toEqual('packages/object-selector');
      expect(releases[2].name).toEqual('object-selector: v1.1.0');
      expect(releases[3].tag.toString()).toEqual('datastore-lock-v2.1.0');
      expect(releases[3].sha).toEqual('abc123');
      expect(releases[3].notes).toBeString();
      expect(releases[3].notes).toStartWith('### Features');
      expect(releases[3].path).toEqual('packages/datastore-lock');
      expect(releases[3].name).toEqual('datastore-lock: v2.1.0');
    });
  });

  describe('createReleases', () => {
    it('jjcjr should handle a single manifest release', async () => {
      mockPullRequests(
        github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody('release-notes/single-manifest.txt'),
            labels: ['autorelease: pending'],
            files: [],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-cloud/release-brancher'})
          )
        );
      mockCreateRelease(github, [
        {id: 123456, sha: 'abc123', tagName: 'release-brancher-v1.3.1'},
      ]);
      const commentStub = jest
        .spyOn(github, 'commentOnIssue')
        .mockResolvedValue('');
      const addLabelsStub = jest
        .spyOn(github, 'addIssueLabels')
        .mockResolvedValue();
      const removeLabelsStub = jest
        .spyOn(github, 'removeIssueLabels')
        .mockResolvedValue();
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
          },
        },
        {
          '.': Version.parse('1.3.1'),
        }
      );
      const releases = await manifest.createReleases();
      expect(releases).toHaveLength(1);
      expect(releases[0]!.tagName).toEqual('release-brancher-v1.3.1');
      expect(releases[0]!.sha).toEqual('abc123');
      expect(releases[0]!.notes).toEqual('some release notes');
      expect(releases[0]!.path).toEqual('.');
      expect(commentStub).toHaveBeenCalledOnce();
      expect(addLabelsStub).toHaveBeenCalledExactlyOnceWith(
        ['autorelease: tagged'],
        1234
      );
      expect(removeLabelsStub).toHaveBeenCalledExactlyOnceWith(
        ['autorelease: pending'],
        1234
      );
    });

    it('should handle a multiple manifest release', async () => {
      mockPullRequests(
        github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody('release-notes/multiple.txt'),
            labels: ['autorelease: pending'],
            files: [
              'packages/bot-config-utils/package.json',
              'packages/label-utils/package.json',
              'packages/object-selector/package.json',
              'packages/datastore-lock/package.json',
            ],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('packages/bot-config-utils/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/bot-config-utils'})
          )
        )
        .calledWith('packages/label-utils/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/label-utils'})
          )
        )
        .calledWith('packages/object-selector/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/object-selector'})
          )
        )
        .calledWith('packages/datastore-lock/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/datastore-lock'})
          )
        );

      mockCreateRelease(github, [
        {id: 1, sha: 'abc123', tagName: 'bot-config-utils-v3.2.0'},
        {id: 2, sha: 'abc123', tagName: 'label-utils-v1.1.0'},
        {id: 3, sha: 'abc123', tagName: 'object-selector-v1.1.0'},
        {id: 4, sha: 'abc123', tagName: 'datastore-lock-v2.1.0'},
      ]);
      const commentStub = jest
        .spyOn(github, 'commentOnIssue')
        .mockResolvedValue('');
      const addLabelsStub = jest
        .spyOn(github, 'addIssueLabels')
        .mockResolvedValue();
      const removeLabelsStub = jest
        .spyOn(github, 'removeIssueLabels')
        .mockResolvedValue();
      const manifest = new Manifest(
        github,
        'main',
        {
          'packages/bot-config-utils': {
            releaseType: 'node',
          },
          'packages/label-utils': {
            releaseType: 'node',
          },
          'packages/object-selector': {
            releaseType: 'node',
          },
          'packages/datastore-lock': {
            releaseType: 'node',
          },
        },
        {
          'packages/bot-config-utils': Version.parse('3.1.4'),
          'packages/label-utils': Version.parse('1.0.1'),
          'packages/object-selector': Version.parse('1.0.2'),
          'packages/datastore-lock': Version.parse('2.0.0'),
        }
      );
      const releases = await manifest.createReleases();
      expect(releases).toHaveLength(4);
      expect(releases[0]!.tagName).toEqual('bot-config-utils-v3.2.0');
      expect(releases[0]!.sha).toEqual('abc123');
      expect(releases[0]!.notes).toBeString();
      expect(releases[0]!.path).toEqual('packages/bot-config-utils');
      expect(releases[1]!.tagName).toEqual('label-utils-v1.1.0');
      expect(releases[1]!.sha).toEqual('abc123');
      expect(releases[1]!.notes).toBeString();
      expect(releases[1]!.path).toEqual('packages/label-utils');
      expect(releases[2]!.tagName).toEqual('object-selector-v1.1.0');
      expect(releases[2]!.sha).toEqual('abc123');
      expect(releases[2]!.notes).toBeString();
      expect(releases[2]!.path).toEqual('packages/object-selector');
      expect(releases[3]!.tagName).toEqual('datastore-lock-v2.1.0');
      expect(releases[3]!.sha).toEqual('abc123');
      expect(releases[3]!.notes).toBeString();
      expect(releases[3]!.path).toEqual('packages/datastore-lock');
      expect(commentStub).toHaveBeenCalledTimes(4);
      expect(addLabelsStub).toHaveBeenCalledExactlyOnceWith(
        ['autorelease: tagged'],
        1234
      );
      expect(removeLabelsStub).toHaveBeenCalledExactlyOnceWith(
        ['autorelease: pending'],
        1234
      );
    });

    it('should handle a single standalone release', async () => {
      mockPullRequests(
        github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore(main): release 3.2.7',
            body: pullRequestBody('release-notes/single.txt'),
            labels: ['autorelease: pending'],
            files: [],
            sha: 'abc123',
          },
        ]
      );
      const commentStub = jest
        .spyOn(github, 'commentOnIssue')
        .mockResolvedValue('');
      const addLabelsStub = jest
        .spyOn(github, 'addIssueLabels')
        .mockResolvedValue();
      const removeLabelsStub = jest
        .spyOn(github, 'removeIssueLabels')
        .mockResolvedValue();
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'simple',
          },
        },
        {
          '.': Version.parse('3.2.6'),
        }
      );
      mockCreateRelease(github, [
        {id: 123456, sha: 'abc123', tagName: 'v3.2.7'},
      ]);
      const releases = await manifest.createReleases();
      expect(releases).toHaveLength(1);
      expect(releases[0]!.tagName).toEqual('v3.2.7');
      expect(releases[0]!.sha).toEqual('abc123');
      expect(releases[0]!.notes).toBeString();
      expect(releases[0]!.path).toEqual('.');
      expect(commentStub).toHaveBeenCalledOnce();
      expect(addLabelsStub).toHaveBeenCalledExactlyOnceWith(
        ['autorelease: tagged'],
        1234
      );
      expect(removeLabelsStub).toHaveBeenCalledExactlyOnceWith(
        ['autorelease: pending'],
        1234
      );
    });

    it('should allow customizing pull request labels', async () => {
      mockPullRequests(
        github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody('release-notes/single-manifest.txt'),
            labels: ['some-pull-request-label'],
            files: [],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-cloud/release-brancher'})
          )
        );
      mockCreateRelease(github, [
        {id: 123456, sha: 'abc123', tagName: 'release-brancher-v1.3.1'},
      ]);
      const commentStub = jest
        .spyOn(github, 'commentOnIssue')
        .mockResolvedValue('');
      const addLabelsStub = jest
        .spyOn(github, 'addIssueLabels')
        .mockResolvedValue();
      const removeLabelsStub = jest
        .spyOn(github, 'removeIssueLabels')
        .mockResolvedValue();
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
          },
        },
        {
          '.': Version.parse('1.3.1'),
        },
        {
          labels: ['some-pull-request-label'],
          releaseLabels: ['some-tagged-label'],
        }
      );
      const releases = await manifest.createReleases();
      expect(releases).toHaveLength(1);
      expect(releases[0]!.tagName).toEqual('release-brancher-v1.3.1');
      expect(releases[0]!.sha).toEqual('abc123');
      expect(releases[0]!.notes).toEqual('some release notes');
      expect(commentStub).toHaveBeenCalledOnce();
      expect(addLabelsStub).toHaveBeenCalledExactlyOnceWith(
        ['some-tagged-label'],
        1234
      );
      expect(removeLabelsStub).toHaveBeenCalledExactlyOnceWith(
        ['some-pull-request-label'],
        1234
      );
    });

    it('should create a draft release', async () => {
      mockPullRequests(
        github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody('release-notes/single-manifest.txt'),
            labels: ['autorelease: pending'],
            files: [],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-cloud/release-brancher'})
          )
        );
      const githubReleaseStub = mockCreateRelease(github, [
        {
          id: 123456,
          sha: 'abc123',
          tagName: 'release-brancher-v1.3.1',
          draft: true,
        },
      ]);
      const commentStub = jest
        .spyOn(github, 'commentOnIssue')
        .mockResolvedValue('');
      const addLabelsStub = jest
        .spyOn(github, 'addIssueLabels')
        .mockResolvedValue();
      const removeLabelsStub = jest
        .spyOn(github, 'removeIssueLabels')
        .mockResolvedValue();
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
            draft: true,
          },
        },
        {
          '.': Version.parse('1.3.1'),
        }
      );
      const releases = await manifest.createReleases();
      expect(releases).toHaveLength(1);
      expect(releases[0]!.tagName).toEqual('release-brancher-v1.3.1');
      expect(releases[0]!.sha).toEqual('abc123');
      expect(releases[0]!.notes).toEqual('some release notes');
      expect(releases[0]!.draft).toBe(true);
      expect(githubReleaseStub).toHaveBeenCalledExactlyOnceWith(
        expect.anything(),
        {
          draft: true,
          prerelease: undefined,
        } as ReleaseOptions
      );
      expect(commentStub).toHaveBeenCalledOnce();
      expect(addLabelsStub).toHaveBeenCalledExactlyOnceWith(
        ['autorelease: tagged'],
        1234
      );
      expect(removeLabelsStub).toHaveBeenCalledExactlyOnceWith(
        ['autorelease: pending'],
        1234
      );
    });

    it('should create a prerelease release from beta', async () => {
      mockPullRequests(
        github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody(
              'release-notes/single-manifest-prerelease.txt'
            ),
            labels: ['autorelease: pending'],
            files: [],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-cloud/release-brancher'})
          )
        );
      const githubReleaseStub = mockCreateRelease(github, [
        {
          id: 123456,
          sha: 'abc123',
          tagName: 'release-brancher-v1.3.1-beta1',
          prerelease: true,
        },
      ]);
      const commentStub = jest
        .spyOn(github, 'commentOnIssue')
        .mockResolvedValue('');
      const addLabelsStub = jest
        .spyOn(github, 'addIssueLabels')
        .mockResolvedValue();
      const removeLabelsStub = jest
        .spyOn(github, 'removeIssueLabels')
        .mockResolvedValue();
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
            prerelease: true,
          },
        },
        {
          '.': Version.parse('1.3.1'),
        }
      );
      const releases = await manifest.createReleases();
      expect(releases).toHaveLength(1);
      expect(releases[0]!.tagName).toEqual('release-brancher-v1.3.1-beta1');
      expect(releases[0]!.sha).toEqual('abc123');
      expect(releases[0]!.notes).toEqual('some release notes');
      expect(releases[0]!.draft).toBeUndefined();
      expect(githubReleaseStub).toHaveBeenCalledExactlyOnceWith(
        expect.anything(),
        {
          draft: undefined,
          prerelease: true,
        } as ReleaseOptions
      );
      expect(commentStub).toHaveBeenCalledOnce();
      expect(addLabelsStub).toHaveBeenCalledExactlyOnceWith(
        ['autorelease: tagged'],
        1234
      );
      expect(removeLabelsStub).toHaveBeenCalledExactlyOnceWith(
        ['autorelease: pending'],
        1234
      );
    });

    it('should not create a prerelease release from non-prerelease', async () => {
      mockPullRequests(
        github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody('release-notes/single-manifest.txt'),
            labels: ['autorelease: pending'],
            files: [],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-cloud/release-brancher'})
          )
        );
      const githubReleaseStub = mockCreateRelease(github, [
        {
          id: 123456,
          sha: 'abc123',
          tagName: 'release-brancher-v1.3.1',
          prerelease: false,
        },
      ]);
      const commentStub = jest
        .spyOn(github, 'commentOnIssue')
        .mockResolvedValue('');
      const addLabelsStub = jest
        .spyOn(github, 'addIssueLabels')
        .mockResolvedValue();
      const removeLabelsStub = jest
        .spyOn(github, 'removeIssueLabels')
        .mockResolvedValue();
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
            prerelease: true,
          },
        },
        {
          '.': Version.parse('1.3.1'),
        }
      );
      const releases = await manifest.createReleases();
      expect(releases).toHaveLength(1);
      expect(releases[0]!.tagName).toEqual('release-brancher-v1.3.1');
      expect(releases[0]!.sha).toEqual('abc123');
      expect(releases[0]!.notes).toEqual('some release notes');
      expect(releases[0]!.draft).toBeUndefined();
      expect(githubReleaseStub).toHaveBeenCalledExactlyOnceWith(
        expect.anything(),
        {
          draft: undefined,
          prerelease: false,
        } as ReleaseOptions
      );

      expect(commentStub).toHaveBeenCalledOnce();
      expect(addLabelsStub).toHaveBeenCalledExactlyOnceWith(
        ['autorelease: tagged'],
        1234
      );
      expect(removeLabelsStub).toHaveBeenCalledExactlyOnceWith(
        ['autorelease: pending'],
        1234
      );
    });

    it('should handle partially failed manifest release', async () => {
      mockPullRequests(
        github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody('release-notes/multiple.txt'),
            labels: ['autorelease: pending'],
            files: [
              'packages/bot-config-utils/package.json',
              'packages/label-utils/package.json',
              'packages/object-selector/package.json',
              'packages/datastore-lock/package.json',
            ],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('packages/bot-config-utils/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/bot-config-utils'})
          )
        )
        .calledWith('packages/label-utils/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/label-utils'})
          )
        )
        .calledWith('packages/object-selector/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/object-selector'})
          )
        )
        .calledWith('packages/datastore-lock/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/datastore-lock'})
          )
        );

      mockCreateRelease(github, [
        {
          id: 1,
          sha: 'abc123',
          tagName: 'bot-config-utils-v3.2.0',
          duplicate: true,
        },
        {id: 2, sha: 'abc123', tagName: 'label-utils-v1.1.0'},
        {id: 3, sha: 'abc123', tagName: 'object-selector-v1.1.0'},
        {id: 4, sha: 'abc123', tagName: 'datastore-lock-v2.1.0'},
      ]);
      const commentStub = jest
        .spyOn(github, 'commentOnIssue')
        .mockResolvedValue('');
      const addLabelsStub = jest
        .spyOn(github, 'addIssueLabels')
        .mockResolvedValue();
      const removeLabelsStub = jest
        .spyOn(github, 'removeIssueLabels')
        .mockResolvedValue();
      const manifest = new Manifest(
        github,
        'main',
        {
          'packages/bot-config-utils': {
            releaseType: 'node',
          },
          'packages/label-utils': {
            releaseType: 'node',
          },
          'packages/object-selector': {
            releaseType: 'node',
          },
          'packages/datastore-lock': {
            releaseType: 'node',
          },
        },
        {
          'packages/bot-config-utils': Version.parse('3.1.4'),
          'packages/label-utils': Version.parse('1.0.1'),
          'packages/object-selector': Version.parse('1.0.2'),
          'packages/datastore-lock': Version.parse('2.0.0'),
        }
      );
      const releases = await manifest.createReleases();
      expect(releases).toHaveLength(3);
      expect(releases[0]!.tagName).toEqual('label-utils-v1.1.0');
      expect(releases[0]!.sha).toEqual('abc123');
      expect(releases[0]!.notes).toBeString();
      expect(releases[0]!.path).toEqual('packages/label-utils');
      expect(releases[1]!.tagName).toEqual('object-selector-v1.1.0');
      expect(releases[1]!.sha).toEqual('abc123');
      expect(releases[1]!.notes).toBeString();
      expect(releases[1]!.path).toEqual('packages/object-selector');
      expect(releases[2]!.tagName).toEqual('datastore-lock-v2.1.0');
      expect(releases[2]!.sha).toEqual('abc123');
      expect(releases[2]!.notes).toBeString();
      expect(releases[2]!.path).toEqual('packages/datastore-lock');
      expect(commentStub).toHaveBeenCalledTimes(3);
      expect(addLabelsStub).toHaveBeenCalledExactlyOnceWith(
        ['autorelease: tagged'],
        1234
      );
      expect(removeLabelsStub).toHaveBeenCalledExactlyOnceWith(
        ['autorelease: pending'],
        1234
      );
    });

    it('should throw DuplicateReleaseError if all releases already tagged', async () => {
      mockPullRequests(
        github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody('release-notes/multiple.txt'),
            labels: ['autorelease: pending'],
            files: [
              'packages/bot-config-utils/package.json',
              'packages/label-utils/package.json',
              'packages/object-selector/package.json',
              'packages/datastore-lock/package.json',
            ],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = jest.spyOn(github, 'getFileContentsOnBranch');
      when(getFileContentsStub)
        .calledWith('packages/bot-config-utils/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/bot-config-utils'})
          )
        )
        .calledWith('packages/label-utils/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/label-utils'})
          )
        )
        .calledWith('packages/object-selector/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/object-selector'})
          )
        )
        .calledWith('packages/datastore-lock/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/datastore-lock'})
          )
        );

      mockCreateRelease(github, [
        {
          id: 1,
          sha: 'abc123',
          tagName: 'bot-config-utils-v3.2.0',
          duplicate: true,
        },
        {
          id: 2,
          sha: 'abc123',
          tagName: 'label-utils-v1.1.0',
          duplicate: true,
        },
        {
          id: 3,
          sha: 'abc123',
          tagName: 'object-selector-v1.1.0',
          duplicate: true,
        },
        {
          id: 4,
          sha: 'abc123',
          tagName: 'datastore-lock-v2.1.0',
          duplicate: true,
        },
      ]);
      const commentStub = jest
        .spyOn(github, 'commentOnIssue')
        .mockResolvedValue('');
      const addLabelsStub = jest
        .spyOn(github, 'addIssueLabels')
        .mockResolvedValue();
      const removeLabelsStub = jest
        .spyOn(github, 'removeIssueLabels')
        .mockResolvedValue();
      const manifest = new Manifest(
        github,
        'main',
        {
          'packages/bot-config-utils': {
            releaseType: 'node',
          },
          'packages/label-utils': {
            releaseType: 'node',
          },
          'packages/object-selector': {
            releaseType: 'node',
          },
          'packages/datastore-lock': {
            releaseType: 'node',
          },
        },
        {
          'packages/bot-config-utils': Version.parse('3.1.4'),
          'packages/label-utils': Version.parse('1.0.1'),
          'packages/object-selector': Version.parse('1.0.2'),
          'packages/datastore-lock': Version.parse('2.0.0'),
        }
      );
      try {
        await manifest.createReleases();
        expect(false).toBe(true);
      } catch (err) {
        expect(err).toBeInstanceOf(DuplicateReleaseError);
      }

      expect(commentStub).not.toHaveBeenCalled();
      expect(addLabelsStub).toHaveBeenCalledOnce();
      expect(removeLabelsStub).toHaveBeenCalledOnce();
    });
  });
});
