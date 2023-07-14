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

import {parseConventionalCommits, ConventionalCommit} from '../src/commit';
import {buildCommitFromFixture, buildMockCommit} from './helpers';

describe('parseConventionalCommits', () => {
  it('can parse plain commit messages', async () => {
    const commits = [
      buildMockCommit('feat: some feature'),
      buildMockCommit('fix: some bugfix'),
      buildMockCommit('docs: some documentation'),
    ];
    const conventionalCommits = parseConventionalCommits(commits);
    expect(conventionalCommits).toHaveLength(3);
    expect(conventionalCommits[0].type).toBe('feat');
    expect(conventionalCommits[0].scope).toBeNull();
    expect(conventionalCommits[1].type).toBe('fix');
    expect(conventionalCommits[1].scope).toBeNull();
    expect(conventionalCommits[2].type).toBe('docs');
    expect(conventionalCommits[2].scope).toBeNull();
  });

  it('can parse a breaking change', async () => {
    const commits = [buildMockCommit('fix!: some breaking fix')];
    const conventionalCommits = parseConventionalCommits(commits);
    expect(conventionalCommits).toHaveLength(1);
    expect(conventionalCommits[0].type).toBe('fix');
    expect(conventionalCommits[0].scope).toBeNull();
    expect(conventionalCommits[0].breaking).toBe(true);
    expect(conventionalCommits[0].notes).toHaveLength(1);
    expect(conventionalCommits[0].notes[0].title).toBe('BREAKING CHANGE');
    expect(conventionalCommits[0].notes[0].text).toBe('some breaking fix');
  });

  it('can parse multiple commit messages from a single commit', async () => {
    const commits = [buildCommitFromFixture('multiple-messages')];
    const conventionalCommits = parseConventionalCommits(commits);
    expect(conventionalCommits).toHaveLength(2);
    expect(conventionalCommits[0].type).toBe('fix');
    expect(conventionalCommits[0].scope).toBeNull();
    expect(conventionalCommits[1].type).toBe('feat');
    expect(conventionalCommits[1].scope).toBeNull();
  });

  it('handles BREAKING CHANGE body', async () => {
    const commits = [buildCommitFromFixture('breaking-body')];
    const conventionalCommits = parseConventionalCommits(commits);
    expect(conventionalCommits).toHaveLength(1);
    expect(conventionalCommits[0].type).toEqual('feat');
    expect(conventionalCommits[0].breaking).toBe(true);
    expect(conventionalCommits[0].notes).toHaveLength(1);
    expect(conventionalCommits[0].notes[0].title).toEqual('BREAKING CHANGE');
    expect(conventionalCommits[0].notes[0].text).toEqual(
      'this is actually a breaking change'
    );
  });

  it('links bugs', async () => {
    const commits = [buildCommitFromFixture('bug-link')];
    const conventionalCommits = parseConventionalCommits(commits);
    expect(conventionalCommits).toHaveLength(1);
    expect(conventionalCommits[0].type).toEqual('fix');
    expect(conventionalCommits[0].breaking).toBe(false);
    expect(conventionalCommits[0].references).toHaveLength(1);
    expect(conventionalCommits[0].references[0].prefix).toEqual('#');
    expect(conventionalCommits[0].references[0].issue).toEqual('123');
    expect(conventionalCommits[0].references[0].action).toEqual('Fixes');
  });

  it('captures git trailers', async () => {
    const commits = [buildCommitFromFixture('git-trailers-with-breaking')];
    const conventionalCommits = parseConventionalCommits(commits);
    // the parser detects git trailers as extra semantic commits
    // expect(conventionalCommits).lengthOf(1);
    const mainCommit = conventionalCommits.find(
      conventionalCommit => conventionalCommit.bareMessage === 'some fix'
    );
    expect(mainCommit).toBeDefined();
    expect(mainCommit!.type).toEqual('fix');
    expect(mainCommit!.breaking).toBe(true);
    expect(mainCommit!.notes).toHaveLength(1);
    expect(mainCommit!.notes[0].title).toEqual('BREAKING CHANGE');
    expect(mainCommit!.notes[0].text).toEqual(
      'this is actually a breaking change'
    );
  });

  it('parses meta commits', async () => {
    const commits = [buildCommitFromFixture('meta')];
    const conventionalCommits = parseConventionalCommits(commits);
    const fixCommit1 = conventionalCommits.find(
      conventionalCommit => conventionalCommit.bareMessage === 'fixes bug #733'
    );
    expect(fixCommit1).toBeDefined();
    expect(fixCommit1!.type).toEqual('fix');
    expect(fixCommit1!.scope).toBeNull();
    const fixCommit2 = conventionalCommits.find(
      conventionalCommit =>
        conventionalCommit.bareMessage === 'fixes security center.'
    );
    expect(fixCommit2).toBeDefined();
    expect(fixCommit2!.type).toEqual('fix');
    expect(fixCommit2!.scope).toEqual('securitycenter');
    const featCommit = conventionalCommits.find(
      conventionalCommit =>
        conventionalCommit.bareMessage === 'migrate microgenerator'
    );
    expect(featCommit).toBeDefined();
    expect(featCommit!.breaking).toBe(true);
    expect(featCommit!.type).toEqual('feat');
    expect(featCommit!.scope).toEqual('recaptchaenterprise');
  });

  it('includes multi-line breaking changes', async () => {
    const commits = [buildCommitFromFixture('multi-line-breaking-body')];
    const conventionalCommits = parseConventionalCommits(commits);
    expect(conventionalCommits).toHaveLength(1);
    expect(conventionalCommits[0].breaking).toBe(true);
    expect(conventionalCommits[0].notes).toHaveLength(1);
    expect(conventionalCommits[0].notes[0].text).toContain('second line');
    expect(conventionalCommits[0].notes[0].text).toContain('third line');
  });

  it('supports additional markdown for breaking change, if prefixed with list', async () => {
    const commits = [buildCommitFromFixture('multi-line-breaking-body-list')];
    const conventionalCommits = parseConventionalCommits(commits);
    expect(conventionalCommits).toHaveLength(1);
    expect(conventionalCommits[0].breaking).toBe(true);
    expect(conventionalCommits[0].notes).toHaveLength(1);
    expect(conventionalCommits[0].notes[0].text).toContain('deleted API foo');
    expect(conventionalCommits[0].notes[0].text).toContain('deleted API bar');
  });

  it('does not include content two newlines after BREAKING CHANGE', async () => {
    const commits = [buildCommitFromFixture('breaking-body-content-after')];
    const conventionalCommits = parseConventionalCommits(commits);
    expect(conventionalCommits).toHaveLength(1);
    expect(conventionalCommits[0].breaking).toBe(true);
    expect(conventionalCommits[0].message).toEqual(
      expect.not.arrayContaining(['I should be removed'])
    );
  });

  // Refs: #1257
  it('removes content before and after BREAKING CHANGE in body', async () => {
    const commits = [buildCommitFromFixture('1257-breaking-change')];
    const conventionalCommits = parseConventionalCommits(commits);
    expect(conventionalCommits).toHaveLength(1);
    expect(conventionalCommits[0].breaking).toBe(true);
    expect(conventionalCommits[0].notes[0].text).toBe('my comment');
  });

  it('handles Release-As footers', async () => {
    const commits = [buildCommitFromFixture('release-as')];
    const conventionalCommits = parseConventionalCommits(commits);
    const metaCommit = conventionalCommits.find(
      conventionalCommit => conventionalCommit.bareMessage === 'correct release'
    );
    expect(metaCommit).toBeDefined();
    expect(metaCommit!.breaking).toBe(false);
    expect(metaCommit!.notes).toHaveLength(1);
    expect(metaCommit!.notes[0].title).toEqual('RELEASE AS');
    expect(metaCommit!.notes[0].text).toEqual('v3.0.0');
  });

  it('can override the commit message from BEGIN_COMMIT_OVERRIDE body', async () => {
    const commit = buildMockCommit('chore: some commit');
    const body = 'BEGIN_COMMIT_OVERRIDE\nfix: some fix\nEND_COMMIT_OVERRIDE';
    commit.pullRequest = {
      headBranchName: 'fix-something',
      baseBranchName: 'main',
      number: 123,
      title: 'chore: some commit',
      labels: [],
      files: [],
      body,
    };

    const conventionalCommits = parseConventionalCommits([commit]);
    expect(conventionalCommits).toHaveLength(1);
    expect(conventionalCommits[0].type).toEqual('fix');
    expect(conventionalCommits[0].bareMessage).toEqual('some fix');
  });

  it('can override the commit message from BEGIN_COMMIT_OVERRIDE body with a meta commit', async () => {
    const commit = buildMockCommit('chore: some commit');
    const body =
      'BEGIN_COMMIT_OVERRIDE\nfix: some fix\n\nfeat: another feature\nEND_COMMIT_OVERRIDE';
    commit.pullRequest = {
      headBranchName: 'fix-something',
      baseBranchName: 'main',
      number: 123,
      title: 'chore: some commit',
      labels: [],
      files: [],
      body,
    };

    const conventionalCommits = parseConventionalCommits([commit]);
    expect(conventionalCommits).toHaveLength(2);
    expect(conventionalCommits[0].type).toEqual('feat');
    expect(conventionalCommits[0].bareMessage).toEqual('another feature');
    expect(conventionalCommits[1].type).toEqual('fix');
    expect(conventionalCommits[1].bareMessage).toEqual('some fix');
  });

  it('handles a special commit separator', async () => {
    const commits = [buildCommitFromFixture('multiple-commits-with-separator')];
    const conventionalCommits = parseConventionalCommits(commits);
    let commit = assertHasCommit(
      conventionalCommits,
      'annotating some fields as REQUIRED'
    );
    expect(commit.type).toEqual('fix');
    commit = assertHasCommit(
      conventionalCommits,
      'include metadata file, add exclusions for samples to handwritten libraries'
    );
    expect(commit.type).toEqual('docs');
    expect(commit.scope).toEqual('samples');
    commit = assertHasCommit(
      conventionalCommits,
      'add flag to distinguish autogenerated libs with a handwritten layer'
    );
    expect(commit.type).toEqual('build');
    commit = assertHasCommit(
      conventionalCommits,
      'update v2.14.1 gapic-generator-typescript'
    );
    expect(commit.type).toEqual('chore');
  });

  // it('ignores reverted commits', async () => {
  //   const commits = [
  //     {sha: 'sha1', message: 'feat: some feature', files: ['path1/file1.txt']},
  //     {
  //       sha: 'sha2',
  //       message: 'revert: feat: some feature\nThe reverts commit sha1.\n',
  //       files: ['path1/file1.rb'],
  //     },
  //     {
  //       sha: 'sha3',
  //       message: 'docs: some documentation',
  //       files: ['path1/file1.java'],
  //     },
  //   ];
  //   const conventionalCommits = parseConventionalCommits(commits);
  //   expect(conventionalCommits).lengthOf(1);
  //   expect(conventionalCommits[0].type).to.equal('docs');
  //   expect(conventionalCommits[0].scope).is.null;
  // });
});

function assertHasCommit(
  commits: ConventionalCommit[],
  bareMessage: string
): ConventionalCommit {
  const found = commits.find(commit =>
    commit.bareMessage.includes(bareMessage)
  );
  // commit with message: '${bareMessage}'
  expect(found).toBeDefined();
  return found!;
}
