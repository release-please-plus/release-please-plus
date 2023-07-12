// Copyright 2020 Google LLC
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

import {readFileSync, readdirSync, statSync} from 'fs';
import {resolve, posix} from 'path';
import * as crypto from 'crypto';
import * as suggester from 'code-suggester';
import {when} from 'jest-when';
import {CreatePullRequestUserOptions} from 'code-suggester/build/src/types';
import {Octokit} from '@octokit/rest';
import {
  Commit,
  ConventionalCommit,
  parseConventionalCommits,
} from '../src/commit';
import {GitHub, GitHubTag, GitHubRelease} from '../src/github';
import {Update} from '../src/update';
import {CandidateReleasePullRequest} from '../src/manifest';
import {Version} from '../src/version';
import {PullRequestTitle} from '../src/util/pull-request-title';
import {PullRequestBody, ReleaseData} from '../src/util/pull-request-body';
import {BranchName} from '../src/util/branch-name';
import {ReleaseType} from '../src/factory';
import {
  GitHubFileContents,
  DEFAULT_FILE_MODE,
} from '@google-automations/git-file-utils';
import {CompositeUpdater} from '../src/updaters/composite';
import {PullRequestOverflowHandler} from '../src/util/pull-request-overflow-handler';
import {ReleasePullRequest} from '../src/release-pull-request';
import {PullRequest} from '../src/pull-request';

export function stubSuggesterWithSnapshot() {
  jest.spyOn(suggester, 'createPullRequest')
    .mockImplementation(
      (
        _octokit: Octokit,
        changes: suggester.Changes | null | undefined,
        options: CreatePullRequestUserOptions
      ): Promise<number> => {
        expect(stringifyExpectedChanges([...changes!])).toMatchSnapshot();
        expect(stringifyExpectedOptions(options)).toMatchSnapshot();
        return Promise.resolve(22);
      }
    );
}

export function safeSnapshot(content: string) {
  expect(dateSafe(newLine(content))).toMatchSnapshot();
}

export function dateSafe(content: string): string {
  return content.replace(
    /[0-9]{4}-[0-9]{2}-[0-9]{2}/g,
    '1983-10-10' // use a fake date, so that we don't break daily.
  );
}

function stringifyExpectedOptions(
  expected: CreatePullRequestUserOptions
): string {
  expected.description = newLine(expected.description);
  let stringified = '';
  for (const [option, value] of Object.entries(expected)) {
    stringified = `${stringified}\n${option}: ${value}`;
  }
  return dateSafe(stringified);
}

function newLine(content: string): string {
  return content.replace(/\r\n/g, '\n');
}
/*
 * Given an object of changes expected to be made by code-suggester API,
 * stringify content in such a way that it works well for snapshots:
 */
export function stringifyExpectedChanges(expected: [string, object][]): string {
  let stringified = '';
  for (const update of expected) {
    stringified = `${stringified}\nfilename: ${update[0]}`;
    const obj = update[1] as {[key: string]: string};
    stringified = `${stringified}\n${newLine(obj.content)}`;
  }
  return dateSafe(stringified);
}

/*
 * Reads a plain-old-JavaScript object, stored in fixtures directory.
 * these are used to represent responses from the methods in the github.ts
 * wrapper for GitHub API calls:
 */
export function readPOJO(name: string): object {
  const content = readFileSync(
    resolve('./test/fixtures/pojos', `${name}.json`),
    'utf8'
  );
  return JSON.parse(content);
}

export function buildMockConventionalCommit(
  message: string,
  files: string[] = []
): ConventionalCommit[] {
  return parseConventionalCommits([
    {
      // Ensure SHA is same on Windows with replace:
      sha: crypto
        .createHash('md5')
        .update(message.replace(/\r\n/g, '\n'))
        .digest('hex'),
      message,
      files: files,
    },
  ]);
}

export function buildMockCommit(message: string, files: string[] = []): Commit {
  return {
    // Ensure SHA is same on Windows with replace:
    sha: crypto
      .createHash('md5')
      .update(message.replace(/\r\n/g, '\n'))
      .digest('hex'),
    message,
    files: files,
  };
}

