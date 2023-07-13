// Copyright 2019 Google LLC
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

import 'jest-extended';
import nock from 'nock';

import {readFileSync} from 'fs';
import {resolve} from 'path';

import {GH_API_URL, GitHub, GitHubRelease} from '../src/github';
import {PullRequest} from '../src/pull-request';
import {TagName} from '../src/util/tag-name';
import {Version} from '../src/version';
import {
  DuplicateReleaseError,
  GitHubAPIError,
  FileNotFoundError,
} from '../src/errors';

import {PullRequestBody} from '../src/util/pull-request-body';
import {PullRequestTitle} from '../src/util/pull-request-title';
import * as codeSuggester from 'code-suggester';
import {RawContent} from '../src/updaters/raw-content';
import {HttpsProxyAgent} from 'https-proxy-agent';
import {HttpProxyAgent} from 'http-proxy-agent';
import {Commit} from '../src/commit';
import {mockReleaseData, MockPullRequestOverflowHandler} from './helpers';
import {when} from 'jest-when';

const fixturesPath = './test/fixtures';
nock.disableNetConnect();

describe('GitHub', () => {
  const gitHubConfig = {
    owner: 'fake',
    repo: 'fake',
    defaultBranch: 'main',
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('create', () => {
    const req = nock('https://api.github.com/')
      .get('/repos/fake/fake')
      .optionally()
      .reply(200, {
        default_branch: 'main',
      });

    it('allows configuring the default branch explicitly', async () => {
      const github = await GitHub.create({
        owner: 'some-owner',
        repo: 'some-repo',
        defaultBranch: 'some-branch',
      });
      expect(github.repository.defaultBranch).toEqual('some-branch');
    });

    it('fetches the default branch', async () => {
      req.get('/repos/some-owner/some-repo').reply(200, {
        default_branch: 'some-branch-from-api',
      });
      const github = await GitHub.create({
        owner: 'some-owner',
        repo: 'some-repo',
      });

      expect(github.repository.defaultBranch).toEqual('some-branch-from-api');
    });

    it('default agent is undefined when no proxy option passed ', () => {
      expect(GitHub.createDefaultAgent('test_url')).toBeUndefined();
    });

    it('should return a https agent', () => {
      expect(
        GitHub.createDefaultAgent(GH_API_URL, {
          host: 'http://proxy.com',
          port: 3000,
        })
      ).toBeInstanceOf(HttpsProxyAgent);
    });

    it('should throw error when baseUrl is an invalid url', () => {
      expect(() => {
        GitHub.createDefaultAgent('invalid_url', {
          host: 'http://proxy.com',
          port: 3000,
        });
      }).toThrow('Invalid URL');
    });

    it('should return a http agent', () => {
      expect(
        GitHub.createDefaultAgent('http://www.github.com', {
          host: 'http://proxy.com',
          port: 3000,
        })
      ).toBeInstanceOf(HttpProxyAgent);
    });
  });

  describe('findFilesByFilename', () => {
    const req = nock('https://api.github.com/')
      .get('/repos/fake/fake')
      .optionally()
      .reply(200, {
        default_branch: 'main',
      });

    it('returns files matching the requested pattern', async () => {
      const github = await GitHub.create(gitHubConfig);
      const fileSearchResponse = JSON.parse(
        readFileSync(resolve(fixturesPath, 'pom-file-search.json'), 'utf8')
      );
      req
        .get('/repos/fake/fake/git/trees/main?recursive=true')
        .reply(200, fileSearchResponse);
      const pomFiles = await github.findFilesByFilename('pom.xml');
      expect(pomFiles).toMatchSnapshot();
      req.done();
    });

    const prefixes = [
      'appengine',
      'appengine/',
      '/appengine',
      '/appengine/',
      'appengine\\',
      '\\appengine',
      '\\appengine\\',
    ];
    prefixes.forEach(prefix => {
      it(`scopes pattern matching files to prefix(${prefix})`, async () => {
        const github = await GitHub.create(gitHubConfig);
        const fileSearchResponse = JSON.parse(
          readFileSync(
            resolve(fixturesPath, 'pom-file-search-with-prefix.json'),
            'utf8'
          )
        );
        req
          .get('/repos/fake/fake/git/trees/main?recursive=true')
          .reply(200, fileSearchResponse);
        const pomFiles = await github.findFilesByFilename('pom.xml', prefix);
        req.done();
        expect(pomFiles).toEqual(['pom.xml', 'foo/pom.xml']);
      });
    });
  });

  describe('findFilesByExtension', () => {
    const req = nock('https://api.github.com/')
      .get('/repos/fake/fake')
      .optionally()
      .reply(200, {
        default_branch: 'main',
      });

    it('returns files matching the requested pattern', async () => {
      const github = await GitHub.create(gitHubConfig);
      const fileSearchResponse = JSON.parse(
        readFileSync(resolve(fixturesPath, 'pom-file-search.json'), 'utf8')
      );
      req
        .get('/repos/fake/fake/git/trees/main?recursive=true')
        .reply(200, fileSearchResponse);
      const pomFiles = await github.findFilesByExtension('xml');
      expect(pomFiles).toMatchSnapshot();
      req.done();
    });

    const prefixes = [
      'appengine',
      'appengine/',
      '/appengine',
      '/appengine/',
      'appengine\\',
      '\\appengine',
      '\\appengine\\',
    ];
    prefixes.forEach(prefix => {
      it(`scopes pattern matching files to prefix(${prefix})`, async () => {
        const github = await GitHub.create(gitHubConfig);
        const fileSearchResponse = JSON.parse(
          readFileSync(
            resolve(fixturesPath, 'pom-file-search-with-prefix.json'),
            'utf8'
          )
        );
        req
          .get('/repos/fake/fake/git/trees/main?recursive=true')
          .reply(200, fileSearchResponse);
        const pomFiles = await github.findFilesByExtension('xml', prefix);
        req.done();
        expect(pomFiles).toEqual(['pom.xml', 'foo/pom.xml']);
      });
    });
    it('ensures the prefix is a directory', async () => {
      const github = await GitHub.create(gitHubConfig);
      const fileSearchResponse = JSON.parse(
        readFileSync(
          resolve(fixturesPath, 'pom-file-search-with-prefix.json'),
          'utf8'
        )
      );
      req
        .get('/repos/fake/fake/git/trees/main?recursive=true')
        .reply(200, fileSearchResponse);
      const pomFiles = await github.findFilesByExtension('xml', 'appengine');
      req.done();
      expect(pomFiles).toEqual(['pom.xml', 'foo/pom.xml']);
    });
  });

  describe('getFileContents', () => {
    let req: nock.Scope;
    req = nock('https://api.github.com/')
      .get('/repos/fake/fake')
      .optionally()
      .reply(200, {
        default_branch: 'main',
      });

    beforeEach(() => {
      const dataAPITreesResponse = JSON.parse(
        readFileSync(
          resolve(
            fixturesPath,
            'github-data-api',
            'data-api-trees-successful-response.json'
          ),
          'utf8'
        )
      );
      req = req
        .get('/repos/fake/fake/git/trees/main?recursive=true')
        .reply(200, dataAPITreesResponse);
    });
    it('should support Github Data API in case of a big file', async () => {
      const github = await GitHub.create(gitHubConfig);
      const dataAPIBlobResponse = JSON.parse(
        readFileSync(
          resolve(
            fixturesPath,
            'github-data-api',
            'data-api-blobs-successful-response.json'
          ),
          'utf8'
        )
      );

      req = req
        .get(
          '/repos/fake/fake/git/blobs/2f3d2c47bf49f81aca0df9ffc49524a213a2dc33'
        )
        .reply(200, dataAPIBlobResponse);

      const fileContents = await github.getFileContents('package-lock.json');
      expect(fileContents).toHaveProperty('content');
      expect(fileContents).toHaveProperty('parsedContent');
      expect(fileContents).toHaveProperty(
        'sha',
        '2f3d2c47bf49f81aca0df9ffc49524a213a2dc33'
      );
      expect(fileContents).toMatchSnapshot();
      req.done();
    });

    it('should throw a missing file error', async () => {
      const github = await GitHub.create(gitHubConfig);
      expect.assertions(1);
      try {
        await github.getFileContents('non-existent-file');
      } catch (e) {
        expect(e).toBeInstanceOf(FileNotFoundError);
      }
    });
  });

  describe('pullRequestIterator', () => {
    const req = nock('https://api.github.com/')
      .get('/repos/fake/fake')
      .optionally()
      .reply(200, {
        default_branch: 'main',
      });

    it('finds merged pull requests with labels', async () => {
      const github = await GitHub.create(gitHubConfig);
      const graphql = JSON.parse(
        readFileSync(resolve(fixturesPath, 'merged-pull-requests.json'), 'utf8')
      );
      req.post('/graphql').reply(200, {
        data: graphql,
      });
      const generator = github.pullRequestIterator('main');
      const pullRequests: PullRequest[] = [];
      for await (const pullRequest of generator) {
        pullRequests.push(pullRequest);
      }
      expect(pullRequests).toHaveLength(25);
      expect(pullRequests!).toMatchSnapshot();
      req.done();
    });
    it('handles merged pull requests without files', async () => {
      const github = await GitHub.create(gitHubConfig);
      const graphql = JSON.parse(
        readFileSync(
          resolve(fixturesPath, 'merged-pull-requests-no-files.json'),
          'utf8'
        )
      );
      req.post('/graphql').reply(200, {
        data: graphql,
      });
      const generator = github.pullRequestIterator('main');
      const pullRequests: PullRequest[] = [];
      for await (const pullRequest of generator) {
        pullRequests.push(pullRequest);
      }
      expect(pullRequests).toHaveLength(25);
      expect(pullRequests!).toMatchSnapshot();
      req.done();
    });
    it('uses REST API if files are not needed', async () => {
      const github = await GitHub.create(gitHubConfig);
      req
        .get(
          '/repos/fake/fake/pulls?base=main&state=closed&sort=updated&direction=desc'
        )
        .reply(200, [
          {
            head: {
              ref: 'feature-branch',
            },
            base: {
              ref: 'main',
            },
            number: 123,
            title: 'some title',
            body: 'some body',
            labels: [{name: 'label 1'}, {name: 'label 2'}],
            merge_commit_sha: 'abc123',
            merged_at: '2022-08-08T19:07:20Z',
          },
          {
            head: {
              ref: 'feature-branch',
            },
            base: {
              ref: 'main',
            },
            number: 124,
            title: 'merged title 2 ',
            body: 'merged body 2',
            labels: [{name: 'label 1'}, {name: 'label 2'}],
            merge_commit_sha: 'abc123',
            merged_at: '2022-08-08T19:07:20Z',
          },
          {
            head: {
              ref: 'feature-branch',
            },
            base: {
              ref: 'main',
            },
            number: 125,
            title: 'closed title',
            body: 'closed body',
            labels: [{name: 'label 1'}, {name: 'label 2'}],
            merge_commit_sha: 'def234',
          },
        ]);
      const generator = github.pullRequestIterator('main', 'MERGED', 30, false);
      const pullRequests: PullRequest[] = [];
      for await (const pullRequest of generator) {
        pullRequests.push(pullRequest);
      }
      expect(pullRequests).toHaveLength(2);
      expect(pullRequests!).toMatchSnapshot();
      req.done();
    });
  });

  describe('commitsSince', () => {
    const req = nock('https://api.github.com/')
      .get('/repos/fake/fake')
      .optionally()
      .reply(200, {
        default_branch: 'main',
      });

    it('finds commits up until a condition', async () => {
      const github = await GitHub.create(gitHubConfig);
      const graphql = JSON.parse(
        readFileSync(resolve(fixturesPath, 'commits-since.json'), 'utf8')
      );
      req.post('/graphql').reply(200, {
        data: graphql,
      });
      const targetBranch = 'main';
      const commitsSinceSha = await github.commitsSince(
        targetBranch,
        commit => {
          // this commit is the 2nd most recent
          return commit.sha === 'b29149f890e6f76ee31ed128585744d4c598924c';
        }
      );
      expect(commitsSinceSha.length).toEqual(1);
      expect(commitsSinceSha).toMatchSnapshot();
      req.done();
    });

    it('paginates through commits', async () => {
      const github = await GitHub.create(gitHubConfig);
      const graphql1 = JSON.parse(
        readFileSync(resolve(fixturesPath, 'commits-since-page-1.json'), 'utf8')
      );
      const graphql2 = JSON.parse(
        readFileSync(resolve(fixturesPath, 'commits-since-page-2.json'), 'utf8')
      );
      req
        .post('/graphql')
        .reply(200, {
          data: graphql1,
        })
        .post('/graphql')
        .reply(200, {
          data: graphql2,
        });
      const targetBranch = 'main';
      const commitsSinceSha = await github.commitsSince(
        targetBranch,
        commit => {
          // this commit is on page 2
          return commit.sha === 'c6d9dfb03aa2dbe1abc329592af60713fe28586d';
        }
      );
      expect(commitsSinceSha.length).toEqual(11);
      expect(commitsSinceSha).toMatchSnapshot();
      req.done();
    });

    it('finds first commit of a multi-commit merge pull request', async () => {
      const github = await GitHub.create(gitHubConfig);
      const graphql = JSON.parse(
        readFileSync(resolve(fixturesPath, 'commits-since.json'), 'utf8')
      );
      req.post('/graphql').reply(200, {
        data: graphql,
      });
      const targetBranch = 'main';
      const commitsSinceSha = await github.commitsSince(
        targetBranch,
        commit => {
          // PR #6 was rebase/merged so it has 4 associated commits
          return commit.pullRequest?.number === 6;
        }
      );
      expect(commitsSinceSha.length).toEqual(3);
      expect(commitsSinceSha).toMatchSnapshot();
      req.done();
    });

    it('limits pagination', async () => {
      const github = await GitHub.create(gitHubConfig);
      const graphql1 = JSON.parse(
        readFileSync(resolve(fixturesPath, 'commits-since-page-1.json'), 'utf8')
      );
      req.post('/graphql').reply(200, {
        data: graphql1,
      });
      const targetBranch = 'main';
      const commitsSinceSha = await github.commitsSince(
        targetBranch,
        commit => {
          // this commit is on page 2
          return commit.sha === 'c6d9dfb03aa2dbe1abc329592af60713fe28586d';
        },
        {
          maxResults: 10,
        }
      );
      expect(commitsSinceSha.length).toEqual(10);
      expect(commitsSinceSha).toMatchSnapshot();
      req.done();
    });

    it('returns empty commits if branch does not exist', async () => {
      const github = await GitHub.create(gitHubConfig);
      const graphql = JSON.parse(
        readFileSync(
          resolve(fixturesPath, 'commits-since-missing-branch.json'),
          'utf8'
        )
      );
      req.post('/graphql').reply(200, {
        data: graphql,
      });
      const targetBranch = 'main';
      const commitsSinceSha = await github.commitsSince(
        targetBranch,
        _commit => {
          return true;
        }
      );
      expect(commitsSinceSha.length).toEqual(0);
      req.done();
    });

    it('backfills commit files without pull requests', async () => {
      const github = await GitHub.create(gitHubConfig);
      const graphql = JSON.parse(
        readFileSync(resolve(fixturesPath, 'commits-since.json'), 'utf8')
      );
      req
        .post('/graphql')
        .reply(200, {
          data: graphql,
        })
        .get(
          '/repos/fake/fake/commits/0cda26c2e7776748072ba5a24302474947b3ebbd'
        )
        .reply(200, {files: [{filename: 'abc'}]})
        .get(
          '/repos/fake/fake/commits/c6d9dfb03aa2dbe1abc329592af60713fe28586d'
        )
        .reply(200, {files: [{filename: 'def'}]})
        .get(
          '/repos/fake/fake/commits/c8f1498c92c323bfa8f5ffe84e0ade1c37e4ea6e'
        )
        .reply(200, {files: [{filename: 'ghi'}]});
      const targetBranch = 'main';
      const commitsSinceSha = await github.commitsSince(
        targetBranch,
        commit => {
          // this commit is the 2nd most recent
          return commit.sha === 'b29149f890e6f76ee31ed128585744d4c598924c';
        },
        {backfillFiles: true}
      );
      expect(commitsSinceSha.length).toEqual(1);
      expect(commitsSinceSha).toMatchSnapshot();
      req.done();
    });

    it('backfills commit files for pull requests with lots of files', async () => {
      const github = await GitHub.create(gitHubConfig);
      const graphql = JSON.parse(
        readFileSync(
          resolve(fixturesPath, 'commits-since-many-files.json'),
          'utf8'
        )
      );
      req
        .post('/graphql')
        .reply(200, {
          data: graphql,
        })
        .get(
          '/repos/fake/fake/commits/e6daec403626c9987c7af0d97b34f324cd84320a'
        )
        .reply(200, {files: [{filename: 'abc'}]});
      const targetBranch = 'main';
      const commitsSinceSha = await github.commitsSince(
        targetBranch,
        commit => {
          // this commit is the 2nd most recent
          return commit.sha === 'b29149f890e6f76ee31ed128585744d4c598924c';
        },
        {backfillFiles: true}
      );
      expect(commitsSinceSha.length).toEqual(1);
      expect(commitsSinceSha).toMatchSnapshot();
      req.done();
    });
  });

  describe('mergeCommitIterator', () => {
    const req = nock('https://api.github.com/')
      .get('/repos/fake/fake')
      .optionally()
      .reply(200, {
        default_branch: 'main',
      });

    it('handles merged pull requests without files', async () => {
      const github = await GitHub.create(gitHubConfig);
      const graphql = JSON.parse(
        readFileSync(
          resolve(fixturesPath, 'commits-since-no-files.json'),
          'utf8'
        )
      );
      req.post('/graphql').reply(200, {
        data: graphql,
      });
      const generator = github.mergeCommitIterator('main');
      const commits: Commit[] = [];
      for await (const commit of generator) {
        commits.push(commit);
      }
      expect(commits).toHaveLength(2);
      expect(commits!).toMatchSnapshot();
      req.done();
    });
  });

  describe('getCommitFiles', () => {
    const req = nock('https://api.github.com/')
      .get('/repos/fake/fake')
      .optionally()
      .reply(200, {
        default_branch: 'main',
      });

    it('fetches the list of files', async () => {
      const github = await GitHub.create(gitHubConfig);
      req
        .get('/repos/fake/fake/commits/abc123')
        .reply(200, {files: [{filename: 'abc'}]});
      const files = await github.getCommitFiles('abc123');
      expect(files).toEqual(['abc']);
      req.done();
    });

    it('paginates', async () => {
      const github = await GitHub.create(gitHubConfig);
      req
        .get('/repos/fake/fake/commits/abc123')
        .reply(
          200,
          {files: [{filename: 'abc'}]},
          {
            link: '<https://api.github.com/repos/fake/fake/commits/abc123?page=2>; rel="next", <https://api.github.com/repos/fake/fake/commits/abc123?page=2>; rel="last"',
          }
        )
        .get('/repos/fake/fake/commits/abc123?page=2')
        .reply(200, {files: [{filename: 'def'}]});
      const files = await github.getCommitFiles('abc123');
      expect(files).toEqual(['abc', 'def']);
      req.done();
    });
  });

  describe('releaseIterator', () => {
    const req = nock('https://api.github.com/')
      .get('/repos/fake/fake')
      .optionally()
      .reply(200, {
        default_branch: 'main',
      });

    it('iterates through releases', async () => {
      const github = await GitHub.create(gitHubConfig);
      const graphql = JSON.parse(
        readFileSync(resolve(fixturesPath, 'releases.json'), 'utf8')
      );
      req.post('/graphql').reply(200, {
        data: graphql,
      });
      const generator = github.releaseIterator();
      const releases: GitHubRelease[] = [];
      for await (const release of generator) {
        releases.push(release);
      }
      expect(releases).toHaveLength(5);
    });

    it('iterates through up to 3 releases', async () => {
      const github = await GitHub.create(gitHubConfig);
      const graphql = JSON.parse(
        readFileSync(resolve(fixturesPath, 'releases.json'), 'utf8')
      );
      req.post('/graphql').reply(200, {
        data: graphql,
      });
      const generator = github.releaseIterator({maxResults: 3});
      const releases: GitHubRelease[] = [];
      for await (const release of generator) {
        releases.push(release);
      }
      expect(releases).toHaveLength(3);
    });

    it('correctly identifies draft releases', async () => {
      const github = await GitHub.create(gitHubConfig);
      const graphql = JSON.parse(
        readFileSync(resolve(fixturesPath, 'releases.json'), 'utf8')
      );
      req.post('/graphql').reply(200, {
        data: graphql,
      });
      const generator = github.releaseIterator();
      let drafts = 0;
      for await (const release of generator) {
        if (release.draft) {
          drafts++;
        }
      }
      expect(drafts).toBe(1);
    });

    it('iterates through a result withouth releases', async () => {
      const github = await GitHub.create(gitHubConfig);
      req.post('/graphql').reply(200, {
        data: {
          repository: {
            releases: {
              nodes: [],
              pageInfo: {
                endCursor: null,
                hasNextPage: false,
              },
            },
          },
        },
      });
      const generator = github.releaseIterator();
      const releases: GitHubRelease[] = [];
      for await (const release of generator) {
        releases.push(release);
      }
      expect(releases).toHaveLength(0);
    });
  });

  describe('createRelease', () => {
    const req = nock('https://api.github.com/')
      .get('/repos/fake/fake')
      .optionally()
      .reply(200, {
        default_branch: 'main',
      });

    it('should create a release with a package prefix', async () => {
      const github = await GitHub.create(gitHubConfig);
      const githubCreateReleaseSpy = jest.spyOn(
        github['octokit'].repos,
        'createRelease'
      );

      req
        .post('/repos/fake/fake/releases', body => {
          expect(body).toMatchSnapshot();
          return true;
        })
        .reply(200, {
          id: 123456,
          tag_name: 'v1.2.3',
          draft: false,
          html_url: 'https://github.com/fake/fake/releases/v1.2.3',
          upload_url:
            'https://uploads.github.com/repos/fake/fake/releases/1/assets{?name,label}',
          target_commitish: 'abc123',
          body: 'Some release notes response.',
        });
      const release = await github.createRelease({
        tag: new TagName(Version.parse('1.2.3')),
        sha: 'abc123',
        notes: 'Some release notes',
      });
      req.done();
      expect(githubCreateReleaseSpy).toHaveBeenCalledExactlyOnceWith({
        name: undefined,
        owner: 'fake',
        repo: 'fake',
        tag_name: 'v1.2.3',
        body: 'Some release notes',
        target_commitish: 'abc123',
        draft: false,
        prerelease: false,
      });
      expect(release).toBeDefined();
      expect(release.id).toEqual(123456);
      expect(release.tagName).toEqual('v1.2.3');
      expect(release.sha).toEqual('abc123');
      expect(release.draft).toBe(false);
      expect(release.uploadUrl).toEqual(
        'https://uploads.github.com/repos/fake/fake/releases/1/assets{?name,label}'
      );
      expect(release.notes).toEqual('Some release notes response.');
    });

    it('should raise a DuplicateReleaseError if already_exists', async () => {
      const github = await GitHub.create(gitHubConfig);

      req
        .post('/repos/fake/fake/releases', body => {
          expect(body).toMatchSnapshot();
          return true;
        })
        .reply(422, {
          message: 'Validation Failed',
          errors: [
            {
              resource: 'Release',
              code: 'already_exists',
              field: 'tag_name',
            },
          ],
          documentation_url:
            'https://docs.github.com/rest/reference/repos#create-a-release',
        });

      await expect(
        github.createRelease({
          tag: new TagName(Version.parse('1.2.3')),
          sha: 'abc123',
          notes: 'Some release notes',
        })
      ).rejects.toSatisfy(error => {
        expect(error).toBeInstanceOf(DuplicateReleaseError);
        expect(error.stack).toInclude('GitHub.createRelease');
        expect(error.cause).toBeTruthy();
        return true;
      });
    });

    it('should raise a RequestError for other validation errors', async () => {
      const github = await GitHub.create(gitHubConfig);

      req
        .post('/repos/fake/fake/releases', body => {
          expect(body).toMatchSnapshot();
          return true;
        })
        .reply(422, {
          message: 'Invalid request.\n\n"tag_name" wasn\'t supplied.',
          documentation_url:
            'https://docs.github.com/rest/reference/repos#create-a-release',
        });

      expect.assertions(5);
      await expect(
        github.createRelease({
          tag: new TagName(Version.parse('1.2.3')),
          sha: 'abc123',
          notes: 'Some release notes',
        })
      ).rejects.toSatisfy(error => {
        expect(error).toBeInstanceOf(GitHubAPIError);
        expect(error.stack).toInclude('GitHub.createRelease');
        expect(error.cause).toBeTruthy();
        return true;
      });
    });

    it('should create a draft release', async () => {
      const github = await GitHub.create(gitHubConfig);
      const githubCreateReleaseSpy = jest.spyOn(
        github['octokit'].repos,
        'createRelease'
      );

      req
        .post('/repos/fake/fake/releases', body => {
          expect(body).toMatchSnapshot();
          return true;
        })
        .reply(200, {
          tag_name: 'v1.2.3',
          draft: true,
          html_url: 'https://github.com/fake/fake/releases/v1.2.3',
          upload_url:
            'https://uploads.github.com/repos/fake/fake/releases/1/assets{?name,label}',
          target_commitish: 'abc123',
        });
      const release = await github.createRelease(
        {
          tag: new TagName(Version.parse('1.2.3')),
          sha: 'abc123',
          notes: 'Some release notes',
        },
        {draft: true}
      );
      req.done();
      expect(githubCreateReleaseSpy).toHaveBeenCalledExactlyOnceWith({
        name: undefined,
        owner: 'fake',
        repo: 'fake',
        tag_name: 'v1.2.3',
        body: 'Some release notes',
        target_commitish: 'abc123',
        draft: true,
        prerelease: false,
      });
      expect(release).toBeDefined();
      expect(release.tagName).toEqual('v1.2.3');
      expect(release.sha).toEqual('abc123');
      expect(release.draft).toBe(true);
    });

    it('should create a prerelease release', async () => {
      const github = await GitHub.create(gitHubConfig);
      const githubCreateReleaseSpy = jest.spyOn(
        github['octokit'].repos,
        'createRelease'
      );

      req
        .post('/repos/fake/fake/releases', body => {
          expect(body).toMatchSnapshot();
          return true;
        })
        .reply(200, {
          id: 123456,
          tag_name: 'v1.2.3',
          draft: false,
          html_url: 'https://github.com/fake/fake/releases/v1.2.3',
          upload_url:
            'https://uploads.github.com/repos/fake/fake/releases/1/assets{?name,label}',
          target_commitish: 'abc123',
        });
      const release = await github.createRelease(
        {
          tag: new TagName(Version.parse('1.2.3')),
          sha: 'abc123',
          notes: 'Some release notes',
        },
        {prerelease: true}
      );
      req.done();
      expect(githubCreateReleaseSpy).toHaveBeenCalledExactlyOnceWith({
        name: undefined,
        owner: 'fake',
        repo: 'fake',
        tag_name: 'v1.2.3',
        body: 'Some release notes',
        target_commitish: 'abc123',
        draft: false,
        prerelease: true,
      });
      expect(release.id).toEqual(123456);
      expect(release.tagName).toEqual('v1.2.3');
      expect(release.sha).toEqual('abc123');
      expect(release.draft).toBe(false);
    });
  });

  describe('commentOnIssue', () => {
    const req = nock('https://api.github.com/')
      .get('/repos/fake/fake')
      .optionally()
      .reply(200, {
        default_branch: 'main',
      });

    it('can create a comment', async () => {
      const github = await GitHub.create(gitHubConfig);
      const createCommentResponse = JSON.parse(
        readFileSync(
          resolve(fixturesPath, 'create-comment-response.json'),
          'utf8'
        )
      );
      req
        .post('/repos/fake/fake/issues/1347/comments', body => {
          expect(body).toMatchSnapshot();
          return true;
        })
        .reply(201, createCommentResponse);
      const url = await github.commentOnIssue('This is a comment', 1347);
      expect(url).toEqual(
        'https://github.com/fake/fake/issues/1347#issuecomment-1'
      );
    });

    it('propagates error', async () => {
      const github = await GitHub.create(gitHubConfig);
      req.post('/repos/fake/fake/issues/1347/comments').reply(410, 'Gone');
      let thrown = false;
      try {
        await github.commentOnIssue('This is a comment', 1347);
        fail('should have thrown');
      } catch (err) {
        thrown = true;
        expect((err as GitHubAPIError).status).toEqual(410);
      }
      expect(thrown).toBe(true);
    });
  });

  describe('generateReleaseNotes', () => {
    const req = nock('https://api.github.com/')
      .get('/repos/fake/fake')
      .optionally()
      .reply(200, {
        default_branch: 'main',
      });

    it('can generate notes with previous tag', async () => {
      const github = await GitHub.create(gitHubConfig);
      req
        .post('/repos/fake/fake/releases/generate-notes', body => {
          expect(body).toMatchSnapshot();
          return body;
        })
        .reply(200, {
          name: 'Release v1.0.0 is now available!',
          body: '##Changes in Release v1.0.0 ... ##Contributors @monalisa',
        });
      const notes = await github.generateReleaseNotes(
        'v1.2.3',
        'main',
        'v1.2.2'
      );
      expect(notes).toEqual(
        '##Changes in Release v1.0.0 ... ##Contributors @monalisa'
      );
    });
    it('can generate notes without previous tag', async () => {
      const github = await GitHub.create(gitHubConfig);
      req
        .post('/repos/fake/fake/releases/generate-notes', body => {
          expect(body).toMatchSnapshot();
          return body;
        })
        .reply(200, {
          name: 'Release v1.0.0 is now available!',
          body: '##Changes in Release v1.0.0 ... ##Contributors @monalisa',
        });
      const notes = await github.generateReleaseNotes('v1.2.3', 'main');
      expect(notes).toEqual(
        '##Changes in Release v1.0.0 ... ##Contributors @monalisa'
      );
    });
  });

  describe('createReleasePullRequest', () => {
    it('should update file', async () => {
      const github = await GitHub.create(gitHubConfig);
      const createPullRequestStub = jest
        .spyOn(codeSuggester, 'createPullRequest')
        .mockResolvedValue(1);
      when(jest.spyOn(github, 'getFileContentsOnBranch'))
        .calledWith('existing-file', 'main')
        .mockResolvedValue({
          sha: 'abc123',
          content: 'somecontent',
          parsedContent: 'somecontent',
          mode: '100644',
        });
      when(jest.spyOn(github, 'getPullRequest'))
        .calledWith(1)
        .mockResolvedValue({
          title: 'created title',
          headBranchName: 'release-please--branches--main',
          baseBranchName: 'main',
          number: 1,
          body: 'some body',
          labels: [],
          files: [],
        });
      const pullRequest = await github.createReleasePullRequest(
        {
          title: PullRequestTitle.ofTargetBranch('main'),
          body: new PullRequestBody([]),
          labels: [],
          headRefName: 'release-please--branches--main',
          draft: false,
          updates: [
            {
              path: 'existing-file',
              createIfMissing: false,
              updater: new RawContent('some content'),
            },
          ],
        },
        'main'
      );
      expect(pullRequest.number).toEqual(1);
      expect(createPullRequestStub).toHaveBeenCalledOnce();
      const changes = createPullRequestStub.mock.calls[0][1];
      expect(changes).toBeDefined();
      expect(changes!.size).toEqual(1);
      expect(changes!.get('existing-file')).toBeDefined();
    });
    it('should handle missing files', async () => {
      const github = await GitHub.create(gitHubConfig);
      const createPullRequestStub = jest
        .spyOn(codeSuggester, 'createPullRequest')
        .mockResolvedValue(1);
      when(jest.spyOn(github, 'getFileContentsOnBranch'))
        .calledWith('missing-file', 'main')
        .mockRejectedValue(new FileNotFoundError('missing-file'));
      when(jest.spyOn(github, 'getPullRequest'))
        .calledWith(1)
        .mockResolvedValue({
          title: 'created title',
          headBranchName: 'release-please--branches--main',
          baseBranchName: 'main',
          number: 1,
          body: 'some body',
          labels: [],
          files: [],
        });
      const pullRequest = await github.createReleasePullRequest(
        {
          title: PullRequestTitle.ofTargetBranch('main'),
          body: new PullRequestBody([]),
          labels: [],
          headRefName: 'release-please--branches--main',
          draft: false,
          updates: [
            {
              path: 'missing-file',
              createIfMissing: false,
              updater: new RawContent('some content'),
            },
          ],
        },
        'main'
      );
      expect(pullRequest.number).toEqual(1);
      expect(createPullRequestStub).toHaveBeenCalledOnce();
      const changes = createPullRequestStub.mock.calls[0][1];
      expect(changes).toBeDefined();
      expect(changes!.size).toEqual(0);
    });
    it('should create missing file', async () => {
      const github = await GitHub.create(gitHubConfig);
      const createPullRequestStub = jest
        .spyOn(codeSuggester, 'createPullRequest')
        .mockResolvedValue(1);
      when(jest.spyOn(github, 'getFileContentsOnBranch'))
        .calledWith('missing-file', 'main')
        .mockRejectedValue(new FileNotFoundError('missing-file'));
      when(jest.spyOn(github, 'getPullRequest'))
        .calledWith(1)
        .mockResolvedValue({
          title: 'created title',
          headBranchName: 'release-please--branches--main',
          baseBranchName: 'main',
          number: 1,
          body: 'some body',
          labels: [],
          files: [],
        });
      const pullRequest = await github.createReleasePullRequest(
        {
          title: PullRequestTitle.ofTargetBranch('main'),
          body: new PullRequestBody([]),
          labels: [],
          headRefName: 'release-please--branches--main',
          draft: false,
          updates: [
            {
              path: 'missing-file',
              createIfMissing: true,
              updater: new RawContent('some content'),
            },
          ],
        },
        'main'
      );
      expect(pullRequest.number).toEqual(1);
      expect(createPullRequestStub).toHaveBeenCalledOnce();
      const changes = createPullRequestStub.mock.calls[0][1];
      expect(changes).toBeDefined();
      expect(changes!.size).toEqual(1);
      expect(changes!.get('missing-file')).toBeDefined();
    });
  });

  describe('createFileOnNewBranch', () => {
    let req = nock('https://api.github.com/')
      .get('/repos/fake/fake')
      .optionally()
      .reply(200, {
        default_branch: 'main',
      });

    it('forks a new branch if the branch does not exist', async () => {
      const github = await GitHub.create(gitHubConfig);
      req = req
        .get('/repos/fake/fake/git/ref/heads%2Fbase-branch')
        .reply(200, {
          object: {
            sha: 'abc123',
          },
        })
        .get('/repos/fake/fake/git/ref/heads%2Fnew-branch')
        .reply(404)
        .post('/repos/fake/fake/git/refs', body => {
          expect(body.ref).toEqual('refs/heads/new-branch');
          expect(body.sha).toEqual('abc123');
          return body;
        })
        .reply(201, {
          object: {sha: 'abc123'},
        })
        .put('/repos/fake/fake/contents/new-file.txt', body => {
          expect(body.message).toEqual('Saving release notes');
          expect(body.branch).toEqual('new-branch');
          expect(Buffer.from(body.content, 'base64').toString('utf-8')).toEqual(
            'some contents'
          );
          return body;
        })
        .reply(201, {
          content: {
            html_url: 'https://github.com/fake/fake/blob/new-file.txt',
          },
        });
      const url = await github.createFileOnNewBranch(
        'new-file.txt',
        'some contents',
        'new-branch',
        'base-branch'
      );
      expect(url).toEqual('https://github.com/fake/fake/blob/new-file.txt');
    });
    it('reuses an existing branch', async () => {
      const github = await GitHub.create(gitHubConfig);
      req = req
        .get('/repos/fake/fake/git/ref/heads%2Fbase-branch')
        .reply(200, {
          object: {
            sha: 'abc123',
          },
        })
        .get('/repos/fake/fake/git/ref/heads%2Fnew-branch')
        .reply(200, {
          object: {
            sha: 'def234',
          },
        })
        .patch('/repos/fake/fake/git/refs/heads%2Fnew-branch', body => {
          expect(body.force).toBe(true);
          expect(body.sha).toEqual('abc123');
          return body;
        })
        .reply(200, {
          object: {sha: 'abc123'},
        })
        .put('/repos/fake/fake/contents/new-file.txt', body => {
          expect(body.message).toEqual('Saving release notes');
          expect(body.branch).toEqual('new-branch');
          expect(Buffer.from(body.content, 'base64').toString('utf-8')).toEqual(
            'some contents'
          );
          return body;
        })
        .reply(201, {
          content: {
            html_url: 'https://github.com/fake/fake/blob/new-file.txt',
          },
        });
      const url = await github.createFileOnNewBranch(
        'new-file.txt',
        'some contents',
        'new-branch',
        'base-branch'
      );
      expect(url).toEqual('https://github.com/fake/fake/blob/new-file.txt');
    });
  });

  describe('updatePullRequest', () => {
    let req = nock('https://api.github.com/')
      .get('/repos/fake/fake')
      .optionally()
      .reply(200, {
        default_branch: 'main',
      });

    it('handles a PR body that is too big', async () => {
      const github = await GitHub.create(gitHubConfig);
      req = req.patch('/repos/fake/fake/pulls/123').reply(200, {
        number: 123,
        title: 'updated-title',
        body: 'updated body',
        labels: [],
        head: {
          ref: 'abc123',
        },
        base: {
          ref: 'def234',
        },
      });
      const pullRequest = {
        title: PullRequestTitle.ofTargetBranch('main'),
        body: new PullRequestBody(mockReleaseData(1000), {useComponents: true}),
        labels: [],
        headRefName: 'release-please--branches--main',
        draft: false,
        updates: [],
      };
      const pullRequestOverflowHandler = new MockPullRequestOverflowHandler();
      const handleOverflowStub = jest
        .spyOn(pullRequestOverflowHandler, 'handleOverflow')
        .mockResolvedValue('overflow message');
      await github.updatePullRequest(123, pullRequest, 'main', {
        pullRequestOverflowHandler,
      });
      expect(handleOverflowStub).toHaveBeenCalledOnce();
      req.done();
    });
  });
});