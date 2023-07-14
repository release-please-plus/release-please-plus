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

import {BranchName} from '../../src/util/branch-name';
import {Version} from '../../src/version';

describe('BranchName', () => {
  describe('parse', () => {
    describe('autorelease branch name', () => {
      it('parses a versioned branch name', () => {
        const name = 'release-v1.2.3';
        const branchName = BranchName.parse(name);
        expect(branchName).toBeDefined();
        expect(branchName?.getTargetBranch()).toBeUndefined();
        expect(branchName?.getComponent()).toBeUndefined();
        expect(branchName?.getVersion()?.toString()).toEqual('1.2.3');
        expect(branchName?.toString()).toEqual(name);
      });
      it('parses a versioned branch name with component', () => {
        const name = 'release-storage-v1.2.3';
        const branchName = BranchName.parse(name);
        expect(branchName).toBeDefined();
        expect(branchName?.getTargetBranch()).toBeUndefined();
        expect(branchName?.getComponent()).toEqual('storage');
        expect(branchName?.getVersion()?.toString()).toEqual('1.2.3');
        expect(branchName?.toString()).toEqual(name);
      });
      it('should not crash on parsing', () => {
        const name = 'release-storage-v1';
        const branchName = BranchName.parse(name);
        expect(branchName).toBeUndefined();
      });
    });
    describe('v12 format', () => {
      it('parses a target branch', () => {
        const name = 'release-please/branches/main';
        const branchName = BranchName.parse(name);
        expect(branchName).toBeDefined();
        expect(branchName?.getTargetBranch()).toEqual('main');
        expect(branchName?.getComponent()).toBeUndefined();
        expect(branchName?.getVersion()).toBeUndefined();
        expect(branchName?.toString()).toEqual(name);
      });

      it('parses a target branch and component', () => {
        const name = 'release-please/branches/main/components/storage';
        const branchName = BranchName.parse(name);
        expect(branchName).toBeDefined();
        expect(branchName?.getTargetBranch()).toEqual('main');
        expect(branchName?.getComponent()).toEqual('storage');
        expect(branchName?.getVersion()).toBeUndefined();
        expect(branchName?.toString()).toEqual(name);
      });
    });

    it('parses a target branch', () => {
      const name = 'release-please--branches--main';
      const branchName = BranchName.parse(name);
      expect(branchName).toBeDefined();
      expect(branchName?.getTargetBranch()).toEqual('main');
      expect(branchName?.getComponent()).toBeUndefined();
      expect(branchName?.getVersion()).toBeUndefined();
      expect(branchName?.toString()).toEqual(name);
    });

    it('parses a target branch that starts with a v', () => {
      const name = 'release-please--branches--v3.3.x';
      const branchName = BranchName.parse(name);
      expect(branchName).toBeDefined();
      expect(branchName?.getTargetBranch()).toEqual('v3.3.x');
      expect(branchName?.getComponent()).toBeUndefined();
      expect(branchName?.getVersion()).toBeUndefined();
      expect(branchName?.toString()).toEqual(name);
    });

    it('parses a target branch named with a valid semver', () => {
      const name = 'release-please--branches--v3.3.9';
      const branchName = BranchName.parse(name);
      expect(branchName).toBeDefined();
      expect(branchName?.getTargetBranch()).toEqual('v3.3.9');
      expect(branchName?.getComponent()).toBeUndefined();
      expect(branchName?.getVersion()).toBeUndefined();
      expect(branchName?.toString()).toEqual(name);
    });

    it('parses a target branch and component', () => {
      const name = 'release-please--branches--main--components--storage';
      const branchName = BranchName.parse(name);
      expect(branchName).toBeDefined();
      expect(branchName?.getTargetBranch()).toEqual('main');
      expect(branchName?.getComponent()).toEqual('storage');
      expect(branchName?.getVersion()).toBeUndefined();
      expect(branchName?.toString()).toEqual(name);
    });

    it('parses a target branch that has a /', () => {
      const name = 'release-please--branches--hotfix/3.3.x';
      const branchName = BranchName.parse(name);
      expect(branchName).toBeDefined();
      expect(branchName?.getTargetBranch()).toEqual('hotfix/3.3.x');
      expect(branchName?.getComponent()).toBeUndefined();
      expect(branchName?.getVersion()).toBeUndefined();
      expect(branchName?.toString()).toEqual(name);
    });

    it('fails to parse', () => {
      const branchName = BranchName.parse('release-foo');
      expect(branchName).toBeUndefined();
    });
  });
  describe('ofVersion', () => {
    it('builds the autorelease versioned branch name', () => {
      const branchName = BranchName.ofVersion(Version.parse('1.2.3'));
      expect(branchName.toString()).toEqual('release-v1.2.3');
    });
  });
  describe('ofComponentVersion', () => {
    it('builds the autorelease versioned branch name with component', () => {
      const branchName = BranchName.ofComponentVersion(
        'storage',
        Version.parse('1.2.3')
      );
      expect(branchName.toString()).toEqual('release-storage-v1.2.3');
    });
  });
  describe('ofTargetBranch', () => {
    it('builds branchname with only target branch', () => {
      const branchName = BranchName.ofTargetBranch('main');
      expect(branchName.toString()).toEqual('release-please--branches--main');
    });
  });
  describe('ofComponentTargetBranch', () => {
    it('builds branchname with target branch and component', () => {
      const branchName = BranchName.ofComponentTargetBranch('foo', 'main');
      expect(branchName.toString()).toEqual(
        'release-please--branches--main--components--foo'
      );
    });
  });
});