export function buildGitHubFileContent(
  fixturesPath: string,
  fixture: string
): GitHubFileContents {
  return buildGitHubFileRaw(
    readFileSync(resolve(fixturesPath, fixture), 'utf8').replace(/\r\n/g, '\n')
  );
}

export function buildGitHubFileRaw(content: string): GitHubFileContents {
  return {
    content: Buffer.from(content, 'utf8').toString('base64'),
    parsedContent: content,
    // fake a consistent sha
    sha: crypto.createHash('md5').update(content).digest('hex'),
    mode: DEFAULT_FILE_MODE,
  };
}

export interface StubFiles {
  github: GitHub;

  // "master" TODO update all test code to use "main"
  targetBranch?: string;

  // Example1: test/updaters/fixtures/python
  // Example2: test/fixtures/releaser/repo
  fixturePath: string;

  // list of files in the mocked repo relative to the repo root. These should
  // have corresponding fixture files to use as stubbed content.
  // Example1: ["setup.py, "src/foolib/version.py"]
  // Example2: ["python/setup.py", "python/src/foolib/version.py"]
  files: string[];

  // If true, the fixture files are assumed to exist directly beneath
  // Example (following Example1 above)
  // - test/updaters/fixtures/python/setup.py
  // - test/updaters/fixtures/python/version.py
  //
  // if false, the fixture files are assumed to exist under fixturePath *with*
  // their relative path prefix.
  // Example (following Example2 above)
  // - test/fixtures/releaser/repo/python/setup.py
  // - test/fixtures/releaser/python/src/foolib/version.py
  flatten?: boolean;

  // Inline content for files to stub.
  // Example: [
  //  ['pkg1/package.json', '{"version":"1.2.3","name":"@foo/pkg1"}']
  //  ['py/setup.py', 'version = "3.2.1"\nname = "pylib"']
  // ]
  inlineFiles?: [string, string][];
}

export function stubFilesFromFixtures(options: StubFiles) {
  const {fixturePath, github, files} = options;
  const inlineFiles = options.inlineFiles ?? [];
  const overlap = inlineFiles.filter(f => files.includes(f[0]));
  if (overlap.length > 0) {
    throw new Error(
      'Overlap between files and inlineFiles: ' + JSON.stringify(overlap)
    );
  }
  const targetBranch = options.targetBranch ?? 'master';
  const flatten = options.flatten ?? true;
  const stub = jest.spyOn(github, 'getFileContentsOnBranch');
  for (const file of files) {
    let fixtureFile = file;
    if (flatten) {
      const parts = file.split('/');
      fixtureFile = parts[parts.length - 1];
    }
    when(stub)
      .calledWith(file, targetBranch)
      .mockResolvedValue(buildGitHubFileContent(fixturePath, fixtureFile));
  }
  for (const [file, content] of inlineFiles) {
    when(stub)
      .calledWith(file, targetBranch)
      .mockResolvedValue(buildGitHubFileRaw(content));
  }
  stub.mockRejectedValue(Object.assign(Error('not found'), {status: 404}));
}

// get list of files in a directory
export function getFilesInDir(
  directory: string,
  fileList: string[] = []
): string[] {
  const items = readdirSync(directory);
  for (const item of items) {
    const stat = statSync(posix.join(directory, item));
    if (stat.isDirectory())
      fileList = getFilesInDir(posix.join(directory, item), fileList);
    else fileList.push(posix.join(directory, item));
  }
  return fileList;
}

