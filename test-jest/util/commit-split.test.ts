// Copyright 2022 Google LLC
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

import {CommitSplit} from '../../src/util/commit-split';
import {Commit} from '../../src/commit';

describe('CommitSplit', () => {
  const commits: Commit[] = [
    {
      sha: 'abc123',
      message: 'commit abc123',
      files: ['pkg1/foo.txt', 'pkg2/bar.txt'],
    },
    {
      sha: 'def234',
      message: 'commit def234',
      files: ['pkg1/foo2.txt', 'pkg3/asdf.txt'],
    },
    {
      sha: 'efg',
      message: 'empty files',
      files: [],
    },
    {
      sha: 'hij',
      message: 'path prefixes',
      files: ['pkg5/foo.txt', 'pkg6/pkg5/foo.txt'],
    },
  ];
  it('defaults to excluding empty commits', () => {
    const commitSplit = new CommitSplit();
    expect(commitSplit.includeEmpty).toBe(false);
  });
  it('uses path prefixes', () => {
    const commitSplit = new CommitSplit({
      packagePaths: ['pkg5', 'pkg6/pkg5'],
    });
    const splitCommits = commitSplit.split(commits);
    expect(splitCommits['pkg1']).toBeUndefined();
    expect(splitCommits['pkg2']).toBeUndefined();
    expect(splitCommits['pkg3']).toBeUndefined();
    expect(splitCommits['pkg4']).toBeUndefined();
    expect(splitCommits['pkg5']).toHaveLength(1);
    expect(splitCommits['pkg6/pkg5']).toHaveLength(1);
  });
  it('handles nested folders', () => {
    const commits: Commit[] = [
      {
        sha: 'abc123',
        message: 'commit abc123',
        files: ['core/foo.txt', 'pkg2/bar.txt'],
      },
      {
        sha: 'def234',
        message: 'commit def234',
        files: ['core/subpackage/foo2.txt', 'pkg3/asdf.txt'],
      },
    ];
    const commitSplit = new CommitSplit({
      packagePaths: ['core', 'core/subpackage'],
    });
    const splitCommits = commitSplit.split(commits);
    expect(splitCommits['core']).toHaveLength(1);
    expect(splitCommits['core/subpackage']).toHaveLength(1);
  });
  describe('including empty commits', () => {
    it('should separate commits', () => {
      const commitSplit = new CommitSplit({
        includeEmpty: true,
      });
      const splitCommits = commitSplit.split(commits);
      expect(splitCommits['pkg1']).toHaveLength(3);
      expect(splitCommits['pkg2']).toHaveLength(2);
      expect(splitCommits['pkg3']).toHaveLength(2);
      expect(splitCommits['pkg4']).toBeUndefined();
    });
    it('should separate commits with limited list of paths', () => {
      const commitSplit = new CommitSplit({
        includeEmpty: true,
        packagePaths: ['pkg1', 'pkg4'],
      });
      const splitCommits = commitSplit.split(commits);
      expect(splitCommits['pkg1']).toHaveLength(3);
      expect(splitCommits['pkg2']).toBeUndefined();
      expect(splitCommits['pkg3']).toBeUndefined();
      expect(splitCommits['pkg4']).toHaveLength(1);
    });
  });

  describe('excluding empty commits', () => {
    it('should separate commits', () => {
      const commitSplit = new CommitSplit({
        includeEmpty: false,
      });
      const splitCommits = commitSplit.split(commits);
      expect(splitCommits['pkg1']).toHaveLength(2);
      expect(splitCommits['pkg2']).toHaveLength(1);
      expect(splitCommits['pkg3']).toHaveLength(1);
      expect(splitCommits['pkg4']).toBeUndefined();
    });
    it('should separate commits with limited list of paths', () => {
      const commitSplit = new CommitSplit({
        includeEmpty: false,
        packagePaths: ['pkg1', 'pkg4'],
      });
      const splitCommits = commitSplit.split(commits);
      expect(splitCommits['pkg1']).toHaveLength(2);
      expect(splitCommits['pkg2']).toBeUndefined();
      expect(splitCommits['pkg3']).toBeUndefined();
      expect(splitCommits['pkg4']).toBeUndefined();
    });
  });
});
