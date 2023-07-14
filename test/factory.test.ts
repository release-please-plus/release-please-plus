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

import {
  buildStrategy,
  getReleaserTypes,
  registerReleaseType,
  unregisterReleaseType,
} from '../src/factory';
import {GitHub} from '../src/github';
import {Simple} from '../src/strategies/simple';
import {DefaultVersioningStrategy} from '../src/versioning-strategies/default';
import {AlwaysBumpPatch} from '../src/versioning-strategies/always-bump-patch';
import {Ruby} from '../src/strategies/ruby';
import {JavaYoshi} from '../src/strategies/java-yoshi';
import {JavaSnapshot} from '../src/versioning-strategies/java-snapshot';
import {ServicePackVersioningStrategy} from '../src/versioning-strategies/service-pack';
import {DependencyManifest} from '../src/versioning-strategies/dependency-manifest';
import {GitHubChangelogNotes} from '../src/changelog-notes/github';
import {DefaultChangelogNotes} from '../src/changelog-notes/default';
import {Java} from '../src/strategies/java';

describe('factory', () => {
  let github: GitHub;
  beforeEach(async () => {
    github = await GitHub.create({
      owner: 'fake-owner',
      repo: 'fake-repo',
      defaultBranch: 'main',
      token: 'fake-token',
    });
  });
  describe('buildStrategy', () => {
    it('should build a basic strategy', async () => {
      const strategy = await buildStrategy({
        github,
        releaseType: 'simple',
      });
      expect(strategy).toBeInstanceOf(Simple);

      expect(strategy.versioningStrategy).toBeInstanceOf(
        DefaultVersioningStrategy
      );
      const versioningStrategy =
        strategy.versioningStrategy as DefaultVersioningStrategy;
      expect(versioningStrategy.bumpMinorPreMajor).toBe(false);
      expect(versioningStrategy.bumpPatchForMinorPreMajor).toBe(false);
      expect(strategy.path).toEqual('.');
      expect(await strategy.getComponent()).toBeFalsy();
      expect(strategy.changelogNotes).toBeInstanceOf(DefaultChangelogNotes);
    });
    it('should build a with configuration', async () => {
      const strategy = await buildStrategy({
        github,
        releaseType: 'simple',
        bumpMinorPreMajor: true,
        bumpPatchForMinorPreMajor: true,
      });
      expect(strategy).toBeInstanceOf(Simple);
      expect(strategy.versioningStrategy).toBeInstanceOf(
        DefaultVersioningStrategy
      );
      const versioningStrategy =
        strategy.versioningStrategy as DefaultVersioningStrategy;
      expect(versioningStrategy.bumpMinorPreMajor).toBe(true);
      expect(versioningStrategy.bumpPatchForMinorPreMajor).toBe(true);
    });
    it('should throw for unknown type', async () => {
      try {
        await buildStrategy({
          github,
          releaseType: 'non-existent',
        });
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
      }
    });
    it('should build with a configured versioning strategy', async () => {
      const strategy = await buildStrategy({
        github,
        releaseType: 'simple',
        versioning: 'always-bump-patch',
      });
      expect(strategy).toBeInstanceOf(Simple);
      expect(strategy.versioningStrategy).toBeInstanceOf(AlwaysBumpPatch);
    });
    it('should build with a service pack versioning strategy', async () => {
      const strategy = await buildStrategy({
        github,
        releaseType: 'simple',
        versioning: 'service-pack',
      });
      expect(strategy).toBeInstanceOf(Simple);
      expect(strategy.versioningStrategy).toBeInstanceOf(
        ServicePackVersioningStrategy
      );
    });
    it('should build with a configured changelog type', async () => {
      const strategy = await buildStrategy({
        github,
        releaseType: 'simple',
        changelogType: 'github',
      });
      expect(strategy).toBeInstanceOf(Simple);
      expect(strategy.changelogNotes).toBeInstanceOf(GitHubChangelogNotes);
    });
    it('should build a ruby strategy', async () => {
      const strategy = await buildStrategy({
        github,
        releaseType: 'ruby',
        versionFile: 'src/version.rb',
      });
      expect(strategy).toBeInstanceOf(Ruby);
      expect((strategy as Ruby).versionFile).toEqual('src/version.rb');
    });
    it('should build a java-yoshi strategy', async () => {
      const strategy = await buildStrategy({
        github,
        releaseType: 'java-yoshi',
        bumpMinorPreMajor: true,
        bumpPatchForMinorPreMajor: true,
        extraFiles: ['path1/foo1.java', 'path2/foo2.java'],
      });
      expect(strategy).toBeInstanceOf(JavaYoshi);
      expect((strategy as JavaYoshi).extraFiles).toEqual([
        'path1/foo1.java',
        'path2/foo2.java',
      ]);
      expect(strategy.versioningStrategy).toBeInstanceOf(JavaSnapshot);
      const versioningStrategy = strategy.versioningStrategy as JavaSnapshot;
      expect(versioningStrategy.strategy).toBeInstanceOf(
        DefaultVersioningStrategy
      );
      const innerVersioningStrategy =
        versioningStrategy.strategy as DefaultVersioningStrategy;
      expect(innerVersioningStrategy.bumpMinorPreMajor).toBe(true);
      expect(innerVersioningStrategy.bumpPatchForMinorPreMajor).toBe(true);
    });
    it('should build a java-backport strategy', async () => {
      const strategy = await buildStrategy({
        github,
        releaseType: 'java-backport',
        extraFiles: ['path1/foo1.java', 'path2/foo2.java'],
      });
      expect(strategy).toBeInstanceOf(JavaYoshi);
      expect((strategy as JavaYoshi).extraFiles).toEqual([
        'path1/foo1.java',
        'path2/foo2.java',
      ]);
      expect(strategy.versioningStrategy).toBeInstanceOf(JavaSnapshot);
      const versioningStrategy = strategy.versioningStrategy as JavaSnapshot;
      expect(versioningStrategy.strategy).toBeInstanceOf(AlwaysBumpPatch);
    });
    it('should build a java-lts strategy', async () => {
      const strategy = await buildStrategy({
        github,
        releaseType: 'java-lts',
        extraFiles: ['path1/foo1.java', 'path2/foo2.java'],
      });
      expect(strategy).toBeInstanceOf(JavaYoshi);
      expect((strategy as JavaYoshi).extraFiles).toEqual([
        'path1/foo1.java',
        'path2/foo2.java',
      ]);
      expect(strategy.versioningStrategy).toBeInstanceOf(JavaSnapshot);
      const versioningStrategy = strategy.versioningStrategy as JavaSnapshot;
      expect(versioningStrategy.strategy).toBeInstanceOf(
        ServicePackVersioningStrategy
      );
    });
    it('should build a java-bom strategy', async () => {
      const strategy = await buildStrategy({
        github,
        releaseType: 'java-bom',
        bumpMinorPreMajor: true,
        bumpPatchForMinorPreMajor: true,
        extraFiles: ['path1/foo1.java', 'path2/foo2.java'],
      });
      expect(strategy).toBeInstanceOf(JavaYoshi);
      expect((strategy as JavaYoshi).extraFiles).toEqual([
        'path1/foo1.java',
        'path2/foo2.java',
      ]);
      expect(strategy.versioningStrategy).toBeInstanceOf(JavaSnapshot);
      const versioningStrategy = strategy.versioningStrategy as JavaSnapshot;
      expect(versioningStrategy.strategy).toBeInstanceOf(DependencyManifest);
      const innerVersioningStrategy =
        versioningStrategy.strategy as DependencyManifest;
      expect(innerVersioningStrategy.bumpMinorPreMajor).toBe(true);
      expect(innerVersioningStrategy.bumpPatchForMinorPreMajor).toBe(true);
    });
    it('should handle skipping snapshots', async () => {
      const strategy = await buildStrategy({
        github,
        releaseType: 'java',
        bumpMinorPreMajor: true,
        bumpPatchForMinorPreMajor: true,
        extraFiles: ['path1/foo1.java', 'path2/foo2.java'],
        skipSnapshot: true,
      });
      expect(strategy).toBeInstanceOf(Java);
      const javaStrategy = strategy as Java;
      expect(javaStrategy.extraFiles).toEqual([
        'path1/foo1.java',
        'path2/foo2.java',
      ]);
      expect(javaStrategy.skipSnapshot).toBe(true);
    });
    it('should handle extra-files', async () => {
      const strategy = await buildStrategy({
        github,
        releaseType: 'simple',
        extraFiles: ['path1/foo1.java', 'path2/foo2.java'],
      });
      expect(strategy).toBeInstanceOf(Simple);
      expect((strategy as Simple).extraFiles).toEqual([
        'path1/foo1.java',
        'path2/foo2.java',
      ]);
    });
    for (const releaseType of getReleaserTypes()) {
      it(`should build a default ${releaseType}`, async () => {
        const strategy = await buildStrategy({github, releaseType});
        expect(strategy).toBeDefined();
      });
    }
    it('should customize a version-file for Simple', async () => {
      const strategy = await buildStrategy({
        github,
        releaseType: 'simple',
        versionFile: 'foo/bar',
      });
      expect(strategy).toBeInstanceOf(Simple);
      expect((strategy as Simple).versionFile).toEqual('foo/bar');
    });
  });
  describe('registerReleaseType', () => {
    const releaseType = 'custom-test';

    class CustomTest extends Simple {}

    afterEach(() => {
      unregisterReleaseType(releaseType);
    });

    it('should register new releaser', async () => {
      registerReleaseType(releaseType, options => new CustomTest(options));

      const strategy = await buildStrategy({github, releaseType: releaseType});
      expect(strategy).toBeInstanceOf(CustomTest);
    });
    it('should return custom types', () => {
      registerReleaseType(releaseType, options => new Simple(options));

      const allTypes = getReleaserTypes();
      expect(allTypes).toEqual(expect.arrayContaining([releaseType]));
    });
  });
});