// get list of files with a particular prefix in a directory
export function getFilesInDirWithPrefix(directory: string, prefix: string) {
  const allFiles = getFilesInDir(directory);
  return allFiles
    .filter(p => {
      return posix.extname(p) === `.${prefix}`;
    })
    .map(p => posix.relative(directory, p));
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function assertHasUpdate(
  updates: Update[],
  path: string,
  clazz?: any
): Update {
  const found = updates.find(update => {
    return update.path === path;
  });
  // update for ${path}
  expect(found).toBeDefined();
  if (clazz) {
    expect(found?.updater).toBeInstanceOf(clazz);
  }
  return found!;
}

export function assertHasUpdates(
  updates: Update[],
  path: string,
  ...clazz: any
) {
  if (clazz.length <= 1) {
    return assertHasUpdate(updates, path, clazz[0]);
  }

  const composite = assertHasUpdate(updates, path, CompositeUpdater)
    .updater as CompositeUpdater;
  expect(composite.updaters).toHaveLength(clazz.length);
  for (let i = 0; i < clazz.length; i++) {
    expect(composite.updaters[i]).toBeInstanceOf(clazz[i]);
  }
  return composite;
}

export function assertNoHasUpdate(updates: Update[], path: string) {
  const found = updates.find(update => {
    return update.path === path;
  });
  // update for ${path}
  expect(found).toBeUndefined();
}

export function loadCommitFixtures(name: string): Commit[] {
  const content = readFileSync(
    resolve('./test/fixtures/commits', `${name}.json`),
    'utf8'
  );
  return JSON.parse(content);
}

export function buildCommitFromFixture(name: string): Commit {
  const message = readFileSync(
    resolve('./test/fixtures/commit-messages', `${name}.txt`),
    'utf8'
  );
  return buildMockCommit(message);
}

interface MockCandidatePullRequestOptions {
  component?: string;
  updates?: Update[];
  notes?: string;
  draft?: boolean;
  labels?: string[];
  group?: string;
}
export function buildMockCandidatePullRequest(
  path: string,
  releaseType: ReleaseType,
  versionString: string,
  options: MockCandidatePullRequestOptions = {}
): CandidateReleasePullRequest {
  const version = Version.parse(versionString);
  return {
    path,
    pullRequest: {
      title: PullRequestTitle.ofTargetBranch('main'),
      body: new PullRequestBody([
        {
          component: options.component,
          version,
          notes:
            options.notes ??
            `Release notes for path: ${path}, releaseType: ${releaseType}`,
        },
      ]),
      updates: options.updates ?? [],
      labels: options.labels ?? [],
      headRefName: BranchName.ofTargetBranch('main').toString(),
      version,
      draft: options.draft ?? false,
      group: options.group,
    },
    config: {
      releaseType,
    },
  };
}

export function mockCommits(github: GitHub, commits: Commit[]) {
  async function* fakeGenerator() {
    for (const commit of commits) {
      yield commit;
    }
  }
  return jest.spyOn(github, 'mergeCommitIterator')
    .mockReturnValue(fakeGenerator());
}

export function mockReleases(github: GitHub, releases: GitHubRelease[]) {
  async function* fakeGenerator() {
    for (const release of releases) {
      yield release;
    }
  }
  return jest.spyOn(github, 'releaseIterator').mockReturnValue(fakeGenerator());
}

export function mockTags(github: GitHub, tags: GitHubTag[]) {
  async function* fakeGenerator() {
    for (const tag of tags) {
      yield tag;
    }
  }
  return jest.spyOn(github, 'tagIterator').mockReturnValue(fakeGenerator());
}

export function mockPullRequests(github: GitHub, pullRequests: PullRequest[]) {
  async function* fakeGenerator() {
    for (const pullRequest of pullRequests) {
      yield pullRequest;
    }
  }
  return jest.spyOn(github, 'pullRequestIterator')
    .mockReturnValue(fakeGenerator());
}

export function mockReleaseData(count: number): ReleaseData[] {
  const releaseData: ReleaseData[] = [];
  const version = Version.parse('1.2.3');
  for (let i = 0; i < count; i++) {
    releaseData.push({
      component: `component${i}`,
      version,
      notes: `release notes for component${i}`,
    });
  }
  return releaseData;
}

export class MockPullRequestOverflowHandler
  implements PullRequestOverflowHandler
{
  async handleOverflow(
    pullRequest: ReleasePullRequest,
    _maxSize?: number | undefined
  ): Promise<string> {
    return pullRequest.body.toString();
  }
  async parseOverflow(
    pullRequest: PullRequest
  ): Promise<PullRequestBody | undefined> {
    return PullRequestBody.parse(pullRequest.body);
  }
}
