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

import {parser, handleError} from '../src/bin/release-please';
import {
  Manifest,
  DEFAULT_RELEASE_PLEASE_CONFIG,
  DEFAULT_RELEASE_PLEASE_MANIFEST,
} from '../src/manifest';
import {GitHub} from '../src/github';
import {ParseCallback} from 'yargs';
import 'jest-extended';

// function callStub(
//   instance: Manifest,
//   method: ManifestMethod
// ): ManifestCallResult;
// function callStub(
//   instance: ReleasePR,
//   method: ReleasePRMethod
// ): ReleasePRCallResult;
// function callStub(
//   instance: GitHubRelease,
//   method: GitHubReleaseMethod
// ): GitHubReleaseCallResult;
// function callStub(
//   instance: Manifest | ReleasePR | GitHubRelease,
//   method: Method
// ): CallResult {
//   instanceToRun = instance;
//   methodCalled = method;
//   return Promise.resolve(undefined);
// }

describe('CLI', () => {
  let fakeGitHub: GitHub;
  let fakeManifest: Manifest;
  let gitHubCreateStub: jest.SpyInstance;
  beforeEach(async () => {
    fakeGitHub = await GitHub.create({
      owner: 'googleapis',
      repo: 'release-please-cli',
      defaultBranch: 'main',
    });
    fakeManifest = new Manifest(fakeGitHub, 'main', {}, {});
    gitHubCreateStub = jest
      .spyOn(GitHub, 'create')
      .mockResolvedValue(fakeGitHub);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });
  describe('handleError', () => {
    it('handles an error', async () => {
      const stack = 'bad\nmore\nbad';
      const err = {
        body: {a: 1},
        status: 404,
        message: 'bad',
        stack,
      };
      const logs: string[] = [];
      handleError.logger = {
        error: (msg: string) => logs.push(msg),
      } as unknown as Console;
      handleError.yargsArgs = {debug: true, _: ['foobar'], $0: 'mocha?'};
      handleError(err);
      expect(logs).toMatchSnapshot();
    });

    it('needs yargs', async () => {
      handleError.yargsArgs = undefined;
      expect(() => handleError({message: '', stack: ''})).toThrow(
        'Set handleError.yargsArgs with a yargs.Arguments instance.'
      );
    });
  });
  describe('manifest-pr', () => {
    let fromManifestStub: jest.SpyInstance;
    let createPullRequestsStub: jest.SpyInstance;
    beforeEach(() => {
      fromManifestStub = jest
        .spyOn(Manifest, 'fromManifest')
        .mockResolvedValue(fakeManifest);
      createPullRequestsStub = jest
        .spyOn(fakeManifest, 'createPullRequests')
        .mockResolvedValue([
          {
            title: 'fake title',
            body: 'fake body',
            headBranchName: 'head-branch-name',
            baseBranchName: 'base-branch-name',
            number: 123,
            files: [],
            labels: [],
          },
        ]);
    });

    it('instantiates a basic Manifest', async () => {
      await await parser.parseAsync(
        'manifest-pr --repo-url=googleapis/release-please-cli'
      );

      expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
        owner: 'googleapis',
        repo: 'release-please-cli',
        token: undefined,
        apiUrl: 'https://api.github.com',
        graphqlUrl: 'https://api.github.com',
      });
      expect(fromManifestStub).toHaveBeenCalledExactlyOnceWith(
        fakeGitHub,
        'main',
        DEFAULT_RELEASE_PLEASE_CONFIG,
        DEFAULT_RELEASE_PLEASE_MANIFEST,
        expect.anything()
      );
      expect(createPullRequestsStub).toHaveBeenCalledOnce();
    });

    it('instantiates Manifest with custom config/manifest', async () => {
      await parser.parseAsync(
        'manifest-pr --repo-url=googleapis/release-please-cli --config-file=foo.json --manifest-file=.bar.json'
      );

      expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
        owner: 'googleapis',
        repo: 'release-please-cli',
        token: undefined,
        apiUrl: 'https://api.github.com',
        graphqlUrl: 'https://api.github.com',
      });
      expect(fromManifestStub).toHaveBeenCalledExactlyOnceWith(
        fakeGitHub,
        'main',
        'foo.json',
        '.bar.json',
        expect.anything()
      );

      expect(createPullRequestsStub).toHaveBeenCalledOnce();
    });
    for (const flag of ['--target-branch', '--default-branch']) {
      it(`handles ${flag}`, async () => {
        await parser.parseAsync(
          `manifest-pr --repo-url=googleapis/release-please-cli ${flag}=1.x`
        );

        expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
          owner: 'googleapis',
          repo: 'release-please-cli',
          token: undefined,
          apiUrl: 'https://api.github.com',
          graphqlUrl: 'https://api.github.com',
        });
        expect(fromManifestStub).toHaveBeenCalledExactlyOnceWith(
          fakeGitHub,
          '1.x',
          DEFAULT_RELEASE_PLEASE_CONFIG,
          DEFAULT_RELEASE_PLEASE_MANIFEST,
          expect.anything()
        );
        expect(createPullRequestsStub).toHaveBeenCalledOnce();
      });
    }

    it('handles --dry-run', async () => {
      const buildPullRequestsStub = jest
        .spyOn(fakeManifest, 'buildPullRequests')
        .mockResolvedValue([]);

      await parser.parseAsync(
        'manifest-pr --repo-url=googleapis/release-please-cli --dry-run'
      );
      expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
        owner: 'googleapis',
        repo: 'release-please-cli',
        token: undefined,
        apiUrl: 'https://api.github.com',
        graphqlUrl: 'https://api.github.com',
      });
      expect(fromManifestStub).toHaveBeenCalledExactlyOnceWith(
        fakeGitHub,
        'main',
        DEFAULT_RELEASE_PLEASE_CONFIG,
        DEFAULT_RELEASE_PLEASE_MANIFEST,
        expect.anything()
      );
      expect(buildPullRequestsStub).toHaveBeenCalledOnce();
    });

    it('handles --fork', async () => {
      await parser.parseAsync(
        'manifest-pr --repo-url=googleapis/release-please-cli --fork'
      );

      expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
        owner: 'googleapis',
        repo: 'release-please-cli',
        token: undefined,
        apiUrl: 'https://api.github.com',
        graphqlUrl: 'https://api.github.com',
      });
      expect(fromManifestStub).toHaveBeenCalledExactlyOnceWith(
        fakeGitHub,
        'main',
        DEFAULT_RELEASE_PLEASE_CONFIG,
        DEFAULT_RELEASE_PLEASE_MANIFEST,
        expect.objectContaining({fork: true})
      );
      expect(createPullRequestsStub).toHaveBeenCalledOnce();
    });

    it('handles --label', async () => {
      await parser.parseAsync(
        'manifest-pr --repo-url=googleapis/release-please-cli --label=foo,bar'
      );

      expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
        owner: 'googleapis',
        repo: 'release-please-cli',
        token: undefined,
        apiUrl: 'https://api.github.com',
        graphqlUrl: 'https://api.github.com',
      });
      expect(fromManifestStub).toHaveBeenCalledExactlyOnceWith(
        fakeGitHub,
        'main',
        DEFAULT_RELEASE_PLEASE_CONFIG,
        DEFAULT_RELEASE_PLEASE_MANIFEST,
        expect.objectContaining({labels: ['foo', 'bar']})
      );
      expect(createPullRequestsStub).toHaveBeenCalledOnce();
    });

    it('handles empty --label', async () => {
      await parser.parseAsync(
        'manifest-pr --repo-url=googleapis/release-please-cli --label='
      );

      expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
        owner: 'googleapis',
        repo: 'release-please-cli',
        token: undefined,
        apiUrl: 'https://api.github.com',
        graphqlUrl: 'https://api.github.com',
      });
      expect(fromManifestStub).toHaveBeenCalledExactlyOnceWith(
        fakeGitHub,
        'main',
        DEFAULT_RELEASE_PLEASE_CONFIG,
        DEFAULT_RELEASE_PLEASE_MANIFEST,
        expect.objectContaining({labels: []})
      );
      expect(createPullRequestsStub).toHaveBeenCalledOnce();
    });

    it('handles --skip-labeling', async () => {
      await parser.parseAsync(
        'manifest-pr --repo-url=googleapis/release-please-cli --skip-labeling'
      );

      expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
        owner: 'googleapis',
        repo: 'release-please-cli',
        token: undefined,
        apiUrl: 'https://api.github.com',
        graphqlUrl: 'https://api.github.com',
      });
      expect(fromManifestStub).toHaveBeenCalledExactlyOnceWith(
        fakeGitHub,
        'main',
        DEFAULT_RELEASE_PLEASE_CONFIG,
        DEFAULT_RELEASE_PLEASE_MANIFEST,
        expect.objectContaining({skipLabeling: true})
      );
      expect(createPullRequestsStub).toHaveBeenCalledOnce();
    });

    // it('handles --draft', async () => {
    //   await parser.parseAsync(
    //     'manifest-pr --repo-url=googleapis/release-please-cli --draft'
    //   );

    //   expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
    //     owner: 'googleapis',
    //     repo: 'release-please-cli',
    //     token: undefined,
    //     apiUrl: 'https://api.github.com',
    //     graphqlUrl: 'https://api.github.com',
    //   });
    //   sinon.assert.calledOnceWithExactly(
    //     fromManifestStub,
    //     fakeGitHub,
    //     'main',
    //     DEFAULT_RELEASE_PLEASE_CONFIG,
    //     DEFAULT_RELEASE_PLEASE_MANIFEST,
    //     {draft: true},
    //   );
    //   sinon.assert.calledOnce(createPullRequestsStub);
    // });

    it('handles --signoff', async () => {
      await parser.parseAsync(
        'manifest-pr --repo-url=googleapis/release-please-cli --signoff="Alice <alice@example.com>"'
      );

      expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
        owner: 'googleapis',
        repo: 'release-please-cli',
        token: undefined,
        apiUrl: 'https://api.github.com',
        graphqlUrl: 'https://api.github.com',
      });
      expect(fromManifestStub).toHaveBeenCalledExactlyOnceWith(
        fakeGitHub,
        'main',
        DEFAULT_RELEASE_PLEASE_CONFIG,
        DEFAULT_RELEASE_PLEASE_MANIFEST,
        expect.objectContaining({signoff: 'Alice <alice@example.com>'})
      );
      expect(createPullRequestsStub).toHaveBeenCalledOnce();
    });
  });
  describe('manifest-release', () => {
    let fromManifestStub: jest.SpyInstance;
    let createReleasesStub: jest.SpyInstance;
    beforeEach(() => {
      fromManifestStub = jest
        .spyOn(Manifest, 'fromManifest')
        .mockResolvedValue(fakeManifest);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      createReleasesStub = jest
        .spyOn(fakeManifest, 'createReleases')
        .mockResolvedValue([
          {
            id: 123456,
            tagName: 'v1.2.3',
            sha: 'abc123',
            notes: 'some release notes',
            url: 'url-of-release',
            path: '.',
            version: 'v1.2.3',
            major: 1,
            minor: 2,
            patch: 3,
          },
        ]);
    });

    it('instantiates a basic Manifest', async () => {
      await parser.parseAsync(
        'manifest-release --repo-url=googleapis/release-please-cli'
      );

      expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
        owner: 'googleapis',
        repo: 'release-please-cli',
        token: undefined,
        apiUrl: 'https://api.github.com',
        graphqlUrl: 'https://api.github.com',
      });
      expect(fromManifestStub).toHaveBeenCalledExactlyOnceWith(
        fakeGitHub,
        'main',
        DEFAULT_RELEASE_PLEASE_CONFIG,
        DEFAULT_RELEASE_PLEASE_MANIFEST,
        expect.anything()
      );
      expect(createReleasesStub).toHaveBeenCalledOnce();
    });

    it('instantiates Manifest with custom config/manifest', async () => {
      await parser.parseAsync(
        'manifest-release --repo-url=googleapis/release-please-cli --config-file=foo.json --manifest-file=.bar.json'
      );

      expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
        owner: 'googleapis',
        repo: 'release-please-cli',
        token: undefined,
        apiUrl: 'https://api.github.com',
        graphqlUrl: 'https://api.github.com',
      });
      expect(fromManifestStub).toHaveBeenCalledExactlyOnceWith(
        fakeGitHub,
        'main',
        'foo.json',
        '.bar.json',
        expect.anything()
      );
      expect(createReleasesStub).toHaveBeenCalledOnce();
    });
    for (const flag of ['--target-branch', '--default-branch']) {
      it(`handles ${flag}`, async () => {
        await parser.parseAsync(
          `manifest-release --repo-url=googleapis/release-please-cli ${flag}=1.x`
        );

        expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
          owner: 'googleapis',
          repo: 'release-please-cli',
          token: undefined,
          apiUrl: 'https://api.github.com',
          graphqlUrl: 'https://api.github.com',
        });
        expect(fromManifestStub).toHaveBeenCalledExactlyOnceWith(
          fakeGitHub,
          '1.x',
          DEFAULT_RELEASE_PLEASE_CONFIG,
          DEFAULT_RELEASE_PLEASE_MANIFEST,
          expect.anything()
        );
        expect(createReleasesStub).toHaveBeenCalledOnce();
      });
    }

    it('handles --dry-run', async () => {
      const buildReleasesStub = jest
        .spyOn(fakeManifest, 'buildReleases')
        .mockResolvedValue([]);

      await parser.parseAsync(
        'manifest-release --repo-url=googleapis/release-please-cli --dry-run'
      );

      expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
        owner: 'googleapis',
        repo: 'release-please-cli',
        token: undefined,
        apiUrl: 'https://api.github.com',
        graphqlUrl: 'https://api.github.com',
      });
      expect(fromManifestStub).toHaveBeenCalledExactlyOnceWith(
        fakeGitHub,
        'main',
        DEFAULT_RELEASE_PLEASE_CONFIG,
        DEFAULT_RELEASE_PLEASE_MANIFEST,
        expect.anything()
      );
      expect(buildReleasesStub).toHaveBeenCalledOnce();
    });

    it('handles --label and --release-label', async () => {
      await parser.parseAsync(
        'manifest-release --repo-url=googleapis/release-please-cli --label=foo,bar --release-label=asdf,qwer'
      );

      expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
        owner: 'googleapis',
        repo: 'release-please-cli',
        token: undefined,
        apiUrl: 'https://api.github.com',
        graphqlUrl: 'https://api.github.com',
      });
      expect(fromManifestStub).toHaveBeenCalledExactlyOnceWith(
        fakeGitHub,
        'main',
        DEFAULT_RELEASE_PLEASE_CONFIG,
        DEFAULT_RELEASE_PLEASE_MANIFEST,
        expect.objectContaining({
          labels: ['foo', 'bar'],
          releaseLabels: ['asdf', 'qwer'],
        })
      );
      expect(createReleasesStub).toHaveBeenCalledOnce();
    });

    it('handles --draft', async () => {
      await parser.parseAsync(
        'manifest-release --repo-url=googleapis/release-please-cli --draft'
      );

      expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
        owner: 'googleapis',
        repo: 'release-please-cli',
        token: undefined,
        apiUrl: 'https://api.github.com',
        graphqlUrl: 'https://api.github.com',
      });
      expect(fromManifestStub).toHaveBeenCalledExactlyOnceWith(
        fakeGitHub,
        'main',
        DEFAULT_RELEASE_PLEASE_CONFIG,
        DEFAULT_RELEASE_PLEASE_MANIFEST,
        expect.objectContaining({draft: true})
      );
      expect(createReleasesStub).toHaveBeenCalledOnce();
    });

    // it('handles --release-as', async () => {
    //   await parser.parseAsync(
    //     'manifest-release --repo-url=googleapis/release-please-cli --release-as=2.3.4'
    //   );

    //   expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
    //     owner: 'googleapis',
    //     repo: 'release-please-cli',
    //     token: undefined,
    //     apiUrl: 'https://api.github.com',
    //     graphqlUrl: 'https://api.github.com',
    //   });
    //   sinon.assert.calledOnceWithExactly(
    //     fromManifestStub,
    //     fakeGitHub,
    //     'main',
    //     DEFAULT_RELEASE_PLEASE_CONFIG,
    //     DEFAULT_RELEASE_PLEASE_MANIFEST,
    //     expect.objectContaining({releaseAs: '2.3.4'}),
    //   );
    //   sinon.assert.calledOnce(createReleasesStub);
    // });
  });
  describe('release-pr', () => {
    describe('with manifest options', () => {
      let fromManifestStub: jest.SpyInstance;
      let createPullRequestsStub: jest.SpyInstance;
      beforeEach(() => {
        fromManifestStub = jest
          .spyOn(Manifest, 'fromManifest')
          .mockResolvedValue(fakeManifest);
        createPullRequestsStub = jest
          .spyOn(fakeManifest, 'createPullRequests')
          .mockResolvedValue([
            {
              title: 'fake title',
              body: 'fake body',
              headBranchName: 'head-branch-name',
              baseBranchName: 'base-branch-name',
              number: 123,
              files: [],
              labels: [],
            },
          ]);
      });

      it('instantiates a basic Manifest', async () => {
        await parser.parseAsync(
          'release-pr --repo-url=googleapis/release-please-cli'
        );

        expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
          owner: 'googleapis',
          repo: 'release-please-cli',
          token: undefined,
          apiUrl: 'https://api.github.com',
          graphqlUrl: 'https://api.github.com',
        });
        expect(fromManifestStub).toHaveBeenCalledExactlyOnceWith(
          fakeGitHub,
          'main',
          DEFAULT_RELEASE_PLEASE_CONFIG,
          DEFAULT_RELEASE_PLEASE_MANIFEST,
          expect.anything(),
          undefined,
          undefined
        );
        expect(createPullRequestsStub).toHaveBeenCalledOnce();
      });

      it('instantiates Manifest with custom config/manifest', async () => {
        await parser.parseAsync(
          'release-pr --repo-url=googleapis/release-please-cli --config-file=foo.json --manifest-file=.bar.json'
        );

        expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
          owner: 'googleapis',
          repo: 'release-please-cli',
          token: undefined,
          apiUrl: 'https://api.github.com',
          graphqlUrl: 'https://api.github.com',
        });
        expect(fromManifestStub).toHaveBeenCalledExactlyOnceWith(
          fakeGitHub,
          'main',
          'foo.json',
          '.bar.json',
          expect.anything(),
          undefined,
          undefined
        );
        expect(createPullRequestsStub).toHaveBeenCalledOnce();
      });
      for (const flag of ['--target-branch', '--default-branch']) {
        it(`handles ${flag}`, async () => {
          await parser.parseAsync(
            `release-pr --repo-url=googleapis/release-please-cli ${flag}=1.x`
          );

          expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
            owner: 'googleapis',
            repo: 'release-please-cli',
            token: undefined,
            apiUrl: 'https://api.github.com',
            graphqlUrl: 'https://api.github.com',
          });
          expect(fromManifestStub).toHaveBeenCalledExactlyOnceWith(
            fakeGitHub,
            '1.x',
            DEFAULT_RELEASE_PLEASE_CONFIG,
            DEFAULT_RELEASE_PLEASE_MANIFEST,
            expect.anything(),
            undefined,
            undefined
          );
          expect(createPullRequestsStub).toHaveBeenCalledOnce();
        });
      }

      it('handles --dry-run', async () => {
        const buildPullRequestsStub = jest
          .spyOn(fakeManifest, 'buildPullRequests')
          .mockResolvedValue([]);

        await parser.parseAsync(
          'release-pr --repo-url=googleapis/release-please-cli --dry-run'
        );

        expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
          owner: 'googleapis',
          repo: 'release-please-cli',
          token: undefined,
          apiUrl: 'https://api.github.com',
          graphqlUrl: 'https://api.github.com',
        });
        expect(fromManifestStub).toHaveBeenCalledExactlyOnceWith(
          fakeGitHub,
          'main',
          DEFAULT_RELEASE_PLEASE_CONFIG,
          DEFAULT_RELEASE_PLEASE_MANIFEST,
          expect.anything(),
          undefined,
          undefined
        );
        expect(buildPullRequestsStub).toHaveBeenCalledOnce();
      });
    });
    describe('with release type options', () => {
      let fromConfigStub: jest.SpyInstance;
      let createPullRequestsStub: jest.SpyInstance;
      beforeEach(() => {
        fromConfigStub = jest
          .spyOn(Manifest, 'fromConfig')
          .mockResolvedValue(fakeManifest);
        createPullRequestsStub = jest
          .spyOn(fakeManifest, 'createPullRequests')
          .mockResolvedValue([
            {
              title: 'fake title',
              body: 'fake body',
              headBranchName: 'head-branch-name',
              baseBranchName: 'base-branch-name',
              number: 123,
              files: [],
              labels: [],
            },
          ]);
      });

      it('instantiates a basic Manifest', async () => {
        await parser.parseAsync(
          'release-pr --repo-url=googleapis/release-please-cli --release-type=java-yoshi'
        );

        expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
          owner: 'googleapis',
          repo: 'release-please-cli',
          token: undefined,
          apiUrl: 'https://api.github.com',
          graphqlUrl: 'https://api.github.com',
        });
        expect(fromConfigStub).toHaveBeenCalledExactlyOnceWith(
          fakeGitHub,
          'main',
          expect.objectContaining({releaseType: 'java-yoshi'}),
          expect.anything(),
          undefined
        );
        expect(createPullRequestsStub).toHaveBeenCalledOnce();
      });

      for (const flag of ['--target-branch', '--default-branch']) {
        it(`handles ${flag}`, async () => {
          await parser.parseAsync(
            `release-pr --repo-url=googleapis/release-please-cli --release-type=java-yoshi ${flag}=1.x`
          );

          expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
            owner: 'googleapis',
            repo: 'release-please-cli',
            token: undefined,
            apiUrl: 'https://api.github.com',
            graphqlUrl: 'https://api.github.com',
          });
          expect(fromConfigStub).toHaveBeenCalledExactlyOnceWith(
            fakeGitHub,
            '1.x',
            expect.objectContaining({releaseType: 'java-yoshi'}),
            expect.anything(),
            undefined
          );
          expect(createPullRequestsStub).toHaveBeenCalledOnce();
        });
      }

      it('handles --dry-run', async () => {
        const buildPullRequestsStub = jest
          .spyOn(fakeManifest, 'buildPullRequests')
          .mockResolvedValue([]);

        await parser.parseAsync(
          'release-pr --repo-url=googleapis/release-please-cli --release-type=java-yoshi --dry-run'
        );

        expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
          owner: 'googleapis',
          repo: 'release-please-cli',
          token: undefined,
          apiUrl: 'https://api.github.com',
          graphqlUrl: 'https://api.github.com',
        });
        expect(fromConfigStub).toHaveBeenCalledExactlyOnceWith(
          fakeGitHub,
          'main',
          expect.objectContaining({releaseType: 'java-yoshi'}),
          expect.anything(),
          undefined
        );
        expect(buildPullRequestsStub).toHaveBeenCalledOnce();
      });

      it('handles --release-as', async () => {
        await parser.parseAsync(
          'release-pr --repo-url=googleapis/release-please-cli --release-type=java-yoshi --release-as=2.3.4'
        );

        expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
          owner: 'googleapis',
          repo: 'release-please-cli',
          token: undefined,
          apiUrl: 'https://api.github.com',
          graphqlUrl: 'https://api.github.com',
        });
        expect(fromConfigStub).toHaveBeenCalledExactlyOnceWith(
          fakeGitHub,
          'main',
          expect.objectContaining({
            releaseType: 'java-yoshi',
            releaseAs: '2.3.4',
          }),
          expect.anything(),
          undefined
        );
        expect(createPullRequestsStub).toHaveBeenCalledOnce();
      });

      it('handles --versioning-strategy', async () => {
        await parser.parseAsync(
          'release-pr --repo-url=googleapis/release-please-cli --release-type=java-yoshi --versioning-strategy=always-bump-patch'
        );

        expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
          owner: 'googleapis',
          repo: 'release-please-cli',
          token: undefined,
          apiUrl: 'https://api.github.com',
          graphqlUrl: 'https://api.github.com',
        });
        expect(fromConfigStub).toHaveBeenCalledExactlyOnceWith(
          fakeGitHub,
          'main',
          expect.objectContaining({
            releaseType: 'java-yoshi',
            versioning: 'always-bump-patch',
          }),
          expect.anything(),
          undefined
        );
        expect(createPullRequestsStub).toHaveBeenCalledOnce();
      });

      it('handles --bump-minor-pre-major and --bump-patch-for-minor-pre-major', async () => {
        await parser.parseAsync(
          'release-pr --repo-url=googleapis/release-please-cli --release-type=java-yoshi --bump-minor-pre-major --bump-patch-for-minor-pre-major'
        );

        expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
          owner: 'googleapis',
          repo: 'release-please-cli',
          token: undefined,
          apiUrl: 'https://api.github.com',
          graphqlUrl: 'https://api.github.com',
        });
        expect(fromConfigStub).toHaveBeenCalledExactlyOnceWith(
          fakeGitHub,
          'main',
          expect.objectContaining({
            releaseType: 'java-yoshi',
            bumpMinorPreMajor: true,
            bumpPatchForMinorPreMajor: true,
          }),
          expect.anything(),
          undefined
        );
        expect(createPullRequestsStub).toHaveBeenCalledOnce();
      });

      it('handles java --extra-files', async () => {
        await parser.parseAsync(
          'release-pr --repo-url=googleapis/release-please-cli --release-type=java-yoshi --extra-files=foo/bar.java,asdf/qwer.java'
        );

        expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
          owner: 'googleapis',
          repo: 'release-please-cli',
          token: undefined,
          apiUrl: 'https://api.github.com',
          graphqlUrl: 'https://api.github.com',
        });
        expect(fromConfigStub).toHaveBeenCalledExactlyOnceWith(
          fakeGitHub,
          'main',
          expect.objectContaining({
            releaseType: 'java-yoshi',
            extraFiles: ['foo/bar.java', 'asdf/qwer.java'],
          }),
          expect.anything(),
          undefined
        );
        expect(createPullRequestsStub).toHaveBeenCalledOnce();
      });

      it('handles ruby --version-file', async () => {
        await parser.parseAsync(
          'release-pr --repo-url=googleapis/release-please-cli --release-type=ruby-yoshi --version-file=lib/foo/version.rb'
        );

        expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
          owner: 'googleapis',
          repo: 'release-please-cli',
          token: undefined,
          apiUrl: 'https://api.github.com',
          graphqlUrl: 'https://api.github.com',
        });
        expect(fromConfigStub).toHaveBeenCalledExactlyOnceWith(
          fakeGitHub,
          'main',
          expect.objectContaining({
            releaseType: 'ruby-yoshi',
            versionFile: 'lib/foo/version.rb',
          }),
          expect.anything(),
          undefined
        );
        expect(createPullRequestsStub).toHaveBeenCalledOnce();
      });

      it('handles --signoff', async () => {
        await parser.parseAsync(
          'release-pr --repo-url=googleapis/release-please-cli --release-type=java-yoshi --signoff="Alice <alice@example.com>"'
        );

        expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
          owner: 'googleapis',
          repo: 'release-please-cli',
          token: undefined,
          apiUrl: 'https://api.github.com',
          graphqlUrl: 'https://api.github.com',
        });
        expect(fromConfigStub).toHaveBeenCalledExactlyOnceWith(
          fakeGitHub,
          'main',
          expect.objectContaining({releaseType: 'java-yoshi'}),
          expect.objectContaining({signoff: 'Alice <alice@example.com>'}),
          undefined
        );
        expect(createPullRequestsStub).toHaveBeenCalledOnce();
      });

      it('handles --changelog-path', async () => {
        await parser.parseAsync(
          'release-pr --repo-url=googleapis/release-please-cli --release-type=java-yoshi --changelog-path=docs/changes.md'
        );

        expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
          owner: 'googleapis',
          repo: 'release-please-cli',
          token: undefined,
          apiUrl: 'https://api.github.com',
          graphqlUrl: 'https://api.github.com',
        });
        expect(fromConfigStub).toHaveBeenCalledExactlyOnceWith(
          fakeGitHub,
          'main',
          expect.objectContaining({
            releaseType: 'java-yoshi',
            changelogPath: 'docs/changes.md',
          }),
          expect.anything(),
          undefined
        );
        expect(createPullRequestsStub).toHaveBeenCalledOnce();
      });

      it('handles --changelog-type', async () => {
        await parser.parseAsync(
          'release-pr --repo-url=googleapis/release-please-cli --release-type=java-yoshi --changelog-type=github'
        );

        expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
          owner: 'googleapis',
          repo: 'release-please-cli',
          token: undefined,
          apiUrl: 'https://api.github.com',
          graphqlUrl: 'https://api.github.com',
        });
        expect(fromConfigStub).toHaveBeenCalledExactlyOnceWith(
          fakeGitHub,
          'main',
          expect.objectContaining({
            releaseType: 'java-yoshi',
            changelogType: 'github',
          }),
          expect.anything(),
          undefined
        );
        expect(createPullRequestsStub).toHaveBeenCalledOnce();
      });

      it('handles --changelog-host', async () => {
        await parser.parseAsync(
          'release-pr --repo-url=googleapis/release-please-cli --release-type=java-yoshi --changelog-host=https://example.com'
        );

        expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
          owner: 'googleapis',
          repo: 'release-please-cli',
          token: undefined,
          apiUrl: 'https://api.github.com',
          graphqlUrl: 'https://api.github.com',
        });
        expect(fromConfigStub).toHaveBeenCalledExactlyOnceWith(
          fakeGitHub,
          'main',
          expect.objectContaining({
            releaseType: 'java-yoshi',
            changelogHost: 'https://example.com',
          }),
          expect.anything(),
          undefined
        );
        expect(createPullRequestsStub).toHaveBeenCalledOnce();
      });
      it('handles --draft-pull-request', async () => {
        await parser.parseAsync(
          'release-pr --repo-url=googleapis/release-please-cli --release-type=java-yoshi --draft-pull-request'
        );

        expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
          owner: 'googleapis',
          repo: 'release-please-cli',
          token: undefined,
          apiUrl: 'https://api.github.com',
          graphqlUrl: 'https://api.github.com',
        });
        expect(fromConfigStub).toHaveBeenCalledExactlyOnceWith(
          fakeGitHub,
          'main',
          expect.objectContaining({
            releaseType: 'java-yoshi',
            draftPullRequest: true,
          }),
          expect.anything(),
          undefined
        );
        expect(createPullRequestsStub).toHaveBeenCalledOnce();
      });

      it('handles --fork', async () => {
        await parser.parseAsync(
          'release-pr --repo-url=googleapis/release-please-cli --release-type=java-yoshi --fork'
        );

        expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
          owner: 'googleapis',
          repo: 'release-please-cli',
          token: undefined,
          apiUrl: 'https://api.github.com',
          graphqlUrl: 'https://api.github.com',
        });
        expect(fromConfigStub).toHaveBeenCalledExactlyOnceWith(
          fakeGitHub,
          'main',
          expect.objectContaining({releaseType: 'java-yoshi'}),
          expect.objectContaining({fork: true}),
          undefined
        );
        expect(createPullRequestsStub).toHaveBeenCalledOnce();
      });

      it('handles --path', async () => {
        await parser.parseAsync(
          'release-pr --repo-url=googleapis/release-please-cli --release-type=java-yoshi --path=submodule'
        );

        expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
          owner: 'googleapis',
          repo: 'release-please-cli',
          token: undefined,
          apiUrl: 'https://api.github.com',
          graphqlUrl: 'https://api.github.com',
        });
        expect(fromConfigStub).toHaveBeenCalledExactlyOnceWith(
          fakeGitHub,
          'main',
          expect.objectContaining({releaseType: 'java-yoshi'}),
          expect.anything(),
          'submodule'
        );
        expect(createPullRequestsStub).toHaveBeenCalledOnce();
      });

      it('handles --component', async () => {
        await parser.parseAsync(
          'release-pr --repo-url=googleapis/release-please-cli --release-type=java-yoshi --component=pkg1'
        );

        expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
          owner: 'googleapis',
          repo: 'release-please-cli',
          token: undefined,
          apiUrl: 'https://api.github.com',
          graphqlUrl: 'https://api.github.com',
        });
        expect(fromConfigStub).toHaveBeenCalledExactlyOnceWith(
          fakeGitHub,
          'main',
          expect.objectContaining({
            releaseType: 'java-yoshi',
            component: 'pkg1',
          }),
          expect.anything(),
          undefined
        );
        expect(createPullRequestsStub).toHaveBeenCalledOnce();
      });

      it('handles --package-name', async () => {
        await parser.parseAsync(
          'release-pr --repo-url=googleapis/release-please-cli --release-type=java-yoshi --package-name=@foo/bar'
        );

        expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
          owner: 'googleapis',
          repo: 'release-please-cli',
          token: undefined,
          apiUrl: 'https://api.github.com',
          graphqlUrl: 'https://api.github.com',
        });
        expect(fromConfigStub).toHaveBeenCalledExactlyOnceWith(
          fakeGitHub,
          'main',
          expect.objectContaining({
            releaseType: 'java-yoshi',
            packageName: '@foo/bar',
          }),
          expect.anything(),
          undefined
        );
        expect(createPullRequestsStub).toHaveBeenCalledOnce();
      });

      it('handles --monorepo-tags', async () => {
        await parser.parseAsync(
          'release-pr --repo-url=googleapis/release-please-cli --release-type=java-yoshi --monorepo-tags'
        );

        expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
          owner: 'googleapis',
          repo: 'release-please-cli',
          token: undefined,
          apiUrl: 'https://api.github.com',
          graphqlUrl: 'https://api.github.com',
        });
        expect(fromConfigStub).toHaveBeenCalledExactlyOnceWith(
          fakeGitHub,
          'main',
          expect.objectContaining({
            releaseType: 'java-yoshi',
            includeComponentInTag: true,
          }),
          expect.anything(),
          undefined
        );
        expect(createPullRequestsStub).toHaveBeenCalledOnce();
      });
    });
  });
  describe('github-release', () => {
    describe('with manifest options', () => {
      let fromManifestStub: jest.SpyInstance;
      let createReleasesStub: jest.SpyInstance;
      beforeEach(() => {
        fromManifestStub = jest
          .spyOn(Manifest, 'fromManifest')
          .mockResolvedValue(fakeManifest);
        createReleasesStub = jest
          .spyOn(fakeManifest, 'createReleases')
          .mockResolvedValue([
            {
              id: 123456,
              tagName: 'v1.2.3',
              sha: 'abc123',
              notes: 'some release notes',
              url: 'url-of-release',
              path: '.',
              version: 'v1.2.3',
              major: 1,
              minor: 2,
              patch: 3,
            },
          ]);
      });

      it('instantiates a basic Manifest', async () => {
        await parser.parseAsync(
          'github-release --repo-url=googleapis/release-please-cli'
        );

        expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
          owner: 'googleapis',
          repo: 'release-please-cli',
          token: undefined,
          apiUrl: 'https://api.github.com',
          graphqlUrl: 'https://api.github.com',
        });
        expect(fromManifestStub).toHaveBeenCalledExactlyOnceWith(
          fakeGitHub,
          'main',
          DEFAULT_RELEASE_PLEASE_CONFIG,
          DEFAULT_RELEASE_PLEASE_MANIFEST,
          expect.anything()
        );
        expect(createReleasesStub).toHaveBeenCalledOnce();
      });

      it('instantiates Manifest with custom config/manifest', async () => {
        await parser.parseAsync(
          'github-release --repo-url=googleapis/release-please-cli --config-file=foo.json --manifest-file=.bar.json'
        );

        expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
          owner: 'googleapis',
          repo: 'release-please-cli',
          token: undefined,
          apiUrl: 'https://api.github.com',
          graphqlUrl: 'https://api.github.com',
        });
        expect(fromManifestStub).toHaveBeenCalledExactlyOnceWith(
          fakeGitHub,
          'main',
          'foo.json',
          '.bar.json',
          expect.anything()
        );
        expect(createReleasesStub).toHaveBeenCalledOnce();
      });
      for (const flag of ['--target-branch', '--default-branch']) {
        it(`handles ${flag}`, async () => {
          await parser.parseAsync(
            `github-release --repo-url=googleapis/release-please-cli ${flag}=1.x`
          );

          expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
            owner: 'googleapis',
            repo: 'release-please-cli',
            token: undefined,
            apiUrl: 'https://api.github.com',
            graphqlUrl: 'https://api.github.com',
          });
          expect(fromManifestStub).toHaveBeenCalledExactlyOnceWith(
            fakeGitHub,
            '1.x',
            DEFAULT_RELEASE_PLEASE_CONFIG,
            DEFAULT_RELEASE_PLEASE_MANIFEST,
            expect.anything()
          );
          expect(createReleasesStub).toHaveBeenCalledOnce();
        });
      }

      it('handles --dry-run', async () => {
        const buildReleasesStub = jest
          .spyOn(fakeManifest, 'buildReleases')
          .mockResolvedValue([]);

        await parser.parseAsync(
          'github-release --repo-url=googleapis/release-please-cli --dry-run'
        );

        expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
          owner: 'googleapis',
          repo: 'release-please-cli',
          token: undefined,
          apiUrl: 'https://api.github.com',
          graphqlUrl: 'https://api.github.com',
        });
        expect(fromManifestStub).toHaveBeenCalledExactlyOnceWith(
          fakeGitHub,
          'main',
          DEFAULT_RELEASE_PLEASE_CONFIG,
          DEFAULT_RELEASE_PLEASE_MANIFEST,
          expect.anything()
        );
        expect(buildReleasesStub).toHaveBeenCalledOnce();
      });

      it('handles --label and --release-label', async () => {
        await parser.parseAsync(
          'github-release --repo-url=googleapis/release-please-cli --label=foo,bar --release-label=asdf,qwer'
        );

        expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
          owner: 'googleapis',
          repo: 'release-please-cli',
          token: undefined,
          apiUrl: 'https://api.github.com',
          graphqlUrl: 'https://api.github.com',
        });
        expect(fromManifestStub).toHaveBeenCalledExactlyOnceWith(
          fakeGitHub,
          'main',
          DEFAULT_RELEASE_PLEASE_CONFIG,
          DEFAULT_RELEASE_PLEASE_MANIFEST,
          expect.objectContaining({
            labels: ['foo', 'bar'],
            releaseLabels: ['asdf', 'qwer'],
          })
        );
        expect(createReleasesStub).toHaveBeenCalledOnce();
      });

      it('handles --draft', async () => {
        await parser.parseAsync(
          'github-release --repo-url=googleapis/release-please-cli --draft'
        );

        expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
          owner: 'googleapis',
          repo: 'release-please-cli',
          token: undefined,
          apiUrl: 'https://api.github.com',
          graphqlUrl: 'https://api.github.com',
        });
        expect(fromManifestStub).toHaveBeenCalledExactlyOnceWith(
          fakeGitHub,
          'main',
          DEFAULT_RELEASE_PLEASE_CONFIG,
          DEFAULT_RELEASE_PLEASE_MANIFEST,
          expect.objectContaining({draft: true})
        );
        expect(createReleasesStub).toHaveBeenCalledOnce();
      });

      // it('handles --release-as', async () => {
      //   await parser.parseAsync(
      //     'github-release --repo-url=googleapis/release-please-cli --release-as=2.3.4'
      //   );
      // });
    });
    describe('with release type options', () => {
      let fromConfigStub: jest.SpyInstance;
      let createReleasesStub: jest.SpyInstance;
      beforeEach(() => {
        fromConfigStub = jest
          .spyOn(Manifest, 'fromConfig')
          .mockResolvedValue(fakeManifest);
        createReleasesStub = jest
          .spyOn(fakeManifest, 'createReleases')
          .mockResolvedValue([
            {
              id: 123456,
              tagName: 'v1.2.3',
              sha: 'abc123',
              notes: 'some release notes',
              url: 'url-of-release',
              path: '.',
              version: 'v1.2.3',
              major: 1,
              minor: 2,
              patch: 3,
            },
          ]);
      });

      it('instantiates a basic Manifest', async () => {
        await parser.parseAsync(
          'github-release --repo-url=googleapis/release-please-cli --release-type=java-yoshi'
        );

        expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
          owner: 'googleapis',
          repo: 'release-please-cli',
          token: undefined,
          apiUrl: 'https://api.github.com',
          graphqlUrl: 'https://api.github.com',
        });
        expect(fromConfigStub).toHaveBeenCalledExactlyOnceWith(
          fakeGitHub,
          'main',
          expect.objectContaining({releaseType: 'java-yoshi'}),
          expect.anything(),
          undefined
        );
        expect(createReleasesStub).toHaveBeenCalledOnce();
      });

      it('handles --dry-run', async () => {
        const buildReleasesStub = jest
          .spyOn(fakeManifest, 'buildReleases')
          .mockResolvedValue([]);
        await parser.parseAsync(
          'github-release --repo-url=googleapis/release-please-cli --release-type=java-yoshi --dry-run'
        );

        expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
          owner: 'googleapis',
          repo: 'release-please-cli',
          token: undefined,
          apiUrl: 'https://api.github.com',
          graphqlUrl: 'https://api.github.com',
        });
        expect(fromConfigStub).toHaveBeenCalledExactlyOnceWith(
          fakeGitHub,
          'main',
          expect.objectContaining({releaseType: 'java-yoshi'}),
          expect.anything(),
          undefined
        );
        expect(buildReleasesStub).toHaveBeenCalledOnce();
      });

      it('handles --draft', async () => {
        await parser.parseAsync(
          'github-release --repo-url=googleapis/release-please-cli --release-type=java-yoshi --draft'
        );

        expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
          owner: 'googleapis',
          repo: 'release-please-cli',
          token: undefined,
          apiUrl: 'https://api.github.com',
          graphqlUrl: 'https://api.github.com',
        });
        expect(fromConfigStub).toHaveBeenCalledExactlyOnceWith(
          fakeGitHub,
          'main',
          expect.objectContaining({releaseType: 'java-yoshi', draft: true}),
          expect.anything(),
          undefined
        );
        expect(createReleasesStub).toHaveBeenCalledOnce();
      });

      it('handles --prerelease', async () => {
        await parser.parseAsync(
          'github-release --repo-url=googleapis/release-please-cli --release-type=java-yoshi --prerelease'
        );

        expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
          owner: 'googleapis',
          repo: 'release-please-cli',
          token: undefined,
          apiUrl: 'https://api.github.com',
          graphqlUrl: 'https://api.github.com',
        });

        expect(fromConfigStub).toHaveBeenCalledExactlyOnceWith(
          fakeGitHub,
          'main',
          expect.objectContaining({
            releaseType: 'java-yoshi',
            prerelease: true,
          }),
          expect.anything(),
          undefined
        );
        expect(createReleasesStub).toHaveBeenCalledOnce();
      });

      it('handles --label and --release-label', async () => {
        await parser.parseAsync(
          'github-release --repo-url=googleapis/release-please-cli --release-type=java-yoshi --label=foo,bar --release-label=asdf,qwer'
        );

        expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
          owner: 'googleapis',
          repo: 'release-please-cli',
          token: undefined,
          apiUrl: 'https://api.github.com',
          graphqlUrl: 'https://api.github.com',
        });
        expect(fromConfigStub).toHaveBeenCalledExactlyOnceWith(
          fakeGitHub,
          'main',
          expect.objectContaining({releaseType: 'java-yoshi'}),
          expect.objectContaining({
            labels: ['foo', 'bar'],
            releaseLabels: ['asdf', 'qwer'],
          }),
          undefined
        );
        expect(createReleasesStub).toHaveBeenCalledOnce();
      });

      it('handles --path', async () => {
        await parser.parseAsync(
          'github-release --repo-url=googleapis/release-please-cli --release-type=java-yoshi --path=submodule'
        );

        expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
          owner: 'googleapis',
          repo: 'release-please-cli',
          token: undefined,
          apiUrl: 'https://api.github.com',
          graphqlUrl: 'https://api.github.com',
        });
        expect(fromConfigStub).toHaveBeenCalledExactlyOnceWith(
          fakeGitHub,
          'main',
          expect.objectContaining({releaseType: 'java-yoshi'}),
          expect.anything(),
          'submodule'
        );
        expect(createReleasesStub).toHaveBeenCalledOnce();
      });

      it('handles --component', async () => {
        await parser.parseAsync(
          'github-release --repo-url=googleapis/release-please-cli --release-type=java-yoshi --component=pkg1'
        );

        expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
          owner: 'googleapis',
          repo: 'release-please-cli',
          token: undefined,
          apiUrl: 'https://api.github.com',
          graphqlUrl: 'https://api.github.com',
        });
        expect(fromConfigStub).toHaveBeenCalledExactlyOnceWith(
          fakeGitHub,
          'main',
          expect.objectContaining({
            releaseType: 'java-yoshi',
            component: 'pkg1',
          }),
          expect.anything(),
          undefined
        );
        expect(createReleasesStub).toHaveBeenCalledOnce();
      });

      it('handles --package-name', async () => {
        await parser.parseAsync(
          'github-release --repo-url=googleapis/release-please-cli --release-type=java-yoshi --package-name=@foo/bar'
        );

        expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
          owner: 'googleapis',
          repo: 'release-please-cli',
          token: undefined,
          apiUrl: 'https://api.github.com',
          graphqlUrl: 'https://api.github.com',
        });
        expect(fromConfigStub).toHaveBeenCalledExactlyOnceWith(
          fakeGitHub,
          'main',
          expect.objectContaining({
            releaseType: 'java-yoshi',
            packageName: '@foo/bar',
          }),
          expect.anything(),
          undefined
        );
        expect(createReleasesStub).toHaveBeenCalledOnce();
      });

      it('handles --monorepo-tags', async () => {
        await parser.parseAsync(
          'github-release --repo-url=googleapis/release-please-cli --release-type=java-yoshi --monorepo-tags'
        );

        expect(gitHubCreateStub).toHaveBeenCalledExactlyOnceWith({
          owner: 'googleapis',
          repo: 'release-please-cli',
          token: undefined,
          apiUrl: 'https://api.github.com',
          graphqlUrl: 'https://api.github.com',
        });
        expect(fromConfigStub).toHaveBeenCalledExactlyOnceWith(
          fakeGitHub,
          'main',
          expect.objectContaining({
            releaseType: 'java-yoshi',
            includeComponentInTag: true,
          }),
          expect.anything(),
          undefined
        );
        expect(createReleasesStub).toHaveBeenCalledOnce();
      });
    });
  });
  describe('bootstrap', () => {
    it('defaults path to .', async () => {
      const createPullStub = jest
        .spyOn(fakeGitHub, 'createPullRequest')
        .mockResolvedValue({
          headBranchName: 'head-branch',
          baseBranchName: 'base-branch',
          number: 1234,
          title: 'pr-title',
          body: 'pr-body',
          labels: [],
          files: [],
        });
      await await parser.parseAsync(
        'bootstrap --repo-url=googleapis/release-please-cli --release-type=java'
      );
      expect(createPullStub).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          headBranchName: 'release-please/bootstrap/default',
        }),
        'main',
        'chore: bootstrap releases for path: .',
        expect.anything(),
        {}
      );
    });
  });

  describe('--help', () => {
    for (const cmd of [
      'release-pr',
      'github-release',
      'manifest-pr',
      'manifest-release',
    ]) {
      it(cmd, async () => {
        const parseCallback: ParseCallback = (_err, _argv, output) => {
          expect(output).toMatchSnapshot();
        };
        const foo = await parser.parseAsync(`${cmd} --help`, parseCallback);
        console.log(foo);
      });
    }
  });
});
